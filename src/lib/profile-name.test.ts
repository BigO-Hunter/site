import test from 'node:test';
import assert from 'node:assert/strict';
import {profileName} from './profile-name.ts';
test('a profile name with no letter or digit falls back to the login', () => {
 for (const name of ['-', ' - ', '...', '', '   ', null, undefined, 7, '🙂']) assert.equal(profileName(name, 'Wang-jiong-han'), 'Wang-jiong-han');
});
test('a profile name with a letter or digit is kept, trimmed', () => {
 for (const name of ['Ada Lovelace', ' Ada ', 'x', '3', '王小明', 'Zoë - Ann']) assert.equal(profileName(name, 'login'), name.trim());
});

test('a credit name replaces the GitHub profile name of its login, also when the profile refresh writes the GitHub name', async () => {
  const {authorFromProfile} = await import('./record-links.ts');
  const profiles = {darkhipo: {login: 'darkhipo', name: 'Dmitri I. Arkhipov', twitter_username: null}};
  const avatars = {darkhipo: '/avatars/darkhipo-0123456789.png'};
  assert.deepEqual(authorFromProfile({name: 'darkhipo', url: 'https://github.com/DarkHipo'}, profiles, avatars),
    {name: 'MultiAgency swarm', login: 'darkhipo', url: 'https://github.com/darkhipo', twitterUsername: undefined, avatar: '/avatars/darkhipo-0123456789.png'});
  assert.equal(authorFromProfile({name: 'x', url: 'https://github.com/someone'}, {someone: {login: 'someone', name: 'Some One', twitter_username: null}}).name, 'Some One');
});
