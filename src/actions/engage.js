import { SEL } from '../selectors.js';
import { clickFirst, firstVisible, normalizePostUrl, normalizeUsername, sleep } from '../helpers.js';
import { BadInputError, InstagramError, NotFoundError, NotLoggedInError, UiNotFoundError } from '../errors.js';

/** Fail early when Instagram shows "page isn't available" or kicked us to the login form. */
async function assertPageAvailable(ig, what) {
  const page = ig.page;
  const body = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  if (SEL.profile.notAvailable.test(body)) throw new NotFoundError(`${what} is not available (deleted, private, or the link is wrong).`);
  if (
    await page
      .locator(SEL.login.username)
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    throw new NotLoggedInError('Instagram showed the login form instead of the page: the saved session has expired. Run `ig login` again.');
  }
}

async function readBox(box) {
  const value = await box.inputValue().catch(() => null);
  if (value !== null) return value;
  return (await box.innerText().catch(() => '')) ?? '';
}

async function waitUntilSent(ig, box, body, timeout) {
  const page = ig.page;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const remaining = (await readBox(box)).trim();
    const shown = await page
      .getByText(body)
      .first()
      .isVisible()
      .catch(() => false);
    if (!remaining && shown) return true;
    await sleep(700);
  }
  return false;
}

export async function likePost(ig, postRef) {
  const target = normalizePostUrl(postRef);
  await ig.requireLogin();
  await ig.goto(target);
  const page = ig.page;
  await assertPageAvailable(ig, 'This post');

  if (await firstVisible(page, SEL.post.unlikeIcon, { timeout: 1500 })) {
    return { url: page.url(), liked: true, changed: false };
  }
  const like = await firstVisible(page, SEL.post.likeIcon, { timeout: 10000 });
  if (!like) {
    await ig.debug('like-stuck', { force: true });
    throw new UiNotFoundError('No "Like" button found on this post.');
  }
  ig.log('tapping Like');
  await like.click();
  const liked = Boolean(await firstVisible(page, SEL.post.unlikeIcon, { timeout: 8000 }));
  await ig.debug('like-result');
  if (!liked) throw new InstagramError('Tapped Like, but Instagram did not switch the button to Unlike.', { code: 'LIKE_UNCONFIRMED' });
  return { url: page.url(), liked: true, changed: true };
}

export async function commentOnPost(ig, postRef, text) {
  const body = String(text ?? '').trim();
  if (!body) throw new BadInputError('Comment text is required.');
  const target = normalizePostUrl(postRef);

  await ig.requireLogin();
  await ig.goto(target);
  const page = ig.page;
  await assertPageAvailable(ig, 'This post');

  let box = await firstVisible(page, SEL.post.commentBox, { timeout: 4000 });
  if (!box) {
    // The phone layout often hides the composer behind the speech-bubble icon.
    const icon = await firstVisible(page, SEL.post.commentIcon, { timeout: 4000 });
    if (icon) {
      await icon.click();
      await sleep(1500);
      box = await firstVisible(page, SEL.post.commentBox, { timeout: 8000 });
    }
  }
  if (!box) {
    await ig.debug('comment-stuck', { force: true });
    throw new UiNotFoundError('No comment box found on this post.');
  }

  ig.log('writing the comment');
  await box.click();
  await box.fill(body);
  const submit = await firstVisible(page, SEL.post.commentSubmit, { timeout: 5000 });
  if (submit) await submit.click();
  else await page.keyboard.press('Enter');

  const posted = await waitUntilSent(ig, box, body, ig.config.timeoutMs);
  await ig.debug('comment-result');
  if (!posted) throw new InstagramError('Instagram did not confirm the comment before the timeout.', { code: 'COMMENT_UNCONFIRMED' });
  return { url: page.url(), text: body, posted: true };
}

export async function followUser(ig, username) {
  const handle = normalizeUsername(username);
  await ig.requireLogin();
  await ig.goto(`/${handle}/`);
  const page = ig.page;
  await assertPageAvailable(ig, `The profile @${handle}`);

  if (await firstVisible(page, SEL.profile.following, { timeout: 1500 })) {
    return { username: handle, following: true, changed: false };
  }
  const button = await firstVisible(page, SEL.profile.follow, { timeout: 10000 });
  if (!button) {
    await ig.debug('follow-stuck', { force: true });
    throw new UiNotFoundError(`No "Follow" button on @${handle}'s profile (is it your own account?).`);
  }
  ig.log(`tapping Follow on @${handle}`);
  await button.click();
  const after = await firstVisible(page, SEL.profile.following, { timeout: 10000 });
  await ig.debug('follow-result');
  if (!after)
    throw new InstagramError('Tapped Follow, but the button did not change to Following/Requested.', { code: 'FOLLOW_UNCONFIRMED' });
  const label = (await after.innerText().catch(() => '')).trim();
  return { username: handle, following: true, requested: /requested/i.test(label), changed: true };
}

export async function unfollowUser(ig, username) {
  const handle = normalizeUsername(username);
  await ig.requireLogin();
  await ig.goto(`/${handle}/`);
  const page = ig.page;
  await assertPageAvailable(ig, `The profile @${handle}`);

  const button = await firstVisible(page, SEL.profile.following, { timeout: 5000 });
  if (!button) {
    if (await firstVisible(page, SEL.profile.follow, { timeout: 1500 })) return { username: handle, following: false, changed: false };
    await ig.debug('unfollow-stuck', { force: true });
    throw new UiNotFoundError(`No "Following" button on @${handle}'s profile.`);
  }
  ig.log(`tapping Following on @${handle}`);
  await button.click();
  await sleep(800);
  const confirm = await firstVisible(page, SEL.profile.unfollowConfirm, { timeout: 5000 });
  if (confirm) await confirm.click();
  const after = await firstVisible(page, SEL.profile.follow, { timeout: 10000 });
  await ig.debug('unfollow-result');
  if (!after) throw new InstagramError('Tapped Unfollow, but the button did not change back to Follow.', { code: 'UNFOLLOW_UNCONFIRMED' });
  return { username: handle, following: false, changed: true };
}

export async function sendDirectMessage(ig, username, text) {
  const handle = normalizeUsername(username);
  const body = String(text ?? '').trim();
  if (!body) throw new BadInputError('Message text is required.');

  await ig.requireLogin();
  await ig.goto(`/${handle}/`);
  const page = ig.page;
  await assertPageAvailable(ig, `The profile @${handle}`);

  ig.log(`opening the chat with @${handle}`);
  await clickFirst(page, SEL.profile.message, { timeout: 10000, what: `the "Message" button on @${handle}'s profile` });
  await sleep(1500);
  await ig.dismissDialogs();

  const input = await firstVisible(page, SEL.dm.input, { timeout: 15000 });
  if (!input) {
    await ig.debug('dm-stuck', { force: true });
    throw new UiNotFoundError('The message box did not appear.');
  }
  await input.click();
  await input.fill(body);
  const send = await firstVisible(page, SEL.dm.send, { timeout: 2000 });
  if (send) await send.click();
  else await page.keyboard.press('Enter');

  const sent = await waitUntilSent(ig, input, body, ig.config.timeoutMs);
  await ig.debug('dm-result');
  if (!sent) throw new InstagramError('Instagram did not confirm the message before the timeout.', { code: 'DM_UNCONFIRMED' });
  return { username: handle, text: body, sent: true, url: page.url() };
}
