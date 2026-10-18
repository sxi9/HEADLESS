#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { getConfig } from './config.js';
import { listPhoneDevices } from './browser.js';
import { InstagramMobile } from './instagram.js';
import { BadInputError, InstagramError } from './errors.js';
import { assertFiles, sleep, timestamp } from './helpers.js';
import { NOTE_MAX_CHARS } from './actions/note.js';

const USAGE = `
ig - the Instagram phone app, headless

Usage: ig <command> [arguments] [options]

Account
  login                          Log in with IG_USERNAME / IG_PASSWORD and save the session
  whoami                         Check whether the saved session is still logged in
  session [--clear]              Show (or delete) the saved session file

Create (what the phone app's "+" offers)
  post <file...> --caption <t>   Share a photo/video post; several files make a carousel
  story <file>                   Add a photo or video to your story
  note <text>                    Publish a note (max 60 chars) [--audience followers|close_friends]

Engage
  like <post-url|shortcode>      Like a post or reel
  comment <post-url> <text>      Comment on a post or reel
  follow <username>              Follow an account
  unfollow <username>            Unfollow an account
  dm <username> <text>           Send a direct message

Look
  open [path] [-s shot.png]      Open any Instagram path in the phone layout
  screenshot <path> [-o file]    Screenshot a page (--full for the whole page)
  profile <username> [--json]    Print a profile's name, counts and privacy
  devices                        List phone presets for --device

Options
  -d, --device <name>    Phone to emulate (default: iPhone 13)
      --headed           Show the browser window instead of running headless
      --proxy <url>      Proxy for the browser ("none" to disable)
      --timeout <ms>     Per-step timeout
      --session <file>   Session file (default: .session/state.json)
      --caption <text>   Caption for "post"
      --audience <a>     Note audience: followers | close_friends
  -s, --screenshot <f>   Also save a screenshot (open, whoami, profile)
  -o, --out <file>       Output file for "screenshot"
      --full             Full-page screenshot
      --wait <seconds>   Keep the page open this long before finishing (open)
      --no-save          Do not write the session file after login
      --json             Print machine-readable JSON
      --debug            Save a screenshot + HTML after every step into debug/
      --quiet            Hide step-by-step progress
  -h, --help             Show this help

Credentials and settings come from .env (see .env.example) or the environment.
`;

function emit(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const [key, value] of Object.entries(result)) {
    const shown = value === null || value === undefined ? '-' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    console.log(`${key.padEnd(16)} ${shown}`);
  }
}

function need(args, count, usage) {
  if (args.length < count) throw new BadInputError(`Missing argument. Usage: ig ${usage}`);
}

async function promptTwoFactorCode() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question('Two-factor code: ')).trim();
  } finally {
    rl.close();
  }
}

async function withBrowser(config, fn) {
  const ig = await InstagramMobile.launch(config);
  const onSignal = () => {
    ig.close().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    return await fn(ig);
  } catch (err) {
    const capture = await ig.debug('error', { force: true });
    if (capture && err && typeof err === 'object') err.debugCapture = capture;
    throw err;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await ig.close();
  }
}

