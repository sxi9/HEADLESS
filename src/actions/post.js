import { SEL } from '../selectors.js';
import { assertFiles, clickFirst, firstVisible, provideFiles, sleep } from '../helpers.js';
import { BadInputError, InstagramError, UiNotFoundError } from '../errors.js';

const isHome = (url) => /^https:\/\/www\.instagram\.com\/?(\?.*)?$/.test(url);

/**
 * Share a feed post from the phone app: tap "+", pick the file(s), tap Next
 * through crop/filters, write the caption, tap Share.
 */
export async function createPost(ig, files, { caption = '', timeoutMs } = {}) {
  const list = assertFiles(files, { kinds: ['image', 'video'], max: 10 });
  const text = String(caption ?? '');
  if ([...text].length > 2200) throw new BadInputError('Captions are limited to 2,200 characters.');
  const timeout = timeoutMs ?? ig.config.uploadTimeoutMs;

  await ig.requireLogin();
  await ig.goto('/');
  const page = ig.page;

  ig.log('tapping "+" (new post)');
  const how = await provideFiles(
    page,
    async () => {
      await clickFirst(page, SEL.post.open, { timeout: 10000, what: 'the "New post" button in the bottom bar' });
      // Some layouts add a "Select from device" step before the picker opens.
      const pick = await firstVisible(page, SEL.post.selectFromDevice, { timeout: 2500 });
      if (pick) await pick.click();
    },
    list,
    { timeout: 10000 },
  );
  ig.log(`selected ${list.length} file(s) via ${how}`);
  await sleep(1500);
  await ig.debug('post-01-selected');

  const captionBox = await advanceToCaption(ig, timeout);
  if (text) {
    ig.log('writing the caption');
    await captionBox.click();
    await captionBox.fill(text);
  }
  await ig.debug('post-02-caption');

  ig.log('tapping Share');
  await clickFirst(page, SEL.post.share, { timeout: 10000, what: 'the "Share" button' });
  const confirmation = await waitForShared(ig, timeout);
  await ig.debug('post-03-result');
  if (!confirmation) {
    throw new InstagramError(
      'Instagram did not confirm the post before the timeout. It may still have gone through; check the profile and the debug captures.',
      { code: 'POST_UNCONFIRMED' },
    );
  }
  return { files: list, caption: text, confirmation, url: page.url() };
}

async function advanceToCaption(ig, timeout) {
  const page = ig.page;
  const deadline = Date.now() + timeout;
  let taps = 0;
  while (Date.now() < deadline) {
    const box = await firstVisible(page, SEL.post.caption, { timeout: 2000 });
    if (box) return box;
    const next = await firstVisible(page, SEL.post.next, { timeout: 2000 });
    if (next && taps < 5) {
      taps += 1;
      ig.log(`tapping Next (${taps})`);
      await next.click();
      await sleep(1500);
      await ig.debug(`post-next-${taps}`);
      continue;
    }
    if (taps >= 5) break;
    await sleep(1000);
  }
  await ig.debug('post-stuck', { force: true });
  throw new UiNotFoundError('Could not reach the caption screen of the new-post flow.');
}

async function waitForShared(ig, timeout) {
  const page = ig.page;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await firstVisible(page, SEL.post.shared, { timeout: 500 })) return 'confirmed';
    const [share, caption, dialog] = await Promise.all([
      firstVisible(page, SEL.post.share, { timeout: 200 }),
      firstVisible(page, SEL.post.caption, { timeout: 200 }),
      page
        .locator('[role="dialog"]')
        .first()
        .isVisible()
        .catch(() => false),
    ]);
    if (!share && !caption && !dialog && isHome(page.url())) return 'returned-home';
    await sleep(1000);
  }
  return null;
}
