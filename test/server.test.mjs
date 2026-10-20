import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles, parsePathMap, parseRoots } from '../server/files.js';
import { createServer, MAX_EDIT_BYTES } from '../server/server.js';

const ROOT = realpathSync(mkdtempSync(join(tmpdir(), 'merma-root-')));
const OUTSIDE = realpathSync(mkdtempSync(join(tmpdir(), 'merma-outside-')));
let server, base;

before(async () => {
  const files = createFiles({ roots: [ROOT], pathMap: [[ROOT, '/host/diagrams']] });
  server = createServer({ files, script: '/path/to/merma.js' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = async (path, init) => {
  const res = await fetch(base + path, init);
  return { status: res.status, text: await res.text(), headers: res.headers };
};
const q = encodeURIComponent;

function file(name, text = 'flowchart TD\n  A --> B\n', dir = ROOT) {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

test('health names the process and script', async () => {
  const { status, text } = await get('/health');
  assert.equal(status, 200);
  assert.equal(text, `ok pid=${process.pid} script=/path/to/merma.js`);
});

test('source returns an allowed file', async () => {
  const path = file('a.mmd');
  const { status, text, headers } = await get('/source?f=' + q(path));
  assert.equal(status, 200);
  assert.equal(text, 'flowchart TD\n  A --> B\n');
  assert.equal(headers.get('cache-control'), 'no-store');
});

test('source refuses files outside the roots, through symlinks, and not .mmd', async () => {
  const outside = file('x.mmd', 'secret', OUTSIDE);
  symlinkSync(outside, join(ROOT, 'link.mmd'));
  const txt = file('notes.txt', 'secret');
  for (const path of [outside, join(ROOT, 'link.mmd'), txt, 'relative.mmd', join(ROOT, '..', 'x.mmd')]) {
    const { status, text } = await get('/source?f=' + q(path));
    assert.equal(status, 403, path);
    assert.ok(!text.includes('secret'));
  }
});

test('source of a missing file is 404', async () => {
  assert.equal((await get('/source?f=' + q(join(ROOT, 'missing.mmd')))).status, 404);
});

test('hostpath maps by prefix, and is empty when unknown', async () => {
  assert.equal((await get('/hostpath?f=' + q(join(ROOT, 'a.mmd')))).text, '/host/diagrams/a.mmd');
  assert.equal((await get('/hostpath?f=' + q('/elsewhere/a.mmd'))).text, '');
});

test('the page and its modules are served with their types', async () => {
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  assert.match(page.text, /<script type="module" src="\/main.mjs">/);
  for (const [path, type] of [['/main.mjs', /^text\/javascript/], ['/viewer.mjs', /^text\/javascript/], ['/style.css', /^text\/css/]]) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), type);
  }
});

test('nothing outside web/ is served', async () => {
  for (const path of ['/../server/server.js', '/%2e%2e/server/files.js', '/..%2fpackage.json', '/missing.mjs']) {
    assert.equal((await get(path)).status, 404, path);
  }
});

test('other methods are refused', async () => {
  assert.equal((await get('/source?f=x', { method: 'DELETE' })).status, 405);
});

test('settings parse from their environment forms', () => {
  assert.deepEqual(parseRoots(' /a/, /b/ ,,'), ['/a/', '/b/']);
  assert.deepEqual(parsePathMap('/workspace/=/home/me/ws,junk,/x=/y'), [['/workspace', '/home/me/ws'], ['/x', '/y']]);
});

// --- edits ---------------------------------------------------------------------------------------------------

const edit = (path, body, headers = {}) => get('/edit?f=' + q(path), { method: 'POST', body, headers });
const versionOf = async (path) => (await get('/source?f=' + q(path))).headers.get('etag');
const read = (path) => readFileSync(path, 'utf8');

test('source carries a version that follows the content', async () => {
  const path = file('v.mmd');
  const before = await versionOf(path);
  assert.match(before, /^"[0-9a-f]{16}"$/);
  writeFileSync(path, 'flowchart TD\n  A --> C\n');
  assert.notEqual(await versionOf(path), before);
});

test('an edit from the current version saves and returns the new version', async () => {
  const path = file('e1.mmd');
  const res = await edit(path, 'flowchart TD\n  A --> B\n  B --> C\n', { 'If-Match': await versionOf(path) });
  assert.equal(res.status, 200);
  assert.equal(read(path), 'flowchart TD\n  A --> B\n  B --> C\n');
  assert.equal(res.headers.get('etag'), await versionOf(path));
});

test('a stale edit is refused, keeps the file, and returns the current version', async () => {
  const path = file('e2.mmd');
  const stale = await versionOf(path);
  writeFileSync(path, 'flowchart TD\n  A --> Z\n');
  const res = await edit(path, 'flowchart TD\n  X\n', { 'If-Match': stale });
  assert.equal(res.status, 409);
  assert.equal(read(path), 'flowchart TD\n  A --> Z\n');
  assert.equal(res.headers.get('etag'), await versionOf(path));
});

test('an edit needs If-Match', async () => {
  const path = file('e3.mmd');
  assert.equal((await edit(path, 'flowchart TD\n  X\n')).status, 428);
  assert.equal(read(path), 'flowchart TD\n  A --> B\n');
});

test('edits outside the roots, through symlinks, and to other files are refused', async () => {
  const outside = file('target.mmd', 'keep', OUTSIDE);
  symlinkSync(outside, join(ROOT, 'edit-link.mmd'));
  const txt = file('edit-notes.txt', 'keep');
  for (const path of [outside, join(ROOT, 'edit-link.mmd'), txt]) {
    assert.equal((await edit(path, 'x', { 'If-Match': '"x"' })).status, 403, path);
  }
  assert.equal(read(outside), 'keep');
  assert.equal(read(txt), 'keep');
});

test("edits from another site's page are refused; this server's own page is accepted", async () => {
  const path = file('e4.mmd');
  const v = await versionOf(path);
  assert.equal((await edit(path, 'flowchart TD\n  X\n', { 'If-Match': v, Origin: 'https://evil.example' })).status, 403);
  assert.equal(read(path), 'flowchart TD\n  A --> B\n');
  assert.equal((await edit(path, 'flowchart TD\n  X\n', { 'If-Match': v, Origin: base })).status, 200);
});

test('an edit to a missing file is 404 and creates nothing', async () => {
  const path = join(ROOT, 'never.mmd');
  assert.equal((await edit(path, 'flowchart TD\n', { 'If-Match': '"x"' })).status, 404);
  assert.equal(existsSync(path), false);
});

test('invalid UTF-8 and oversized edits are refused', async () => {
  const path = file('e5.mmd');
  const v = await versionOf(path);
  assert.equal((await edit(path, Buffer.from([0xff, 0xfe]), { 'If-Match': v })).status, 400);
  assert.equal((await edit(path, 'x'.repeat(MAX_EDIT_BYTES + 1), { 'If-Match': v })).status, 413);
  assert.equal(read(path), 'flowchart TD\n  A --> B\n');
});

test('an edit keeps the file mode and leaves no temporary file', async () => {
  const path = file('e6.mmd');
  chmodSync(path, 0o640);
  await edit(path, 'flowchart TD\n  X\n', { 'If-Match': await versionOf(path) });
  assert.equal(statSync(path).mode & 0o777, 0o640);
  assert.deepEqual(readdirSync(ROOT).filter((n) => n.startsWith('.merma-')), []);
});

test('of several edits from one version, exactly one is saved', async () => {
  const path = file('e7.mmd');
  const v = await versionOf(path);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => edit(path, `flowchart TD\n  N${i}\n`, { 'If-Match': v })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409, 409, 409, 409, 409, 409]);
});

