import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// On 2026-11-01 the board's health probes (3 s timeout) failed on a busy host while the service ran fine:
// `node -e` needs more than 3 s to start when the load is 4 to 13 and disk wait reaches 46 ms. The site
// and its egress proxy use the same kind of probe, so their timeout is at least 10 s too.
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the site image health check allows its probe at least 10 s', () => {
 const timeout = /^HEALTHCHECK[^\n]*--timeout=(\d+)s/m.exec(read('Dockerfile'));
 assert.ok(timeout, 'the Dockerfile has a HEALTHCHECK with --timeout');
 assert.ok(Number(timeout[1]) >= 10, `timeout ${timeout[1]}s is under 10 s`);
});

test('the egress health check in ops/self-host/compose.yaml allows its probe at least 10 s', () => {
 const timeouts = [...read('ops/self-host/compose.yaml').matchAll(/^\s+healthcheck:\s*\n(?:\s+.*\n){0,5}?\s+timeout:\s*(\d+)s/gm)].map(match => Number(match[1]));
 assert.equal(timeouts.length, 1);
 assert.ok(timeouts[0] >= 10, `timeout ${timeouts[0]}s is under 10 s`);
});
