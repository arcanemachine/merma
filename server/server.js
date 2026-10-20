// The HTTP server: the page and its modules from web/, and the diagram files through the routes below.
//
//   GET /                  the page
//   GET /<file>.mjs|.css   the page's modules and styles
//   GET /source?f=<path>   a diagram file's text, with its version as the ETag
//   POST /edit?f=<path>    replace the file with the request body, only if If-Match names its current version;
//                          409 otherwise, so an edit made in the page never overwrites a change saved meanwhile
//   GET /hostpath?f=<path> where that file is on the host, for a server in a container ('' when unknown)
//   GET /health            "ok pid=<pid> script=<path>", so a caller can tell which server holds the port
//
// Every route answers only requests addressed to a known host name (`hosts`), whatever the port. That stops DNS
// rebinding: a page on another site can point its own domain at this machine, and its requests would then be
// same-origin to the browser, but they still carry that domain as their Host.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { version } from './files.js';

const WEB = fileURLToPath(new URL('../web/', import.meta.url));
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript' };
export const MAX_EDIT_BYTES = 1_000_000;

export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** The host name from a Host header, without its port: `localhost:6376` → `localhost`, `[::1]:6376` → `[::1]`. */
function hostName(header = '') {
  return header.startsWith('[') ? header.slice(0, header.indexOf(']') + 1) : header.split(':')[0];
}

/**
 * @param {object} options
 * @param {ReturnType<import('./files.js').createFiles>} options.files
 * @param {string} options.script the path /health reports
 * @param {string[]} [options.hosts] host names requests may be addressed to (default: loopback only)
 */
export function createServer({ files, script, hosts = LOOPBACK_HOSTS }) {
  const allowedHosts = new Set(hosts.map((h) => h.toLowerCase()));
  const server = http.createServer((req, res) => {
    server.lastRequest = Date.now();
    handle(req, res).catch((e) => send(res, 500, String(e.message || e)));
  });
  server.lastRequest = Date.now();

  async function handle(req, res) {
    if (!allowedHosts.has(hostName(req.headers.host).toLowerCase())) {
      return send(res, 403, 'Unknown host: ' + (req.headers.host || '(none)'));
    }
    const url = new URL(req.url, 'http://localhost');
    const f = url.searchParams.get('f') || '';
    if (req.method === 'POST' && url.pathname === '/edit') return edit(req, res, f);
    if (req.method !== 'GET') return send(res, 405, 'Method not allowed');

    if (url.pathname === '/health') return send(res, 200, `ok pid=${process.pid} script=${script}`);
    if (url.pathname === '/hostpath') return send(res, 200, files.hostPath(f));

    if (url.pathname === '/source') {
      if (!files.allowed(f)) return send(res, 403, 'Only .mmd files under ' + files.roots.join(', ') + ' are served.');
      const text = files.read(f);
      if (text === null) return send(res, 404, 'File not found: ' + f);
      return send(res, 200, text, 'text/plain', { ETag: version(text) });
    }

    return serveWeb(url.pathname, res);
  }

  async function edit(req, res, f) {
    // A page from another site can send a POST to localhost. Requiring If-Match (not a CORS-safelisted header) makes
    // the browser ask first, and this server never says yes; the Origin check refuses any request that gets through.
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {
      return send(res, 403, "Edits are accepted only from this server's own page.");
    }
    if (!files.allowed(f)) return send(res, 403, 'Only .mmd files under ' + files.roots.join(', ') + ' can be edited.');
    const base = req.headers['if-match'];
    if (!base) return send(res, 428, 'If-Match is required: the version (ETag) the edit was based on.');

    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_EDIT_BYTES) return send(res, 413, `Edits are limited to ${MAX_EDIT_BYTES} bytes.`);
      chunks.push(chunk);
    }
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    } catch {
      return send(res, 400, 'The edit is not valid UTF-8.');
    }

    const result = files.writeIfVersion(f, base, text);
    if (result === 'missing') return send(res, 404, 'File not found: ' + f);
    if (result === 'conflict') {
      return send(res, 409, 'The file changed since the page read it; reload and edit again.', 'text/plain',
        { ETag: version(files.read(f) ?? '') });
    }
    return send(res, 200, 'saved', 'text/plain', { ETag: version(text) });
  }

  return server;
}

/** A file from web/, by its path; nothing outside web/ and nothing but the page's own file types. */
async function serveWeb(pathname, res) {
  const path = normalize(join(WEB, pathname === '/' ? 'index.html' : decodeURIComponent(pathname)));
  const type = TYPES[extname(path)];
  if (!path.startsWith(WEB.endsWith(sep) ? WEB : WEB + sep) || !type) return send(res, 404, 'Not found');
  try {
    return send(res, 200, await readFile(path, 'utf8'), type);
  } catch {
    return send(res, 404, 'Not found');
  }
}

export function send(res, status, body, type = 'text/plain', headers = {}) {
  const data = Buffer.from(body, 'utf8');
  res.writeHead(status, {
    'Content-Type': `${type}; charset=utf-8`,
    'Cache-Control': 'no-store',
    'Content-Length': data.length,
    ...headers,
  });
  res.end(data);
}