const COMMANDS = {
  async login({ config, o }) {
    return withBrowser(config, async (ig) => {
      const twoFactorCode = config.twoFactorCode ?? (process.stdin.isTTY ? promptTwoFactorCode : undefined);
      const result = await ig.login({ twoFactorCode, save: o.save !== false });
      emit({ loggedIn: true, username: config.username, session: o.save === false ? null : config.sessionFile, ...result }, o.json);
    });
  },

  async whoami({ config, o }) {
    return withBrowser(config, async (ig) => {
      await ig.goto('/');
      const loggedIn = await ig.isLoggedIn({ verify: true });
      const result = { loggedIn, session: config.sessionFile, sessionFileExists: fs.existsSync(config.sessionFile), url: ig.page.url() };
      if (o.screenshot) result.screenshot = await ig.screenshot(o.screenshot, { fullPage: o.full });
      emit(result, o.json);
      return loggedIn ? 0 : 3;
    });
  },

  async session({ config, o }) {
    const exists = fs.existsSync(config.sessionFile);
    if (o.clear) {
      if (exists) fs.rmSync(config.sessionFile);
      emit({ session: config.sessionFile, cleared: exists }, o.json);
      return 0;
    }
    const stat = exists ? fs.statSync(config.sessionFile) : null;
    emit({ session: config.sessionFile, exists, savedAt: stat ? stat.mtime.toISOString() : null }, o.json);
    return 0;
  },

  async post({ config, args, o }) {
    need(args, 1, 'post <file...> --caption "text"');
    assertFiles(args, { kinds: ['image', 'video'], max: 10 }); // fail fast, before a browser starts
    return withBrowser(config, async (ig) => emit(await ig.post(args, { caption: o.caption ?? '' }), o.json));
  },

  async story({ config, args, o }) {
    need(args, 1, 'story <file>');
    assertFiles([args[0]], { kinds: ['image', 'video'], max: 1 });
    return withBrowser(config, async (ig) => emit(await ig.story(args[0]), o.json));
  },

  async note({ config, args, o }) {
    need(args, 1, 'note "text"');
    const text = args.join(' ');
    if ([...text].length > NOTE_MAX_CHARS)
      throw new BadInputError(`Notes are limited to ${NOTE_MAX_CHARS} characters (got ${[...text].length}).`);
    return withBrowser(config, async (ig) => emit(await ig.note(text, { audience: o.audience }), o.json));
  },

  async like({ config, args, o }) {
    need(args, 1, 'like <post-url|shortcode>');
    return withBrowser(config, async (ig) => emit(await ig.like(args[0]), o.json));
  },

  async comment({ config, args, o }) {
    need(args, 2, 'comment <post-url> "text"');
    return withBrowser(config, async (ig) => emit(await ig.comment(args[0], args.slice(1).join(' ')), o.json));
  },

  async follow({ config, args, o }) {
    need(args, 1, 'follow <username>');
    return withBrowser(config, async (ig) => emit(await ig.follow(args[0]), o.json));
  },

  async unfollow({ config, args, o }) {
    need(args, 1, 'unfollow <username>');
    return withBrowser(config, async (ig) => emit(await ig.unfollow(args[0]), o.json));
  },

  async dm({ config, args, o }) {
    need(args, 2, 'dm <username> "text"');
    return withBrowser(config, async (ig) => emit(await ig.dm(args[0], args.slice(1).join(' ')), o.json));
  },

  async open({ config, args, o }) {
    return withBrowser(config, async (ig) => {
      await ig.goto(args[0] ?? '/');
      if (o.wait) await sleep(Number(o.wait) * 1000);
      const result = {
        url: ig.page.url(),
        title: await ig.page.title(),
        device: config.device,
        viewport: ig.page.viewportSize(),
        loggedIn: await ig.isLoggedIn(),
      };
      if (o.screenshot) result.screenshot = await ig.screenshot(o.screenshot, { fullPage: o.full });
      emit(result, o.json);
    });
  },

  async screenshot({ config, args, o }) {
    need(args, 1, 'screenshot <path-or-url> [-o file.png]');
    const out = o.out ?? path.join('screenshots', `${timestamp()}.png`);
    return withBrowser(config, async (ig) => {
      await ig.goto(args[0]);
      const file = await ig.screenshot(out, { fullPage: o.full });
      emit({ url: ig.page.url(), screenshot: file }, o.json);
    });
  },

  async profile({ config, args, o }) {
    need(args, 1, 'profile <username>');
    return withBrowser(config, async (ig) => {
      const result = await ig.profile(args[0]);
      if (o.screenshot) result.screenshot = await ig.screenshot(o.screenshot, { fullPage: o.full });
      emit(result, o.json);
    });
  },

  async devices({ o }) {
    const names = listPhoneDevices();
    if (o.json) console.log(JSON.stringify(names, null, 2));
    else console.log(names.join('\n'));
    return 0;
  },
};

export async function main(argv) {
  const { values: o, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      device: { type: 'string', short: 'd' },
      headed: { type: 'boolean' },
      proxy: { type: 'string' },
      timeout: { type: 'string' },
      session: { type: 'string' },
      caption: { type: 'string' },
      audience: { type: 'string' },
      screenshot: { type: 'string', short: 's' },
      out: { type: 'string', short: 'o' },
      full: { type: 'boolean' },
      wait: { type: 'string' },
      save: { type: 'boolean', default: true },
      clear: { type: 'boolean' },
      json: { type: 'boolean' },
      debug: { type: 'boolean' },
      quiet: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const [command, ...args] = positionals;
  if (o.help || !command) {
    console.log(USAGE.trim());
    return 0;
  }
  const handler = COMMANDS[command];
  if (!handler) throw new BadInputError(`Unknown command "${command}". Run \`ig --help\` for the list.`);

  const config = getConfig({
    device: o.device,
    headless: o.headed ? false : undefined,
    proxy: o.proxy,
    timeoutMs: o.timeout,
    sessionFile: o.session,
    debug: o.debug ? true : undefined,
    verbose: o.quiet ? false : undefined,
  });
  const code = await handler({ config, args, o });
  return typeof code === 'number' ? code : 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      if (err instanceof InstagramError) {
        console.error(`error [${err.code}]: ${err.message}`);
      } else if (err && err.name === 'TimeoutError') {
        console.error(`error [TIMEOUT]: ${String(err.message).split('\n')[0]}`);
        console.error('Instagram did not respond in time. Retry, raise --timeout, or run with --headed / --debug to see the screen.');
      } else if (err && err.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
        console.error(`error: ${err.message}`);
      } else {
        console.error(`error: ${err && err.stack ? err.stack : err}`);
      }
      if (err && err.debugCapture) console.error(`screen at the time of the error: ${err.debugCapture}`);
      process.exit(err && err.code === 'NOT_LOGGED_IN' ? 3 : 1);
    },
  );
}
