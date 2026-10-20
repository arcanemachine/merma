import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(import.meta.dirname, '..', 'bin', 'merma.js');
const DIR = realpathSync(mkdtempSync(join(tmpdir(), 'merma-cli-')));
const children = [];
after(() => children.forEach((c) => c.kill()));

/** Run merma with `args` until it prints a page address; resolves with the address and the process. */
function run(args) {
  const child = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, BROWSER: '' } });
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
