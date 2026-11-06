// The generic score paths on a directed-sssp board with "D ; T" rows (Reviewer point 7, Lead 2026-11-03): the Discord
// plan with frontier rows, the X skip rule, the board leaders of the chat and the landing page.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {plan,feedBoard} from './records-feed.ts';
import type {FeedSnapshot,FeedState} from './records-feed.ts';
import {worseThanBreakthrough} from './x-skip.ts';
import {boardLeaders,ssspFrontier,ssspRecordRows} from './sssp-board.ts';
import {landingRecords} from './landing-records.ts';
import {ranked} from './ranking.ts';
import {scoreValue} from './chart.ts';
import {frontier,parse,parseFunction,density} from './sssp.ts';
import type {ChartLine,RecordEntry} from './types.ts';

const board = JSON.parse(readFileSync(new URL('../../data/directed-sssp.json', import.meta.url), 'utf8'));
const lines: ChartLine[] = board.chart.lines;
const problem = {slug: 'directed-sssp', direction: 'lower-is-better' as const, chartLines: lines};
const row = (id: string, score: string, evidenceLevel = 'claimed', date = '2026-11-04') =>
 ({id, score, evidenceLevel, date, repoId: 1, authors: [{name: id}], scoreRelation: 'attained', isBreakthrough: id === 'directed-sssp-2026'}) as unknown as RecordEntry;
const START = [row('classical-baseline', 'm + n log', 'human-verified', '1987-01-01'), row('duan-et-al-stoc-2025', 'm log^2/3 + n', 'claimed', '2025-04-23'),
 row('directed-sssp-2026', 'n log^3/4 ; n log^11/12', 'lean-verified', '2026-09-21')];
const snap = (records: RecordEntry[]): FeedSnapshot => ({schema_version: 1, boards: [feedBoard(problem, records, 'Directed Shortest Paths')]});
const empty: FeedState = {schema_version: 1, snapshot: {schema_version: 1, boards: []}, reserved: []};

test('frontier: dominance by another point row (strict in one) and by a Lean Verified line of another row', () => {
 const chd = {row: 'vals', terms: parseFunction(lines[0].function), cap: density(lines[0].up_to)};
 const rows = [['vals', 'n log^3/4 ; n log^11/12'], ['a', 'n ; n log^2/3'], ['b', 'n ; n log^1/2'], ['c', 'n log^1/2 ; n log^11/12'],
  ['d', 'n log ; n log^2'], ['e', 'n log ; n log^2'], ['f', 'n log ; n^2 loglog^-1']].map(([id, s]) => ({id, t: parse(s)}));
 // b beats a at the same D, c is below the Vals AI point, f is slower than d at the same D; e equals the earlier d.
 assert.deepEqual(frontier(rows, [chd]), ['vals', 'b', 'd']);
 // Without b, a ties the line at its D (Tchd(n) = n log^2/3): only the line keeps it off the frontier.
 assert.deepEqual(frontier(rows.filter(r => r.id !== 'b'), [chd]), ['vals', 'd']);
 assert.deepEqual(frontier(rows.filter(r => r.id !== 'b')), ['vals', 'a', 'd']);
});

test('of exactly equal rows the earliest is the frontier row (Reviewer, 2026-11-03), as ranked() on the other boards', () => {
 const rows = [['first', 'n ; n log^1/2'], ['same', 'n ; n log^1/2'], ['other', 'n log ; n log^2']].map(([id, s]) => ({id, t: parse(s)}));
 assert.deepEqual(frontier(rows), ['first', 'other']);
 const records = [row('later', 'n ; n log^1/2', 'claimed', '2026-11-06'), row('earlier', 'n ; n log^1/2', 'claimed', '2026-11-05')];
 assert.deepEqual(ssspFrontier(records).map(r => r.id), ['earlier']);
 // A later equal row posts nothing.
 const start = plan(empty, snap(START));
 const once = plan(start.state, snap([...START, records[1]]), [], Date.parse('2026-11-05T12:00:00Z'));
 assert.equal(once.messages.length, 1);
 assert.deepEqual(plan(once.state, snap([...START, ...records]), [], Date.parse('2026-11-06T12:00:00Z')).messages, []);
});

