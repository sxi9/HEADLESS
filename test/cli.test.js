import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('ig --help prints usage', () => {
  const result = run('--help');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: ig <command>/);
  assert.match(result.stdout, /story <file>/);
});

test('ig devices lists phone presets', () => {
  const result = run('devices');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /iPhone 13/);
  assert.match(result.stdout, /Pixel 7/);
});

test('unknown command and missing arguments fail with a clear message', () => {
  const unknown = run('dance');
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown command "dance"/);

  const missing = run('note', '--quiet');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Usage: ig note/);
});

test('note rejects text over 60 characters before touching the browser', () => {
  const result = run('note', 'x'.repeat(61), '--quiet');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /limited to 60 characters/);
});
