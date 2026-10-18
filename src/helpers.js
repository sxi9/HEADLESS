import fs from 'node:fs';
import path from 'node:path';
import { BadInputError, UiNotFoundError } from './errors.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

/** Turn a selector spec (see src/selectors.js) into a Playwright locator. */
export function toLocator(root, spec) {
  if (typeof spec === 'string') return root.locator(spec);
  if (spec && typeof spec === 'object') {
    if (spec.role) return root.getByRole(spec.role, { name: spec.name, exact: spec.exact });
    if (spec.text !== undefined) return root.getByText(spec.text, { exact: spec.exact });
    if (spec.label !== undefined) return root.getByLabel(spec.label, { exact: spec.exact });
  }
  throw new BadInputError(`Unsupported selector spec: ${describeSpec(spec)}`);
}

export function describeSpec(spec) {
  if (typeof spec === 'string') return spec;
  return JSON.stringify(spec, (_key, value) => (value instanceof RegExp ? value.toString() : value));
}

const asList = (specs) => (Array.isArray(specs) ? specs : [specs]);

/**
 * Poll the given specs (in order) until one of them is visible.
 * Resolves with the locator, or null after `timeout` ms.
 */
export async function firstVisible(page, specs, { timeout = 5000, scope } = {}) {
  const list = asList(specs);
  const root = scope ?? page;
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const spec of list) {
      const locator = toLocator(root, spec).first();
      if (await locator.isVisible().catch(() => false)) return locator;
    }
    if (Date.now() >= deadline) return null;
    await sleep(250);
  }
}

/** Click the first visible spec, or throw a UiNotFoundError naming what was expected. */
export async function clickFirst(page, specs, { timeout = 5000, scope, what } = {}) {
  const list = asList(specs);
  const locator = await firstVisible(page, list, { timeout, scope });
  if (!locator) {
    throw new UiNotFoundError(`Could not find ${what ?? 'the expected control'} (tried: ${list.map(describeSpec).join(' | ')}).`);
  }
  await locator.click();
  return locator;
}

/**
 * Hand files to Instagram the way a phone user would: run `trigger` (usually a tap
 * on "+"), catch the file chooser it opens and feed it. Falls back to any
 * <input type=file> on the page when no chooser appears.
 */
export async function provideFiles(page, trigger, files, { timeout = 10000 } = {}) {
  const chooserPromise = page.waitForEvent('filechooser', { timeout }).then(
    (chooser) => chooser,
    () => null,
  );

  let triggerError = null;
  try {
    await trigger();
  } catch (err) {
    triggerError = err;
  }

  const inputs = page.locator('input[type="file"]');
  if (triggerError) {
    if ((await inputs.count()) > 0) {
      await inputs.last().setInputFiles(files);
      return 'file-input';
    }
    throw triggerError;
  }

  const chooser = await chooserPromise;
  if (chooser) {
    await chooser.setFiles(files);
    return 'file-chooser';
  }
  if ((await inputs.count()) > 0) {
    await inputs.last().setInputFiles(files);
    return 'file-input';
  }
  throw new UiNotFoundError('No file chooser opened and the page has no file input.');
}

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'];
export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v'];

/** Resolve, existence-check and type-check media files. Returns absolute paths. */
export function assertFiles(files, { kinds = ['image', 'video'], max = 10 } = {}) {
  const list = (Array.isArray(files) ? files : [files]).filter(Boolean).map((file) => path.resolve(String(file)));
  if (list.length === 0) throw new BadInputError('At least one media file is required.');
  if (list.length > max) throw new BadInputError(`At most ${max} file(s) allowed here (got ${list.length}).`);

  const allowed = [...(kinds.includes('image') ? IMAGE_EXTENSIONS : []), ...(kinds.includes('video') ? VIDEO_EXTENSIONS : [])];
  for (const file of list) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new BadInputError(`File not found: ${file}`);
    const ext = path.extname(file).toLowerCase();
    if (!allowed.includes(ext)) {
      throw new BadInputError(`Unsupported file type "${ext || '(none)'}" for ${file}. Allowed: ${allowed.join(' ')}.`);
    }
  }
  return list;
}

/** Accepts a full post/reel URL, a path like /p/CODE/, or a bare shortcode. Returns a path. */
export function normalizePostUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new BadInputError('A post URL or shortcode is required.');
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) throw new BadInputError(`Not an Instagram URL: ${raw}`);
    return url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  }
  if (raw.startsWith('/')) return raw.endsWith('/') ? raw : `${raw}/`;
  if (/^[A-Za-z0-9_-]+$/.test(raw)) return `/p/${raw}/`;
  throw new BadInputError(`Unrecognised post reference: ${raw}`);
}

/** Accepts "name", "@name" or a profile URL. Returns the bare handle. */
export function normalizeUsername(input) {
  const handle = String(input ?? '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) throw new BadInputError(`Invalid Instagram username: "${input}"`);
  return handle;
}
