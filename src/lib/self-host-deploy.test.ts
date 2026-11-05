import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer, type Server} from 'node:http';
import {spawnSync, spawn} from 'node:child_process';
import type {AddressInfo} from 'node:net';

// ops/self-host/auto-deploy.sh against a fake docker, a fake health probe and a stub
// registry plus GitHub API. Nothing here touches a real registry, GitHub or Docker.
const script = new URL('../../ops/self-host/auto-deploy.sh', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'bos-deploy-'));
const root = join(dir, 'root'), envDir = join(dir, 'etc'), fake = join(dir, 'fake'), units = join(dir, 'units');
for (const path of [root, fake, units, join(fake, 'labels')]) mkdirSync(path, {recursive: true});
mkdirSync(envDir, {mode: 0o700});
writeFileSync(join(envDir, 'auto-deploy.env'), 'BOS_IMAGE=ghcr.io/bigospeedrun/site\nBOS_GITHUB_REPO=bigospeedrun/site\nBOS_IMAGE_WORKFLOW=site-image.yml\n', {mode: 0o600});
const digest = (n: number) => 'sha256:' + String(n).repeat(64).slice(0, 64);
const commit = (n: number) => String(n).repeat(40).slice(0, 40);
for (const n of [1, 2, 3, 4]) writeFileSync(join(fake, 'labels', digest(n)), commit(n));
writeFileSync(join(root, 'compose.yaml'), 'services: {}\n');
writeFileSync(join(root, 'release.env'), `BOS_UID=990\nBOS_GID=990\nBOS_SITE_IMAGE=ghcr.io/bigospeedrun/site@${digest(1)}\n`);
writeFileSync(join(root, 'release.commit'), commit(1) + '\n');
writeFileSync(join(fake, 'running'), digest(1));
writeFileSync(join(fake, 'unhealthy'), '');

// docker: pull and inspect read the fake labels; `compose up` starts whatever release.env
// names and fails for an unhealthy digest. The probe prints what runs, if it is healthy.
// `image ls` prints the rows of the file `images` whatever it is asked (so the script's own repository check is
// what the tests see), `image rm` records its target in `removed` and fails for a digest in `rm-fail`, and every
// call is kept in `calls`.
const fakeDocker = (fake: string) => `#!/usr/bin/env bash
fake=${fake}
echo "$*" >> "$fake/calls"
case $1 in
pull) grep -qx "\${3##*@}" "$fake/pull-fail" 2>/dev/null && exit 1; exit 0 ;;
image)
  case $2 in
  ls) cat "$fake/images" 2>/dev/null; exit 0 ;;
  rm) echo "$3" >> "$fake/removed"; grep -qx "\${3##*@}" "$fake/rm-fail" 2>/dev/null && exit 1; exit 0 ;;
  *) ref=\${@: -1}; cat "$fake/labels/\${ref##*@}" ;;
  esac ;;
compose)
  for ((i=1; i<=$#; i++)); do [[ \${!i} == --env-file ]] && { j=$((i+1)); env_file=\${!j}; }; done
  d=$(sed -n 's/^BOS_SITE_IMAGE=.*@//p' "$env_file"); echo "$d" > "$fake/running"
  grep -qx "$d" "$fake/unhealthy" && exit 1; exit 0 ;;
esac
`;
const fakeProbe = (fake: string) => `#!/usr/bin/env bash
d=$(cat ${fake}/running); grep -qx "$d" ${fake}/unhealthy && exit 1; echo "$d"
`;
writeFileSync(join(fake, 'docker'), fakeDocker(fake), {mode: 0o755});
writeFileSync(join(fake, 'probe'), fakeProbe(fake), {mode: 0o755});

