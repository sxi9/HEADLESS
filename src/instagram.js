import fs from 'node:fs';
import path from 'node:path';
import { launchPhoneBrowser, saveSession } from './browser.js';
import { SEL } from './selectors.js';
import { firstVisible, normalizeUsername, sleep, timestamp } from './helpers.js';
import { parseOgTitle, parseProfileDescription } from './parse.js';
import { ChallengeError, LoginError, NotFoundError, NotLoggedInError, RateLimitedError, TwoFactorError } from './errors.js';
import { createPost } from './actions/post.js';
import { shareStory } from './actions/story.js';
import { publishNote } from './actions/note.js';
import { commentOnPost, followUser, likePost, sendDirectMessage, unfollowUser } from './actions/engage.js';

export const IG_BASE = 'https://www.instagram.com';

/**
 * A headless phone running the Instagram mobile web app.
 *
 *   const ig = await InstagramMobile.launch(getConfig());
 *   await ig.login();
 *   await ig.post(['photo.jpg'], { caption: 'hello' });
 *   await ig.close();
 */
export class InstagramMobile {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.device = null;
    this.logger =
      config.logger ??
      ((message) => {
        if (config.verbose) console.error(`[ig] ${message}`);
      });
  }

  static async launch(config) {
    const ig = new InstagramMobile(config);
    await ig.start();
    return ig;
  }

  async start() {
    if (this.browser) return this;
    const { browser, context, page, device } = await launchPhoneBrowser(this.config);
    Object.assign(this, { browser, context, page, device });
    this.log(
      `${this.config.headless ? 'headless' : 'headed'} Chromium as "${this.config.device}" (${device.viewport.width}x${device.viewport.height}${
        this.config.proxy ? `, proxy ${this.config.proxy}` : ''
      })`,
    );
    return this;
  }

  log(message) {
    this.logger(message);
  }

  /** Absolute Instagram URL for a path, or the URL itself when one is given. */
  url(target = '/') {
    const value = String(target ?? '/');
    if (/^https?:\/\//i.test(value)) return value;
    return `${IG_BASE}/${value.replace(/^\/+/, '')}`;
  }

  /** Navigate, fail loudly on a 429, let the page settle and close nag dialogs. */
  async goto(target = '/', { waitUntil = 'domcontentloaded', settleMs = 2000, dismiss = true } = {}) {
    const url = this.url(target);
    this.log(`open ${url}`);
    const response = await this.page.goto(url, { waitUntil });
    if (response && response.status() === 429) {
      await this.debug('rate-limited', { force: true });
      throw new RateLimitedError(this.page.url());
    }
    if (settleMs) await sleep(settleMs);
    if (dismiss) await this.dismissDialogs();
    return response;
  }

  /** Close cookie banners and "Not now" prompts that sit on top of the app. */
  async dismissDialogs() {
    for (const name of SEL.dialogs.dismiss) {
      const button = this.page.getByRole('button', { name, exact: true }).first();
      if (await button.isVisible().catch(() => false)) {
        this.log(`dismiss "${name}"`);
        await button.click({ timeout: 3000 }).catch(() => {});
        await sleep(600);
      }
    }
  }

  async #hasSessionCookie() {
    const cookies = await this.context.cookies(IG_BASE);
    return cookies.some((cookie) => cookie.name === 'sessionid' && cookie.value);
  }

  /**
   * True when a session cookie exists. With `verify`, also load the app and make
   * sure Instagram does not answer with the login form (expired session).
   */
  async isLoggedIn({ verify = false } = {}) {
    if (!(await this.#hasSessionCookie())) return false;
    if (!verify) return true;
    if (!this.page.url().startsWith(IG_BASE)) await this.goto('/');
    const loginForm = await this.page
      .locator(SEL.login.username)
      .first()
      .isVisible()
      .catch(() => false);
    return !loginForm && (await this.#hasSessionCookie());
  }

  /** Log in with username/password (plus 2FA code when asked) and save the session. */
  async login({
    username = this.config.username,
    password = this.config.password,
    twoFactorCode = this.config.twoFactorCode,
    save = true,
  } = {}) {
    if (!username || !password) {
      throw new LoginError('No credentials. Set IG_USERNAME and IG_PASSWORD in .env (or the environment), or pass them to login().', {
        code: 'NO_CREDENTIALS',
      });
    }
    const page = this.page;
    await this.goto('/accounts/login/');

    const usernameField = page.locator(SEL.login.username).first();
    if (!(await usernameField.isVisible().catch(() => false))) {
      if (await this.isLoggedIn()) {
        this.log('already logged in (session cookie present)');
        if (save) await this.saveSession();
        return { alreadyLoggedIn: true };
      }
      // Phone landing page: tap "Log in" to reach the form.
      await this.goto('/');
      const open = await firstVisible(page, SEL.login.openLogin, { timeout: 5000 });
      if (open) {
        await open.click();
        await sleep(1500);
      }
      if (!(await usernameField.isVisible().catch(() => false))) {
        await this.debug('login-no-form', { force: true });
        throw new LoginError(
          'Could not find the login form. Instagram may be rate limiting this IP, or the layout changed; see the debug capture.',
        );
      }
    }

    this.log(`logging in as ${username}`);
    await usernameField.fill(username);
    await page.locator(SEL.login.password).first().fill(password);
    const submit = await firstVisible(page, SEL.login.submit, { timeout: 3000 });
    if (submit) await submit.click();
    else await page.keyboard.press('Enter');

    let outcome = await this.#loginOutcome(this.config.timeoutMs);

    if (outcome.kind === 'two_factor') {
      this.log('two-factor code requested');
      const code = typeof twoFactorCode === 'function' ? await twoFactorCode() : twoFactorCode;
      if (!code) {
        throw new TwoFactorError(
          'Instagram asked for a two-factor code. Set IG_TOTP_CODE, or run `ig login` in a terminal to be prompted.',
        );
      }
      const input = page.locator(SEL.login.twoFactorInput).first();
      await input.waitFor({ state: 'visible' });
      await input.fill(String(code).replace(/\s+/g, ''));
      const confirm = await firstVisible(page, SEL.login.twoFactorSubmit, { timeout: 3000 });
      if (confirm) await confirm.click();
      else await page.keyboard.press('Enter');
      outcome = await this.#loginOutcome(this.config.timeoutMs);
      if (outcome.kind !== 'ok') {
        await this.debug('login-2fa-failed', { force: true });
        throw new TwoFactorError(
          `Two-factor verification did not complete (${outcome.kind}${outcome.message ? `: ${outcome.message}` : ''}).`,
        );
      }
    } else if (outcome.kind === 'challenge') {
      await this.debug('login-challenge', { force: true });
      throw new ChallengeError(
        `Instagram wants a manual checkpoint (${outcome.url}). Finish it once in a normal browser or with --headed, then log in again.`,
      );
    } else if (outcome.kind === 'error') {
      throw new LoginError(`Instagram rejected the login: ${outcome.message}`);
    } else if (outcome.kind !== 'ok') {
      await this.debug('login-timeout', { force: true });
      throw new LoginError('Login did not complete in time; see the debug capture for what Instagram showed.');
    }

    await sleep(1500);
    await this.dismissDialogs();
    if (!this.page.url().replace(/\/$/, '').endsWith('instagram.com')) {
      // "Save your login info?" lives on its own page; go home and clear the next prompt too.
      await this.goto('/');
    }
    this.log('logged in');
    if (save) await this.saveSession();
    return { alreadyLoggedIn: false };
  }

  async #loginOutcome(timeoutMs) {
    const page = this.page;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.#hasSessionCookie()) return { kind: 'ok' };
      const url = page.url();
      if (/\/accounts\/login\/two_factor/i.test(url) || (await page.locator(SEL.login.twoFactorInput).count()) > 0) {
        return { kind: 'two_factor' };
      }
      if (/\/challenge\//i.test(url) || /\/accounts\/suspended/i.test(url)) return { kind: 'challenge', url };
      const box = page.locator(SEL.login.errorBox).first();
      if ((await box.count()) > 0) {
        const text = (await box.innerText().catch(() => '')).trim();
        if (text) return { kind: 'error', message: text };
      }
      const body = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
      const match = body.match(SEL.login.errorText);
      if (match) return { kind: 'error', message: match[1].trim() };
      await sleep(500);
    }
    return { kind: 'timeout' };
  }

  /** Log in only when the saved session is missing or expired. */
  async requireLogin() {
    if (await this.isLoggedIn()) return false;
    if (this.config.username && this.config.password) {
      this.log('no session; logging in with the configured credentials');
      await this.login();
      return true;
    }
    throw new NotLoggedInError();
  }

  async saveSession(file = this.config.sessionFile) {
    await saveSession(this.context, file);
    this.log(`session saved to ${file}`);
    return file;
  }

  /** Public profile summary (counts come from Instagram's page metadata). */
  async profile(username) {
    const handle = normalizeUsername(username);
    await this.goto(`/${handle}/`);
    const page = this.page;
    const meta = await page
      .evaluate(() => {
        const get = (selector) => document.querySelector(selector)?.getAttribute('content') ?? null;
        return {
          description: get('meta[property="og:description"]') ?? get('meta[name="description"]'),
          title: get('meta[property="og:title"]') ?? document.title,
          image: get('meta[property="og:image"]'),
          body: (document.body?.innerText ?? '').slice(0, 4000),
        };
      })
      .catch(() => ({ description: null, title: null, image: null, body: '' }));

    if (SEL.profile.notAvailable.test(meta.body)) throw new NotFoundError(`No Instagram profile "${handle}" (or it is unavailable).`);
    const loginRequired =
      /\/accounts\/login/i.test(page.url()) ||
      (await page
        .locator(SEL.login.username)
        .first()
        .isVisible()
        .catch(() => false));

    const parsed = parseProfileDescription(meta.description);
    const fromTitle = parseOgTitle(meta.title);
    return {
      username: parsed.username ?? fromTitle.username ?? handle,
      fullName: parsed.fullName ?? fromTitle.fullName,
      posts: parsed.posts,
      followers: parsed.followers,
      following: parsed.following,
      isPrivate: SEL.profile.isPrivate.test(meta.body),
      profilePicture: meta.image,
      url: page.url(),
      loginRequired,
      description: meta.description,
    };
  }

  async screenshot(file, { fullPage = false } = {}) {
    const target = path.resolve(file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await this.page.screenshot({ path: target, fullPage });
    this.log(`screenshot ${target}`);
    return target;
  }

  /** Visible text of the current screen (handy for debugging). */
  async text(maxChars = 4000) {
    return (await this.page.evaluate(() => document.body?.innerText ?? '').catch(() => '')).slice(0, maxChars);
  }

  /** Save a screenshot + HTML of the current screen into debugDir (when --debug, or forced). */
  async debug(label, { force = false } = {}) {
    if (!(this.config.debug || force) || !this.page) return null;
    try {
      fs.mkdirSync(this.config.debugDir, { recursive: true });
      const base = path.join(this.config.debugDir, `${timestamp()}-${label}`);
      await this.page.screenshot({ path: `${base}.png` });
      fs.writeFileSync(`${base}.html`, await this.page.content());
      this.log(`debug capture ${base}.png`);
      return `${base}.png`;
    } catch (err) {
      this.log(`debug capture failed: ${err.message}`);
      return null;
    }
  }

  // ---- Phone app actions -------------------------------------------------

  /** Share a photo/video post; several files make a carousel. */
  post(files, options) {
    return createPost(this, files, options);
  }

  /** Add a photo or video to your story. */
  story(file, options) {
    return shareStory(this, file, options);
  }

  /** Publish a note (the short status shown above the inbox). */
  note(text, options) {
    return publishNote(this, text, options);
  }

  like(postRef) {
    return likePost(this, postRef);
  }

  comment(postRef, text) {
    return commentOnPost(this, postRef, text);
  }

  follow(username) {
    return followUser(this, username);
  }

  unfollow(username) {
    return unfollowUser(this, username);
  }

  dm(username, text) {
    return sendDirectMessage(this, username, text);
  }

  async close() {
    const browser = this.browser;
    this.browser = this.context = this.page = null;
    if (browser) await browser.close().catch(() => {});
  }
}
