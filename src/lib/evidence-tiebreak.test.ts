// Nil, 2026-11-04: of two rows with an equal bound, the row with the higher evidence level ranks first (Lean Verified,
// then Human Verified, then Claimed); inside one level the earlier row ranks first. The same rule holds in every place
// that takes a rank or a leader: the tables, the chart line, the landing page, chat-knowledge, the records feed and the
// directed-sssp frontier.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evidenceOrder} from './evidence.ts';
import {ranked} from './ranking.ts';
import {chartRecords, type ChartEntry} from './chart.ts';
import {rankOtherClaims} from './other-rank.ts';
import {otherBoundLeader} from './other-leader.ts';
import {feedBoard, otherFeedBoard} from './records-feed.ts';
import {frontier, parse} from './sssp.ts';
import {ssspFrontier} from './sssp-board.ts';

const row = (id: string, score: string, date: string, evidenceLevel: string) => ({id, score, date, repoId: 0, evidenceLevel, authors: [{name: id}]});

test('the evidence order: Lean Verified, then Human Verified, then Claimed; an unknown level is Claimed', () => {
  assert.ok(evidenceOrder('lean-verified') > evidenceOrder('human-verified'));
  assert.ok(evidenceOrder('human-verified') > evidenceOrder('claimed'));
  assert.equal(evidenceOrder(undefined), evidenceOrder('claimed'));
});

test('Big O table: of equal bounds the higher level ranks first, then the earlier row; ties keep the = marker', () => {
  const rows = [row('claimed', '1/2', '2026-10-01', 'claimed'), row('human', '1/2', '2026-10-02', 'human-verified'), row('lean', '1/2', '2026-10-03', 'lean-verified'),
    row('lean-later', '1/2', '2026-10-04', 'lean-verified'), row('better', '1/3', '2026-10-05', 'claimed')];
  assert.deepEqual(ranked(rows, 'lower-is-better').map(r => [r.record.id, r.rank, r.tie]),
    [['better', 1, false], ['lean', 2, false], ['lean-later', 2, true], ['human', 2, true], ['claimed', 2, true]]);
  // A better bound still ranks first, whatever its level.
  assert.equal(ranked(rows, 'higher-is-better')[0].record.id, 'lean');
});

test('chart: at each time the line follows the rank-1 row, so an equal Lean Verified row takes the line', () => {
  const e = (id: string, score: string, time: number, level: string): ChartEntry => ({id, repoId: 0, score, time, level, scoreRelation: 'attained', date: new Date(time).toISOString(), author: '', boundHtml: '', url: ''});
  const line = chartRecords([e('claimed', '1/2', 1, 'claimed'), e('lean', '1/2', 2, 'lean-verified'), e('claimed-again', '1/2', 3, 'claimed')], new Set(['claimed', 'lean-verified']), false);
  assert.deepEqual(line.map(r => r.id), ['claimed', 'lean']);
});

test('records feed: the leader of a Big O board is the equal row with the higher level', () => {
  const board = feedBoard({slug: '3sum', direction: 'lower-is-better'}, [row('claimed', '2', '2026-10-01', 'claimed'), row('lean', '2', '2026-10-02', 'lean-verified')] as any, '3SUM');
  assert.equal(board.leader, 'lean');
});

const claim = (handle: string, value: string, date: string, evidence: string) => ({handle, value, display: value, bound: value, date, evidence, authors: [{name: handle}]});

test('Other bounds table and leader: an equal Lean Verified claim ranks first and leads, the earlier Claimed one is =1', () => {
  const family = {slug: 'example', name: 'Example', direction: 'lower', bestHandle: 'claimed',
    claims: [claim('older', '20', '2026-10-01', 'claimed'), claim('claimed', '19', '2026-10-15', 'claimed'), claim('lean', '19', '2026-11-03', 'lean-verified')]};
  assert.deepEqual(rankOtherClaims(family.claims, 'lower').map(r => [r.claim.handle, r.rank, r.tie]), [['lean', 1, false], ['claimed', 1, true], ['older', 3, false]]);
  assert.equal(otherBoundLeader(family)!.handle, 'lean');
  assert.equal(otherFeedBoard(family).leader, 'lean:19');
  // Inside one level the earlier claim still leads, and a better claim leads whatever its level.
  assert.equal(otherBoundLeader({...family, claims: [claim('claimed', '19', '2026-10-15', 'claimed'), claim('later', '19', '2026-11-03', 'claimed')]})!.handle, 'claimed');
  assert.equal(otherBoundLeader({...family, bestHandle: 'best', claims: [claim('lean', '19', '2026-10-15', 'lean-verified'), claim('best', '18', '2026-11-03', 'claimed')]})!.handle, 'best');
  // A row without a direction keeps the claim of its best author.
  assert.equal(otherBoundLeader({bestHandle: 'claimed', claims: family.claims})!.handle, 'claimed');
});

test('A d^p claims: of equal claims the higher level ranks first', () => {
  const claims = [claim('claimed', '80{,}000d^{17}', '2026-10-01', 'claimed'), claim('lean', '80{,}000d^{17}', '2026-10-02', 'lean-verified')];
  assert.deepEqual(rankOtherClaims(claims, 'lower').map(r => [r.claim.handle, r.rank, r.tie]), [['lean', 1, false], ['claimed', 1, true]]);
});

test('directed-sssp frontier: an equal row dominates a row with a lower level, and the later rows at its own level', () => {
  const t = parse('n ; n log^1/2');
  assert.deepEqual(frontier([{id: 'claimed', t, level: 0}, {id: 'lean', t, level: 2}]), ['lean']);
  assert.deepEqual(frontier([{id: 'lean', t, level: 2}, {id: 'claimed', t, level: 0}]), ['lean']);
  assert.deepEqual(frontier([{id: 'first', t, level: 0}, {id: 'second', t, level: 0}]), ['first']);
  const records = [row('claimed', 'n ; n log^1/2', '2026-11-05', 'claimed'), row('lean', 'n ; n log^1/2', '2026-11-06', 'lean-verified')];
  assert.deepEqual(ssspFrontier(records as any).map(r => r.id), ['lean']);
});