// --- host names ----------------------------------------------------------------------------------------------

/** A request with a chosen Host header, which fetch does not allow setting. */
function withHost(host, path, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + path, { method, agent: false, headers: { ...headers, Host: host } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, text: body, build: res.headers['x-merma-build'] }));
    });
    req.on('error', reject);
    req.end(method === 'POST' ? 'flowchart TD\n  X\n' : undefined);
  });
}

test('requests addressed to another host name are refused on every route (DNS rebinding)', async () => {
  const path = file('h1.mmd');
  const v = await versionOf(path);
  for (const [route, method] of [['/source?f=' + q(path), 'GET'], ['/edit?f=' + q(path), 'POST'], ['/', 'GET'], ['/health', 'GET']]) {
    const res = await withHost('evil.example:6376', route, method, { 'If-Match': v, Origin: 'http://evil.example:6376' });
    assert.equal(res.status, 403, route);
  }
  assert.equal(read(path), 'flowchart TD\n  A --> B\n');
});

test('the loopback names are accepted, with any port and in any case', async () => {
  const path = file('h2.mmd');
  for (const host of ['localhost:6376', 'LOCALHOST', '127.0.0.1:1', '[::1]:6376']) {
    assert.equal((await withHost(host, '/source?f=' + q(path))).status, 200, host);
  }
});

