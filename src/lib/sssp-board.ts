// The directed-sssp board has no single leader: its frontier rows take that place (Lead, 2026-11-03; design note
// sections 7 and 8). Every generic place that asks for "the leader" of a board asks boardLeaders. No data import here:
// the site server image has src/lib/*.ts only (image-imports.test.ts), so the chart lines come with the Problem.
import {ranked} from './ranking.ts';
import {parse, parseFunction, density, frontier, timeAt, lexCmp, CLASSIC} from './sssp.ts';
import {evidenceOrder} from './evidence.ts';
import type {ChartLine, Problem, RecordEntry} from './types';

/** The frontier rows among records (point rows only), in input order. A line counts when its row is Lean Verified.
 * Of exactly equal rows, the one with the highest evidence level, then the earliest (date, then input order), is the frontier row. */
export function ssspFrontier<T extends Pick<RecordEntry, 'id' | 'score' | 'evidenceLevel' | 'date'>>(records: T[], lines: ChartLine[] = []): T[] {
 const points = records.filter(r => r.score.includes(' ; ')).map((r, i) => ({r, i})).sort((x, y) => x.r.date.localeCompare(y.r.date) || x.i - y.i).map(x => x.r);
 const verified = new Set(points.filter(r => r.evidenceLevel === 'lean-verified').map(r => r.id));
 const proven = lines.filter(l => verified.has(l.row)).map(l => ({row: l.row, terms: parseFunction(l.function), cap: density(l.up_to)}));
 const ids = new Set(frontier(points.map(r => ({id: r.id, t: parse(r.score), level: evidenceOrder(r.evidenceLevel)})), proven));
 return records.filter(r => ids.has(r.id));
}
/** The frontier rows that are records: at their own density each one is strictly faster than every function row of the
 * board (the classic Dijkstra row and the paper rows, at every evidence level). The frontier already puts it below every point
 * row that covers its density. Only these post as "New record", and only these go to X (Lead, 2026-11-06, after X post
 * 2118427792107016517: verifier #158, O(n log^2 n) for m <= n log n, is a frontier row, but Dijkstra gives O(n log n) there). */
export function ssspRecordRows<T extends Pick<RecordEntry, 'id' | 'score' | 'evidenceLevel' | 'date'>>(records: T[], lines: ChartLine[] = []): T[] {
 // The classic Dijkstra row (CLASSIC, m + n log n) always counts: the feed's board rows (boardRecords) leave the classical
 // baseline out, and verifier #147 (n^2 ; n^2), which ties it at m <= n^2, then posted as a record in a dry run (2026-11-06).
 const functions = [CLASSIC, ...records.filter(r => !r.score.includes(' ; ')).map(r => parseFunction(r.score))];
 return ssspFrontier(records, lines).filter(r => { const t = parse(r.score); return functions.every(f => lexCmp(t.slice(2), timeAt(f, t.slice(0, 2))) < 0); });
}
/** The rows that lead a board: its rank-1 rows, or on directed-sssp its frontier rows. */
export function boardLeaders(problem: Pick<Problem, 'slug' | 'direction' | 'chartLines'>, records: RecordEntry[]): RecordEntry[] {
 return problem.slug === 'directed-sssp' ? ssspFrontier(records, problem.chartLines)
  : ranked(records, problem.direction).filter(r => r.rank === 1).map(r => r.record);
}
