// Directed shortest paths board: exact density-time comparison (no reals). Mirrors data/sssp.py;
// data/direct-fixtures/sssp-cases.json holds the cases that both and the verifier agree on.
// A point row is "D ; T" in the verifier's normal form: D = n^a log^b, T = n^a' log^b' loglog^c'.
// A function row is a sum of terms m^p n^q log^r loglog^s (log(2+m/n))^k; at D its time is the
// lexicographically largest term tuple. f = O(g) exactly when f's tuple is at most g's in lex order.

export type Q = { n: bigint; d: bigint };
export type Term = Partial<Record<'m' | 'n' | 'log' | 'loglog' | 'logratio', string>>;

const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; };
export function q(n: bigint, d = 1n): Q { if (d === 0n) throw new Error('zero denominator'); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return { n: n / g, d: d / g }; }
export function parseQ(s: string): Q {
 const m = /^(-?\d+)(?:\/(\d+))?$/.exec(s); if (!m) throw new Error(`not an exact rational: ${s}`);
 return q(BigInt(m[1]), BigInt(m[2] ?? '1'));
}
export const qText = (x: Q): string => x.d === 1n ? `${x.n}` : `${x.n}/${x.d}`;
export const qCmp = (x: Q, y: Q): number => { const v = x.n * y.d - y.n * x.d; return v < 0n ? -1 : v > 0n ? 1 : 0; };
const add = (x: Q, y: Q): Q => q(x.n * y.d + y.n * x.d, x.d * y.d);
const mul = (x: Q, y: Q): Q => q(x.n * y.n, x.d * y.d);
const ZERO = q(0n), ONE = q(1n);

export function lexCmp(x: Q[], y: Q[]): number { for (let i = 0; i < x.length; i++) { const c = qCmp(x[i], y[i]); if (c) return c; } return 0; }

export const EXAMPLE = 'n log^3/4 ; n log^11/12';
const FACTOR = /^(n|log|loglog)(?:\^(-?(?:0|[1-9][0-9]{0,39})(?:\/[1-9][0-9]{0,39})?))?$/;
export const D_NAMES = ['n', 'log'] as const;
export const T_NAMES = ['n', 'log', 'loglog'] as const;
const HELP = `the bound for directed-sssp must be "D ; T", for example "${EXAMPLE}"`;

function side(text: string, names: readonly string[]): Q[] {
 const exps = names.map(() => ZERO); let order = [...names];
 for (const token of text.split(' ')) {
  const m = FACTOR.exec(token); if (!m || !order.includes(m[1])) throw new Error(HELP);
  const [, name, raw] = m; order = order.slice(order.indexOf(name) + 1);
  if (raw === undefined) { exps[names.indexOf(name)] = ONE; continue; }
  const v = parseQ(raw); if (qText(v) !== raw || qCmp(v, ZERO) === 0 || qCmp(v, ONE) === 0) throw new Error(HELP);
  exps[names.indexOf(name)] = v;
 }
 return exps;
}
export function text(exps: Q[], names: readonly string[] = T_NAMES): string {
 return names.map((name, i) => qCmp(exps[i], ZERO) === 0 ? '' : qCmp(exps[i], ONE) === 0 ? name : `${name}^${qText(exps[i])}`).filter(Boolean).join(' ');
}