// Stub registry and GitHub API. The runs endpoint answers 304 to a matching ETag.
let mainDigest = digest(1), runStatus = 'completed', apiFails = false, served = {ok: 0, notModified: 0};
let server: Server;
before(async () => {
 server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://stub');
  if (url.pathname === '/token') return res.end(JSON.stringify({token: 'stub'}));
  if (url.pathname === '/v2/bigospeedrun/site/manifests/main') { res.writeHead(200, {'Docker-Content-Digest': mainDigest}); return res.end(); }
  if (url.pathname === '/v2/bigospeedrun/site/manifests/rehearsal-bad') { res.writeHead(200, {'Docker-Content-Digest': digest(6)}); return res.end(); }
  if (url.pathname === '/repos/bigospeedrun/site/actions/workflows/site-image.yml/runs') {
   if (apiFails) { res.writeHead(500); return res.end(); }
   const etag = `W/"${runStatus}"`;
   if (req.headers['if-none-match'] === etag) { served.notModified++; res.writeHead(304, {ETag: etag}); return res.end(); }
   served.ok++;
   res.writeHead(200, {ETag: etag, 'Content-Type': 'application/json'});
   return res.end(JSON.stringify({workflow_runs: [{status: runStatus}]}));
  }
  res.writeHead(404); res.end();
 });
 await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
});
after(() => { server.close(); rmSync(dir, {recursive: true, force: true}); });

const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
// spawnSync would block the stub server in this process, so the tick runs asynchronously.
function tick(): Promise<{status: Record<string, unknown>; output: string}> {
 return new Promise(done => {
  const child = spawn('bash', [script], {env: {PATH: process.env.PATH, BOS_ROOT: root, BOS_ENV_DIR: envDir, BOS_UNIT_DIR: units,
   BOS_DOCKER: join(fake, 'docker'), BOS_PROBE: join(fake, 'probe'), BOS_REGISTRY: base(), BOS_GITHUB_API: base()}});
  let output = '';
  child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  child.on('close', () => done({status: JSON.parse(readFileSync(join(root, 'auto-deploy/status.json'), 'utf8')), output}));
 });
}
// Hold a deploy lock until release() is called. The holder prints "held" only after flock has the lock, and it keeps
// the lock until its stdin closes. A fixed `flock ... sleep 1` and a 300 ms wait raced under parallel test load: the
// tick could take the lock before the holder had it, or after it was free again (failed_target, not locked).
async function holdLock(path: string): Promise<() => Promise<void>> {
 const holder = spawn('flock', [path, 'sh', '-c', 'echo held; cat >/dev/null']);
 const closed = new Promise(done => holder.on('close', done));
 await new Promise<void>((done, fail) => {
  holder.stdout.once('data', () => done());
  holder.once('error', fail);
  holder.once('close', code => fail(new Error('the lock holder ended before it had the lock: ' + code)));
 });
 return async () => { holder.stdin.end(); await closed; };
}
const failed = () => existsSync(join(root, 'auto-deploy/failed')) ? readFileSync(join(root, 'auto-deploy/failed'), 'utf8').trim().split('\n') : [];

test('status.json has exactly the Hosted Isomux fields, in order; an unchanged tag is up to date', async () => {
 const {status} = await tick();
 assert.deepEqual(Object.keys(status), ['tick_at', 'deployed', 'result', 'phase', 'target', 'stopped', 'held', 'waiting', 'waiting_since', 'tick_error_since', 'units', 'last_attempt']);
 assert.deepEqual(Object.keys(status.last_attempt as object), ['at', 'target', 'result']);
 assert.equal(status.result, 'up_to_date');
 assert.equal(status.deployed, commit(1));
 assert.equal(status.units, 'absent');
 // The second read sends the ETag and gets a 304, which does not count against the API limit.
 await tick();
 assert.deepEqual(served, {ok: 1, notModified: 1});
});

test('a running image workflow is waiting; a new main digest deploys', async () => {
 runStatus = 'in_progress';
 let {status} = await tick();
 assert.equal(status.result, 'waiting');
 assert.equal(status.waiting, true);
 assert.match(String(status.waiting_since), /^\d{4}-\d\d-\d\dT/);
 runStatus = 'completed'; mainDigest = digest(2);
 ({status} = await tick());
 assert.equal(status.result, 'deployed');
 assert.equal(status.deployed, commit(2));
 assert.equal(status.waiting, false);
 assert.deepEqual(status.last_attempt, {at: (status.last_attempt as {at: string}).at, target: commit(2), result: 'deployed'});
 // The image line changes; the dedicated uid and gid stay.
 assert.equal(readFileSync(join(root, 'release.env'), 'utf8'), `BOS_UID=990\nBOS_GID=990\nBOS_SITE_IMAGE=ghcr.io/bigospeedrun/site@${digest(2)}\n`);
});

