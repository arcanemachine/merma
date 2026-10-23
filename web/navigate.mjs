// Where an arrow key moves the selection along a flowchart's edges, from the nodes as drawn: no DOM. The diagram's
// direction says which arrow goes forward (to the nodes this one points to) and which goes back; the other two step
// through a group of siblings in screen order, without wrapping. A subgraph's own direction is not read.

/**
 * A drawn node: its middle and size, in screen coordinates.
 * @typedef {{ id: string, x: number, y: number, w: number, h: number }} Box
 */
/** @typedef {{ from: string, to: string }} Link */
/** @typedef {'TB' | 'BT' | 'LR' | 'RL'} Direction */
/**
 * What a run of arrow keys remembers: `path`, the nodes it came forward through (the last one is the node it came
 * from), and `group`, the siblings the cross arrows step through.
 * @typedef {{ path: string[], group: string[] }} Trail
 */

/** Each direction's arrows: forward, back, previous sibling, next sibling. */
const ARROWS = {
  TB: { ArrowDown: 'forward', ArrowUp: 'back', ArrowLeft: 'prev', ArrowRight: 'next' },
  BT: { ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'prev', ArrowRight: 'next' },
  LR: { ArrowRight: 'forward', ArrowLeft: 'back', ArrowUp: 'prev', ArrowDown: 'next' },
  RL: { ArrowLeft: 'forward', ArrowRight: 'back', ArrowUp: 'prev', ArrowDown: 'next' },
};

/**
 * The next node for `key` (KeyboardEvent.key) from node `at`, and the trail to carry on with; null when there is
 * nowhere to go. Edges to anything not in `boxes` (a subgraph) are left out.
 * @param {{ boxes: Box[], links: Link[], direction: Direction }} graph
 * @param {string} at
 * @param {string} key
 * @param {Trail | null} trail from the last arrow of this run, or null
 * @returns {{ id: string, trail: Trail } | null}
 */
export function step({ boxes, links, direction }, at, key, trail) {
  const move = /** @type {Record<string, string>} */ (ARROWS[direction])[key];
  const byId = new Map(boxes.map((b) => [b.id, b]));
  if (!move || !byId.has(at)) return null;
  // Siblings run across the flow: left to right in TB and BT, top to bottom in LR and RL.
  const across = direction === 'TB' || direction === 'BT' ? 'x' : 'y';
  const along = across === 'x' ? 'y' : 'x';
  const order = (/** @type {Iterable<string>} */ ids) => [...new Set(ids)].filter((id) => byId.has(id))
    .sort((a, b) => {
      const p = /** @type {Box} */ (byId.get(a)), q = /** @type {Box} */ (byId.get(b));
      return p[across] - q[across] || p[along] - q[along];
    });
  const real = links.filter((l) => l.from !== l.to && byId.has(l.from) && byId.has(l.to));
  const children = (/** @type {string} */ id) => order(real.filter((l) => l.from === id).map((l) => l.to));
  const parents = (/** @type {string} */ id) => order(real.filter((l) => l.to === id).map((l) => l.from));
  const path = trail?.path ?? [];

  if (move === 'forward') {
    const next = children(at);
    return next.length ? { id: next[0], trail: { path: [...path, at], group: next } } : null;
  }
  if (move === 'back') {
    const up = parents(at);
    if (!up.length) return null;
    const came = path.at(-1);
    const id = came && up.includes(came) ? came : up[0];
    // At a merge the cross arrows step through its parents; otherwise through the siblings of where Up went.
    const rest = came === id ? path.slice(0, -1) : [];
    return { id, trail: { path: rest, group: up.length > 1 ? up : groupOf(id, rest) } };
  }
  const group = trail?.group.includes(at) ? trail.group : groupOf(at, path);
  const k = group.indexOf(at) + (move === 'next' ? 1 : -1);
  return k >= 0 && k < group.length ? { id: group[k], trail: { path, group } } : null;

  /** The siblings of `id`: the nodes its parent points to (the one it was reached from, else its first), or the
   * nodes nothing points to when it has no parent. */
  function groupOf(/** @type {string} */ id, /** @type {string[]} */ from) {
    const up = parents(id);
    const came = from.at(-1);
    const parent = came && up.includes(came) ? came : up[0];
    if (parent) return children(parent);
    return order(boxes.map((b) => b.id).filter((b) => !parents(b).length));
  }
}

