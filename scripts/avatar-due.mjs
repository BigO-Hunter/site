import {createHash} from 'node:crypto';

// GitHub's avatar CDN serves two encodings of one picture and alternates between them, and an avatar
// file is named by its content hash. Fetched every hour, 50 files flipped per run, the site build
// changed, and a new image was built and pulled about 30 times a day. So each login's avatar is
// fetched again at most every 7 days, at a day of the week that depends on the login.
export const AVATAR_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;

export const avatarStagger = login => createHash('sha256').update(login).digest()[0] % 7 * DAY;

// The time to store after a download. The first fetch of a login (no valid date kept) is moved back by
// the login's stagger, so the due dates spread over the week. Every later fetch stores now, so two
// fetches of one login are always at least 7 days apart.
export function avatarCheckedAt(login, now, previous) {
 const first = !Number.isFinite(Date.parse(previous ?? ''));
 return new Date(first ? now - avatarStagger(login) : now).toISOString();
}

// true when the avatar must be fetched: none is kept, its file is gone, or the last fetch is 7 days old.
export function avatarDue({login, have, fileExists, checkedAt, now}) {
 if (!have || !fileExists) return true;
 const at = Date.parse(checkedAt ?? '');
 return !Number.isFinite(at) || now - at >= AVATAR_MAX_AGE_MS || at > now + DAY;
}
