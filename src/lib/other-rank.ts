// The order of the claims of an Other bounds row, best first, by the row's direction. A claim has no
// single exact format ('\approx6.14\cdot10^{-11}', '2^{-38}', '10499/12000', '\le0.87488664704'), so its
// number is read from its display, then from its exact value. Claims that tie share a rank, the higher
// evidence level first, then the earliest, as on the Big O pages. When a number cannot be read for some claim, the row keeps the newest
// first. That is only a fallback: a claim listed by hand was the best when it appeared, but a prove2.me
// claim needs only to beat the best Lean Verified claim at its time (data/prove2me_import.py), so the
// newest claim is not always the best.
//
// A claim of the form A d^p ('80{,}000d^{17}', the contingency tables row) has no single number: d^p dominates
// A for large d, so its order is lexicographic, by the exponent p first, then by the constant A (site#9, darkhipo).
// It is read only from the whole display, and the row uses that order only when every one of its claims is such a claim.
//
// Of claims that tie, the one with the higher evidence level ranks first (Nil, 2026-11-04; evidenceOrder), then the earlier one.
type Claim = {display: string; value: string; date: string; evidence?: string};

import {evidenceOrder} from './evidence.ts';

const DEGREE_CLAIM = /^(\d+(?:\{,\}\d{3})*(?:\.\d+)?)d\^\{(-?\d+)\}$/;

// A d^p as the exact rational A (numerator, denominator) and the exponent p, or null for any other display.
export function parseDegreeClaim(display: string): {a: [bigint, bigint]; p: bigint} | null {
  const m = DEGREE_CLAIM.exec(display);
  if (!m) return null;
  const [whole, fraction = ''] = m[1].replaceAll('{,}', '').split('.');
  return {a: [BigInt(whole + fraction), 10n ** BigInt(fraction.length)], p: BigInt(m[2])};
}

