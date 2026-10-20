import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles, parsePathMap, parseRoots } from '../server/files.js';
import { createServer } from '../server/server.js';

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
