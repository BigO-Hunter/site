"""The one rule for an author link (Lead, 2026-11-08, site#17): it goes to the person's or the organisation's profile, GitHub
if known, else ORCID, else there is no link. It never goes to a repository, a PDF, a paper, a submission or any other
page; a link to the work belongs in the row's source or evidence field. The site schemas, validate.py, the credit notes
(direct_note_rules.credit_ok) and the importers use these two helpers, so a new row cannot link anything else."""
import re

PROFILE_URL=re.compile(r'https://(?:github\.com/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})|orcid\.org/\d{4}-\d{4}-\d{4}-\d{3}[0-9X])')

def is_profile_url(url):
    return isinstance(url,str) and PROFILE_URL.fullmatch(url) is not None

def author_entry(name,url=None):
    """An author of a row: with its profile link, or the name alone when no profile is known."""
    return dict(name=name,url=url) if is_profile_url(url) else dict(name=name)

def bad_author_links(doc):
    """Every author of a document (a problem file, direct-other.json, prove2me.json) whose url is no profile: (name, url)."""
    found=[]
    if isinstance(doc,dict):
        authors=doc.get('authors')
        for a in authors if isinstance(authors,list) else []:
            if isinstance(a,dict) and 'url' in a and not is_profile_url(a['url']):found.append((a.get('name'),a['url']))
        for x in doc.values():found+=bad_author_links(x)
    elif isinstance(doc,list):
        for x in doc:found+=bad_author_links(x)
    return found
