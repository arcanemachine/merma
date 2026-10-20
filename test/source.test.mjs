// source.mjs against a fake server: fetch is replaced, so each test controls what every poll and save sees and when
// it arrives.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSource } from '../web/source.mjs';
import { version } from '../server/files.js';

let file;           // the "server's" copy of the file
let requests;       // every request made, in order
let hold;           // when set, the next /source response waits for this promise
let build;          // the build id the fake server reports
const realFetch = globalThis.fetch;

beforeEach(() => {
  file = 'v1';
  requests = [];
  hold = null;
  build = 'b1';
  globalThis.fetch = async (url, init = {}) => {
    const req = {
      url, method: init.method || 'GET', body: init.body,
      ifMatch: init.headers?.['If-Match'], ifNoneMatch: init.headers?.['If-None-Match'],
    };
    requests.push(req);
    if (req.url.startsWith('/source')) {
      const snapshot = file;
      if (hold) { const h = hold; hold = null; await h; }
      const headers = { ETag: version(snapshot), 'X-Merma-Build': build };
      if (req.ifNoneMatch === version(snapshot)) return new Response(null, { status: 304, headers });
      return new Response(snapshot, { headers });
    }
    if (req.url.startsWith('/edit')) {
      if (req.ifMatch !== version(file)) return new Response('conflict', { status: 409 });
      file = req.body;
      return new Response('saved', { headers: { ETag: version(file) } });
    }
    return new Response('', { status: 404 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

function source() {
  const seen = [];
  const builds = [];
  const s = createSource('/d/x.mmd', {
    onText: (t) => { seen.push(t); }, onError: (m) => seen.push('error: ' + m), onBuild: (id) => builds.push(id),
  });
  return { s, seen, builds };
}

test('a save goes over the version the edit began from, so a change polled in meanwhile is not overwritten', async () => {
  const { s } = source();
  await s.poll();
  const base = s.snapshot();                     // the edit begins on v1
  file = 'v2 from an agent';
  await s.poll();                                // the agent's change arrives while the edit is being checked
  assert.equal(s.version, version('v2 from an agent'));
  const saved = await s.save('v1 plus the edit', base.version);
  assert.equal(requests.findLast((r) => r.method === 'POST').ifMatch, version('v1'));
  assert.equal(saved.ok, false);
  assert.equal(saved.conflict, true);
  assert.equal(file, 'v2 from an agent');
});

test('a successful save updates the text and version without a re-read', async () => {
  const { s, seen } = source();
  await s.poll();
  assert.deepEqual(await s.save('v1 edited', s.snapshot().version), { ok: true });
  assert.deepEqual(s.snapshot(), { text: 'v1 edited', version: version('v1 edited') });
  await s.poll();
  assert.deepEqual(seen, ['v1'], 'the saved text is not reported again as a change');
});

test('a poll that overlaps a save is dropped, so it cannot bring back the text from before the save', async () => {
  const { s, seen } = source();
  await s.poll();
  let release;
  hold = new Promise((r) => { release = r; });
  const polling = s.poll();                      // reads v1, then waits
  await s.save('v1 edited', s.snapshot().version);
  release();
  await polling;
  assert.deepEqual(s.snapshot(), { text: 'v1 edited', version: version('v1 edited') });
  assert.deepEqual(seen, ['v1']);
});

test('after a conflict the new version is fetched and reported', async () => {
  const { s, seen } = source();
  await s.poll();
  const base = s.snapshot();
  file = 'v2';
  await s.save('v1 edited', base.version);
  await new Promise((r) => setTimeout(r, 0));    // the re-read is queued, not awaited by save
  assert.deepEqual(seen, ['v1', 'v2']);
});

test('an unchanged file comes back as a 304, which changes nothing', async () => {
  const { s, seen } = source();
  await s.poll();
  await s.poll();
  assert.equal(requests.at(-1).ifNoneMatch, version('v1'));
  assert.deepEqual(seen, ['v1']);
  assert.deepEqual(s.snapshot(), { text: 'v1', version: version('v1') });
});

test('the build id is reported from every response, 304s included', async () => {
  const { s, builds } = source();
  await s.poll();
  build = 'b2';
  await s.poll();                                // a 304
  assert.deepEqual(builds, ['b1', 'b2']);
});

test('after a conflict the re-read asks for the whole file, not a 304', async () => {
  const { s } = source();
  await s.poll();
  const base = s.snapshot();
  file = 'v2';
  await s.save('v1 edited', base.version);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(requests.at(-1).ifNoneMatch, undefined);
});
