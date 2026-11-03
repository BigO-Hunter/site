// The order of the claims of an Other bounds row, best first, by the row's direction. A claim has no
// single exact format ('\approx6.14\cdot10^{-11}', '2^{-38}', '10499/12000', '\le0.87488664704'), so its
// number is read from its display, then from its exact value. Claims that tie share a rank, the earliest
// first, as on the Big O pages. When a number cannot be read for some claim, the row keeps the newest
// first. That is only a fallback: a claim listed by hand was the best when it appeared, but a prove2.me
// claim needs only to beat the best Lean Verified claim at its time (data/prove2me_import.py), so the
// newest claim is not always the best.
//
// A claim of the form A d^p ('80{,}000d^{17}', the contingency tables row) has no single number: d^p dominates
// A for large d, so its order is lexicographic, by the exponent p first, then by the constant A (site#9, darkhipo).
// It is read only from the whole display, and the row uses that order only when every one of its claims is such a claim.
type Claim = {display: string; value: string; date: string};

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

export function rankOtherClaims<C extends Claim>(claims: C[], direction: string): {claim: C; rank: number; tie: boolean}[] {
  const degrees = claims.map(claim => parseDegreeClaim(claim.display));
  if (claims.length > 0 && degrees.every(d => d !== null)) {
    const sign = direction === 'higher' ? -1 : 1;
    const items = claims.map((claim, index) => ({claim, index, degree: degrees[index]!}));
    const sorted = [...items].sort((a, b) => sign * compareDegree(a.degree, b.degree) || a.index - b.index);
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
  const sorted = [...entries].sort((a, b) => known ? order(a, b) || a.index - b.index : b.index - a.index);
  let rank = 0;
  return sorted.map((entry, i) => {
    const prev = sorted[i - 1];
    const tie = known && i > 0 && order(entry, prev) === 0;
    if (!tie) rank = i + 1;
    return {claim: entry.claim, rank, tie};
  });
}
