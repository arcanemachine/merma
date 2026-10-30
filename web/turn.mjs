// Rotate and flip, page-side, as collapse is (collapse.mjs): the page draws the file with its directions turned, and
// nothing is written (docs/ux.md, "The file comes first"). Each direction is two letters, swapped in place, so no
// offset after it moves; a header with none gets one, since Mermaid ignores a top-level `direction` line.

import { directions } from './patch/flowchart.mjs';

/** @typedef {{ rotate: boolean, flip: boolean }} Turn */

// Rotate turns top-down sideways and back, keeping which way it reads; flip reverses it, keeping it upright or sideways.
const ROTATE = /** @type {Record<string, string>} */ ({ TB: 'LR', TD: 'LR', LR: 'TB', BT: 'RL', RL: 'BT' });
const FLIP = /** @type {Record<string, string>} */ ({ TB: 'BT', TD: 'BT', BT: 'TB', LR: 'RL', RL: 'LR' });

/** Direction `dir` turned: rotated, then flipped. The two commute. */
export function turnDir(/** @type {string} */ dir, /** @type {Turn} */ turn) {
  const r = turn.rotate ? ROTATE[dir] : dir;
  return turn.flip ? FLIP[r] : r;
}

/** The file's own direction, as Mermaid reads it (none written is TB): what a turn was made from. */
export function baseDir(/** @type {string} */ text) {
  return directions(text)?.header.dir ?? 'TB';
}

/** The text the page draws for `text` turned: the header's direction and every subgraph's, each turned. */
export function turnText(/** @type {string} */ text, /** @type {Turn} */ turn) {
  const found = directions(text);
  if (!found || (!turn.rotate && !turn.flip)) return text;
  const { header, inner } = found;
  let out = text;
  // Last first, so the offsets before each stay good.
  for (const { at, dir } of [...inner].reverse()) out = out.slice(0, at) + turnDir(dir, turn) + out.slice(at + 2);
  const dir = turnDir(header.dir ?? 'TB', turn);
  return header.dir ? out.slice(0, header.at) + dir + out.slice(header.at + 2) : `${out.slice(0, header.at)} ${dir}${out.slice(header.at)}`;
}
