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
export const CLASSIC: Term[] = [{ m: '1' }, { n: '1', log: '1' }];
export const RANGE_END = [q(3n), ZERO, ZERO];

/** The gate's best(D): the smallest T among Lean Verified point rows whose D covers D; undefined if none.
 * Claimed rows, function rows and the classic never gate (Nil, 2026-10-20 and 2026-11-02). */
export function best(d: Q[], points: Q[][]): Q[] | undefined {
 const times = points.filter(p => lexCmp(p.slice(0, 2), d) >= 0).map(p => p.slice(2));
 return times.reduce<Q[] | undefined>((m, t) => !m || lexCmp(t, m) < 0 ? t : m, undefined);
}
export function qualifies(candidate: Q[], points: Q[][]): boolean {
 const current = best(candidate.slice(0, 2), points);
 return current ? lexCmp(candidate.slice(2), current) < 0 : lexCmp(candidate.slice(2), RANGE_END) <= 0;
}
/** KaTeX for a time or density tuple, e.g. n \log^{3/4} n. */
export function latex(exps: Q[], names: readonly string[] = T_NAMES): string {
 const pow = (base: string, e: Q, tail = '') => qCmp(e, ONE) === 0 ? `${base}${tail}` : `${base}^{${qText(e)}}${tail}`;
 const parts = names.map((name, i) => qCmp(exps[i], ZERO) === 0 ? '' : name === 'n' ? pow('n', exps[i]) : name === 'log' ? pow('\\log', exps[i], ' n') : pow('\\log\\log', exps[i], ' n'));
 return parts.filter(Boolean).join(' ') || '1';
}
