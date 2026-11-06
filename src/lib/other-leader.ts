import {rankOtherClaims} from './other-rank.ts';
// The leader of an Other bounds row is the newest claim by its best author.
// Claims are in date order, so an author's later claim replaces an earlier one.
// Of the claims that tie with that claim, the one that ranks first leads: the higher evidence level, then the
// earlier claim (Nil, 2026-11-04). A row without a direction keeps the claim of its best author.
export const otherBoundLeader = <C extends {handle: string; display: string; value: string; date: string; evidence?: string}>(row: {bestHandle: string; claims: C[]; direction?: string}): C | undefined => {
  const best = row.claims.findLast(claim => claim.handle === row.bestHandle);
  if (!best || !row.direction) return best;
  const ranked = rankOtherClaims(row.claims, row.direction, (row as {rankBy?: string[]}).rankBy);
  const own = ranked.find(entry => entry.claim === best);
  return own ? ranked.find(entry => entry.rank === own.rank)!.claim : best;
};
