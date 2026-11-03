import json
from fractions import Fraction
from pathlib import Path
import unittest

import sssp

CASES = json.loads((Path(__file__).parent / 'direct-fixtures/sssp-cases.json').read_text())


class SharedCaseTests(unittest.TestCase):
    """direct-fixtures/sssp-cases.json: the cases that data/sssp.py, src/lib/sssp.ts and the verifier's
    parse_sssp agree on (the verifier keeps a byte copy)."""
    def test_normal_forms(self):
        for case in CASES['parse']:
            with self.subTest(text=case['text']):
                self.assertEqual(sssp.parse(case['text']), tuple(Fraction(x) for x in case['exponents']))
                t = sssp.parse(case['text'])
                self.assertEqual(sssp.text(t[:2], sssp.D_NAMES) + ' ; ' + sssp.text(t[2:]), case['text'])

    def test_refusals(self):
        for text in CASES['refuse']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                sssp.parse(text)

    def test_function_rows(self):
        for row in CASES['functions']:
            for d, t in row['at'].items():
                with self.subTest(row=row['name'], d=d):
                    self.assertEqual(sssp.text(sssp.time_at(row['terms'], sssp.density(d))), t)

    def test_gate(self):
        for case in CASES['gate']:
            with self.subTest(candidate=case['candidate'], verified=case['lean_verified']):
                points = [sssp.parse(p) for p in case['lean_verified']]
                c = sssp.parse(case['candidate'])
                b = sssp.best(c[:2], points)
                self.assertEqual(None if b is None else sssp.text(b), case['best'])
                self.assertEqual(sssp.qualifies(c, points), case['runs'])


class RuleTests(unittest.TestCase):
    def test_the_classic_never_gates(self):
        # Nil, 2026-11-02: a Lean proof worse than the classic bound runs when it is the best Lean Verified bound.
        self.assertTrue(sssp.qualifies(sssp.parse('n log^1/2 ; n log^2'), []))
        self.assertEqual(sssp.text(sssp.time_at(sssp.CLASSIC, sssp.density('n log^1/2'))), 'n log')

    def test_a_denser_row_covers_a_sparser_density_only(self):
        chd = sssp.parse('n log^3/4 ; n log^11/12')
        self.assertEqual(sssp.best((Fraction(1), Fraction(1, 4)), [chd]), chd[2:])
        self.assertIsNone(sssp.best((Fraction(1), Fraction(1)), [chd]))

    def test_bad_terms(self):
        for t in [{}, {'x': '1'}, {'m': 'a'}]:
            with self.subTest(term=t), self.assertRaises((ValueError, ZeroDivisionError)):
                sssp.time_at([t], (Fraction(1), Fraction(0)))
        with self.assertRaises(ValueError):
            sssp.time_at([], (Fraction(1), Fraction(0)))


if __name__ == '__main__':
    unittest.main()
