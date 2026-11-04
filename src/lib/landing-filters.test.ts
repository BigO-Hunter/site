import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseEvidenceLevels} from './evidence-filters.ts';
import {landingRecords,firstSelected,shortAuthors} from './landing-records.ts';
import type {RecordEntry} from './types.ts';

const record=(id:string,score:string,level:RecordEntry['evidenceLevel'],date='2026-10-10T10:00:00Z',extra:Partial<RecordEntry>={}):RecordEntry=>({id,score,evidenceLevel:level,date,repoId:0,dateLabel:'Published',...extra} as RecordEntry);
test('stored evidence selection preserves none and defaults safely for missing or invalid storage',()=>{
 const all=['claimed','human-verified','lean-verified'];
 assert.deepEqual(parseEvidenceLevels(null),all);
 assert.deepEqual(parseEvidenceLevels('[]'),[]);
 assert.deepEqual(parseEvidenceLevels('["lean-verified","human-verified","lean-verified"]'),['human-verified','lean-verified']);
 for(const invalid of ['not json','null','{}','["claimed","unknown"]'])assert.deepEqual(parseEvidenceLevels(invalid),all);
});
test('landing switches to the best checked evidence level, using exact score order',()=>{
 const records=[record('claim','100000000000000000001/100000000000000000000','claimed'),record('human','1','human-verified'),record('older-human','9/10','human-verified'),record('lean','4/5','lean-verified')];
 const choices=landingRecords(records,'higher-is-better');
 assert.deepEqual(choices.map(record=>record.id),['claim','human','lean']);
 const levels=['claimed','human-verified','lean-verified'];
 for(let mask=0;mask<8;mask++){
  const selected=levels.filter((_,i)=>mask&(1<<i));
  assert.equal(firstSelected(choices,selected)?.id,choices.find(record=>selected.includes(record.evidenceLevel))?.id);
 }
 assert.equal(firstSelected(choices,['human-verified','lean-verified'])?.id,'human');
 assert.equal(firstSelected(choices,['lean-verified'])?.id,'lean');
 assert.equal(firstSelected(choices,[]),undefined);
});
test('landing keeps publication rules and lower-is-better endpoint ranking',()=>{
 const choices=landingRecords([
  record('original','1/10','claimed','2026-10-06T12:00:00Z',{isBreakthrough:true}),
  record('observation','1/10','claimed',undefined,{dateLabel:'Observed'}),
  record('old-paper','1/10','claimed',undefined,{publicationYear:2025}),
  record('closed','1/2','claimed'),
  record('open','1/2','human-verified',undefined,{scoreRelation:'strict-upper-bound'}),
  record('lean','3/5','lean-verified'),
 ],'lower-is-better');
 // An endpoint n^(1/2+o(1)) is weaker than an attained O(n^(1/2)) at the same exponent.
 assert.deepEqual(choices.map(record=>record.id),['closed','open','lean']);
});

// Nil, 2026-11-04: "record holder names in the main table?". Short: one or two names, else the first and "and N more".
test('a landing holder shows one or two names, else the first name and the count of the others', () => {
  assert.deepEqual(shortAuthors([]), {shown: [], more: 0});
  assert.deepEqual(shortAuthors(['A']), {shown: ['A'], more: 0});
  assert.deepEqual(shortAuthors(['A', 'B']), {shown: ['A', 'B'], more: 0});
  assert.deepEqual(shortAuthors(['A', 'B', 'C', 'D']), {shown: ['A'], more: 3});
});

// Lead, 2026-11-04: a grouped credit is not split, so the Agent breakthrough cell of 3SUM names the agent.
test('a grouped credit is one credit, so two credits show in full', () => {
  assert.deepEqual(shortAuthors([{name: 'Josh Alman and Virginia Vassilevska Williams'}, {name: 'Anthropic'}]).more, 0);
});