test('a server can be told to answer to more host names', async () => {
  const files = createFiles({ roots: [ROOT] });
  const other = createServer({ files, script: 'x', hosts: ['localhost', 'box.lan'] });
  await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve));
  const at = `http://127.0.0.1:${other.address().port}`;
  const status = (host) => new Promise((resolve) => {
    http.get(at + '/health', { agent: false, headers: { Host: host } }, (res) => { res.resume(); resolve(res.statusCode); });
  });
  try {
    assert.equal(await status('box.lan:80'), 200);
    assert.equal(await status('127.0.0.1'), 403);
  } finally {
    other.close();
  }
});

// --- polling and the build id --------------------------------------------------------------------------------

test('a poll naming the current version gets a bodiless 304 with the ETag; any other gets the text', async () => {
  const path = file('p1.mmd');
  const v = await versionOf(path);
  const same = await get('/source?f=' + q(path), { headers: { 'If-None-Match': v } });
  assert.equal(same.status, 304);
  assert.equal(same.text, '');
  assert.equal(same.headers.get('etag'), v);
  writeFileSync(path, 'flowchart TD\n  A --> C\n');
  const changed = await get('/source?f=' + q(path), { headers: { 'If-None-Match': v } });
  assert.equal(changed.status, 200);
  assert.equal(changed.text, 'flowchart TD\n  A --> C\n');
});

test('every response carries the build id, and the page is served with the same id', async () => {
  const path = file('b1.mmd');
  const page = await get('/');
  const id = page.headers.get('x-merma-build');
  assert.match(id, /^[0-9a-f]{12}$/);
  assert.ok(page.text.includes(`<meta name="merma-build" content="${id}">`));
  const v = await versionOf(path);
  for (const res of [
    await get('/source?f=' + q(path)),
    await get('/source?f=' + q(path), { headers: { 'If-None-Match': v } }),
    await get('/source?f=' + q('/elsewhere/x.mmd')),
    await get('/missing.mjs'),
    await withHost('evil.example', '/health'),
  ]) {
    assert.equal(res.headers?.get?.('x-merma-build') ?? res.build, id);
  }
});

test('the build id changes when a page file changes under a running server', async () => {
  const web = mkdtempSync(join(tmpdir(), 'merma-web-'));
  writeFileSync(join(web, 'index.html'), '<meta name="merma-build" content="{{MERMA_BUILD}}">');
  writeFileSync(join(web, 'main.mjs'), 'export {};\n');
  const other = createServer({ files: createFiles({ roots: [ROOT] }), script: 'x', web });
  await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve));
  try {
    const at = `http://127.0.0.1:${other.address().port}`;
    const id = async () => (await fetch(at + '/health')).headers.get('x-merma-build');
    const before = await id();
    assert.equal(await id(), before, 'stable while nothing changes');
    writeFileSync(join(web, 'main.mjs'), 'export const changed = 1;\n');
    assert.notEqual(await id(), before);
  } finally {
    other.close();
  }
});

test('a root that is a .mmd file allows that file only, also when reached through a symlink', () => {
  const one = file('single.mmd');
  const sibling = file('sibling.mmd');
  const link = join(OUTSIDE, 'link-to-single.mmd');
  symlinkSync(one, link);
  const files = createFiles({ roots: [one] });
  assert.equal(files.allowed(one), true);
  assert.equal(files.allowed(link), true);
  assert.equal(files.allowed(sibling), false);
  assert.equal(files.allowed(one + '.mmd'), false);
});
