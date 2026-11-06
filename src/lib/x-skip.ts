import {compare} from './ranking.ts';
import {isBreakthroughRecord} from './evidence.ts';
import type {FeedSnapshot} from './records-feed.ts';
import type {XEntry} from './x-posts.ts';

// Nil, 2026-11-02: X never announces a Lean Verified result whose bound is worse than the breakthrough that started the
// race on that board. The bar is the board's race-start row (isBreakthroughRecord) when OpenAI or Anthropic made it:
// the feed's own data names it, no list of boards is kept here. A bound equal to or better than the bar posts as
// before. Boards whose race-start row has another author are not touched. Discord is not touched either.
const BREAKTHROUGH_AUTHORS=['OpenAI','Anthropic'];
export function breakthroughBar(snapshot:FeedSnapshot|undefined,slug:string):{score:string;direction:'lower'|'higher'}|undefined {
 const board=snapshot?.boards.find(b=>b.slug===slug);
 if(!board?.direction)return undefined;
 const row=board.records.find(r=>isBreakthroughRecord(slug,r.id)&&r.authors.some(a=>BREAKTHROUGH_AUTHORS.includes(a)));
 return row?{score:row.score,direction:board.direction}:undefined;
}
// The reason to skip the post, or undefined when it may go out. A score that is not a rational logs a warning and
// never stops the plan: that post goes out as before.
export function worseThanBreakthrough(post:XEntry,snapshot:FeedSnapshot|undefined):string|undefined {
 const lean=post.key.endsWith(':lean')||/^Status: Lean Verified$/m.test(post.x_text??'');
 // Directed SSSP (Lead, 2026-11-03 and 2026-11-06): X only for a Lean Verified record row, a frontier row that is faster
 // than every row at its density, the function rows (classic Dijkstra, papers) too: recordRows of the saved snapshot. A
 // snapshot without that list posts nothing.
 if(post.key.startsWith('["directed-sssp",')){
  if(!lean)return 'Directed shortest paths posts on X only for a Lean Verified record row (Lead, 2026-11-03): no X post';
  let id:unknown;
  try{[,id]=JSON.parse(post.key.slice(0,post.key.lastIndexOf(':')));}catch{id=undefined;}
  const board=snapshot?.boards.find(b=>b.slug==='directed-sssp');
  if(typeof id!=='string'||!board?.recordRows?.includes(id))return 'Directed shortest paths: a row that a function row (classic Dijkstra or a paper) matches or beats at its density is no record (Lead, 2026-11-06): no X post';
 }
 if(!lean)return undefined;
 let slug:unknown,score:unknown;
 try{[slug,,score]=JSON.parse(post.key.slice(0,post.key.lastIndexOf(':')));}catch{return undefined;}
 if(typeof slug!=='string'||typeof score!=='string')return undefined;
 const bar=breakthroughBar(snapshot,slug);
 if(!bar)return undefined;
 let order:number;
 try{order=compare(score,bar.score);}catch{console.warn(`X skip rule: cannot compare the score of ${post.key.slice(0,80)}; the post is left unchanged`);return undefined;}
 const worse=bar.direction==='lower'?order>0:order<0;
 return worse?`Lean Verified ${score} is worse than the breakthrough bound ${bar.score} that started the race on this board (Nil, 2026-11-02): no X post`:undefined;
}
