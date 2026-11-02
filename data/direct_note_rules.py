"""Rules for the reviewed credit notes in data/direct-notes.json (shared by validate.py and the tests)."""
import re

PREDECESSOR=re.compile(r'https://github\.com/[\w.-]+/[\w.-]+/(issues|pull)/\d+')

def predecessor_ok(note):
    # The predecessor is optional: a row whose lineage is not a verifier submission has none. If present, it must be a
    # verifier issue or pull request (the tooltip shows it as the "Source of the earlier result" link).
    return 'predecessor' not in note or bool(PREDECESSOR.fullmatch(note['predecessor']))
