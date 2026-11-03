import { test } from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { parse, text, density, lexCmp, timeAt, best, qualifies, qText, latex, D_NAMES, plain, CLASSIC, functionText, parseFunction, functionLatex } from './sssp.ts';
// The cases that data/sssp.py, this module and the verifier's parse_sssp agree on.
const CASES = JSON.parse(readFileSync(new URL('../../data/direct-fixtures/sssp-cases.json', import.meta.url), 'utf8'));
test('normal forms parse to the shared exponent tuples', () => {
 for (const c of CASES.parse) { const t = parse(c.text); assert.deepEqual(t.map(qText), c.exponents, c.text); assert.equal(text(t.slice(0, 2), D_NAMES) + ' ; ' + text(t.slice(2)), c.text); }
});
test('every shared refusal is refused', () => { for (const t of CASES.refuse) assert.throws(() => parse(t), Error, JSON.stringify(t)); });
test('T >= n·D is refused as the statement\'s own bound (Lead, 2026-11-03)', () => {
 for (const t of ['n^2 ; n^3', 'n ; n^2', 'n log^3/4 ; n^2 log^3/4']) assert.throws(() => parse(t), /below n·D/, t);
 assert.equal(text(parse('n ; n^2 loglog^-1').slice(2)), 'n^2 loglog^-1');
});
test('function rows give the shared time at each density', () => {
 for (const row of CASES.functions) { assert.equal(functionText(row.terms), row.text); assert.deepEqual(parseFunction(row.text), row.terms); }
 for (const bad of ['m^1 + n', 'm  + n', 'm log log', 'm^2/4', '']) assert.throws(() => parseFunction(bad), Error, bad);
 assert.equal(functionLatex(CLASSIC), 'm + n \\log n');
 for (const row of CASES.functions) for (const [d, t] of Object.entries(row.at)) assert.equal(text(timeAt(row.terms, density(d))), t, `${row.name} at ${d}`);
 // A row with up_to is valid only up to that density (C-HD: above the cap the theorem gives (n+1)(m+1)).
 for (const row of CASES.functions) if (row.up_to) for (const d of Object.keys(row.at)) assert.ok(lexCmp(density(d), density(row.up_to)) <= 0, `${row.name} at ${d} is above up_to`);
});
test('the gate agrees with the shared cases, and the classic never gates', () => {
 for (const c of CASES.gate) {
  const points = c.lean_verified.map(parse), cand = parse(c.candidate);
  const lines = c.lean_lines.map((l: { function: string; up_to: string }) => ({ terms: parseFunction(l.function), cap: density(l.up_to) }));
  const b = best(cand.slice(0, 2), points, lines), label = `${c.candidate} with ${lines.length} line(s)`;
  assert.equal(b ? text(b) : null, c.best, label); assert.equal(qualifies(cand, points, lines), c.runs, label);
 }
 assert.equal(qualifies(parse('n log^1/2 ; n log^2'), []), true);
 assert.equal(text(timeAt(CLASSIC, density('n log^1/2'))), 'n log');
});
test('latex', () => { assert.equal(latex(parse(CASES.parse[0].text).slice(2)), 'n \\log^{11/12} n'); assert.equal(latex(density('n log^3/4'), D_NAMES), 'n \\log^{3/4} n'); });
test('plain text for aria labels has no TeX', () => {
 assert.deepEqual(['n', 'n log^1/4', 'n log', 'n^2'].map(d => plain(density(d), D_NAMES)), ['n', 'n log^(1/4) n', 'n log n', 'n^2']);
 assert.equal(plain(parse('n log^3/4 ; n log^11/12 loglog^1/2').slice(2)), 'n log^(11/12) n (log log n)^(1/2)');
});
