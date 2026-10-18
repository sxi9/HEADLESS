import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCount, parseOgTitle, parseProfileDescription } from '../src/parse.js';

test('parseCount handles plain, comma and suffixed numbers', () => {
  assert.equal(parseCount('42'), 42);
  assert.equal(parseCount('1,234'), 1234);
  assert.equal(parseCount('12K'), 12000);
  assert.equal(parseCount('1.5M'), 1500000);
  assert.equal(parseCount('2b'), 2000000000);
  assert.equal(parseCount('n/a'), null);
  assert.equal(parseCount(null), null);
});

test('parseProfileDescription reads counts, name and handle', () => {
  const parsed = parseProfileDescription(
    '1,234 Followers, 56 Following, 78 Posts - See Instagram photos and videos from Jane Doe (@janedoe)',
  );
  assert.deepEqual(
    { followers: parsed.followers, following: parsed.following, posts: parsed.posts, fullName: parsed.fullName, username: parsed.username },
    { followers: 1234, following: 56, posts: 78, fullName: 'Jane Doe', username: 'janedoe' },
  );
});

test('parseProfileDescription copes with abbreviated counts and no name', () => {
  const parsed = parseProfileDescription(
    '690M Followers, 120 Following, 8,012 Posts - See Instagram photos and videos from Instagram (@instagram)',
  );
  assert.equal(parsed.followers, 690000000);
  assert.equal(parsed.posts, 8012);
  assert.equal(parsed.username, 'instagram');
  assert.deepEqual(parseProfileDescription(null).followers, null);
});

test('parseOgTitle splits "Name (@handle) • ..."', () => {
  assert.deepEqual(parseOgTitle('Jane Doe (@janedoe) • Instagram photos and videos'), { fullName: 'Jane Doe', username: 'janedoe' });
  assert.deepEqual(parseOgTitle('Instagram'), { fullName: null, username: null });
});