// Lead, 2026-11-03 (verifier #134): the second clause of Bound gives every program C(n+1)(m+1), so a row with
// T >= n·D says nothing new. The form refuses it; this is the statement's own bound, not the classic.
export const G1_HELP = 'the time T of directed-sssp must be below n·D: the statement already gives every program C(n+1)(m+1)';
/** [a, b, a', b', c'] of a normal-form point row; throws otherwise (the verifier's ranges). */
export function parse(value: string): Q[] {
 if (typeof value !== 'string' || value.split(' ; ').length !== 2) throw new Error(HELP);
 const [dText, tText] = value.split(' ; '); if (!dText || !tText) throw new Error(HELP);
 const d = side(dText, D_NAMES), t = side(tText, T_NAMES);
 if (text(d, D_NAMES) !== dText || text(t) !== tText) throw new Error(HELP);
 const [a, b] = d;
 if (qCmp(a, ONE) < 0 || qCmp(a, q(2n)) > 0 || qCmp(b, ZERO) < 0 || (qCmp(a, q(2n)) === 0 && qCmp(b, ZERO) !== 0))
  throw new Error('the edge bound D of directed-sssp must be between n and n^2');
 if (lexCmp(t, [a, b, ZERO]) < 0 || lexCmp(t, [q(3n), ZERO, ZERO]) > 0)
  throw new Error('the time T of directed-sssp must be at least the edge bound D and at most n^3');
 if (lexCmp(t, [add(a, ONE), b, ZERO]) >= 0) throw new Error(G1_HELP);
 return [...d, ...t];
}
export function density(value: string): Q[] { const d = side(value, D_NAMES); if (text(d, D_NAMES) !== value) throw new Error(HELP); return d; }

const KEYS = ['m', 'n', 'log', 'loglog', 'logratio'] as const;
/** T(D) of a function row at D = [a, b]. */
export function timeAt(terms: Term[], d: Q[]): Q[] {
 if (!terms.length) throw new Error('a function row needs at least one term');
 const [a, b] = d;
 const ratio = qCmp(a, ONE) > 0 ? [ZERO, ONE, ZERO] : qCmp(b, ZERO) > 0 ? [ZERO, ZERO, ONE] : [ZERO, ZERO, ZERO];
 let best: Q[] | undefined;
 for (const t of terms) {
  if (!Object.keys(t).length || Object.keys(t).some(k => !(KEYS as readonly string[]).includes(k))) throw new Error('bad function-row term');
  const [p, n, l, ll, k] = KEYS.map(key => parseQ(t[key] ?? '0'));
  const v = [add(add(mul(p, a), n), mul(k, ratio[0])), add(add(mul(p, b), l), mul(k, ratio[1])), add(ll, mul(k, ratio[2]))];
  if (!best || lexCmp(v, best) > 0) best = v;
 }
 return best!;
}
/** The score text of a function row (data/sssp.py function_text). */
export function functionText(terms: Term[]): string {
 return terms.map(t => KEYS.map(k => { const e = parseQ(t[k] ?? '0'); return qCmp(e, ZERO) === 0 ? '' : qCmp(e, ONE) === 0 ? k : `${k}^${qText(e)}`; }).filter(Boolean).join(' ') || '1').join(' + ');
}
export function parseFunction(value: string): Term[] {
 const terms = value.split(' + ').map(part => { const t: Term = {}; for (const token of part.split(' ')) {
  const m = /^(m|n|loglog|logratio|log)(?:\^(-?(?:0|[1-9][0-9]{0,39})(?:\/[1-9][0-9]{0,39})?))?$/.exec(token);
  if (!m || m[1] in t) throw new Error(`bad function row term: ${part}`); t[m[1] as keyof Term] = m[2] ?? '1'; } return t; });
 if (functionText(terms) !== value) throw new Error(`a function row score must be in normal form: ${value}`);
 return terms;
}
/** KaTeX for a function row, e.g. O(m + n \log n). */
export function functionLatex(terms: Term[]): string {
 const f: Record<string, (e: string) => string> = { m: e => e === '1' ? 'm' : `m^{${e}}`, n: e => e === '1' ? 'n' : `n^{${e}}`, log: e => e === '1' ? '\\log n' : e === '1/2' ? '\\sqrt{\\log n}' : `\\log^{${e}} n`, loglog: e => e === '1' ? '\\log\\log n' : e === '1/2' ? '\\sqrt{\\log\\log n}' : `(\\log\\log n)^{${e}}`, logratio: e => e === '1' ? '\\log(2+m/n)' : `\\log^{${e}}(2+m/n)` };
 const bare: Record<string, string> = { m: 'm', n: 'n', log: '\\log n', loglog: '\\log\\log n', logratio: '\\log(2+m/n)' };
 return terms.map(t => { const keys = KEYS.filter(k => t[k] && qCmp(parseQ(t[k]!), ZERO) !== 0); const es = keys.map(k => qText(parseQ(t[k]!)));
  // A term whose factors all have exponent 1/2 reads as one square root, e.g. \sqrt{m n \log n \log\log n}.
  if (keys.length > 1 && es.every(e => e === '1/2')) return `\\sqrt{${keys.map(k => bare[k]).join(' ')}}`;
  return keys.map((k, i) => f[k](es[i])).join(' ') || '1'; }).join(' + ');
}
/** KaTeX for a row: a point row "m \le D: O(T)", a function row "O(f)". */
export function rowLatex(score: string): string {
 if (score.includes(' ; ')) { const t = parse(score); return `m \\le ${latex(t.slice(0, 2), D_NAMES)}:\\ O(${latex(t.slice(2))})`; }
 return `O(${functionLatex(parseFunction(score))})`;
}
export const CLASSIC: Term[] = [{ m: '1' }, { n: '1', log: '1' }];
export const RANGE_END = [q(3n), ZERO, ZERO];

