// Lead, 2026-11-08 (site#17): an author link goes to the person's or the organisation's profile, GitHub if known, else
// ORCID, else there is no link. Never a repository, a PDF, a paper, a submission or a page of the work: that link belongs
// in the row's source or evidence field. data/validate.py checks the board data on every refresh; this test checks the
// hand-kept Other bounds file and the committed snapshot the site is built from.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {authorFromProfile} from './record-links.ts';

const PROFILE = /^https:\/\/(github\.com\/[A-Za-z0-9][A-Za-z0-9-]{0,38}|orcid\.org\/\d{4}-\d{4}-\d{4}-\d{3}[0-9X])$/;
function offenders(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach(x => offenders(x, found));
  else if (value && typeof value === 'object') {
    const {authors} = value as {authors?: unknown};
    if (Array.isArray(authors)) for (const a of authors as {name?: string; url?: unknown}[]) if (a && 'url' in a && !(typeof a.url === 'string' && PROFILE.test(a.url))) found.push(`${a.name}: ${a.url}`);
    Object.values(value).forEach(x => offenders(x, found));
  }
  return found;
}
const read = (path: URL) => JSON.parse(readFileSync(path, 'utf8'));

test('no author of an Other bounds claim links a repository, a paper, a file or a submission', () => {
  assert.deepEqual(offenders(read(new URL('./other-bounds.json', import.meta.url))), []);
});

test('no author of the committed board data links anything but a profile', () => {
  const directory = new URL('../data/', import.meta.url);
  for (const name of readdirSync(directory).filter(x => x.endsWith('.json'))) {
    assert.deepEqual(offenders(read(new URL(name, directory))), [], name);
  }
});

test('an author without a link stays a plain name, and a profile keeps its link', () => {
  assert.deepEqual(authorFromProfile({name: 'Ran Duan'}, {}), {name: 'Ran Duan'});
  assert.equal(authorFromProfile({name: 'darkhipo', url: 'https://github.com/darkhipo'}, {}).url, 'https://github.com/darkhipo');
});

test('the test finds a repository, a paper and a prove2.me page', () => {
  const doc = {families: [{claims: [{authors: [{name: 'A', url: 'https://github.com/o/r'}, {name: 'B', url: 'https://arxiv.org/abs/1'}, {name: 'C'}, {name: 'D', url: 'https://prove2.me/users/x'}, {name: 'E', url: 'https://orcid.org/0000-0002-9577-4871'}]}]}]};
  assert.deepEqual(offenders(doc), ['A: https://github.com/o/r', 'B: https://arxiv.org/abs/1', 'D: https://prove2.me/users/x']);
});
