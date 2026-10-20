// The HTTP server: the page and its modules from web/, and the diagram files through the routes below.
//
//   GET /                  the page
//   GET /<file>.mjs|.css   the page's modules and styles
//   GET /source?f=<path>   a diagram file's text
//   GET /hostpath?f=<path> where that file is on the host, for a server in a container ('' when unknown)
//   GET /health            "ok pid=<pid> script=<path>", so a caller can tell which server holds the port

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../web/', import.meta.url));
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript' };

/**
 * @param {object} options
 * @param {ReturnType<import('./files.js').createFiles>} options.files
 * @param {string} options.script the path /health reports
 */
export function createServer({ files, script }) {
  const server = http.createServer((req, res) => {
    server.lastRequest = Date.now();
    handle(req, res).catch((e) => send(res, 500, String(e.message || e)));
  });
  server.lastRequest = Date.now();

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const f = url.searchParams.get('f') || '';
    if (req.method !== 'GET') return send(res, 405, 'Method not allowed');

    if (url.pathname === '/health') return send(res, 200, `ok pid=${process.pid} script=${script}`);
    if (url.pathname === '/hostpath') return send(res, 200, files.hostPath(f));

    if (url.pathname === '/source') {
      if (!files.allowed(f)) return send(res, 403, 'Only .mmd files under ' + files.roots.join(', ') + ' are served.');
      const text = files.read(f);
      if (text === null) return send(res, 404, 'File not found: ' + f);
      return send(res, 200, text);
    }

    return serveWeb(url.pathname, res);
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