/** A Lean Verified function line: its terms up to its cap density (Vals AI's proven Tchd). */
export type Line = { terms: Term[]; cap: Q[] };
/** The gate's best(D): the smallest T among Lean Verified point rows whose D covers D, and Lean Verified
 * lines at D when D <= cap; undefined if none. The only such line is Vals AI's proven Tchd (Lead, 2026-11-03,
 * verifier #134: below the cap a new row must beat it). Claimed rows, the paper function rows and the
 * classic never gate (Nil, 2026-10-20 and 2026-11-02). */
export function best(d: Q[], points: Q[][], lines: Line[] = []): Q[] | undefined {
 const times = [...points.filter(p => lexCmp(p.slice(0, 2), d) >= 0).map(p => p.slice(2)),
  ...lines.filter(l => lexCmp(d, l.cap) <= 0).map(l => timeAt(l.terms, d))];
 return times.reduce<Q[] | undefined>((m, t) => !m || lexCmp(t, m) < 0 ? t : m, undefined);
}
export function qualifies(candidate: Q[], points: Q[][], lines: Line[] = []): boolean {
 const current = best(candidate.slice(0, 2), points, lines);
 return current ? lexCmp(candidate.slice(2), current) < 0 : lexCmp(candidate.slice(2), RANGE_END) <= 0;
}
/** The frontier rows of the directed-sssp board (Lead, 2026-11-03): the point rows [a, b, a', b', c'] that no other point
 * row dominates (a D at least as dense and a T at most as large, strict in one; an exactly equal row dominates a row with a
 * lower evidence level, and the rows after it at the same level, so of equal rows the highest level leads, then the earliest,
 * as ranked() does on the other boards; Nil, 2026-11-04) and that no Lean Verified line of
 * another row dominates (D <= cap and T >= T(D) of the line: such a row only ties the gate, G2). rows: earliest first, with
 * level = evidenceOrder of the row (0 when absent); the ids in that order. */