test('an unhealthy image rolls back by itself and is not tried again', async () => {
 writeFileSync(join(fake, 'unhealthy'), digest(3) + '\n');
 mainDigest = digest(3);
 let {status} = await tick();
 assert.equal(status.result, 'rolled_back');
 assert.equal(status.deployed, commit(2));
 assert.equal(readFileSync(join(fake, 'running'), 'utf8').trim(), digest(2));
 assert.deepEqual(failed(), [digest(3)]);
 ({status} = await tick());
 assert.equal(status.result, 'failed_target');
});

test('a pull that fails three times marks the digest failed', async () => {
 writeFileSync(join(fake, 'pull-fail'), digest(4) + '\n');
 mainDigest = digest(4);
 assert.equal((await tick()).status.result, 'build_failed');
 assert.equal((await tick()).status.result, 'build_failed');
 assert.equal((await tick()).status.result, 'failed');
 assert.deepEqual(failed(), [digest(3), digest(4)]);
});

test('API errors, hold, lock and bad config deploy nothing', async () => {
 apiFails = true;
 let {status} = await tick();
 assert.equal(status.result, 'tick_error');
 assert.match(String(status.tick_error_since), /^\d{4}-/);
 apiFails = false;
 writeFileSync(join(envDir, 'auto-deploy.hold'), '');
 ({status} = await tick());
 assert.equal(status.result, 'held'); assert.equal(status.held, true);
 rmSync(join(envDir, 'auto-deploy.hold'));
 const release = await holdLock(join(root, 'deploy.lock'));
 try {
  ({status} = await tick());
  assert.equal(status.result, 'locked');
 } finally { await release(); }
 chmodSync(join(envDir, 'auto-deploy.env'), 0o644);
 ({status} = await tick());
 assert.equal(status.phase, 'config');
 chmodSync(join(envDir, 'auto-deploy.env'), 0o600);
});

test('a failed rollback stops every later tick until the marker is deleted', async () => {
 writeFileSync(join(fake, 'labels', digest(5)), commit(5));
 mainDigest = digest(5);
 // The new image fails and the previous one no longer runs healthy either.
 writeFileSync(join(fake, 'unhealthy'), [digest(5), digest(2)].join('\n') + '\n');
 let {status} = await tick();
 assert.equal(status.result, 'rollback_failed');
 assert.equal(status.stopped, true);
 ({status} = await tick());
 assert.equal(status.result, 'stopped');
 assert.equal(status.phase, 'marker');
 assert.equal(spawnSync('test', ['-e', join(root, 'auto-deploy/stopped')]).status, 0);
});

test('BOS_TAG follows a rehearsal tag, and an unhealthy rehearsal rolls back', async () => {
 rmSync(join(root, 'auto-deploy/stopped'), {force: true});
 writeFileSync(join(fake, 'unhealthy'), digest(6) + '\n');
 writeFileSync(join(fake, 'labels', digest(6)), commit(5));
 writeFileSync(join(envDir, 'auto-deploy.env'), 'BOS_IMAGE=ghcr.io/bigospeedrun/site\nBOS_GITHUB_REPO=bigospeedrun/site\nBOS_IMAGE_WORKFLOW=site-image.yml\nBOS_TAG=rehearsal-bad\n', {mode: 0o600});
 const running = readFileSync(join(fake, 'running'), 'utf8').trim();
 const {status} = await tick();
 assert.equal(status.result, 'rolled_back');
 assert.equal(readFileSync(join(fake, 'running'), 'utf8').trim(), running);
 assert.ok(failed().includes(digest(6)));
 writeFileSync(join(envDir, 'auto-deploy.env'), 'BOS_IMAGE=ghcr.io/bigospeedrun/site\nBOS_GITHUB_REPO=bigospeedrun/site\nBOS_IMAGE_WORKFLOW=site-image.yml\nBOS_TAG=bad tag\n', {mode: 0o600});
 assert.equal((await tick()).status.phase, 'config');
});