// A d^p has no single number (see above), so it stays unread here, even when A has a decimal point.
export function otherClaimNumber(claim: Pick<Claim, 'display' | 'value'>): number | null {
  if (parseDegreeClaim(claim.display)) return null;
  const power10 = /(\d+(?:\.\d+)?)\s*\\cdot\s*10\^\{?\s*(-?\d+)\s*\}?/.exec(claim.display);
  if (power10) return Number(power10[1] + 'e' + power10[2]);
  const power = /\b(\d+)\^\{\s*(-?\d+)\s*\}/.exec(claim.display);
  if (power) return Number(power[1]) ** Number(power[2]);
  const decimal = /\d+\.\d+/.exec(claim.display);
  if (decimal) return Number(decimal[0]);
  const fraction = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(claim.value);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const whole = /^\s*(\d+)\s*$/.exec(claim.display) ?? /^\s*(\d+)\s*$/.exec(claim.value);
  return whole ? Number(whole[1]) : null;
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

// Claims that differ by less than a float can tell (the quasi-Riemann claims of 2026-10-31 differ by 7e-20) are
// ordered by their exact fractions, when both have one that agrees with the number read from the display.
// Otherwise they tie, as before.
function exactFraction({claim, number}: {claim: Claim; number: number | null}): [bigint, bigint] | null {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(claim.value);
  if (!m || number === null || BigInt(m[2]) === 0n) return null;
  const fraction = Number(m[1]) / Number(m[2]);
  return Math.abs(fraction - number) <= 1e-6 * Math.max(Math.abs(fraction), Math.abs(number)) ? [BigInt(m[1]), BigInt(m[2])] : null;
}
export const compareExact = (a: [bigint, bigint], b: [bigint, bigint]) => { const d = a[0] * b[1] - b[0] * a[1]; return d < 0n ? -1 : d > 0n ? 1 : 0; };

const compareDegree = (a: {a: [bigint, bigint]; p: bigint}, b: {a: [bigint, bigint]; p: bigint}) =>
  a.p !== b.p ? (a.p < b.p ? -1 : 1) : compareExact(a.a, b.a);

export function rankOtherClaims<C extends Claim>(claims: C[], direction: string, rankBy?: string[]): {claim: C; rank: number; tie: boolean}[] {
  if (rankBy?.length) return rankByMeasures(claims, rankBy);
  const degrees = claims.map(claim => parseDegreeClaim(claim.display));
  if (claims.length > 0 && degrees.every(d => d !== null)) {
    const sign = direction === 'higher' ? -1 : 1;
    const items = claims.map((claim, index) => ({claim, index, degree: degrees[index]!}));
    const sorted = [...items].sort((a, b) => sign * compareDegree(a.degree, b.degree) || evidenceOrder(b.claim.evidence) - evidenceOrder(a.claim.evidence) || a.index - b.index);
    let rank = 0;
    return sorted.map((item, i) => {
      const tie = i > 0 && compareDegree(item.degree, sorted[i - 1].degree) === 0;
      if (!tie) rank = i + 1;
      return {claim: item.claim, rank, tie};
    });
  }
  const entries = claims.map((claim, index) => {
    const number = otherClaimNumber(claim);
    return {claim, index, number, exact: exactFraction({claim, number})};
  });
  const sign = direction === 'higher' ? -1 : 1;
  const known = entries.every(e => e.number !== null);
  const order = (a: typeof entries[number], b: typeof entries[number]) => {
    if (!same(a.number!, b.number!)) return sign * (a.number! - b.number!);
    return a.exact && b.exact ? sign * compareExact(a.exact, b.exact) : 0;
  };
  const sorted = [...entries].sort((a, b) => known ? order(a, b) || evidenceOrder(b.claim.evidence) - evidenceOrder(a.claim.evidence) || a.index - b.index : b.index - a.index);
  let rank = 0;
  return sorted.map((entry, i) => {
    const prev = sorted[i - 1];
    const tie = known && i > 0 && order(entry, prev) === 0;
    if (!tie) rank = i + 1;
    return {claim: entry.claim, rank, tie};
  });
}

// A row with `rankBy` (Z is Diophantine in Q; Nil, 2026-11-06: degree first, then variables, then nonzero terms, then
// largest absolute coefficient) ranks its claims by those measures in that order, each lower is better, instead of by
// the one number of the display. A claim's `measures` map each name to an exact whole number ("4", "12504") or to a
// stated upper bound ("<2^80", "<2^(2^45)", "<2^^7", a tower of twos): a bound compares as its value, so an exact
// value beats it only when smaller, and an equal one ties with it. A missing measure (a term count nobody stated)
// ranks after every stated one. Claims equal on every measure tie: the higher evidence level first, then the earlier.
export type Measures = Record<string, string | undefined>;
type Magnitude = bigint | {exp: Magnitude};

// The magnitude of a measure, with its upper bound flag; null for text the grammar does not know.
export function parseMeasure(text: string): {magnitude: Magnitude; bound: boolean} | null {
  const bound = text.trim().startsWith('<');
  const magnitude = parseMagnitude(text.trim().replace(/^<\s*/, '').replaceAll('{,}', '').replaceAll(/[\s,]/g, ''));
  return magnitude === null ? null : {magnitude, bound};
}
function parseMagnitude(text: string): Magnitude | null {
  if (/^\d+$/.test(text)) return BigInt(text);
  const tower = /^2\^\^(\d+)$/.exec(text);
  if (tower) { let m: Magnitude = 2n; for (let i = 1; i < Number(tower[1]); i++) m = {exp: m}; return normal(m); }
  const power = /^2\^\(?(.+?)\)?$/.exec(text);
  if (power) { const inner = parseMagnitude(power[1]); return inner === null ? null : normal({exp: inner}); }
  return null;
}
// 2^n with n at most 4096 is a plain whole number, so that "2^80" and a 24-digit coefficient compare exactly.
const normal = (m: Magnitude): Magnitude => typeof m === 'bigint' ? m : (() => { const e = normal(m.exp); return typeof e === 'bigint' && e <= 4096n ? 2n ** e : {exp: e}; })();
// A tower with an exponent over 4096 counts as larger than any plain number (none in the data has 1234 digits).
export function compareMagnitude(a: Magnitude, b: Magnitude): number {
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'bigint') return -1;
  if (typeof b === 'bigint') return 1;
  return compareMagnitude(a.exp, b.exp);
}
// Lower is better for every measure; a missing or unreadable one ranks last.
export function compareMeasures(a: Measures | undefined, b: Measures | undefined, rankBy: string[]): number {
  for (const name of rankBy) {
    const x = a?.[name] === undefined ? null : parseMeasure(a[name]!), y = b?.[name] === undefined ? null : parseMeasure(b[name]!);
    if (x === null && y === null) continue;
    if (x === null) return 1;
    if (y === null) return -1;
    const c = compareMagnitude(x.magnitude, y.magnitude);
    if (c) return c;
  }
  return 0;
}
export function rankByMeasures<C extends Claim & {measures?: Measures}>(claims: C[], rankBy: string[]): {claim: C; rank: number; tie: boolean}[] {
  const items = claims.map((claim, index) => ({claim, index}));
  const order = (a: typeof items[number], b: typeof items[number]) => compareMeasures(a.claim.measures, b.claim.measures, rankBy);
  const sorted = [...items].sort((a, b) => order(a, b) || evidenceOrder(b.claim.evidence) - evidenceOrder(a.claim.evidence) || a.index - b.index);
  let rank = 0;
  return sorted.map((item, i) => {
    const tie = i > 0 && order(item, sorted[i - 1]) === 0;
    if (!tie) rank = i + 1;
    return {claim: item.claim, rank, tie};
  });
}
