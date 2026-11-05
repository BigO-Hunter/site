import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';

// src/data is the committed copy of the reviewed bundle that the build reads; scripts/sync-data.mjs writes it from
// data/. A data/ edit committed without that sync leaves the copy stale (Ops nearly pushed notes that way,
// 2026-11-02), and validate-data.mjs and data/validate.py each read only one side. The check is here, not in the data
// suite: the hourly workflow runs the data tests before npm run sync-data, and npm test after it.
const data = new URL('../../data/', import.meta.url);
const copy = new URL('../data/', import.meta.url);
// The files sync-data.mjs copies: keep this list equal to its names.
const optional = ['prove2me.json', 'other-reviews.json', 'direct-other.json', 'method-notes.json', 'crocswap-certifications.json', 'maintainer-other.json'];

test('every JSON file in src/data is byte-equal to its data/ source, and every synced file has its copy', () => {
  const registry = JSON.parse(readFileSync(new URL('registry.json', data), 'utf8')) as {problems: {data_file: string}[]};
  const synced = ['registry.json', 'submissions.json', 'chart-cross-check.json', ...registry.problems.map(p => p.data_file),
    ...optional.filter(name => existsSync(new URL(name, data)))];
  const copies = readdirSync(copy).filter(name => name.endsWith('.json')).sort();
  assert.deepEqual(copies, [...new Set(synced)].sort());
  for (const name of copies) {
    assert.ok(readFileSync(new URL(name, copy)).equals(readFileSync(new URL(name, data))),
      `src/data/${name} differs from data/${name}: run npm run sync-data and commit both`);
  }
});

test('the synced file list matches scripts/sync-data.mjs', () => {
  const script = readFileSync(new URL('../../scripts/sync-data.mjs', import.meta.url), 'utf8');
  assert.ok(script.includes("const names=['registry.json','submissions.json','chart-cross-check.json',...registry.problems.map(p=>p.data_file),...["
    + optional.map(name => `'${name}'`).join(',') + ']'));
});