// Old images (2026-11-01): after a successful deploy the tick removes the old images of its own repository and
// nothing else. Each test has its own root and its own fake docker.
const repo = 'ghcr.io/bigospeedrun/site';
// Distinct for 1 to 255 (hex(10) and hex(1) would be alike: the digit string is cut to 64).
const hex = (n: number) => 'sha256:' + n.toString(16).padStart(2, '0').repeat(32);
const row = (n: number, name = repo, digestText = hex(n)) => `2026-10-${String(10 + n).padStart(2, '0')} 12:00:00 +0000 UTC|${name}|${digestText}`;
function sandbox(release: number, previous?: number, images: string[] = []) {
 const box = mkdtempSync(join(dir, 'prune-')), r = join(box, 'root'), e = join(box, 'etc'), f = join(box, 'fake');
 for (const path of [join(r, 'auto-deploy'), f, join(f, 'labels')]) mkdirSync(path, {recursive: true});
 mkdirSync(e, {mode: 0o700});
 writeFileSync(join(e, 'auto-deploy.env'), 'BOS_IMAGE=ghcr.io/bigospeedrun/site\nBOS_GITHUB_REPO=bigospeedrun/site\nBOS_IMAGE_WORKFLOW=site-image.yml\n', {mode: 0o600});
 for (let n = 1; n <= 12; n++) writeFileSync(join(f, 'labels', hex(n)), commit(n));
 writeFileSync(join(r, 'compose.yaml'), 'services: {}\n');
 writeFileSync(join(r, 'release.env'), `BOS_UID=990\nBOS_SITE_IMAGE=${repo}@${hex(release)}\n`);
 if (previous) writeFileSync(join(r, 'previous.env'), `BOS_UID=990\nBOS_SITE_IMAGE=${repo}@${hex(previous)}\n`);
 writeFileSync(join(r, 'release.commit'), commit(release) + '\n');
 writeFileSync(join(f, 'running'), hex(release));
 writeFileSync(join(f, 'unhealthy'), '');
 writeFileSync(join(f, 'images'), images.join('\n') + '\n');
 writeFileSync(join(f, 'docker'), fakeDocker(f), {mode: 0o755});
 writeFileSync(join(f, 'probe'), fakeProbe(f), {mode: 0o755});
 const env = {PATH: process.env.PATH, BOS_ROOT: r, BOS_ENV_DIR: e, BOS_UNIT_DIR: join(box, 'units'), BOS_DOCKER: join(f, 'docker'), BOS_PROBE: join(f, 'probe'),
  BOS_PRUNE_SLEEP: '0', BOS_REGISTRY: 'http://127.0.0.1:1'};
 const text = (name: string) => existsSync(join(f, name)) ? readFileSync(join(f, name), 'utf8').trim().split('\n').filter(Boolean) : [];
 return {r, e, f, env, text, removed: () => text('removed').map(x => x.replace(`${repo}@`, '')), calls: () => text('calls')};
}
// Nine images of the site, one of another repository, one without a digest, and the same digest listed twice.
const catalog = [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => row(n)), row(10, 'ghcr.io/wall-game/server', hex(10)), row(11, repo, '<none>'), row(9), row(1, 'ghcr.io/bigospeedrun/site-old', hex(1))];
const prune = (box: ReturnType<typeof sandbox>, ...args: string[]) => spawnSync('bash', [script, '--prune-images', ...args], {env: box.env, encoding: 'utf8'});

