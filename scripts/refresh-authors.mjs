import {readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {avatarDue, avatarCheckedAt} from './avatar-due.mjs';
import {profileName} from '../src/lib/profile-name.ts';

// Public profile fields only. A failed lookup preserves the last checked profile.
const destination = 'src/lib/author-profiles.json';
// Avatars are copies served by the site, so readers never request GitHub. A
// separate manifest keeps the hourly checked_at changes out of avatar commits.
const avatarManifest = 'src/lib/author-avatars.json';
const avatarDirectory = 'public/avatars';
const registry = JSON.parse(readFileSync('src/data/registry.json', 'utf8'));
const profiles = JSON.parse(readFileSync(destination, 'utf8'));
const avatars = existsSync(avatarManifest) ? JSON.parse(readFileSync(avatarManifest, 'utf8')) : {};
mkdirSync(avatarDirectory, {recursive: true});
// Only raster formats, identified by their file signature, not by the response header.
const imageType = bytes => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'png'
 : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'jpg'
 : bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP' ? 'webp'
 : /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('latin1')) ? 'gif' : undefined;
const removeAvatar = key => {
 const path = avatars[key] && `public${avatars[key]}`;
 if (path && existsSync(path)) unlinkSync(path);
 delete avatars[key];
};
async function refreshAvatar(key, profile, checkedAt) {
 if (!/^[a-z0-9-]+$/.test(key)) return;
 // Organization accounts (OpenAI, Anthropic, community repos) show initials, not a logo.
 if (profile.type !== 'User') return removeAvatar(key);
 // At most one download per login every 7 days (scripts/avatar-due.mjs): the CDN's two encodings of one
 // picture would otherwise change the site build, and the image, every hour.
 if (!avatarDue({login: key, have: avatars[key], fileExists: avatars[key] && existsSync(`public${avatars[key]}`), checkedAt, now: Date.now()})) return 'kept';
 const url = new URL(profile.avatar_url);
 if (url.protocol !== 'https:' || url.hostname !== 'avatars.githubusercontent.com') throw new Error('Unexpected avatar host');
 // GitHub resizes on its side; 48 px covers the largest mark at twice its size.
 url.searchParams.set('s', '48');
 const response = await fetch(url, {headers: {'User-Agent': 'bigospeedrun-site'}, signal: AbortSignal.timeout(15000)});
 if (!response.ok) throw new Error(`Avatar HTTP ${response.status}`);
 const bytes = Buffer.from(await response.arrayBuffer());
 const type = imageType(bytes);
 if (!type || bytes.length > 200000) throw new Error('Unexpected avatar file');
 const path = `/avatars/${key}-${createHash('sha256').update(bytes).digest('hex').slice(0, 10)}.${type}`;
 if (avatars[key] === path && existsSync(`public${path}`)) return 'fetched';
 removeAvatar(key);
 writeFileSync(`public${path}`, bytes);
 avatars[key] = path;
 return 'fetched';
}
const logins = new Set(['dugongue']);
// Supporters are kept by hand in src/lib/supporters.json; their avatars self-host like the others.
const supporters = existsSync('src/lib/supporters.json') ? JSON.parse(readFileSync('src/lib/supporters.json', 'utf8')) : {supporters: []};
for (const supporter of supporters.supporters) logins.add(supporter.login.toLowerCase());
for (const problem of registry.problems) {
  const data = JSON.parse(readFileSync(`src/data/${problem.data_file}`, 'utf8'));
  for (const record of data.records) for (const author of record.authors) {
    const login = author.url?.match(/^https:\/\/github\.com\/([^/?#]+)/)?.[1];
    if (login) logins.add(login.toLowerCase());
  }
}
// Other bounds claims (Nil, 2026-11-04): an author with a GitHub profile url (no deeper path) gets that profile's
// avatar, so the logins of hand-added, prove2.me and direct claims are checked too.
const profileLogin = url => typeof url === 'string' ? url.match(/^https:\/\/github\.com\/([A-Za-z0-9-]+)\/?$/)?.[1] : undefined;
const addProfileLogins = value => {
  if (Array.isArray(value)) value.forEach(addProfileLogins);
  else if (value && typeof value === 'object') {
    if (Array.isArray(value.authors)) for (const author of value.authors) { const login = profileLogin(author?.url) ?? (typeof author?.login === 'string' && /^[A-Za-z0-9-]+$/.test(author.login) ? author.login : undefined); if (login) logins.add(login.toLowerCase()); }
    Object.values(value).forEach(addProfileLogins);
  }
};
for (const file of ['src/lib/other-bounds.json', 'src/data/prove2me.json', 'src/data/direct-other.json'])
  if (existsSync(file)) addProfileLogins(JSON.parse(readFileSync(file, 'utf8')));
let failures = 0;
for (const login of [...logins].sort()) {
  try {
    const headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'bigospeedrun-site'};
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {headers, signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const profile = await response.json();
    const key = login.toLowerCase();
    const avatarAt = profiles[key]?.avatar_checked_at;
    profiles[key] = {
      login: profile.login,
      name: profileName(profile.name, profile.login),
      twitter_username: /^[a-zA-Z0-9_]{1,15}$/.test(profile.twitter_username ?? '') ? profile.twitter_username : null,
      checked_at: new Date().toISOString(),
      ...(avatarAt ? {avatar_checked_at: avatarAt} : {}),
    };
    // A failed avatar download keeps the last copy; the profile above stays current.
    const outcome = await refreshAvatar(key, profile, avatarAt).catch(error => console.warn(`Could not refresh avatar for ${login}: ${error.message}`));
    if (outcome === 'fetched') profiles[key].avatar_checked_at = avatarCheckedAt(key, Date.now(), avatarAt);
  } catch {
    failures++;
    console.warn(`Could not refresh public profile for ${login}; retained cached profile or login fallback.`);
  }
}
writeFileSync(destination + '.tmp', JSON.stringify(Object.fromEntries(Object.entries(profiles).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
renameSync(destination + '.tmp', destination);
writeFileSync(avatarManifest + '.tmp', JSON.stringify(Object.fromEntries(Object.entries(avatars).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
renameSync(avatarManifest + '.tmp', avatarManifest);
console.log(`Checked ${logins.size} public profiles; ${failures} unavailable.`);
