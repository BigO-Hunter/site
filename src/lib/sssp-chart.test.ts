import { test } from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { chartModel } from './sssp-chart.ts';
import { ssspRecordRows } from './sssp-board.ts';
// The board data must give Nil's approved chart (~/nil/bigospeedrun-notes/sssp-chart-source, 2026-11-03): the same
// ticks, the same ordered time classes, and each result drawn at the same ticks with the same class.
const board = JSON.parse(readFileSync(new URL('../../data/directed-sssp.json', import.meta.url), 'utf8'));
const dates: Record<string, string> = {}; for (const r of board.records) dates[r.id] = board.record_metadata[r.id].publication_date ?? r.submitted_at ?? '9999';
// The record rows of a raw board file, as the page computes them (SsspBoard.astro): a Lean Verified row has tier verified.
const recordIds = (b: any) => new Set(ssspRecordRows(b.records.map((r: any) => ({ id: r.id, score: r.score, date: dates[r.id] ?? r.submitted_at ?? '9999',
 evidenceLevel: r.tier === 'verified' ? 'lean-verified' : 'claimed' })), b.chart.lines).map(r => r.id));
// The axes and lines come from the hand-made rows and chart lines, so they are pinned. The point rows come from the hourly
// import (verifier results), so this test pins no list of them: the rule is tested on a fixture below. On 2026-11-06 a pinned
// list here failed the hourly refresh when verifier #147 was imported.
test('the board data gives the approved chart', () => {
 const m = chartModel(board, {}, dates, recordIds(board));
 assert.deepEqual(m.xs, ['m=\\Theta(1)', 'm=\\Theta(n/\\log n)', 'm=\\Theta(n \\log^{1/4} n)', 'm=\\Theta(n \\log^{1/3} n)', 'm=\\Theta(n \\log^{1/2} n)', 'm=\\Theta(n \\log^{3/4} n)', 'm=\\Theta(n \\log n)', 'm=\\Theta(n^{2})']);
 const L = (e: string) => e === '1' ? 'O(n \\log n)' : `O(n \\log^{${e}} n)`;
 assert.deepEqual(m.ys, ['O(n)', L('1/4'), L('1/3'), L('1/2'), L('3/4'), L('7/9'), L('5/6'), L('11/12'), L('1'), 'O(n^{2})']);
 const drawn = Object.fromEntries(m.series.map(s => [s.id, s.points.map(p => `${p.x}:${m.ys[p.y]}`).join(' ')]));
 assert.deepEqual(drawn, {
  'classical-baseline': `0:O(n) 1:O(n) 2:${L('1')} 3:${L('1')} 4:${L('1')} 5:${L('1')} 6:${L('1')} 7:O(n^{2})`,
  'duan-et-al-stoc-2025': `1:O(n) 2:${L('11/12')} 3:${L('1')}`,
  'duan-et-al-icalp-2026': `1:O(n) 2:${L('3/4')} 3:${L('5/6')} 4:${L('1')}`,
  'chd-lean-cost': `2:${L('3/4')} 3:${L('7/9')} 4:${L('5/6')} 5:${L('11/12')}`,
  'lower-bound': `0:O(n) 1:O(n) 2:${L('1/4')} 3:${L('1/3')} 4:${L('1/2')} 5:${L('3/4')} 6:${L('1')} 7:O(n^{2})`,
 });
 // Every marker is a record row at its own density; the Vals AI row stays on the chart while no row beats it there.
 const ids = recordIds(board);
 assert.ok(m.markers.every(k => ids.has(k.id)));
 const vals = m.markers.find(k => k.id === 'directed-sssp-2026');
 if (ids.has('directed-sssp-2026')) assert.deepEqual(vals && [vals.x, m.ys[vals.y]], [5, L('11/12')]);
});
test('the chart marks only record rows: a point row that ties or loses to a function row at its density stays off (Lead, 2026-11-06)', () => {
 const point = (id: string, score: string, tier = 'verified') => ({ id, score, tier, submitted_at: '2026-11-05T00:00:00Z' });
 const fixture = { ...board, records: [...board.records.filter((r: any) => !r.score.includes(' ; ')), point('directed-sssp-2026', 'n log^3/4 ; n log^11/12'),
  // #147: n^2 ties Dijkstra at m <= n^2. #158: n log^2 n loses to Dijkstra's n log n at m <= n log n. 'fast': n log^1/2 at m <= n log^1/4.
  point('direct-issue-147', 'n^2 ; n^2'), point('direct-issue-158', 'n log ; n log^2'), point('fast', 'n log^1/4 ; n log^1/2', 'claimed')] };
 const ids = recordIds(fixture);
 assert.deepEqual([...ids].sort(), ['directed-sssp-2026', 'fast']);
 const m = chartModel(fixture, {}, {}, ids);
 assert.deepEqual(m.markers.map(k => [k.id, k.x, m.ys[k.y]]), [['directed-sssp-2026', 5, 'O(n \\log^{11/12} n)'], ['fast', 2, 'O(n \\log^{1/2} n)']]);
 // With every point row allowed, #147 would be marked at m = n^2 (the bug of run 42173455967).
 assert.ok(chartModel(fixture, {}, {}, new Set(['direct-issue-147'])).markers.some(k => k.id === 'direct-issue-147'));
});
test('each chart line has the cap of its shared function row', () => {
 const cases = JSON.parse(readFileSync(new URL('../../data/direct-fixtures/sssp-cases.json', import.meta.url), 'utf8'));
 for (const line of board.chart.lines) { const row = cases.functions.find((f: any) => f.text === line.function); assert.ok(row?.up_to, line.id); assert.equal(line.up_to, row.up_to, line.id); }
});