export function frontier(rows: { id: string; t: Q[]; level?: number }[], lines: (Line & { row: string })[] = []): string[] {
 const dominates = (x: Q[], y: Q[]) => { const d = lexCmp(x.slice(0, 2), y.slice(0, 2)), t = lexCmp(x.slice(2), y.slice(2)); return d >= 0 && t <= 0 && (d > 0 || t < 0); };
 const equal = (x: Q[], y: Q[]) => lexCmp(x, y) === 0;
 const first = (o: { level?: number }, j: number, r: { level?: number }, i: number) => (o.level ?? 0) > (r.level ?? 0) || ((o.level ?? 0) === (r.level ?? 0) && j < i);
 return rows.filter((r, i) => !rows.some((o, j) => o !== r && (dominates(o.t, r.t) || (equal(o.t, r.t) && first(o, j, r, i))))
  && !lines.some(l => l.row !== r.id && lexCmp(r.t.slice(0, 2), l.cap) <= 0 && lexCmp(r.t.slice(2), timeAt(l.terms, r.t.slice(0, 2))) >= 0)).map(r => r.id);
}
/** Plain text for a time or density tuple, for aria labels, e.g. n log^(3/4) n. */
export function plain(exps: Q[], names: readonly string[] = T_NAMES): string {
 const pow = (base: string, e: Q, tail = '') => qCmp(e, ONE) === 0 ? `${base}${tail}` : `${base}^${e.d === 1n ? qText(e) : `(${qText(e)})`}${tail}`;
 const parts = names.map((name, i) => qCmp(exps[i], ZERO) === 0 ? '' : name === 'n' ? pow('n', exps[i]) : name === 'log' ? pow('log', exps[i], ' n') : qCmp(exps[i], ONE) === 0 ? 'log log n' : `(log log n)^${exps[i].d === 1n ? qText(exps[i]) : `(${qText(exps[i])})`}`);
 return parts.filter(Boolean).join(' ') || '1';
}
/** KaTeX for a time or density tuple, e.g. n \log^{3/4} n. */
export function latex(exps: Q[], names: readonly string[] = T_NAMES): string {
 const pow = (base: string, e: Q, tail = '') => qCmp(e, ONE) === 0 ? `${base}${tail}` : `${base}^{${qText(e)}}${tail}`;
 const parts = names.map((name, i) => qCmp(exps[i], ZERO) === 0 ? '' : name === 'n' ? pow('n', exps[i]) : name === 'log' ? pow('\\log', exps[i], ' n') : qCmp(exps[i], ONE) === 0 ? '\\log\\log n' : `(\\log\\log n)^{${qText(exps[i])}}`);
 return parts.filter(Boolean).join(' ') || '1';
}
/** The board table (SsspBoard.astro): one section per density (n, the chart ticks and each point row's density), sparsest
 * first, with each row that holds there, fastest first. A function row holds at every density; a point row at its own
 * density and at each sparser one, with from = its own density. A row's home is the densest section it is in (a point row's
 * own density, m <= n^2 for a function row): only there does the table show its full credit (site#14, 2026-11-05). */
export function densitySections(board: { records: { id: string; score: string }[]; chart: { ticks: string[] } }, has: (id: string) => boolean = () => true) {
 const records = board.records.filter(r => has(r.id));
 const points = records.filter(r => r.score.includes(' ; ')).map(r => ({ id: r.id, t: parse(r.score) }));
 const functions = records.filter(r => !r.score.includes(' ; ')).map(r => ({ id: r.id, terms: parseFunction(r.score) }));
 const densities = [...['n', ...board.chart.ticks].map(density), ...points.map(p => p.t.slice(0, 2))].sort(lexCmp).filter((d, i, a) => i === 0 || lexCmp(d, a[i - 1]) !== 0);
 const sections = densities.map(d => {
  const rows = [
   ...functions.map(f => ({ id: f.id, t: timeAt(f.terms, d), from: undefined as Q[] | undefined })),
   ...points.filter(p => lexCmp(p.t.slice(0, 2), d) >= 0).map(p => ({ id: p.id, t: p.t.slice(2), from: lexCmp(p.t.slice(0, 2), d) > 0 ? p.t.slice(0, 2) : undefined })),
  ].sort((a, b) => lexCmp(a.t, b.t));
  return { d, rows: rows.map(r => ({ ...r, best: lexCmp(r.t, rows[0].t) === 0, home: false, homeD: d })) };
 });
 const homes = new Map<string, Q[]>();
 for (const s of sections) for (const r of s.rows) homes.set(r.id, s.d);
 for (const s of sections) for (const r of s.rows) { r.homeD = homes.get(r.id)!; r.home = lexCmp(r.homeD, s.d) === 0; }
 return sections;
}