test('the board posts nothing at race start, then once for each new frontier row', () => {
 const start = plan(empty, snap(START));
 assert.deepEqual(start.messages, [], 'the first snapshot of the board is seeded (the announcement covers its rows)');
 assert.equal(snap(START).boards[0].records.length, 1, 'function rows never post');
 const next = [...START, row('tie', 'n ; n log^2/3'), row('below', 'n log^1/2 ; n log^11/12'), row('new', 'n ; n log^1/2'), row('dense', 'n log ; n log^2', 'lean-verified')];
 const result = plan(start.state, snap(next), [], Date.parse('2026-11-04T12:00:00Z'));
 assert.deepEqual(result.messages.map(m => JSON.parse(m.key.slice(0, m.key.lastIndexOf(':')))[1]), ['new', 'dense']);
 assert.match(result.messages[0].content, /^\*\*New claim\*\* \| \*\*Directed Shortest Paths\*\* \| `O\(n log\^\(1\/2\) n\) for m <= n`/);
 // Dijkstra (m + n log n) is O(n log n) at m <= n log n, so 'dense' is a frontier row but no record (Lead, 2026-11-06).
 assert.match(result.messages[1].content, /^\*\*New Lean Verified bound\*\* \| \*\*Directed Shortest Paths\*\* \| `O\(n log\^2 n\) for m <= n log n`/);
 assert.match(result.messages[1].x_text!, /^New Lean Verified bound!\n\nProblem: Directed Shortest Paths\nValue: O\(n log\^2 n\) for m <= n log n\n/);
 assert.deepEqual(plan(result.state, snap(next), [], Date.parse('2026-11-04T12:00:00Z')).messages, []);
 // A Lean Verified gain posts only while the row is a frontier row.
 const verified = next.map(r => ['below', 'new'].includes(r.id) ? {...r, evidenceLevel: 'lean-verified'} as RecordEntry : r);
 assert.deepEqual(plan(result.state, snap(verified), [], Date.parse('2026-11-04T13:00:00Z')).messages.map(m => m.key.endsWith(':lean') && JSON.parse(m.key.slice(0, m.key.lastIndexOf(':')))[1]), ['new']);
});

test('X: only a Lean Verified record row posts on this board', () => {
 const claim = {key: '["directed-sssp","new","n ; n log^1/2","attained"]:record', x_text: 'New claim!\n\nStatus: Claimed (not verified)'};
 const lean = {key: '["directed-sssp","new","n ; n log^1/2","attained"]:lean', x_text: 'New record!\n\nStatus: Lean Verified'};
 const dense = {key: '["directed-sssp","dense","n log ; n log^2","attained"]:lean', x_text: 'New Lean Verified bound!\n\nStatus: Lean Verified'};
 const records = [...START, row('new', 'n ; n log^1/2', 'lean-verified'), row('dense', 'n log ; n log^2', 'lean-verified')];
 assert.match(worseThanBreakthrough(claim as any, snap(records))!, /only for a Lean Verified record row/);
 assert.equal(worseThanBreakthrough(lean as any, snap(records)), undefined);
 // X post 2118427792107016517 (verifier #158): a frontier row that Dijkstra beats at its density.
 assert.match(worseThanBreakthrough(dense as any, snap(records))!, /is no record/);
 // A snapshot without record rows (or without the board) posts nothing on this board.
 const old = snap(records); delete old.boards[0].recordRows;
 assert.match(worseThanBreakthrough(lean as any, old)!, /is no record/);
 assert.match(worseThanBreakthrough(lean as any, undefined)!, /is no record/);
 assert.equal(worseThanBreakthrough({...claim, key: claim.key.replace('directed-sssp', 'exact-dft')} as any, snap(START)), undefined);
});

