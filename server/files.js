// Which .mmd files the server may touch, and reading them. Every path is resolved through symlinks before it is
// checked, so a link inside an allowed folder cannot reach a file outside it.

import { readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

/** The real path of `path`, or for a file that does not exist yet, its real folder joined to its name. */
function real(path) {
  try {
    return realpathSync(path);
  } catch {
    try {
      return join(realpathSync(dirname(path)), basename(path));
    } catch {
      return resolve(path);
    }
  }
}

/**
 * @param {object} options
 * @param {string[]} options.roots folders whose .mmd files may be served
 * @param {[string, string][]} [options.pathMap] [server prefix, host prefix] pairs, for showing a file's host path
 */
export function createFiles({ roots, pathMap = [] }) {
  const realRoots = roots.map((root) => real(root).replace(/\/*$/, '/'));

  return {
    roots: realRoots,

    allowed(path) {
      if (typeof path !== 'string' || !isAbsolute(path)) return false;
      const p = real(path);
      return p.endsWith('.mmd') && realRoots.some((root) => p.startsWith(root));
    },

    /** The file's text, or null when it does not exist. Call only with an allowed path. */
    read(path) {
      try {
        return readFileSync(path, 'utf8');
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },

    hostPath(path) {
      for (const [server, host] of pathMap) {
        if (path === server || path.startsWith(server + '/')) return host + path.slice(server.length);
      }
      return '';
    },
  };
}

/** "a/,b/" (an environment variable's form) as a list of folders. */
export function parseRoots(spec) {
  return spec.split(',').map((s) => s.trim()).filter(Boolean);
}

/** "server=host,server=host" as [server, host] pairs, trailing slashes dropped. */
export function parsePathMap(spec) {
  return spec.split(',').filter((entry) => entry.includes('=')).map((entry) => {
    const at = entry.indexOf('=');
    return [entry.slice(0, at).replace(/\/+$/, ''), entry.slice(at + 1).replace(/\/+$/, '')];
  });
}
