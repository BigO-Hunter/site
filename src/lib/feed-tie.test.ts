// Of equal bounds the higher evidence level leads (Nil, 2026-11-04). A row that takes the lead with the bound of the old
// leader is no new record (Reviewer and Lead, 2026-11-04): a Lean Verified row posts once as "Record verified", a Human
// Verified row posts nothing. The same on a Big O board, an Other bounds board and the directed-sssp frontier.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baseline,plan,feedBoard,otherFeedBoard} from './records-feed.ts';
import type {FeedSnapshot,OtherClaim} from './records-feed.ts';
import type {RecordEntry} from './types.ts';

const NOW=Date.parse('2026-11-04T00:00:00Z');
const rec=(id:string,score:string,evidenceLevel:string,date:string,repoId:number)=>
 ({id,score,scoreRelation:'attained',date,repoId,evidenceLevel,authors:[{name:id}]}) as unknown as RecordEntry;
const bigO=(records:RecordEntry[]):FeedSnapshot=>({schema_version:1,boards:[feedBoard({slug:'apsp',direction:'lower-is-better'},records,'APSP')]});
const sssp=(records:RecordEntry[]):FeedSnapshot=>({schema_version:1,boards:[feedBoard({slug:'directed-sssp',direction:'lower-is-better',chartLines:[]},records,'SSSP')]});
const claim=(handle:string,value:string,evidence:string,date:string):OtherClaim=>({handle,value,display:value,bound:'H\\le '+value,evidence,date,authors:[{name:handle}]});
// bestHandle: the best claim, as the data names it (otherBoundLeader picks the highest level inside its tie group).
const other=(claims:OtherClaim[],bestHandle='h1'):FeedSnapshot=>({schema_version:1,boards:[otherFeedBoard({slug:'x',name:'X race',bestHandle,direction:'lower',claims})]});
const headlines=(before:FeedSnapshot,after:FeedSnapshot)=>plan(baseline(before),after,[],NOW).messages.map(m=>m.content.split(' | ')[0]);

test('Big O: a tie with the leader at a higher level takes the lead but is no new record',()=>{
 const start=[rec('claimA','2','claimed','2026-10-01',1)];
 assert.deepEqual(headlines(bigO(start),bigO([...start,rec('leanB','2','lean-verified','2026-11-01',2)])),['**Record verified**']);
 assert.deepEqual(headlines(bigO(start),bigO([...start,rec('humanB','2','human-verified','2026-11-01',2)])),[]);
 assert.deepEqual(headlines(bigO(start),bigO([...start,rec('leanB','19/10','lean-verified','2026-11-01',2)])),['**New record**']);
});

test('Other bounds: a tie with the leader at a higher level takes the lead but is no new record',()=>{
 const start=[claim('h1','19','claimed','2026-10-01')];
 const lean=other([...start,claim('h2','19','lean-verified','2026-11-01')]);
 assert.equal(lean.boards[0].leader,'h2:19');
 assert.deepEqual(headlines(other(start),lean),['**Record verified**']);
 assert.deepEqual(headlines(other(start),other([...start,claim('h2','19','human-verified','2026-11-01')])),[]);
 assert.deepEqual(headlines(other(start),other([...start,claim('h2','18','lean-verified','2026-11-01')],'h2')),['**New record**']);
});

test('directed-sssp: a tie with a frontier row at a higher level joins the frontier but is no new record (Lead, 2026-11-04)',()=>{
 const start=[rec('seed','n^2 ; n^5/2','claimed','2026-09-01',0),rec('claimA','n ; n log^1/2','claimed','2026-10-01',1)];
 const lean=sssp([...start,rec('leanB','n ; n log^1/2','lean-verified','2026-11-01',2)]);
 assert.deepEqual(lean.boards[0].frontier,['seed','leanB']);
 assert.deepEqual(headlines(sssp(start),lean),['**Record verified**']);
 assert.deepEqual(headlines(sssp(start),sssp([...start,rec('humanB','n ; n log^1/2','human-verified','2026-11-01',2)])),[]);
 assert.deepEqual(headlines(sssp(start),sssp([...start,rec('leanB','n ; n log^1/3','lean-verified','2026-11-01',2)])),['**New record**']);
});
