// A node's link (`click A href "…"`), as Mermaid reads it: what Open link does with it, or why it does nothing. No DOM.

export const NO_LINK = 'No link on this node.';
/** A callback, or a `javascript:` link, which Mermaid's sanitizer turns into about:blank. */
export const SCRIPT_LINK = 'This link runs a script; merma does not run it.';
export const NOT_MMD = 'merma opens only .mmd files from a link to a path.';

/**
 * What a link leads to: a diagram file on this server, shown with its part (a subgraph id, as in the address), a web
 * address, an app's address (`vscode:`), which the system hands to the app, or why merma does not follow it.
 * @typedef {{ path: string, part: string | null } | { url: string, app: boolean } | { why: string }} LinkTarget
 */

/**
 * Where node's link `link` (from Mermaid's db; undefined for none) leads, from diagram `file` (an absolute path).
 * `click` says whether the text has a `click` line for the node: with no link, it is a callback.
 * @returns {LinkTarget}
 */
export function linkTarget(/** @type {string | undefined} */ link, /** @type {boolean} */ click, /** @type {string} */ file) {
  if (!link) return { why: click ? SCRIPT_LINK : NO_LINK };
  if (link === 'about:blank') return { why: SCRIPT_LINK };
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(link)?.[1].toLowerCase();
  if (scheme === 'http' || scheme === 'https') return { url: link, app: false };
  if (scheme === 'vscode') return { url: link, app: true };
  if (scheme) return { why: `merma does not open ${scheme}: links.` };
  // A path, from the file's folder: `other.mmd?part=pay`, or `?part=pay` for this file.
  const url = new URL(link, new URL('file://' + file));
  const path = decodeURIComponent(url.pathname);
  if (!path.endsWith('.mmd')) return { why: NOT_MMD };
  return { path, part: url.searchParams.get('part') };
}
