import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avatarAccount, avatarDue, avatarCheckedAt, avatarStagger, AVATAR_MAX_AGE_MS} from '../../scripts/avatar-due.mjs';

const now = Date.parse('2026-11-01T12:00:00Z');
const kept = {login: 'zxv', have: '/avatars/zxv-4620db8489.png', fileExists: true};

test('an avatar is fetched when none is kept, its file is gone, or it was never dated', () => {
 assert.equal(avatarDue({...kept, have: undefined, checkedAt: new Date(now).toISOString(), now}), true);
 assert.equal(avatarDue({...kept, fileExists: false, checkedAt: new Date(now).toISOString(), now}), true);
 assert.equal(avatarDue({...kept, checkedAt: undefined, now}), true);
 assert.equal(avatarDue({...kept, checkedAt: 'not a date', now}), true);
});

test('a kept avatar is fetched again only after 7 days, and a date in the future is not trusted', () => {
 assert.equal(avatarDue({...kept, checkedAt: new Date(now - 3600e3).toISOString(), now}), false);
 assert.equal(avatarDue({...kept, checkedAt: new Date(now - AVATAR_MAX_AGE_MS + 60e3).toISOString(), now}), false);
 assert.equal(avatarDue({...kept, checkedAt: new Date(now - AVATAR_MAX_AGE_MS).toISOString(), now}), true);
 assert.equal(avatarDue({...kept, checkedAt: new Date(now + 3 * 86400e3).toISOString(), now}), true);
});

test('the first fetch of a login is moved back by 0 to 6 days, so the due dates spread over the week', () => {
 const days = new Set<number>();
 for (const login of ['zxv', 'dugongue', 'darkhipo', 'anchen0823', '1337isnot1337', 'slitsey', 'nielstron', 'karirogg']) {
  const stagger = avatarStagger(login);
  assert.ok(stagger >= 0 && stagger <= 6 * 86400e3 && stagger % 86400e3 === 0);
  assert.equal(Date.parse(avatarCheckedAt(login, now)), now - stagger);
  assert.equal(Date.parse(avatarCheckedAt(login, now, 'not a date')), now - stagger);
  days.add(stagger / 86400e3);
 }
 assert.ok(days.size >= 3, 'the logins do not all fall on one day');
});

test('a later fetch stores now, so no login is fetched twice within 7 days (hourly ticks over 30 days)', () => {
 const hour = 3600e3;
 for (let stagger = 0; stagger <= 6; stagger++) {
  const login = [...'abcdefghijklmnopqrstuvwxyz0123456789'].map(c => c.repeat(2)).find(l => avatarStagger(l) === stagger * 86400e3)!;
  let checkedAt: string | undefined;
  const fetches: number[] = [];
  for (let t = now; t < now + 30 * 86400e3; t += hour) {
   if (avatarDue({login, have: '/avatars/x.png', fileExists: true, checkedAt, now: t})) {
    fetches.push(t);
    checkedAt = avatarCheckedAt(login, t, checkedAt);
   }
  }
  assert.ok(fetches.length >= 4 && fetches.length <= 6, `${login}: ${fetches.length} fetches in 30 days`);
  assert.equal(fetches[1] - fetches[0], AVATAR_MAX_AGE_MS - stagger * 86400e3, 'the first gap carries the stagger');
  for (let i = 2; i < fetches.length; i++) assert.ok(fetches[i] - fetches[i - 1] >= AVATAR_MAX_AGE_MS, `${login} stagger ${stagger}: fetches ${i - 1} and ${i} are under 7 days apart`);
 }
});

// site#20 (2026-11-09): organizations (OpenAI, Anthropic, CrocSwap) show their GitHub avatar, as personal accounts do.
test('personal accounts and organizations get an avatar; other account types keep initials', () => {
  assert.equal(avatarAccount({login: 'openai', type: 'Organization'}), true);
  assert.equal(avatarAccount({login: 'darkhipo', type: 'User'}), true);
  for (const profile of [{login: 'x', type: 'Bot'}, {login: 'x'}, null, undefined])
    assert.equal(avatarAccount(profile), false, JSON.stringify(profile));
});