test('--prune-images is a dry run: it keeps the running image, the rollback image and the 5 newest, and removes nothing', () => {
 const box = sandbox(3, 2, catalog);
 const out = prune(box);
 assert.equal(out.status, 0, out.stderr);
 // Newest 5 are 9 to 5; 3 runs, 2 is the rollback image; 4 and 1 are the only ones to go.
 assert.deepEqual([...out.stdout.matchAll(/would remove ghcr\.io\/bigospeedrun\/site@(sha256:\w+)/g)].map(m => m[1]), [hex(4), hex(1)]);
 assert.match(out.stdout, /prune \(dry-run\): kept 7, would remove 2, failed 0, left 0/);
 assert.deepEqual(box.removed(), []);
 assert.ok(!existsSync(join(box.r, 'auto-deploy/status.json')), 'a manual run writes no status');
 // The listing is asked for this repository only.
 assert.ok(box.calls().includes(`image ls --no-trunc --digests --format {{.CreatedAt}}|{{.Repository}}|{{.Digest}} ${repo}`));
});

test('--prune-images --apply removes at most 25, or --max, newest first, only digests of the repository, never forced', () => {
 const box = sandbox(3, 2, catalog);
 let out = prune(box, '--apply', '--max', '1');
 assert.equal(out.status, 0, out.stderr);
 assert.deepEqual(box.removed(), [hex(4)]);
 assert.match(out.stdout, /removed 1, failed 0, left 1/);
 out = prune(box, '--apply');
 assert.deepEqual(box.removed(), [hex(4), hex(4), hex(1)]);
 for (const call of box.calls().filter(c => c.startsWith('image rm'))) assert.match(call, /^image rm ghcr\.io\/bigospeedrun\/site@sha256:[0-9a-f]{64}$/);
 assert.ok(!box.calls().some(c => /prune| -f|--force|system/.test(c)), 'no prune and no force');
 assert.equal(prune(box, '--apply', '--max', '0').status, 2);
 assert.equal(prune(box, '--bogus').status, 2);
});

test('an image that cannot be removed is logged and does not stop the rest', () => {
 const box = sandbox(3, 2, catalog);
 writeFileSync(join(box.f, 'rm-fail'), hex(4) + '\n');
 const out = prune(box, '--apply');
 assert.equal(out.status, 0);
 assert.match(out.stdout, /could not remove ghcr\.io\/bigospeedrun\/site@sha256:(?:04)+ \(in use\?\)/);
 assert.deepEqual(box.removed(), [hex(4), hex(1)]);
 assert.match(out.stdout, /removed 1, failed 1, left 0/);
});

test('--prune-images waits for nothing: a tick that holds the deploy lock stops it', async () => {
 const box = sandbox(3, 2, catalog);
 const release = await holdLock(join(box.r, 'deploy.lock'));
 try {
  const out = prune(box, '--apply');
  assert.equal(out.status, 1);
  assert.match(out.stdout, /holds the lock/);
  assert.deepEqual(box.removed(), []);
 } finally { await release(); }
});

function deployTick(box: ReturnType<typeof sandbox>): Promise<{status: Record<string, unknown>; output: string}> {
 return new Promise(done => {
  const child = spawn('bash', [script], {env: {...box.env, BOS_REGISTRY: base(), BOS_GITHUB_API: base()}});
  let output = '';
  child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  child.on('close', () => done({status: JSON.parse(readFileSync(join(box.r, 'auto-deploy/status.json'), 'utf8')), output}));
 });
}

test('a successful deploy prunes; a rollback, a stopped tick and an unchanged tag prune nothing', async () => {
 // Release 3 runs and 2 is the rollback image. Main moves to 12 (healthy): the deploy makes 3 the rollback image.
 const images = [...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => row(n))];
 mainDigest = hex(12);
 let box = sandbox(3, 2, images);
 let {status, output} = await deployTick(box);
 assert.equal(status.result, 'deployed');
 // Running 12, rollback 3 (the old release), newest 5 of the others = 11..7: 6, 5, 4, 2 and 1 go.
 assert.deepEqual(box.removed(), [hex(6), hex(5), hex(4), hex(2), hex(1)]);
 assert.match(output, /prune \(apply\): kept 7, removed 5, failed 0, left 0/);
 // The status file shows the deploy result.
 assert.equal(status.deployed, commit(12));

 // An unhealthy image rolls back: nothing is removed.
 box = sandbox(3, 2, images);
 writeFileSync(join(box.f, 'unhealthy'), hex(12) + '\n');
 ({status} = await deployTick(box));
 assert.equal(status.result, 'rolled_back');
 assert.deepEqual(box.removed(), []);
 assert.ok(!box.calls().some(c => c.startsWith('image ls')), 'a rollback does not even list the images');

 // A stopped tick and an unchanged tag.
 box = sandbox(3, 2, images);
 writeFileSync(join(box.r, 'auto-deploy/stopped'), '');
 assert.equal((await deployTick(box)).status.result, 'stopped');
 mainDigest = hex(3);
 box = sandbox(3, 2, images);
 assert.equal((await deployTick(box)).status.result, 'up_to_date');
 assert.deepEqual(box.removed(), []);
 mainDigest = hex(4);
});

