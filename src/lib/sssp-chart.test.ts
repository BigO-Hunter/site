import { test } from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { chartModel } from './sssp-chart.ts';
// The board data must give Nil's approved chart (~/nil/bigospeedrun-notes/sssp-chart-source, 2026-11-03): the same
// ticks, the same ordered time classes, and each result drawn at the same ticks with the same class.
const board = JSON.parse(readFileSync(new URL('../../data/directed-sssp.json', import.meta.url), 'utf8'));
const dates: Record<string, string> = {}; for (const r of board.records) dates[r.id] = board.record_metadata[r.id].publication_date ?? r.submitted_at ?? '9999';
test('the board data gives the approved chart', () => {
 const m = chartModel(board, {}, dates);
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
 assert.deepEqual(m.markers.map(k => [k.id, k.x, m.ys[k.y]]), [['directed-sssp-2026', 5, L('11/12')]]);
});
test('each chart line has the cap of its shared function row', () => {
 const cases = JSON.parse(readFileSync(new URL('../../data/direct-fixtures/sssp-cases.json', import.meta.url), 'utf8'));
 for (const line of board.chart.lines) { const row = cases.functions.find((f: any) => f.text === line.function); assert.ok(row?.up_to, line.id); assert.equal(line.up_to, row.up_to, line.id); }
});
