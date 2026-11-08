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

test('the credit of jv1000 follows the paper, also when the profile has another name or none', async () => {
  const {authorFromProfile} = await import('./record-links.ts');
  assert.equal(authorFromProfile({name: 'x', url: 'https://github.com/jv1000'}, {jv1000: {login: 'jv1000', name: 'UltrontheCat', twitter_username: null}}).name, 'Jennifer Voitle');
  assert.equal(authorFromProfile({name: 'x', url: 'https://github.com/jv1000'}, {}).name, 'Jennifer Voitle');
});

// S. Litsey (Lead, 2026-11-08, verifier #187): his README and the Catalan rows name him so; his profile has no name.
test('the credit of slitsey follows his README, also through the merge of an upgraded Catalan claim', async () => {
  const {authorFromProfile, githubProfileLogin} = await import('./record-links.ts');
  const {mergeDirect} = await import('./other-merge.ts');
  assert.equal(authorFromProfile({name: 'x', url: 'https://github.com/slitsey'}, {slitsey: {login: 'slitsey', name: 'slitsey', twitter_username: null}}).name, 'S. Litsey');
  const person = (a: {name: string; url: string}) => githubProfileLogin(a.url) ? authorFromProfile(a, {slitsey: {login: 'slitsey', name: '', twitter_username: null}}) : a;
  const data = {families: [{slug: 'catalan', direction: 'lower', bestHandle: 'slitsey', claims: [
    {handle: 'slitsey', value: '295', display: '295', date: '2026-11-06T17:13:45Z', evidence: 'claimed', url: 'https://example.org/295'}]}]};
  const url = 'https://github.com/bigospeedrun/verifier/issues/187';
  const state = {boards: {'other-catalan': {claims: [{author: 'S. Litsey; MultiAgency swarm (port)', handle: 'direct-issue-187', value: '295', display: '295',
    date: '2026-11-08T00:00:00Z', dateSource: url, dateKind: 'first-stated', url, lean: true, leanNote: 'Yes', evidence: 'lean-verified', note: 'n',
    proofScope: 'p', bound: 'b', upgrades: {handle: 'slitsey', value: '295'},
    authors: [{name: 'S. Litsey', url: 'https://github.com/slitsey'}, {name: 'MultiAgency swarm', url: 'https://github.com/darkhipo'}]}]}}};
  const claim = (mergeDirect(data as any, state as any, person) as any).families[0].claims[0];
  assert.deepEqual(claim.authors.map((a: {name: string}) => a.name), ['S. Litsey', 'MultiAgency swarm']);
});
