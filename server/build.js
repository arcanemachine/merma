// The build id: which version of merma's code a page is running. A page compares the id it was served with against
// the one on each response, and reloads when they differ, so open pages pick up new code without anyone reloading
// them. The server's own code (server/, bin/) only changes with a restart, so it is hashed once; the page's files
// (web/) can change under a running server, so they are re-hashed whenever a file's size or modification time does.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every file under `dir`, recursively, sorted so the order never depends on the file system. */
function filesUnder(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

function hashFiles(paths) {
  const hash = createHash('sha256');
  for (const path of paths) hash.update(path).update('\0').update(readFileSync(path)).update('\0');
  return hash.digest('hex');
}

/**
 * @param {object} dirs
 * @param {string} dirs.web the page's files, re-checked on every call
 * @param {string[]} dirs.fixed the server's own code, hashed once
 */
export function createBuild({ web, fixed }) {
  const serverHash = hashFiles(fixed.flatMap(filesUnder));
  /** @type {string | null} the web files' paths, sizes and times when `id` was last computed */
  let signature = null;
  /** @type {string | null} */
  let id = null;

  return {
    id() {
      const paths = filesUnder(web);
      const now = paths.map((p) => { const s = statSync(p); return `${p}:${s.size}:${s.mtimeMs}`; }).join('\n');
      if (now !== signature) {
        signature = now;
        id = createHash('sha256').update(serverHash).update(hashFiles(paths)).digest('hex').slice(0, 12);
      }
      return id;
    },
  };
}
