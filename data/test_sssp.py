import hashlib
import json
from fractions import Fraction
from pathlib import Path
import unittest

import sssp

CASES_FILE = Path(__file__).parent / 'direct-fixtures/sssp-cases.json'
CASES = json.loads(CASES_FILE.read_text())


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
            self.assertEqual(sssp.function_text(row['terms']), row['text'])
            self.assertEqual(sssp.parse_function(row['text']), row['terms'])
            for d, t in row['at'].items():
                with self.subTest(row=row['name'], d=d):
                    self.assertEqual(sssp.text(sssp.time_at(row['terms'], sssp.density(d))), t)
            if 'up_to' in row:
                for d in row['at']:
                    self.assertLessEqual(sssp.cmp(sssp.density(d), sssp.density(row['up_to'])), 0, (row['name'], d))

    def test_the_verifier_trusts_the_same_cases(self):
        # The newest trusted verifier controller with tests/fixtures/sssp-cases.json has this file's git blob, so a
        # change to the cases on one side only fails here. previous_controller_blobs is appended in push order and
        # controller_blobs is read last: if controller_blobs gets the case file, it must be the newest entry.
        trust = json.loads((Path(__file__).parent / 'direct-trust.json').read_text())
        entries = [*trust['previous_controller_blobs'].values(), trust['controller_blobs']]
        blobs = [e['tests/fixtures/sssp-cases.json']['sha'] for e in entries if 'tests/fixtures/sssp-cases.json' in e]
        data = CASES_FILE.read_bytes()
        self.assertTrue(blobs, 'no trusted verifier has the case file')
        self.assertEqual(blobs[-1], hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest())

    def test_the_statement_bound_is_refused(self):
        # Lead, 2026-11-03 (verifier #134): T >= n·D adds nothing to the second clause of Bound.
        for t in ['n^2 ; n^3', 'n ; n^2', 'n log^3/4 ; n^2 log^3/4']:
            with self.subTest(t=t), self.assertRaisesRegex(ValueError, 'below n·D'):
                sssp.parse(t)
        self.assertEqual(sssp.parse('n ; n^2 loglog^-1')[2:], (2, 0, -1))

    def test_gate(self):
        for case in CASES['gate']:
            with self.subTest(candidate=case['candidate'], verified=case['lean_verified'], lines=len(case['lean_lines'])):
                points = [sssp.parse(p) for p in case['lean_verified']]
                lines = [(sssp.parse_function(l['function']), sssp.density(l['up_to'])) for l in case['lean_lines']]
                c = sssp.parse(case['candidate'])
                b = sssp.best(c[:2], points, lines)
                self.assertEqual(None if b is None else sssp.text(b), case['best'])
                self.assertEqual(sssp.qualifies(c, points, lines), case['runs'])


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
        for text in ['m^1 + n', 'm  + n', 'm log log', 'm^2/4', '']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                sssp.parse_function(text)


if __name__ == '__main__':
    unittest.main()
