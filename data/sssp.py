"""Directed shortest paths board: exact density-time comparison (no reals).

A point row says "with at most D(n) edges, the time is O(T(n))", written "D ; T" in the
verifier's one normal form (bigospeedrun/verifier scripts/submissions.py parse_sssp):
D = n^a log^b and T = n^a' log^b' loglog^c'. A function row gives the time as a sum of terms
m^p n^q log^r loglog^s; at D = n^a log^b its time is the lexicographically largest term tuple
(a sum is Θ of its largest term). For these functions f = O(g) exactly when the exponent tuple
of f is at most that of g in lexicographic order. direct-fixtures/sssp-cases.json holds the
cases that this module, src/lib/sssp.ts and the verifier must agree on.
"""
from fractions import Fraction
import re

EXAMPLE = 'n log^3/4 ; n log^11/12'
FACTOR = re.compile(r'(n|log|loglog)(?:\^(-?(?:0|[1-9][0-9]{0,39})(?:/[1-9][0-9]{0,39})?))?')
D_NAMES = ('n', 'log')
T_NAMES = ('n', 'log', 'loglog')
HELP = (f'the bound for directed-sssp must be "D ; T", for example "{EXAMPLE}": D = n^a log^b, '
        'T = n^a log^b loglog^c, exponents as integers or reduced fractions (3/4, -1/2), '
        'the factors in this order, a factor with exponent 0 left out, and n instead of n^1')


def side(text, names):
    exponents = dict.fromkeys(names, Fraction(0))
    order = list(names)
    for token in text.split(' '):
        match = FACTOR.fullmatch(token)
        if not match or match.group(1) not in order:
            raise ValueError(HELP)
        name, raw = match.groups()
        order = order[order.index(name) + 1:]
        if raw is None:
            exponents[name] = Fraction(1)
            continue
        value = Fraction(raw)
        if str(value) != raw or value in (0, 1):
            raise ValueError(HELP)
        exponents[name] = value
    return tuple(exponents[name] for name in names)


def text(exponents, names=T_NAMES):
    return ' '.join(name if e == 1 else f'{name}^{e}' for name, e in zip(names, exponents) if e != 0)


def parse(value):
    """(a, b, a', b', c') of a normal-form point row, or ValueError (the verifier's ranges)."""
    if not isinstance(value, str) or value.count(' ; ') != 1:
        raise ValueError(HELP)
    d_text, t_text = value.split(' ; ')
    if not d_text or not t_text:
        raise ValueError(HELP)
    d, t = side(d_text, D_NAMES), side(t_text, T_NAMES)
    if text(d, D_NAMES) != d_text or text(t) != t_text:
        raise ValueError(HELP)
    a, b = d
    if not 1 <= a <= 2 or b < 0 or (a == 2 and b != 0):
        raise ValueError('the edge bound D of directed-sssp must be between n and n^2: n^a log^b with 1 <= a <= 2 and b >= 0')
    if t < (a, b, Fraction(0)) or t > (Fraction(3), Fraction(0), Fraction(0)):
        raise ValueError('the time T of directed-sssp must be at least the edge bound D and at most n^3')
    return d + t


def density(value):
    """(a, b) of a density text such as 'n log^1/4'."""
    d = side(value, D_NAMES)
    if text(d, D_NAMES) != value:
        raise ValueError(HELP)
    return d


def cmp(x, y):
    return (x > y) - (x < y)


KEYS = ('m', 'n', 'log', 'loglog', 'logratio')


def term(t):
    """A function-row term {"m": p, "n": q, "log": r, "loglog": s, "logratio": k} as exact fractions:
    m^p n^q (log n)^r (log log n)^s (log(2 + m/n))^k."""
    if not isinstance(t, dict) or not t or set(t) - set(KEYS):
        raise ValueError('a function-row term has only the keys ' + ', '.join(KEYS))
    return tuple(Fraction(str(t.get(k, '0'))) for k in KEYS)


def time_at(terms, d):
    """T(D) of a function row at D = (a, b): the lex largest term tuple. At m = n^a log^b,
    log(2 + m/n) is Θ(log n) when a > 1, Θ(log log n) when a = 1 and b > 0, and Θ(1) when m = n."""
    a, b = d
    if not terms:
        raise ValueError('a function row needs at least one term')
    ratio = (0, 1, 0) if a > 1 else (0, 0, 1) if b > 0 else (0, 0, 0)
    return max((p * a + q + k * ratio[0], p * b + r + k * ratio[1], s + k * ratio[2])
               for p, q, r, s, k in map(term, terms))


FN_NAMES = {'m': 'm', 'n': 'n', 'log': 'log', 'loglog': 'loglog', 'logratio': 'logratio'}


def function_text(terms):
    """The score text of a function row: its terms joined by ' + ', each term its factors in the order
    m n log loglog logratio, with the verifier's exponent style (logratio is log(2 + m/n))."""
    parts = []
    for t in map(term, terms):
        part = ' '.join(k if e == 1 else f'{k}^{e}' for k, e in zip(KEYS, t) if e != 0)
        parts.append(part or '1')
    return ' + '.join(parts)


def parse_function(value):
    """The terms of a function-row score text; it must be in the normal form of function_text."""
    if not isinstance(value, str) or not value:
        raise ValueError('a function row score is terms joined by " + "')
    terms = []
    for part in value.split(' + '):
        t = {}
        for token in part.split(' '):
            m = re.fullmatch(r'(m|n|loglog|logratio|log)(?:\^(-?(?:0|[1-9][0-9]{0,39})(?:/[1-9][0-9]{0,39})?))?', token)
            if not m or m.group(1) in t:
                raise ValueError('bad function row term: ' + part)
            t[m.group(1)] = m.group(2) or '1'
        terms.append(t)
    if function_text(terms) != value:
        raise ValueError('a function row score must be in normal form: ' + value)
    return terms


CLASSIC = [{'m': '1'}, {'n': '1', 'log': '1'}]
RANGE_END = (Fraction(3), Fraction(0), Fraction(0))


def best(d, points):
    """best(D) for the gate: the lex smallest time of a Lean Verified point row (a, b, a', b', c')
    whose density covers D, or None. Claimed rows and function rows never gate (Nil, 2026-10-20),
    and the classic never gates either (Nil, 2026-11-02: a Lean proof worse than the classic bound
    runs when it is the best Lean Verified bound)."""
    times = [p[2:] for p in points if p[:2] >= d]
    return min(times) if times else None


def qualifies(candidate, points):
    """A submission (a, b, a', b', c') runs when its T is strictly below best(D); with no Lean
    Verified row at D or denser, every T of the range runs (the range ends at n^3)."""
    current = best(candidate[:2], points)
    return candidate[2:] <= RANGE_END if current is None else candidate[2:] < current