/** The node whose middle is nearest the point (`x`, `y`), or null when there are none. */
export function nearest(/** @type {Box[]} */ boxes, /** @type {number} */ x, /** @type {number} */ y) {
  let best = null, bestD = Infinity;
  for (const b of boxes) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < bestD) { best = b.id; bestD = d; }
  }
  return best;
}

/** Each arrow's direction on screen. */
const ON_SCREEN = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

/**
 * The nearest node in `key`'s direction from node `at`, by place on screen, connected or not: one whose middle lies
 * within 45° either side of the arrow. Null when there is none; nothing wraps.
 */
export function byPlace(/** @type {Box[]} */ boxes, /** @type {string} */ at, /** @type {string} */ key) {
  const v = /** @type {Record<string, number[]>} */ (ON_SCREEN)[key];
  const from = boxes.find((b) => b.id === at);
  if (!v || !from) return null;
  let best = null, bestD = Infinity;
  for (const b of boxes) {
    const dx = b.x - from.x, dy = b.y - from.y;
    const ahead = dx * v[0] + dy * v[1], aside = Math.abs(dx * v[1] - dy * v[0]);
    if (b.id === at || ahead <= 0 || aside > ahead) continue;
    const d = Math.hypot(dx, dy);
    if (d < bestD) { best = b.id; bestD = d; }
  }
  return best;
}

/** @typedef {{ id: string, from: string, to: string }} Edge an edge between drawn nodes, by its SVG id */

/**
 * Arrow keys onto and between edges. From node `at`, forward selects its first outgoing edge and back its first
 * incoming one (first across the flow, by the node at the other end); from edge `at`, forward and back go to the node
 * it points to and the one it comes from, and the cross arrows step through `group` (the edges it was reached among,
 * else the edges leaving the node it comes from), without wrapping. Null when there is nowhere to go.
 * @param {{ boxes: Box[], edges: Edge[], direction: Direction }} graph
 * @param {{ kind: 'node' | 'edge', id: string }} at
 * @param {string} key
 * @param {string[] | null} group
 * @returns {{ kind: 'node' | 'edge', id: string, group: string[] } | null}
 */
export function edgeStep({ boxes, edges, direction }, at, key, group) {
  const move = /** @type {Record<string, string>} */ (ARROWS[direction])[key];
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const across = direction === 'TB' || direction === 'BT' ? 'x' : 'y';
  const real = edges.filter((e) => e.from !== e.to && byId.has(e.from) && byId.has(e.to));
  /** Edges ordered across the flow by their other end. */
  const order = (/** @type {Edge[]} */ list, /** @type {'from' | 'to'} */ end) => [...list]
    .sort((a, b) => /** @type {Box} */ (byId.get(a[end]))[across] - /** @type {Box} */ (byId.get(b[end]))[across])
    .map((e) => e.id);
  if (!move) return null;
  if (at.kind === 'node') {
    const list = move === 'forward' ? order(real.filter((e) => e.from === at.id), 'to')
      : move === 'back' ? order(real.filter((e) => e.to === at.id), 'from') : [];
    return list.length ? { kind: 'edge', id: list[0], group: list } : null;
  }
  const edge = real.find((e) => e.id === at.id);
  if (!edge) return null;
  if (move === 'forward') return { kind: 'node', id: edge.to, group: [] };
  if (move === 'back') return { kind: 'node', id: edge.from, group: [] };
  const list = group?.includes(at.id) ? group : order(real.filter((e) => e.from === edge.from), 'to');
  const k = list.indexOf(at.id) + (move === 'next' ? 1 : -1);
  return k >= 0 && k < list.length ? { kind: 'edge', id: list[k], group: list } : null;
}
