import {test} from 'node:test';
import assert from 'node:assert/strict';
import direct from '../data/direct-other.json' with {type: 'json'};
import {sourceLinks} from './source-links.ts';

const SHA = '880106a09c1554ab6e5b551b9a9403e7c4acf639';

test('the commit and the repository of a direct proof scope become links', () => {
  assert.equal(sourceLinks(`The verifier checked Race.bound : BigOSpeedrun.Snaky.Bound (19) at commit ${SHA} of https://github.com/darkhipo/snaky-nineteen.`),
    'The verifier checked Race.bound : BigOSpeedrun.Snaky.Bound (19) at commit '
    + `<a href="https://github.com/darkhipo/snaky-nineteen/commit/${SHA}" target="_blank" rel="noopener"><code>880106a0</code></a> of `
    + '<a href="https://github.com/darkhipo/snaky-nineteen" target="_blank" rel="noopener">darkhipo/snaky-nineteen</a>.');
  // A dot inside the repository name stays in it; only the dot that ends the sentence is left out.
  assert.match(sourceLinks(`at commit ${SHA} of https://github.com/o/a.b.`), /href="https:\/\/github\.com\/o\/a\.b"[^>]*>o\/a\.b<\/a>\.$/);
});

test('text without a full commit hash and a GitHub repository does not change', () => {
  for (const text of ['No site rerun.', `at commit ${SHA.slice(0, 12)} of https://github.com/o/r.`, `at commit ${SHA} of https://example.org/o/r.`])
    assert.equal(sourceLinks(text), text);
});

test('every direct result that names a commit gets both links (the refresh keeps the form)', () => {
  const claims = Object.values(direct.boards as Record<string, {claims: {proofScope: string}[]}>).flatMap(b => b.claims);
  assert.ok(claims.length > 0);
  for (const {proofScope} of claims) {
    if (!proofScope.includes('at commit')) continue;
    const html = sourceLinks(proofScope);
    assert.match(html, /<a href="https:\/\/github\.com\/[^"/]+\/[^"/]+\/commit\/[0-9a-f]{40}"/, proofScope);
    assert.doesNotMatch(html, /of https:\/\//, proofScope);
  }
});
