// Where an arrow key moves the selection, from the diagram as drawn: no DOM (the editor measures and passes it in).
// docs/ux.md gives the rules and why. The arrows are screen directions. Plain arrows walk edges: from a node or a
// subgraph's box, an arrow selects an edge leaving it that way; on an edge, the arrow along it goes to that end and the
// other two step to the edges beside it. Ctrl+Arrows skip the edge, or jump by place when there is none that way.

/** @typedef {{ x: number, y: number }} Point */
/**
 * A node or a subgraph's box, by its middle and size on screen. `parent` is the subgraph it is drawn in, or null.
 * @typedef {{ kind: 'node' | 'subgraph', id: string, x: number, y: number, w: number, h: number, parent?: string | null }} Box
 */
/**
 * A drawn edge: its ends' ids (a node's or a subgraph's), and at each end where it meets it and a point a little way
 * along its line from there, which says which way it heads as it leaves; `mid` is its label, else its line's middle.
 * @typedef {{ id: string, from: string, to: string, start: Point, startOut: Point, end: Point, endOut: Point, mid: Point }} Edge
 */
/** @typedef {{ kind: 'node' | 'subgraph' | 'edge', id: string }} Target */

/** Each arrow's direction on screen. */
const SIDES = /** @type {Record<string, { v: [number, number] }>} */ ({
  ArrowUp: { v: [0, -1] },
  ArrowDown: { v: [0, 1] },
  ArrowLeft: { v: [-1, 0] },
  ArrowRight: { v: [1, 0] },
});
export const OPPOSITE = /** @type {Record<string, string>} */ ({
  ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp', ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft',
});
const vertical = (/** @type {string} */ key) => key === 'ArrowUp' || key === 'ArrowDown';

/** Which way a line heads from `a` towards `b`: the arrow of its larger move, down or up when equal. */
export function heading(/** @type {Point} */ a, /** @type {Point} */ b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'ArrowRight' : 'ArrowLeft';
  return dy >= 0 ? 'ArrowDown' : 'ArrowUp';
}

/**
 * The edge's two ends, each with the way the edge heads as it leaves it, and where it meets it.
 * @returns {{ id: string, dir: string, at: Point }[]}
 */
const endsOf = (/** @type {Edge} */ e) => [
  { id: e.from, dir: heading(e.start, e.startOut), at: e.start },
  { id: e.to, dir: heading(e.end, e.endOut), at: e.end },
];

/**
 * The edges leaving `id` heading `key`, in order across that way by where they meet it (two out of a diamond's
 * corners are told apart there): left to right for up and down, top to bottom for left and right. An edge belongs to
 * both its ends, whichever way it points. Self-loops are left out.
 */
export function leaving(/** @type {Edge[]} */ edges, /** @type {string} */ id, /** @type {string} */ key) {
  const across = vertical(key) ? 'x' : 'y';
  /** @type {{ id: string, at: Point }[]} */
  const found = [];
  for (const e of edges) {
    if (e.from === e.to) continue;
    for (const end of endsOf(e)) if (end.id === id && end.dir === key) found.push({ id: e.id, at: end.at });
  }
  return found.sort((a, b) => a.at[across] - b.at[across]).map((f) => f.id);
}

/**
 * Where a plain arrow `key` goes from `at`, or null for nowhere. From a node or a box: the first edge leaving it that
 * way; none, and it is drawn in a subgraph: that subgraph's box. From an edge: the arrow along it goes to the end you
 * arrive at travelling that way (the one end it leaves heading the other way); the other two step to the edge beside
 * it among the edges leaving its top (or left) end the same way as it, without wrapping, and else among those at its
 * other end. Otherwise (a bend that leaves both ends heading the same way, or neither), an arrow goes to the end that
 * lies further that way from the edge's middle.
 * @param {{ boxes: Box[], edges: Edge[] }} graph
 * @param {Target} at
 * @param {string} key
 * @returns {Target | null}
 */
export function walk({ boxes, edges }, at, key) {
  if (!SIDES[key]) return null;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const box = (/** @type {string} */ id) => {
    const b = byId.get(id);
    return b ? /** @type {Target} */ ({ kind: b.kind, id }) : null;
  };
  if (at.kind !== 'edge') {
    const first = leaving(edges, at.id, key)[0];
    if (first) return { kind: 'edge', id: first };
    const parent = byId.get(at.id)?.parent;
    return parent ? { kind: 'subgraph', id: parent } : null;
  }
  const edge = edges.find((e) => e.id === at.id);
  if (!edge || edge.from === edge.to) return null;
  const ends = endsOf(edge);
  // Along the edge: the end it leaves heading back towards us.
  const along = ends.filter((end) => end.dir === OPPOSITE[key]);
  if (along.length === 1) return box(along[0].id);
  if (!along.length) {
    // Across it: the edges beside it, at the end where they fan out the way it goes (its top or left end first).
    const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
    const fans = ends.filter((end) => vertical(end.dir) !== vertical(key))
      .sort((a, b) => Number(b.dir === 'ArrowDown' || b.dir === 'ArrowRight') - Number(a.dir === 'ArrowDown' || a.dir === 'ArrowRight'));
    for (const end of fans) {
      const list = leaving(edges, end.id, end.dir);
      const k = list.indexOf(edge.id) + step;
      if (k >= 0 && k < list.length) return { kind: 'edge', id: list[k] };
      if (list.length > 1) return null;
    }
    // Nothing beside it: a cross arrow stops here, rather than taking an end that happens to lie a little that way.
    // Only a U, leaving both ends the same way, has its ends found by where they lie.
    if (fans.length && ends[0].dir !== ends[1].dir) return null;
  }
  // The end further that way from the middle, if it lies that way at all.
  const [vx, vy] = SIDES[key].v;
  const beyond = (/** @type {Box} */ b) => (b.x - edge.mid.x) * vx + (b.y - edge.mid.y) * vy;
  const ahead = ends.map((end) => byId.get(end.id)).filter((b) => b && beyond(b) > 0)
    .sort((p, q) => beyond(/** @type {Box} */ (q)) - beyond(/** @type {Box} */ (p)));
  return ahead[0] ? box(ahead[0].id) : null;
}

