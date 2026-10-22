#!/usr/bin/env node
// merma <file.mmd> [port]: open one diagram. merma serve [port] [host]: serve a live view of .mmd files. See
// README.md for the settings.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFiles, parsePathMap, parseRoots } from '../server/files.js';
import { createServer, LOOPBACK_HOSTS } from '../server/server.js';

const USAGE = `Usage:
  merma <file.mmd> [port]        open that file (only that file is served); port: a free one
  merma serve [port] [host]      serve the .mmd files under MERMA_ROOTS (defaults 63762, 127.0.0.1)

Settings, from the environment:
  MERMA_ROOTS     for serve: folders whose .mmd files may be served, comma-separated (default /tmp/mermaid-diagrams/)
  MERMA_PATH_MAP  server=host path prefixes, comma-separated, to show a file's host path
  MERMA_IDLE      seconds with no requests before the server exits (default 300)
  MERMA_HOSTS     host names the page may be opened under besides localhost, 127.0.0.1 and [::1], comma-separated
  BROWSER         for merma <file>: a command to open the page with, arguments allowed (unset: the address is printed)`;

const SCRATCH = '/tmp/mermaid-diagrams/scratch.mmd';
const SCRATCH_TEXT = 'flowchart TD\n  A["Edit /tmp/mermaid-diagrams/scratch.mmd"] --> B["This page updates on save"]\n';

const [command, ...args] = process.argv.slice(2);
if (command === 'serve') serve(args[0] ?? '63762', args[1] ?? '127.0.0.1');
else if (command?.endsWith('.mmd')) await open(resolve(command), args[0] ?? '0');
else {
  const help = command === undefined || command === '--help' || command === '-h';
  if (!help) console.log(`merma: opens .mmd files; got ${command}\n`);
  console.log(USAGE);
  process.exit(help ? 0 : 2);
}

function serve(/** @type {string} */ port, /** @type {string} */ host) {
  if (!existsSync(SCRATCH)) {
    mkdirSync(dirname(SCRATCH), { recursive: true });
    writeFileSync(SCRATCH, SCRATCH_TEXT);
  }
  start(parseRoots(process.env.MERMA_ROOTS || '/tmp/mermaid-diagrams/'), port, host,
    (/** @type {string} */ base) => console.log(`merma: serving .mmd files under ${process.env.MERMA_ROOTS || '/tmp/mermaid-diagrams/'} at ${base}/?f=<path>`));
}

/** Serve one file, or point at the merma already serving it on `port`, and print the page's address. */
async function open(/** @type {string} */ file, /** @type {string} */ port) {
  if (!existsSync(file)) {
    console.error(`merma: no such file: ${file}`);
    process.exit(1);
  }
  const page = (/** @type {string} */ base) => `${base}/?f=${encodeURIComponent(realpathSync(file)).replaceAll('%2F', '/')}`;
  if (port !== '0') {
    const there = await mermaAt(port, file);
    if (there === true) {
      show(page(`http://localhost:${port}`), 'already served');
      return;
    }
    // The port was a wish, the page is the aim: a merma there that serves other files leaves us a free port.
    if (there) {
      console.log(`merma: the merma on port ${port} does not serve this file (${there})`);
      port = '0';
    }
  }
  start([file], port, '127.0.0.1', (/** @type {string} */ base) => show(page(base), 'serving'));
}

/**
 * What answers on `port`: true for a merma that serves `file`, the first line of its refusal for a merma that does
 * not, null for anything else (or nothing).
 */
async function mermaAt(/** @type {string} */ port, /** @type {string} */ file) {
  const base = `http://localhost:${port}`;
  try {
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
    if (!(await health.text()).startsWith('ok pid=')) return null;
    const source = await fetch(`${base}/source?f=${encodeURIComponent(file)}`, { signal: AbortSignal.timeout(2000) });
    return source.ok || (await source.text()).split('\n')[0];
  } catch {
    return null;
  }
}

/** Print the page's address, and open it with $BROWSER (a command, with any arguments) when that is set. */
function show(/** @type {string} */ url, /** @type {string} */ what) {
  console.log(`merma: ${what} at\n  ${url}`);
  const [browser, ...options] = (process.env.BROWSER || '').split(/\s+/).filter(Boolean);
  if (!browser) return;
  spawn(browser, [...options, url], { detached: true, stdio: 'ignore' })
    .on('error', (e) => console.error(`merma: could not open the page with $BROWSER: ${e.message}`))
    .unref();
}

function start(/** @type {string[]} */ roots, /** @type {string} */ port, /** @type {string} */ host,
  /** @type {(base: string) => void} */ onListening) {
  const files = createFiles({ roots, pathMap: parsePathMap(process.env.MERMA_PATH_MAP || '') });
  // A server bound to one non-loopback address also answers to it; one bound to every address answers only to the
  // loopback names and MERMA_HOSTS, since nothing says which names reach it.
  const hosts = [...LOOPBACK_HOSTS, ...parseRoots(process.env.MERMA_HOSTS || '')];
  if (!['0.0.0.0', '::'].includes(host)) hosts.push(host.includes(':') ? `[${host}]` : host);
  const server = createServer({ files, script: realpathSync(fileURLToPath(import.meta.url)), hosts });

  // An open page polls every second, so the server lives while any tab is open; the idle time also covers the gap
  // between starting it and opening the page.
  const idleMs = Number(process.env.MERMA_IDLE || 300) * 1000;
  setInterval(() => {
    if (Date.now() - server.lastRequest >= idleMs) process.exit(0);
  }, Math.min(5000, idleMs)).unref();

  server.on('error', (/** @type {NodeJS.ErrnoException} */ e) => {
    console.error(`merma: ${e.code === 'EADDRINUSE' ? `port ${port} is held by something else` : e.message}`);
    process.exit(1);
  });
  server.listen(Number(port), host, () => {
    const name = ['127.0.0.1', '0.0.0.0', '::'].includes(host) ? 'localhost' : host.includes(':') ? `[${host}]` : host;
    onListening(`http://${name}:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`);
  });
}
