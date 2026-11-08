"""The author-link rule (Lead, 2026-11-08, site#17): a profile (GitHub, else ORCID) or no link."""
import json,sys,unittest
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from author_links import is_profile_url,author_entry,bad_author_links

ROOT=Path(__file__).resolve().parent

class AuthorLinkTests(unittest.TestCase):
    def test_only_a_github_profile_or_an_orcid_record_is_a_profile(self):
        for url in ['https://github.com/openai','https://github.com/HalitZiyaKARTAL','https://orcid.org/0000-0002-9577-4871','https://orcid.org/0000-0001-7844-454X']:
            with self.subTest(url=url):self.assertTrue(is_profile_url(url))
        for url in ['https://github.com/openai/math','https://github.com/bigospeedrun/verifier/issues/186','https://github.com/o/r/blob/abc/paper.pdf',
                    'https://arxiv.org/abs/2610.06783','https://doi.org/10.1145/367766.368168','https://prove2.me/users/1218a2a5','https://prove2.me/submissions/2cc2d774',
                    'https://x.com/HaileyStormC','https://zenodo.org/records/23480715','https://eccc.weizmann.ac.il/report/2021/023/','https://orcid.org/0000-0002-9577','http://github.com/openai',
                    'https://github.com/','https://github.com/-bad','https://github.com/openai/','',None,5]:
            with self.subTest(url=url):self.assertFalse(is_profile_url(url))

    def test_an_author_without_a_profile_has_the_name_alone(self):
        self.assertEqual(author_entry('A','https://github.com/a'),dict(name='A',url='https://github.com/a'))
        self.assertEqual(author_entry('A','https://github.com/a/repo'),dict(name='A'))
        self.assertEqual(author_entry('A'),dict(name='A'))

    def test_a_bad_author_link_is_found_anywhere_in_a_document(self):
        doc=dict(records=[dict(authors=[dict(name='Ok',url='https://github.com/ok'),dict(name='NoLink'),dict(name='Repo',url='https://github.com/o/r')]),
                          dict(nested=dict(authors=[dict(name='Pdf',url='https://example.org/p.pdf')]))])
        self.assertEqual(bad_author_links(doc),[('Repo','https://github.com/o/r'),('Pdf','https://example.org/p.pdf')])
        self.assertEqual(bad_author_links(dict(records=[dict(authors=[dict(name='Ok',url='https://orcid.org/0000-0002-9577-4871')])])),[])

    def test_the_published_data_follows_the_rule(self):
        # What validate.py checks on every refresh: the board files, the direct Other bounds rows and the prove2.me rows.
        registry=json.loads((ROOT/'registry.json').read_text())
        names=[p['data_file'] for p in registry['problems']]+[n for n in ('direct-other.json','prove2me.json') if (ROOT/n).exists()]
        for name in names:
            with self.subTest(file=name):self.assertEqual(bad_author_links(json.loads((ROOT/name).read_text())),[])

if __name__=='__main__':unittest.main()
