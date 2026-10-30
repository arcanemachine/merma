// Rotate and flip, page-side, as collapse is (collapse.mjs): the page draws the file with its directions turned, and
// nothing is written (docs/ux.md, "The file comes first"). A direction is two letters, swapped in place; a header with
// none gets one, since Mermaid ignores a top-level `direction` line; a subgraph turned on its own with none gets a
// `direction` line of its own. Only the drawn text moves, never the file's.

import { directions } from './patch/flowchart.mjs';

/** @typedef {{ rotate: boolean, flip: boolean }} Turn */
/** @typedef {Map<string, Turn>} SubTurns each subgraph's own turn, by id, on top of what it is drawn with otherwise */

// Rotate turns top-down sideways and back, keeping which way it reads; flip reverses it, keeping it upright or sideways.
const ROTATE = /** @type {Record<string, string>} */ ({ TB: 'LR', TD: 'LR', LR: 'TB', BT: 'RL', RL: 'BT' });
const FLIP = /** @type {Record<string, string>} */ ({ TB: 'BT', TD: 'BT', BT: 'TB', LR: 'RL', RL: 'LR' });

/** Direction `dir` turned: rotated, then flipped. The two commute. */
export function turnDir(/** @type {string} */ dir, /** @type {Turn} */ turn) {
  const r = turn.rotate ? ROTATE[dir] : dir;
  return turn.flip ? FLIP[r] : r;
}

const on = (/** @type {Turn | undefined} */ t) => Boolean(t && (t.rotate || t.flip));

/** The file's own direction, as Mermaid reads it (none written is TB): what a turn was made from. */
export function baseDir(/** @type {string} */ text) {
  return directions(text)?.header.dir ?? 'TB';
}

/** Subgraph `id`'s own `direction` line in the file, or null: what its own turn was made from. */
export function subgraphDir(/** @type {string} */ text, /** @type {string} */ id) {
  return directions(text)?.blocks.find((b) => b.id === id)?.dir ?? null;
}

/**
 * The text the page draws for `text` turned: the whole diagram by `turn` (the header's direction and every subgraph's
 * own), then each subgraph in `subs` by its own turn, on top of what it would be drawn with: its own line turned, or
 * what it takes from the subgraph or diagram around it.
 */
export function turnText(/** @type {string} */ text, /** @type {Turn} */ turn, /** @type {SubTurns} */ subs = new Map()) {
  const found = directions(text);
  if (!found || (!on(turn) && ![...subs.values()].some(on))) return text;
  const { header, blocks } = found;
  const top = turnDir(header.dir ?? 'TB', turn);
  /** @type {{ at: number, cut: number, put: string }[]} */
  const edits = [];
  if (on(turn)) edits.push(header.dir ? { at: header.at, cut: 2, put: top } : { at: header.at, cut: 0, put: ` ${top}` });
  /** @type {Map<string, string>} each subgraph's direction as drawn; a subgraph comes after the one it is in */
  const drawn = new Map();
  for (const b of blocks) {
    const around = (b.parent !== null && drawn.get(b.parent)) || top;
    const own = b.dir ? turnDir(b.dir, turn) : around;
    const sub = subs.get(b.id);
    const dir = on(sub) ? turnDir(own, /** @type {Turn} */ (sub)) : own;
    drawn.set(b.id, dir);
    if (b.dir !== null && b.at !== null && dir !== b.dir) edits.push({ at: b.at, cut: 2, put: dir });
    else if (b.dir === null && on(sub)) {
      const nl = b.after > 0 && text[b.after - 1] !== '\n' ? '\n' : '';
      edits.push({ at: b.after, cut: 0, put: `${nl}${b.indent}direction ${dir}\n` });
    }
  }
  // Last first, so the offsets before each stay good.
  return edits.sort((a, b) => b.at - a.at).reduce((t, e) => t.slice(0, e.at) + e.put + t.slice(e.at + e.cut), text);
}

/**
 * Whether Mermaid draws subgraph `id` in a direction of its own (seen in Mermaid 12.2.0, not documented): only when no
 * edge joins a node directly in it to a node anywhere else, a subgraph inside it included, nor a node inside it, at
 * any depth, to one outside it. An edge to a subgraph's box does not count.
 * @param {string} id
 * @param {{ id: string, members: string[] }[]} subs every subgraph, with its members (node and subgraph ids)
 * @param {{ from: string, to: string }[]} edges
 */
export function turnable(id, subs, edges) {
  const byId = new Map(subs.map((s) => [s.id, s]));
  const sg = byId.get(id);
  if (!sg) return false;
  const direct = new Set(sg.members.filter((m) => !byId.has(m)));
  /** @type {Set<string>} */
  const inside = new Set();
  const walk = (/** @type {{ members: string[] }} */ s) => {
    for (const m of s.members) { const child = byId.get(m); if (child) walk(child); else inside.add(m); }
  };
  walk(sg);
  for (const e of edges) {
    if (byId.has(e.from) || byId.has(e.to)) continue;
    if (direct.has(e.from) || direct.has(e.to)) {
      if (!direct.has(e.from) || !direct.has(e.to)) return false;
    } else if (inside.has(e.from) !== inside.has(e.to)) return false;
  }
  return true;
}
