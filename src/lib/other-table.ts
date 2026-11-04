// The rows of the table of an Other bounds row (Nil, 2026-11-04: "the agent breakthrough is missing from the table").
// A row whose baseline is OpenAI's release (a baseline without a label) shows that baseline as a row of its own: the
// row's Agent breakthrough, credited to OpenAI, Claimed. It ranks by the rules of the claims (other-rank.ts). When its
// number cannot be read with the numbers of the claims, it ranks last: each claim of the row improved on it.
// A row with a Classic baseline (a published paper) keeps that baseline above the table; its agent breakthrough is its
// first claim marked agent. Only the table shows the baseline row: the leader, the landing page, chat-knowledge and
// the records feed read the claims, so the race-start row never posts.
import {otherClaimNumber, parseDegreeClaim, rankOtherClaims} from './other-rank.ts';

type Baseline = {label?: string; value: string; display?: string; exactValue: string; bound: string; url: string; date: string};
type Claim = {handle: string; display: string; value: string; date: string; evidence?: string; agent?: boolean};
export type BaselineClaim = {handle: string; display: string; value: string; bound: string; date: string; dateSource: string; dateKind: string;
  url: string; evidence: 'claimed'; note: string; proofScope: string; authors: {name: string; url: string}[]; breakthrough: true};

export const isClassicBaseline = (baseline: {label?: string}) => Boolean(baseline.label);

export function baselineClaim(baseline: Baseline): BaselineClaim | undefined {
  if (isClassicBaseline(baseline)) return undefined;
  return {handle: 'openai-baseline', display: baseline.display ?? baseline.value, value: baseline.exactValue, bound: baseline.bound,
    date: baseline.date, dateSource: baseline.url, dateKind: 'first-stated', url: baseline.url, evidence: 'claimed', note: '',
    proofScope: 'A written proof in OpenAI\'s preprint, released with the start of this race. We have not checked a Lean proof of it.',
    authors: [{name: 'OpenAI', url: baseline.url}], breakthrough: true};
}

// Every claim has a number, or every claim is an A d^p claim: the order of rankOtherClaims is then by value.
const byValue = (claims: Pick<Claim, 'display' | 'value'>[]) =>
  claims.every(c => parseDegreeClaim(c.display) !== null) || claims.every(c => otherClaimNumber(c) !== null);

export function otherTableRows<C extends Claim>(family: {baseline: Baseline; claims: C[]; direction: string}): {claim: C | BaselineClaim; rank: number; tie: boolean}[] {
  const base = baselineClaim(family.baseline);
  if (!base) return rankOtherClaims(family.claims, family.direction);
  // In date order, as the claims are: of equal rows at one level the earlier ranks first.
  const at = family.claims.findIndex(c => Date.parse(c.date) > Date.parse(base.date));
  const all: (C | BaselineClaim)[] = at < 0 ? [...family.claims, base] : [...family.claims.slice(0, at), base, ...family.claims.slice(at)];
  if (byValue(all) || !byValue(family.claims)) return rankOtherClaims(all, family.direction);
  return [...rankOtherClaims(family.claims, family.direction), {claim: base, rank: family.claims.length + 1, tie: false}];
}

// The claim that the table labels Agent breakthrough: the OpenAI baseline row, or on a row with a Classic baseline its
// first claim marked agent.
export function isTableBreakthrough(family: {baseline: {label?: string; value: string}; claims: Claim[]}, claim: object): boolean {
  if ('breakthrough' in claim && claim.breakthrough === true) return true;
  if (!isClassicBaseline(family.baseline)) return false;
  const first = family.claims.filter(c => c.agent).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0];
  return first !== undefined && first === claim;
}

// The evidence level that the table shows for a claim, which the evidence filters read: a Human Verified claim without a
// merged review pull request to link shows as Claimed.
export function shownLevel(claim: {evidence?: string}, reviewed: boolean): 'lean-verified' | 'human-verified' | 'claimed' {
  if (claim.evidence === 'lean-verified') return 'lean-verified';
  return claim.evidence === 'human-verified' && reviewed ? 'human-verified' : 'claimed';
}
