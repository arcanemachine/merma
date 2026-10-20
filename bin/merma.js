#!/usr/bin/env node
// merma serve [port] [host]: serve a live view of .mmd files. See README.md for the settings.

import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFiles, parsePathMap, parseRoots } from '../server/files.js';
import { createServer, LOOPBACK_HOSTS } from '../server/server.js';

const USAGE = `Usage: merma serve [port] [host]   (defaults 63762, 127.0.0.1)

Settings, from the environment:
  MERMA_ROOTS     folders whose .mmd files may be served, comma-separated (default /tmp/mermaid-diagrams/)
  MERMA_PATH_MAP  server=host path prefixes, comma-separated, to show a file's host path
  MERMA_IDLE      seconds with no requests before the server exits (default 300)
  MERMA_HOSTS     host names the page may be opened under besides localhost, 127.0.0.1 and [::1], comma-separated`;

const SCRATCH = '/tmp/mermaid-diagrams/scratch.mmd';
const SCRATCH_TEXT = 'flowchart TD\n  A["Edit /tmp/mermaid-diagrams/scratch.mmd"] --> B["This page updates on save"]\n';

const [command, port = '63762', host = '127.0.0.1'] = process.argv.slice(2);
if (command !== 'serve') {
  console.log(USAGE);
  process.exit(command === undefined || command === '--help' || command === '-h' ? 0 : 2);
}

if (!existsSync(SCRATCH)) {
  mkdirSync(dirname(SCRATCH), { recursive: true });
  writeFileSync(SCRATCH, SCRATCH_TEXT);
}

const files = createFiles({
  roots: parseRoots(process.env.MERMA_ROOTS || '/tmp/mermaid-diagrams/'),
  pathMap: parsePathMap(process.env.MERMA_PATH_MAP || ''),
});
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

server.listen(Number(port), host);
