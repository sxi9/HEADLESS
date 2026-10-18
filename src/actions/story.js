import { SEL } from '../selectors.js';
import { assertFiles, clickFirst, firstVisible, provideFiles, sleep } from '../helpers.js';
import { InstagramError, UiNotFoundError } from '../errors.js';

const isHome = (url) => /^https:\/\/www\.instagram\.com\/?(\?.*)?$/.test(url);

/**
 * Add a photo or video to your story: tap "Your story +" (or the camera), pick the
 * file, tap "Add to your story".
 */
export async function shareStory(ig, file, { timeoutMs } = {}) {
  const [media] = assertFiles([file], { kinds: ['image', 'video'], max: 1 });
  const timeout = timeoutMs ?? ig.config.uploadTimeoutMs;

  await ig.requireLogin();
  await ig.goto('/');
  const page = ig.page;

  ig.log('opening the story camera');
  let how;
  try {
    how = await provideFiles(
      page,
      () => clickFirst(page, SEL.story.open, { timeout: 8000, what: 'the "New story" button on the home screen' }),
      [media],
      { timeout: 10000 },
    );
  } catch (err) {
    if (!(err instanceof UiNotFoundError)) throw err;
    ig.log('no story button on the home screen; trying /create/story/');
    await ig.goto('/create/story/');
    how = await provideFiles(
      page,
      async () => {
        const pick = await firstVisible(page, SEL.story.openFallback, { timeout: 5000 });
        if (pick) await pick.click();
      },
      [media],
      { timeout: 10000 },
    );
  }
  ig.log(`selected ${media} via ${how}`);
  await sleep(2000);
  await ig.debug('story-01-selected');

  const share = await firstVisible(page, SEL.story.share, { timeout: Math.min(timeout, 30000) });
  if (!share) {
    await ig.debug('story-stuck', { force: true });
    throw new UiNotFoundError('The story editor did not show an "Add to your story" button.');
  }
  ig.log('tapping "Add to your story"');
  await share.click();

  const confirmation = await waitForStoryShared(ig, timeout);
  await ig.debug('story-02-result');
  if (!confirmation) {
    throw new InstagramError('Instagram did not confirm the story before the timeout. Check your story and the debug captures.', {
      code: 'STORY_UNCONFIRMED',
    });
  }
  return { file: media, confirmation, url: page.url() };
}

async function waitForStoryShared(ig, timeout) {
  const page = ig.page;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await firstVisible(page, SEL.story.shared, { timeout: 500 })) return 'confirmed';
    const share = await firstVisible(page, SEL.story.share, { timeout: 300 });
    if (!share && isHome(page.url())) return 'returned-home';
    await sleep(1000);
  }
  return null;
}