test('a record row is faster than every row at its density, the function rows too (Lead, 2026-11-06)', () => {
 const icalp = row('duan-et-al-icalp-2026', 'm log^1/2 + m^1/2 n^1/2 log^1/2 loglog^1/2', 'claimed', '2026-07-01');
 const ids = (records: RecordEntry[]) => ssspRecordRows(records, lines).map(r => r.id);
 // Verifier #158 and #147: Dijkstra gives O(n log n) at m <= n log n and O(n^2) at m <= n^2, so neither is a record.
 assert.deepEqual(ids([...START, row('158', 'n log ; n log^2', 'lean-verified'), row('147', 'n^2 ; n^2', 'lean-verified')]), ['directed-sssp-2026']);
 assert.deepEqual(ssspFrontier([...START, row('158', 'n log ; n log^2'), row('147', 'n^2 ; n^2')], lines).map(r => r.id), ['directed-sssp-2026', '158', '147']);
 // At m <= n the STOC row gives n log^(2/3) n and the ICALP row n log^(1/2) n (log log n)^(1/2): a row must beat both.
 assert.deepEqual(ids([...START, row('a', 'n ; n log^1/2 loglog^1/2')]), ['directed-sssp-2026', 'a']);
 assert.deepEqual(ids([...START, icalp, row('a', 'n ; n log^1/2 loglog^1/2')]), ['directed-sssp-2026']);
 assert.deepEqual(ids([...START, icalp, row('b', 'n ; n log^1/2 loglog^1/3')]), ['directed-sssp-2026', 'b']);
 // The classic counts also when the rows leave it out (the feed's boardRecords do): #147 ties it at m <= n^2.
 assert.deepEqual(ids([START[1], START[2], row('147', 'n^2 ; n^2', 'lean-verified')]), ['directed-sssp-2026']);
 // A Claimed or Human Verified function row counts as much as a Lean Verified one.
 assert.deepEqual(ids([row('classical-baseline', 'm + n log', 'claimed'), row('c', 'n log^1/2 ; n log^3/4')]), ['c']);
});

test('a frontier row that is no record: no Claimed post, one Discord post when it gains Lean Verified, never a record', () => {
 const start = plan(empty, snap(START));
 const claimed = [...START, row('147', 'n^2 ; n^2')];
 const first = plan(start.state, snap(claimed), [], Date.parse('2026-11-05T00:00:00Z'));
 assert.deepEqual(first.messages, []);
 const verified = [...START, row('147', 'n^2 ; n^2', 'lean-verified')];
 const second = plan(first.state, snap(verified), [], Date.parse('2026-11-05T01:00:00Z'));
 assert.deepEqual(second.messages.map(m => m.content.split(' | ')[0]), ['**New Lean Verified bound**']);
 assert.deepEqual(plan(second.state, snap(verified), [], Date.parse('2026-11-05T02:00:00Z')).messages, []);
 // A record row that gains Lean Verified is still "Record verified".
 const rec = plan(start.state, snap([...START, row('a', 'n ; n log^1/2')]), [], Date.parse('2026-11-05T00:00:00Z'));
 assert.deepEqual(rec.messages.map(m => m.content.split(' | ')[0]), ['**New claim**']);
 assert.deepEqual(plan(rec.state, snap([...START, row('a', 'n ; n log^1/2', 'lean-verified')]), [], Date.parse('2026-11-05T01:00:00Z')).messages.map(m => m.content.split(' | ')[0]), ['**Record verified**']);
});

test('the chat and the landing page read the frontier rows', () => {
 const records = [...START, row('new', 'n ; n log^1/2', 'claimed', '2026-11-05'), row('tie', 'n log^1/4 ; n log^3/4', 'claimed', '2026-11-06')];
 assert.deepEqual(boardLeaders(problem, records).map(r => r.id), ['directed-sssp-2026', 'new']);
 assert.deepEqual(ssspFrontier(records).map(r => r.id), ['directed-sssp-2026', 'new', 'tie'], 'no line without its argument');
 assert.deepEqual(landingRecords(records, problem.direction, lines).map(r => r.id), ['new'], 'the breakthrough has its own column');
 // The rational paths (ranking.ts, chart.ts) cannot read a "D ; T" score: every generic caller goes through boardLeaders.
 assert.throws(() => ranked(records, problem.direction)); assert.throws(() => scoreValue(records[2].score));
 // Another board keeps its rank-1 rows.
 const other = [row('x', '1/2'), row('y', '1/3'), row('z', '1/3')];
 assert.deepEqual(boardLeaders({slug: '3sum', direction: 'lower-is-better'}, other).map(r => r.id), ['y', 'z']);
});
