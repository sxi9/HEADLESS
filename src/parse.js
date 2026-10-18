/** Parse "1,234", "1.5M", "12K" style counts into integers. */
export function parseCount(value) {
  if (value === null || value === undefined) return null;
  const match = String(value)
    .trim()
    .match(/^([\d.,]+)\s*([KMBkmb])?$/);
  if (!match) return null;
  const number = Number.parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(number)) return null;
  const multiplier = { k: 1e3, m: 1e6, b: 1e9 }[(match[2] || '').toLowerCase()] ?? 1;
  return Math.round(number * multiplier);
}

const COUNT = String.raw`([\d.,]+\s*[KMBkmb]?)`;

/**
 * Parse Instagram's profile description, e.g.
 * "1,234 Followers, 56 Following, 78 Posts - See Instagram photos and videos from Jane Doe (@janedoe)".
 */
export function parseProfileDescription(description) {
  const result = { followers: null, following: null, posts: null, fullName: null, username: null, raw: description ?? null };
  if (!description) return result;

  const grab = (label) => {
    const match = description.match(new RegExp(`${COUNT}\\s+${label}\\b`, 'i'));
    return match ? parseCount(match[1]) : null;
  };
  result.followers = grab('Followers?');
  result.following = grab('Following');
  result.posts = grab('Posts?');

  const who = description.match(/from\s+(.+?)\s*\(@([^)\s]+)\)/i);
  if (who) {
    result.fullName = who[1].trim() || null;
    result.username = who[2];
  }
  return result;
}

/** Parse "Jane Doe (@janedoe) • Instagram photos and videos" into name + handle. */
export function parseOgTitle(title) {
  if (!title) return { fullName: null, username: null };
  const match = String(title).match(/^(.*?)\s*\(@([^)\s]+)\)/);
  if (!match) return { fullName: null, username: null };
  return { fullName: match[1].trim() || null, username: match[2] };
}
