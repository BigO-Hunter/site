// Nil, 2026-11-04: "the agent breakthrough is missing from the table at /other/snaky". An OpenAI baseline is a table row.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {rankOtherClaims} from './other-rank.ts';
import {otherTableRows, isTableBreakthrough, shownLevel} from './other-table.ts';
import {isVisibleAtEvidence} from './evidence.ts';

const claim = (handle: string, value: string, date: string, evidence = 'claimed', agent = false) => ({handle, value, display: value, date, evidence, agent});
const openai = (value: string) => ({value, exactValue: value, bound: value, url: 'https://github.com/openai/math', date: '2026-10-06T14:58:00-07:00'});

test('every row with an OpenAI baseline shows it once, as its Agent breakthrough; a Classic baseline row, or a row with no baseline, has no such row', () => {
  for (const family of data.families as any[]) {
    const openai = family.baseline !== undefined && !family.baseline.label;
    const rows = otherTableRows(family);
    const base = rows.filter(r => 'breakthrough' in r.claim);
    assert.equal(rows.length, family.claims.length + (openai ? 1 : 0), family.slug);
    assert.equal(base.length, openai ? 1 : 0, family.slug);
    if (openai) {
      assert.equal((base[0].claim as {authors: {name: string}[]}).authors[0].name, 'OpenAI', family.slug);
      assert.equal(base[0].claim.evidence, 'claimed', family.slug);
    }
    // The claims keep their order around it.
    assert.deepEqual(rows.map(r => r.claim).filter(c => !('breakthrough' in c)), rankOtherClaims(family.claims, family.direction).map(r => r.claim), family.slug);
    assert.equal(rows.filter(r => isTableBreakthrough(family, r.claim)).length, !openai && !family.claims.some((c: any) => c.agent) ? 0 : 1, family.slug);
  }
});

test('the baseline row ranks by the normal rules, the evidence tie-break included', () => {
  const family = {baseline: openai('21'), direction: 'lower', claims: [claim('lean', '21', '2026-10-20', 'lean-verified'), claim('claimed', '21', '2026-10-21'), claim('better', '20', '2026-10-22')]};
  assert.deepEqual(otherTableRows(family).map(r => [r.claim.handle, r.rank, r.tie]),
    [['better', 1, false], ['lean', 2, false], ['openai-baseline', 2, true], ['claimed', 2, true]]);
});

test('a baseline whose number cannot be read ranks last and leaves the order of the claims as it is', () => {
  const family = {baseline: openai('+\\infty'), direction: 'lower', claims: [claim('a', '600', '2026-10-10'), claim('b', '500', '2026-10-09')]};
  assert.deepEqual(otherTableRows(family).map(r => [r.claim.handle, r.rank]), [['b', 1], ['a', 2], ['openai-baseline', 3]]);
});

test('on a row with a Classic baseline, the first claim marked agent is the Agent breakthrough', () => {
  const family = {baseline: {...openai('246'), label: 'Classic baseline'}, direction: 'lower', claims: [claim('human', '240', '2026-08-31'), claim('agent', '186', '2026-09-03', 'claimed', true), claim('agent-later', '180', '2026-10-01', 'claimed', true)]};
  assert.deepEqual(otherTableRows(family).filter(r => isTableBreakthrough(family, r.claim)).map(r => r.claim.handle), ['agent']);
});

// Nil, 2026-11-04: "why does the snaky leaderboard not have evidence level filters?". The filters read the level the table
// shows; the Agent breakthrough row stays at every selection, and the ranks are those of all rows.
test('the evidence filters of an Other bounds table hide rows by their shown level, never the Agent breakthrough row', () => {
  assert.equal(shownLevel({evidence: 'lean-verified'}, false), 'lean-verified');
  assert.equal(shownLevel({evidence: 'human-verified'}, true), 'human-verified');
  assert.equal(shownLevel({evidence: 'human-verified'}, false), 'claimed');
  assert.equal(shownLevel({}, false), 'claimed');
  const family = {baseline: openai('21'), direction: 'lower', claims: [claim('a', '20', '2026-10-07'), claim('b', '19', '2026-10-08', 'lean-verified')]};
  const visible = (levels: string[]) => otherTableRows(family)
    .filter(({claim: c}) => isVisibleAtEvidence({isBreakthrough: isTableBreakthrough(family, c), evidenceLevel: shownLevel(c, false)}, levels))
    .map(({claim: c, rank}) => c.handle + ':' + rank);
  assert.deepEqual(visible(['lean-verified', 'human-verified', 'claimed']), ['b:1', 'a:2', 'openai-baseline:3']);
  assert.deepEqual(visible(['lean-verified']), ['b:1', 'openai-baseline:3']);
  assert.deepEqual(visible([]), ['openai-baseline:3']);
});