test('a tick caps its removals at 25 and leaves the rest for the next deploy', async () => {
 const many = Array.from({length: 40}, (_, i) => `2026-09-${String(i % 28 + 1).padStart(2, '0')} 1${Math.floor(i / 28)}:00:00 +0000 UTC|${repo}|sha256:${(100 + i).toString(16).padStart(2, '0').repeat(32).slice(0, 64)}`);
 mainDigest = hex(12);
 const box = sandbox(3, 2, [...many, row(12), row(3), row(2)]);
 const {output} = await deployTick(box);
 assert.equal(box.removed().length, 25);
 assert.match(output, /removed 25, failed 0, left \d+/);
 mainDigest = hex(4);
});

test('the newest 5 are found by the time, not by its text: a change of zone does not reorder them', () => {
 // 9 (11:30 +0100 = 10:30Z) is newer than 8 (12:00 +0200 = 10:00Z), but its text sorts before the text of 8.
 // The newest 5 are 20 (a time that does not parse counts as the newest), 13, 12, 11 and 9; 1 runs.
 const rows = [`2026-10-25 12:00:00 +0200 CEST|${repo}|${hex(8)}`, `2026-10-25 11:30:00 +0100 CET|${repo}|${hex(9)}`,
  ...[11, 12, 13].map(n => `2026-10-${n + 15} 12:00:00 +0000 UTC|${repo}|${hex(n)}`),
  ...[1, 2, 3].map(n => `2026-10-0${n} 12:00:00 +0000 UTC|${repo}|${hex(n)}`), `not a time|${repo}|${hex(20)}`];
 const out = prune(sandbox(1, undefined, rows));
 assert.equal(out.status, 0, out.stderr);
 assert.deepEqual([...out.stdout.matchAll(/would remove \S+@(sha256:\w+)/g)].map(m => m[1]), [hex(8), hex(3), hex(2)]);
});

function pruneAsync(box: ReturnType<typeof sandbox>, ...args: string[]): Promise<{status: number | null; stdout: string}> {
 return new Promise(done => {
  const child = spawn('bash', [script, '--prune-images', ...args], {env: {...box.env, BOS_REGISTRY: base()}});
  let stdout = '';
  child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stdout += chunk);
  child.on('close', status => done({status, stdout}));
 });
}

test('the digest of the deploy target (the registry tag) is kept even when it is older than the newest 5', async () => {
 // Image 1 is the oldest of nine: without the pin it goes. A registry that cannot be read pins nothing and says so.
 mainDigest = hex(1);
 let out = await pruneAsync(sandbox(3, 2, catalog), '--apply');
 assert.equal(out.status, 0, out.stdout);
 assert.deepEqual([...out.stdout.matchAll(/removed \S+@(sha256:\w+)/g)].map(m => m[1]), [hex(4)]);
 assert.match(out.stdout, /kept 8, removed 1/);
 mainDigest = hex(4);
 const box = sandbox(3, 2, catalog);
 assert.deepEqual([...prune(box).stdout.matchAll(/would remove \S+@(sha256:\w+)/g)].map(m => m[1]), [hex(4), hex(1)], 'unreachable registry: no pin');
 assert.match(prune(box).stdout, /could not be read; the target is not pinned/);
 out = await pruneAsync(box);
 assert.deepEqual([...out.stdout.matchAll(/would remove \S+@(sha256:\w+)/g)].map(m => m[1]), [hex(1)]);
 mainDigest = digest(4);
});
