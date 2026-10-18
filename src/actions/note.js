import { SEL } from '../selectors.js';
import { clickFirst, firstVisible, sleep } from '../helpers.js';
import { BadInputError, InstagramError, UiNotFoundError } from '../errors.js';

export const NOTE_MAX_CHARS = 60;

/**
 * Publish a note: open the inbox, tap "Your note", type up to 60 characters,
 * optionally pick the audience, tap Share.
 */
export async function publishNote(ig, text, { audience, timeoutMs } = {}) {
  const body = String(text ?? '').trim();
  const length = [...body].length;
  if (!body) throw new BadInputError('Note text is required.');
  if (length > NOTE_MAX_CHARS) throw new BadInputError(`Notes are limited to ${NOTE_MAX_CHARS} characters (got ${length}).`);
  if (audience && !SEL.note.audience[audience]) {
    throw new BadInputError(`Unknown audience "${audience}". Use "followers" or "close_friends".`);
  }
  const timeout = timeoutMs ?? ig.config.timeoutMs;

  await ig.requireLogin();
  await ig.goto('/direct/inbox/');
  const page = ig.page;
  await ig.debug('note-01-inbox');

  ig.log('opening the note composer');
  await clickFirst(page, SEL.note.open, { timeout: 15000, what: 'the "Your note" bubble at the top of the inbox' });
  await sleep(1000);

  let input = await firstVisible(page, SEL.note.input, { timeout: 5000 });
  if (!input) {
    // An existing note opens in a viewer first; ask for a new one.
    const fresh = await firstVisible(page, SEL.note.newNote, { timeout: 3000 });
    if (fresh) {
      await fresh.click();
      await sleep(1000);
      input = await firstVisible(page, SEL.note.input, { timeout: 5000 });
    }
  }
  if (!input) {
    await ig.debug('note-stuck', { force: true });
    throw new UiNotFoundError('The note composer did not appear.');
  }

  await input.click();
  await input.fill(body);
  if (audience) {
    const pick = await firstVisible(page, SEL.note.audience[audience], { timeout: 3000 });
    if (pick) {
      ig.log(`audience: ${audience}`);
      await pick.click();
    } else {
      ig.log('audience selector not found; keeping the default');
    }
  }
  await ig.debug('note-02-composed');

  ig.log('tapping Share');
  await clickFirst(page, SEL.note.share, { timeout: 10000, what: 'the note "Share" button' });

  const confirmation = await waitForNote(ig, body, timeout);
  await ig.debug('note-03-result');
  if (!confirmation) {
    throw new InstagramError('Instagram did not confirm the note before the timeout; see the debug captures.', {
      code: 'NOTE_UNCONFIRMED',
    });
  }
  return { text: body, audience: audience ?? 'default', confirmation, url: page.url() };
}

async function waitForNote(ig, body, timeout) {
  const page = ig.page;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const composer = await firstVisible(page, SEL.note.input, { timeout: 300 });
    const shown = await page
      .getByText(body)
      .first()
      .isVisible()
      .catch(() => false);
    if (!composer && shown) return 'confirmed';
    if (!composer) {
      await sleep(1500);
      const again = await page
        .getByText(body)
        .first()
        .isVisible()
        .catch(() => false);
      return again ? 'confirmed' : 'composer-closed';
    }
    await sleep(700);
  }
  return null;
}
