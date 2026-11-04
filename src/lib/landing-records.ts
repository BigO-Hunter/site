import type {ChartLine,RecordEntry} from './types.ts';
import {ranked} from './ranking.ts';
import {ssspFrontier} from './sssp-board.ts';
// Keep the landing's post-announcement publication rule. An observation is not a publication.
// The breakthrough has its own column, so it is never also the latest result.
export function landingRecords(records:RecordEntry[],direction:string,lines:ChartLine[]=[]):RecordEntry[]{
 const seen=new Set<string>();
 // Directed SSSP has no order of rows: its frontier rows, the newest first (sssp-board.ts).
 const order=records.some(r=>r.score.includes(' ; '))?ssspFrontier(records,lines).sort((a,b)=>b.date.localeCompare(a.date)):ranked(records,direction).map(row=>row.record);
 return order.filter(record=>{
  if(record.isBreakthrough||record.publicationYear||record.dateLabel==='Observed'||record.date.slice(0,10)<='2026-10-06'||seen.has(record.evidenceLevel))return false;
  seen.add(record.evidenceLevel);return true;
 });
}
export function firstSelected<T extends {evidenceLevel:string}>(records:readonly T[],levels:readonly string[]):T|undefined{
 return records.find(record=>levels.includes(record.evidenceLevel));
}
// The holder of a landing bound, short (Nil, 2026-11-04): one or two names as the board table shows them, else the
// first name and "and N more". A grouped credit ("A and B") is one credit, as on the board table.
export function shortAuthors<T>(authors:readonly T[]):{shown:T[];more:number}{
 return authors.length>2?{shown:[authors[0]],more:authors.length-1}:{shown:[...authors],more:0};
}
