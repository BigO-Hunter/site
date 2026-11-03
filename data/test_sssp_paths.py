"""The generic score paths of the data tools on the directed-sssp board, with "D ; T" rows (design note section 7,
Reviewer point 7). On 2026-11-03 at 16:17Z review_hold.py stopped the hourly refresh with Fraction('m log^2/3 + n'):
each reader that can meet this board must handle it, and each reader that does not read it stays away from it."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import direct_import as d
import direct_refresh as r
import prove2me_import
import review_hold

ROOT = Path(__file__).resolve().parent
BOARD = json.loads((ROOT / 'directed-sssp.json').read_text())


def issue(number, bound):
    body = ('### Problem\n\ndirected-sssp\n\n### Repository URL\n\nhttps://github.com/someone/sssp\n\n'
            f'### Commit SHA\n\n{"a" * 40}\n\n### Bound\n\n{bound}\n')
    item = dict(number=number, html_url=f'https://github.com/bigospeedrun/verifier/issues/{number}', body=body,
                user=dict(login='someone'), created_at='2026-11-04T00:00:00Z', state='open', labels=[])
    return dict(route='issue', item=item, submission=d.parse_body(body))


def claimed(board):
    """The board with every row Claimed, so a test does not depend on the live tiers of data/directed-sssp.json."""
    board = json.loads(json.dumps(board))
    for row in board['records']:
        row['tier'] = board['record_metadata'][row['id']]['site_tier'] = 'claimed'
        row.pop('rerun_status', None)
    return board


def verified(board, row_id, receipt):
    """The board with one row Lean Verified, as the maintainer and direct imports write it."""
    board = json.loads(json.dumps(board))
    row = next(x for x in board['records'] if x['id'] == row_id)
    row['tier'] = board['record_metadata'][row_id]['site_tier'] = 'verified'
    row['rerun_status'] = dict(state='passed', checked_at='2026-11-04T00:00:00Z', receipt_path=receipt)
    return board


class GatePathTests(unittest.TestCase):
    def test_the_reference_gate_reads_points_and_the_line_of_a_lean_verified_row(self):
        # direct_import.current_record_gate (the Fraction key at its generic path) mirrors the verifier's sssp_record.
        raw = lambda b: json.dumps(b).encode()
        none = d.current_record_gate('directed-sssp', raw(claimed(BOARD)), 'c' * 40, '2026-11-04T00:00:00Z')
        self.assertEqual((none['lean_verified'], none['lean_lines']), ([], []))
        gate = d.current_record_gate('directed-sssp', raw(verified(claimed(BOARD), 'directed-sssp-2026', 'sources/x.json')), 'c' * 40, '2026-11-04T00:00:00Z')
        self.assertEqual(gate['lean_verified'], [dict(id='directed-sssp-2026', score='n log^3/4 ; n log^11/12')])
        self.assertEqual([l['id'] for l in gate['lean_lines']], ['chd-lean-cost'])
        runs = lambda bound, g: d.qualifies_for_run(dict(problem='directed-sssp', bound=bound), g)
        for bound, expected in [('n ; n log^2/3', False), ('n ; n log^1/2', True), ('n log ; n log^2', True)]:
            with self.subTest(bound=bound):
                self.assertEqual(runs(bound, gate), expected)
                self.assertTrue(runs(bound, none))


class ReaderTests(unittest.TestCase):
    def test_readers_that_do_not_handle_the_board_never_read_it(self):
        # refresh.py reads only the integer multiplication board, and prove2.me imports only its reviewed boards.
        self.assertIn("load(stage, 'integer-multiplication.json')", (ROOT / 'refresh.py').read_text())
        self.assertNotIn('directed-sssp', json.loads((ROOT / 'prove2me-trust.json').read_text())['boards'])
        self.assertTrue(hasattr(prove2me_import, 'check_board'))

    def test_review_hold_and_validate_take_new_sssp_rows(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'data'
            # A copy of the real data (validate.py refuses links that leave its root). Files inside folders are hard links
            # when the file system allows it; the top-level JSON files, which review_hold may write, are real copies.
            def place(source, target):
                if Path(source).parent != ROOT:
                    try:
                        return os.link(source, target)
                    except OSError:
                        pass
                return shutil.copy2(source, target)
            shutil.copytree(ROOT, root, copy_function=place, ignore=shutil.ignore_patterns('__pycache__'))

            def write(path, raw):
                # Each write goes to a new file: a write through a hard link would change the real file in data/
                # (for example sources/direct-issue-150-submission.json, once issue #150 is imported).
                target = root / path
                target.unlink(missing_ok=True)
                target.write_bytes(raw if isinstance(raw, bytes) else raw.encode())
                self.assertEqual(target.stat().st_nlink, 1, path)
            write(review_hold.HOLDS, json.dumps({'holds': []}))
            write('directed-sssp.json', json.dumps(BOARD))
            # A Lean Verified direct row and a Claimed one, through direct_refresh as the hourly import writes them.
            lean = issue(150, 'n ; n log^1/2')
            lean['verification'] = dict(checked_at='2026-11-04T00:00:00Z', receipt_path='sources/direct-issue-150-receipt.json',
                                        receipt_url='https://github.com/bigospeedrun/verifier/actions/runs/1', reason='Lean and nanoda passed; permitted-axiom audit passed')
            write('sources/direct-issue-150-receipt.json', json.dumps({'schema_version': 1, 'status': 'passed'}))
            claims = {'direct-issue-150': lean, 'direct-issue-151': issue(151, 'n ; n log^1/2 loglog')}
            board, files = None, {}
            for row_id, claim in claims.items():
                row, meta, source = r.row_for(row_id, claim, '2026-11-04T00:00:00Z')
                files.update(source)
                meta['verification'] = r.verification_state(row_id, claim, {})
                board = board or json.loads(json.dumps(BOARD))
                board['records'].append(row)
                board['record_metadata'][row_id] = meta
            for path, raw in files.items():
                write(path, raw)
            write('directed-sssp.json', json.dumps(board, indent=2) + '\n')
            # review_hold.review writes only the board files it changes and its hold file; it changes no board here.
            published = lambda base, path: json.loads((ROOT / path).read_text())
            self.assertEqual(review_hold.review(root, '2026-11-04T00:00:00Z', published), [])
            done = subprocess.run([sys.executable, str(root / 'validate.py')], capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stdout[-2000:] + done.stderr[-2000:])
            # One more Lean Verified row and one more Claimed row than the live board has.
            lean_rows = sum(row.get('tier') == 'verified' for row in BOARD['records'])
            rows = len(BOARD['records'])
            self.assertIn(f'directed-sssp | {lean_rows + 1} rows | 0 rows | {rows - lean_rows + 1} rows | {rows + 2}', done.stdout)


if __name__ == '__main__':
    unittest.main()
