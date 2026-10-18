import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertFiles, describeSpec, normalizePostUrl, normalizeUsername, toLocator } from '../src/helpers.js';
import { BadInputError } from '../src/errors.js';

test('normalizePostUrl accepts URLs, paths and shortcodes', () => {
  assert.equal(normalizePostUrl('https://www.instagram.com/p/ABC123/'), '/p/ABC123/');
  assert.equal(normalizePostUrl('https://instagram.com/reel/XYZ'), '/reel/XYZ/');
  assert.equal(normalizePostUrl('/p/ABC123'), '/p/ABC123/');
  assert.equal(normalizePostUrl('ABC_12-3'), '/p/ABC_12-3/');
  assert.throws(() => normalizePostUrl('https://example.com/p/ABC/'), BadInputError);
  assert.throws(() => normalizePostUrl(''), BadInputError);
});

test('normalizeUsername strips @ and profile URLs', () => {
  assert.equal(normalizeUsername('@jane.doe'), 'jane.doe');
  assert.equal(normalizeUsername('https://www.instagram.com/jane_doe/?hl=en'), 'jane_doe');
  assert.throws(() => normalizeUsername('not a user'), BadInputError);
  assert.throws(() => normalizeUsername(''), BadInputError);
});

test('assertFiles checks existence, type and count', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-test-'));
  const jpg = path.join(dir, 'a.jpg');
  const mp4 = path.join(dir, 'b.mp4');
  const txt = path.join(dir, 'c.txt');
  for (const file of [jpg, mp4, txt]) fs.writeFileSync(file, 'x');

  assert.deepEqual(assertFiles([jpg, mp4]), [jpg, mp4]);
  assert.deepEqual(assertFiles(jpg, { kinds: ['image'] }), [jpg]);
  assert.throws(() => assertFiles(mp4, { kinds: ['image'] }), /Unsupported file type/);
  assert.throws(() => assertFiles(txt), /Unsupported file type/);
  assert.throws(() => assertFiles(path.join(dir, 'missing.jpg')), /File not found/);
  assert.throws(() => assertFiles([jpg, jpg], { max: 1 }), /At most 1/);
  assert.throws(() => assertFiles([]), /At least one/);
});

test('toLocator maps specs onto the Playwright locator API', () => {
  const calls = [];
  const fakeRoot = {
    locator: (css) => calls.push(['locator', css]),
    getByRole: (role, opts) => calls.push(['role', role, opts]),
    getByText: (text, opts) => calls.push(['text', text, opts]),
    getByLabel: (label, opts) => calls.push(['label', label, opts]),
  };
  toLocator(fakeRoot, 'svg[aria-label="Like"]');
  toLocator(fakeRoot, { role: 'button', name: /^share$/i });
  toLocator(fakeRoot, { text: 'Next', exact: true });
  toLocator(fakeRoot, { label: 'Password' });
  assert.equal(calls[0][1], 'svg[aria-label="Like"]');
  assert.equal(calls[1][1], 'button');
  assert.equal(calls[2][1], 'Next');
  assert.equal(calls[3][1], 'Password');
  assert.throws(() => toLocator(fakeRoot, { nope: true }), BadInputError);
  assert.equal(describeSpec({ role: 'button', name: /^share$/i }), '{"role":"button","name":"/^share$/i"}');
});