/**
 * Where Ctrl+Arrow `key` goes from `at`: past the edge plain `key` would select, to its far end; from an edge, to the
 * end that way. With no edge that way, null: the caller jumps by place instead.
 * @param {{ boxes: Box[], edges: Edge[] }} graph
 * @param {Target} at
 * @param {string} key
 * @returns {Target | null}
 */
export function skip(graph, at, key) {
  if (at.kind === 'edge') {
    const end = walk(graph, at, key);
    return end?.kind === 'edge' ? null : end;
  }
  const first = leaving(graph.edges, at.id, key)[0];
  const edge = graph.edges.find((e) => e.id === first);
  if (!edge) return null;
  const far = edge.from === at.id ? edge.to : edge.from;
  const b = graph.boxes.find((x) => x.id === far);
  return b ? { kind: b.kind, id: far } : null;
}

const dist = (/** @type {Point} */ a, /** @type {Point} */ b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The subgraph each box is drawn in: the smallest subgraph box holding its middle, other than itself.
 * @returns {Box[]} the boxes, each with `parent`
 */
export function nest(/** @type {Box[]} */ boxes) {
  const subgraphs = boxes.filter((b) => b.kind === 'subgraph');
  const inside = (/** @type {Box} */ b, /** @type {Box} */ s) => s !== b
    && Math.abs(b.x - s.x) <= s.w / 2 && Math.abs(b.y - s.y) <= s.h / 2 && b.w * b.h < s.w * s.h;
  return boxes.map((b) => {
    const holders = subgraphs.filter((s) => inside(b, s)).sort((p, q) => p.w * p.h - q.w * q.h);
    return { ...b, parent: holders[0]?.id ?? null };
  });
}

/**
 * Where Ctrl+Arrow `key` goes from box `at`, by place: among the boxes at its own level (the same subgraph, or the
 * top), those ahead (their middle more than a pixel beyond its middle along the arrow); the ones in its row (or column)
 * first, nearest along it; else the nearest; leftmost or topmost breaking ties. Nothing ahead inside a
 * subgraph: the subgraph's own box. Nothing at all: null; nothing wraps. To go from something with no box (an edge),
 * pass a box of no size at its middle through nest(), which puts it at the level of the subgraph around that point.
 * @param {Box[]} boxes from nest()
 * @param {string} at
 * @param {string} key
 * @returns {Target | null}
 */
export function byPlace(boxes, at, key) {
  const arrow = SIDES[key];
  const from = boxes.find((b) => b.id === at);
  if (!arrow || !from) return null;
  const [vx, vy] = arrow.v;
  const alongOf = (/** @type {Box} */ b) => (b.x - from.x) * vx + (b.y - from.y) * vy;
  const horizontal = vx !== 0;
  // In the same row (or column): one's middle within the other's span across the arrow. A sliver of shared span is
  // not enough: a box mostly above, a little to the right, is not what Right means.
  const overlaps = (/** @type {Box} */ b) => (horizontal
    ? Math.abs(b.y - from.y) < Math.max(b.h, from.h) / 2
    : Math.abs(b.x - from.x) < Math.max(b.w, from.w) / 2);
  const tie = (/** @type {Box} */ p, /** @type {Box} */ q) => (horizontal ? p.y - q.y : p.x - q.x);
  // Ahead by more than a pixel: a box straight below is not to the right for being a fraction across.
  const ahead = boxes.filter((b) => b.id !== at && (b.parent ?? null) === (from.parent ?? null) && alongOf(b) > 1);
  const near = ahead.filter(overlaps).sort((p, q) => alongOf(p) - alongOf(q) || tie(p, q));
  const far = ahead.sort((p, q) => dist(p, from) - dist(q, from) || tie(p, q));
  const next = near[0] ?? far[0];
  if (next) return { kind: next.kind, id: next.id };
  return from.parent ? { kind: 'subgraph', id: from.parent } : null;
}

/** The box whose middle is nearest the point (`x`, `y`), or null when there are none. */
export function nearest(/** @type {Box[]} */ boxes, /** @type {number} */ x, /** @type {number} */ y) {
  let best = null, bestD = Infinity;
  for (const b of boxes) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < bestD) { best = b.id; bestD = d; }
  }
  return best;
}

/**
 * A move made by an arrow key, kept so the opposite key can take it back: from `from` to `to` by `key`, with Ctrl or
 * not.
 * @typedef {{ from: Target, to: Target, key: string, ctrl: boolean }} Move
 */

/**
 * The move that `key` (with Ctrl or not) takes back from `at`: the last one, when it ended at `at` and `key` is its
 * opposite with the same modifier; else null, and the rules decide.
 * @param {Move[]} path
 * @param {Target} at
 * @param {string} key
 * @param {boolean} ctrl
 */
export function retrace(path, at, key, ctrl) {
  const last = path.at(-1);
  return last && last.to.kind === at.kind && last.to.id === at.id && key === OPPOSITE[last.key] && ctrl === last.ctrl
    ? last : null;
}
