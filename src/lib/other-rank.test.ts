import {test} from 'node:test';
import assert from 'node:assert/strict';
import data from './other-bounds.json' with {type: 'json'};
import {otherClaimNumber, rankOtherClaims} from './other-rank.ts';
import {otherBoundLeader} from './other-leader.ts';

const claim = (display: string, value = display, date = '2026-10-10T00:00:00Z') => ({display, value, date});

test('the number of a claim is read from its display, then from its exact value', () => {
  assert.equal(otherClaimNumber(claim('\\approx6.14\\cdot10^{-11}', '1/2')), 6.14e-11);
  assert.equal(otherClaimNumber(claim('2^{-38}', '2^{-38}')), 2 ** -38);
  assert.equal(otherClaimNumber(claim('\\le0.87488664704', '11/12-\\ell/4')), 0.87488664704);
  assert.equal(otherClaimNumber(claim('10499/12000', '10499/12000')), 10499 / 12000);
  assert.equal(otherClaimNumber(claim('3.762', '1881/500')), 3.762);
  assert.equal(otherClaimNumber(claim('80{,}000d^{17}', '80{,}000d^{17}')), 80000 * 10 ** 17);
  assert.equal(otherClaimNumber(claim('80,000d^{17}', '80,000d^{17}')), 80000 * 10 ** 17);
  assert.equal(otherClaimNumber(claim('80000d^{17}', '80000d^{17}')), 80000 * 10 ** 17);
  assert.equal(otherClaimNumber(claim('70{,}000d^{18}', '70{,}000d^{18}')), 70000 * 10 ** 18);
  assert.equal(otherClaimNumber(claim('1.5d^{-3}', '1.5d^{-3}')), 1.5 * 10 ** -3);
});

test('best first by direction, ties share a rank, earliest first', () => {
  const rows = [claim('3.83', '3.83', '2026-10-09'), claim('3.762', '1881/500', '2026-10-16'), claim('3.762', '1881/500', '2026-10-18'), claim('3.192', '399/125', '2026-10-19')];
  assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.display, r.rank, r.tie]), [['3.192', 1, false], ['3.762', 2, false], ['3.762', 2, true], ['3.83', 4, false]]);
  assert.deepEqual(rankOtherClaims(rows, 'higher').map(r => [r.claim.display, r.rank]), [['3.83', 1], ['3.762', 2], ['3.762', 2], ['3.192', 4]]);
  // Small values keep their precision: 5.107e-10 beats 5.100e-10, which an absolute tolerance would tie.
  const matroid = rankOtherClaims([claim('\\approx5.10\\cdot10^{-10}'), claim('\\approx5.107\\cdot10^{-10}')], 'higher');
  assert.deepEqual(matroid.map(r => [r.claim.display, r.rank]), [['\\approx5.107\\cdot10^{-10}', 1], ['\\approx5.10\\cdot10^{-10}', 2]]);
});

test('coefficient × variable-base power claims are ranked by value, not date', () => {
  // Older-but-better (lower) beats newer-but-worse: 70{,}000d^{17} < 80{,}000d^{17}.
  const rows = [claim('80{,}000d^{17}', '80{,}000d^{17}', '2026-10-01'), claim('70{,}000d^{17}', '70{,}000d^{17}', '2026-10-05')];
  assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.display, r.rank, r.tie]), [['70{,}000d^{17}', 1, false], ['80{,}000d^{17}', 2, false]]);
  // Reversed dates: the older claim with the better value still ranks first.
  const reversed = [claim('70{,}000d^{17}', '70{,}000d^{17}', '2026-10-05'), claim('80{,}000d^{17}', '80{,}000d^{17}', '2026-10-01')];
  assert.deepEqual(rankOtherClaims(reversed, 'lower').map(r => [r.claim.display, r.rank, r.tie]), [['70{,}000d^{17}', 1, false], ['80{,}000d^{17}', 2, false]]);
});

test('a claim whose number cannot be read puts the row newest first', () => {
  const rows = [claim('something-unparseable', 'x', '2026-10-01'), claim('another-unparseable', 'y', '2026-10-05')];
  assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.display, r.rank, r.tie]), [['another-unparseable', 1, false], ['something-unparseable', 2, false]]);
});

// The rule of the rows is that a listed claim was the best when it appeared, and the leader is a row's newest
// claim of its best handle. So the first rank of every row is its leader.
test('on every Other bounds row, rank 1 is the leader', () => {
  for (const family of data.families) {
    const ranked = rankOtherClaims(family.claims, family.direction);
    const leader = otherBoundLeader(family)!;
    assert.equal(ranked.length, family.claims.length, family.slug);
    assert.ok(ranked.filter(r => r.rank === 1).some(r => r.claim === leader || (r.claim.value === leader.value && r.claim.handle === leader.handle)), `${family.slug}: rank 1 is not the leader ${leader.value}`);
  }
});

test('claims closer than a float can tell are ordered by their exact fractions', () => {
  const rows = [claim('0.8733819666133', '8733819666133/10000000000000', '2026-10-30'), claim('0.87338196661320752', '5458637291332547/6250000000000000', '2026-10-31'), claim('0.87338196661320751993', '87338196661320751993/100000000000000000000', '2026-10-31T17')];
  assert.deepEqual(rankOtherClaims(rows, 'lower').map(r => [r.claim.display, r.rank, r.tie]), [['0.87338196661320751993', 1, false], ['0.87338196661320752', 2, false], ['0.8733819666133', 3, false]]);
  // Equal exact values still tie, earliest first; a value that disagrees with its display keeps the float order.
  const equal = rankOtherClaims([claim('0.5', '1/2', '2026-10-01'), claim('0.5', '2/4', '2026-10-02')], 'lower');
  assert.deepEqual(equal.map(r => [r.claim.date, r.rank, r.tie]), [['2026-10-01', 1, false], ['2026-10-02', 1, true]]);
  const odd = rankOtherClaims([claim('0.5', '1/3', '2026-10-01'), claim('0.4999999999', '1/2', '2026-10-02')], 'lower');
  assert.deepEqual(odd.map(r => [r.claim.display, r.rank, r.tie]), [['0.5', 1, false], ['0.4999999999', 1, true]]);
});
