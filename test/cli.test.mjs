import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(import.meta.dirname, '..', 'bin', 'merma.js');
const DIR = realpathSync(mkdtempSync(join(tmpdir(), 'merma-cli-')));
const children = [];
after(() => children.forEach((c) => c.kill()));

/** Run merma with `args` until it prints a page address; resolves with the address and the process. */
function run(args, env = {}) {
  const child = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, BROWSER: '', ...env } });
  children.push(child);
  return new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      const url = out.match(/http:\/\/\S+/)?.[0];
      if (url) resolve({ url, out, child });
    });
    child.on('exit', (code) => reject(new Error(`merma exited ${code}: ${out}`)));
  });
}

function file(name) {
  const path = join(DIR, name);
  writeFileSync(path, 'flowchart TD\n  A --> B\n');
  return path;
}

test('merma <file> serves that file, and only that file', async () => {
  const one = file('one.mmd');
  const other = file('other.mmd');
  const { url, out } = await run([one]);
  assert.match(out, /^merma: serving at\n/);
  const page = new URL(url);
  assert.equal(page.searchParams.get('f'), one);
  assert.equal((await fetch(`${page.origin}/source?f=${encodeURIComponent(one)}`)).status, 200);
  const refused = await fetch(`${page.origin}/source?f=${encodeURIComponent(other)}`);
  assert.equal(refused.status, 403);
  assert.match(await refused.text(), new RegExp(`run: merma ${other}`));
});

test('merma <file> <port> points at the merma already serving that file there', async () => {
  const one = file('again.mmd');
  const first = await run([one]);
  const port = new URL(first.url).port;
  const second = spawn(process.execPath, [BIN, one, port], { env: { ...process.env, BROWSER: '' } });
  let out = '';
  second.stdout.on('data', (d) => { out += d; });
  const code = await new Promise((resolve) => second.on('exit', resolve));
  assert.equal(code, 0);
  assert.equal(out, `merma: already served at\n  ${first.url}\n`);
});

test('merma <file> refuses a file that does not exist', async () => {
  await assert.rejects(run([join(DIR, 'missing.mmd')]), /exited 1/);
});

test('merma <file> <port> serves on a free port when the merma there does not serve the file', async () => {
  const first = await run([file('first.mmd')]);
  const port = new URL(first.url).port;
  const { url, out } = await run([file('second.mmd'), port]);
  assert.match(out, new RegExp(`^merma: the merma on port ${port} does not serve this file \\(This server does not serve `));
  assert.notEqual(new URL(url).port, port);
  assert.equal((await fetch(url)).status, 200);
});

test('a $BROWSER that cannot be started is reported, and the server keeps serving', async () => {
  const one = file('browser.mmd');
  const { url, child } = await run([one], { BROWSER: 'no-such-browser-merma --new-tab' });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.match(err, /could not open the page with \$BROWSER/);
  assert.equal(child.exitCode, null);
  assert.equal((await fetch(url)).status, 200);
});

test('merma with a file that is not .mmd says why before the usage', () => {
  const r = spawnSync(process.execPath, [BIN, 'diagram.mermaid'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /^merma: opens .mmd files; got diagram.mermaid\n/);
});

test('the refusal quotes a path a shell would split', async () => {
  const { url } = await run([file('quoted.mmd')]);
  const odd = join(DIR, "it's here.mmd");
  const res = await fetch(`${new URL(url).origin}/source?f=${encodeURIComponent(odd)}`);
  assert.match(await res.text(), new RegExp(`run: merma '${DIR}/it'\\\\''s here\\.mmd'$`));
});

test('MERMA_IDLE: unset or 0, the server runs until stopped; N, it stops N seconds after the last request', async () => {
  const one = file('idle.mmd');
  const kept = await Promise.all([run([one]), run([one], { MERMA_IDLE: '0' })]);
  const stops = await run([one], { MERMA_IDLE: '1' });
  const exited = new Promise((resolve) => stops.child.on('exit', resolve));
  await new Promise((r) => setTimeout(r, 2500));
  for (const { child } of kept) assert.equal(child.exitCode, null);
  assert.equal(await exited, 0);
});

test('MERMA_IDLE that is not a number of seconds is refused', () => {
  const r = spawnSync(process.execPath, [BIN, file('bad.mmd')], { env: { ...process.env, BROWSER: '', MERMA_IDLE: 'soon' } });
  assert.equal(r.status, 2);
  assert.match(String(r.stderr), /MERMA_IDLE must be a number of seconds/);
});
