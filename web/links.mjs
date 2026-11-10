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
 * Which blue a link's label takes on a node filled `fill`, a computed CSS color (`rgb(…)`): 'dark' on a fill darker
 * than the luminance where black and white text contrast equally (WCAG's relative luminance), else 'light'. No fill,
 * or a transparent one, is 'light': the page behind it is white.
 * @returns {'light' | 'dark'}
 */
export function linkTone(/** @type {string} */ fill) {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(fill);
  if (!m || Number.parseFloat(m[4] ?? '1') === 0) return 'light';
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => {
    const c = Number(v) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.179 ? 'dark' : 'light';
}

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
