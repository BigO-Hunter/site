// The directed SSSP chart (Nil's approved chart, ~/nil/bigospeedrun-notes/sssp-chart-source), computed from
// board data: both axes are ordinal. X = the chart ticks (two fixed ticks below m = n, then densities).
// Y = the distinct time classes, sorted by the lexicographic order of their exponents (src/lib/sssp.ts).
// Each result is drawn only at the ticks where it is at least as fast as every earlier result.
import { density, timeAt, parseFunction, parse, lexCmp, latex, text, D_NAMES, q, type Q } from './sssp.ts';

export type SeriesKind = 'classic' | 'paper' | 'lean' | 'lower';
export interface Series { id: string; label: string; kind: SeriesKind; dashed: boolean; points: { x: number; y: number }[] }
export interface ChartModel { xs: string[]; ys: string[]; series: Series[]; markers: { id: string; x: number; y: number; label: string }[] }

const N: Q[] = [q(1n), q(0n), q(0n)];
const key = (t: Q[]) => text(t);

/** board: the raw data/directed-sssp.json; labels: a display label by row id; dates: a sortable date by row id;
 * marked: the point rows that the chart marks, the record rows of the board (ssspRecordRows in sssp-board.ts). */
export function chartModel(board: any, labels: Record<string, string>, dates: Record<string, string>, marked: ReadonlySet<string>): ChartModel {
 const chart = board.chart; const below: string[] = chart.below_n_ticks ?? []; const ticks: string[] = chart.ticks;
 const xs = [...below.map(t => `m=${t}`), ...ticks.map(t => `m=\\Theta(${latex(density(t), D_NAMES)})`)];
 const at = (terms: any[]) => ticks.map(t => timeAt(terms, density(t)));
 // Results in date order: function rows of the board, then the chart lines that stand for a point row.
 const results: { id: string; label: string; kind: SeriesKind; times: (Q[] | undefined)[]; date: string; belowAll: boolean }[] = [];
 for (const r of board.records) {
  if (r.score.includes(' ; ')) continue;
  const kind: SeriesKind = r.id === 'classical-baseline' ? 'classic' : 'paper';
  results.push({ id: r.id, label: labels[r.id] ?? r.id, kind, times: at(parseFunction(r.score)), date: kind === 'classic' ? '0000' : dates[r.id] ?? '9999', belowAll: kind === 'classic' });
 }
 for (const line of chart.lines) {
  const cap = density(line.up_to);
  results.push({ id: line.id, label: line.label, kind: 'lean', date: dates[line.row] ?? '9999', belowAll: false,
   times: ticks.map(t => lexCmp(density(t), cap) <= 0 ? timeAt(parseFunction(line.function), density(t)) : undefined) });
 }
 results.sort((a, b) => a.date.localeCompare(b.date));
 // Below m = n every result is O(n) once the unreachable vertices are dropped. The classic and the lower bound
 // are drawn at every tick below n; each later paper joins at the last one, as in Nil's chart. A Lean line
 // starts at its first density tick.
 const series: Series[] = [];
 const drawn = (i: number) => ticks.map((_, x) => {
  const t = results[i].times[x]; if (!t) return false;
  return results.slice(0, i).every(e => !e.times[x] || lexCmp(t, e.times[x]!) <= 0);
 });
 const levels = new Map<string, Q[]>(); const use = (t: Q[]) => { levels.set(key(t), t); return t; };
 const raw: { s: Omit<Series, 'points'>; pts: { x: number; t: Q[] }[] }[] = [];
 results.forEach((r, i) => {
  const pts: { x: number; t: Q[] }[] = [];
  below.forEach((_, x) => { if (r.belowAll || (r.kind === 'paper' && x === below.length - 1 && drawn(i).some(Boolean))) pts.push({ x, t: use(N) }); });
  drawn(i).forEach((ok, x) => { if (ok) pts.push({ x: below.length + x, t: use(r.times[x]!) }); });
  raw.push({ s: { id: r.id, label: r.label, kind: r.kind, dashed: false }, pts });
 });
 const lower = parseFunction(chart.lower_bound);
 raw.push({ s: { id: 'lower-bound', label: '\\Omega(n + m)', kind: 'lower', dashed: true },
  pts: [...below.map((_, x) => ({ x, t: use(N) })), ...ticks.map((t, x) => ({ x: below.length + x, t: use(timeAt(lower, density(t))) }))] });
 const sorted = [...levels.values()].sort(lexCmp); const ys = sorted.map(t => `O(${latex(t)})`);
 const yi = (t: Q[]) => sorted.findIndex(s => lexCmp(s, t) === 0);
 for (const { s, pts } of raw) series.push({ ...s, points: pts.map(p => ({ x: p.x, y: yi(p.t) })) });
 // A point row is marked at its own density when that density is a tick and the row is a record row: strictly faster there
 // than every other row, the function rows too (Lead, 2026-11-06, the same rule as the record posts). Verifier #147
 // (n^2 ; n^2) ties Dijkstra at m <= n^2: it is in the table, not on the chart.
 const markers: ChartModel['markers'] = [];
 for (const r of board.records) {
  if (!r.score.includes(' ; ') || !marked.has(r.id)) continue;
  const p = parse(r.score); const x = ticks.findIndex(t => lexCmp(density(t), p.slice(0, 2)) === 0); const y = yi(p.slice(2));
  if (x >= 0 && y >= 0) markers.push({ id: r.id, x: below.length + x, y, label: labels[r.id] ?? r.id });
 }
 return { xs, ys, series, markers };
}
