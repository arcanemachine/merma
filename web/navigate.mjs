// Where an arrow key moves the selection, from the diagram as drawn: no DOM (the editor measures and passes it in).
// docs/ux.md gives the rules and why. Plain arrows walk edges: from a node or a subgraph's box, an arrow selects an
// edge on that side; from an edge, it goes on to an end. Ctrl+Arrows jump by place, to the next node or box on screen.

/** @typedef {{ x: number, y: number }} Point */
/**
 * A node or a subgraph's box, by its middle and size on screen. `parent` is the subgraph it is drawn in, or null.
 * @typedef {{ kind: 'node' | 'subgraph', id: string, x: number, y: number, w: number, h: number, parent?: string | null }} Box
 */
/**
 * A drawn edge: its ends' ids (a node's or a subgraph's), the points where it meets them, and its middle (its label,
 * else the middle of its line).
 * @typedef {{ id: string, from: string, to: string, start: Point, end: Point, mid: Point }} Edge
 */
/** @typedef {'top' | 'bottom' | 'left' | 'right'} Side */
/**
 * What an arrow onto an edge remembers: the edge, the box it was reached from, the arrow, and the side's edges in
 * order, which the cross arrows step through.
 * @typedef {{ edge: string, from: string, key: string, edges: string[] }} Trail
 */
/** @typedef {{ kind: 'node' | 'subgraph' | 'edge', id: string }} Target */

/** Each arrow's side, and its direction on screen. */
const SIDES = /** @type {Record<string, { side: Side, v: [number, number] }>} */ ({
  ArrowUp: { side: 'top', v: [0, -1] },
  ArrowDown: { side: 'bottom', v: [0, 1] },
  ArrowLeft: { side: 'left', v: [-1, 0] },
  ArrowRight: { side: 'right', v: [1, 0] },
});
const OPPOSITE = /** @type {Record<string, string>} */ ({
  ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp', ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft',
});

/**
 * The side of `box` that `point` (where an edge meets it) is on. Measured against the box's own half width and half
 * height, not as a plain angle: under a wide node, edges spread along its bottom meet it far from its middle and only a
 * little below, yet are on its bottom. Equal goes to top or bottom.
 */
export function sideOf(/** @type {Box} */ box, /** @type {Point} */ point) {
  const dx = (point.x - box.x) / (box.w / 2 || 1), dy = (point.y - box.y) / (box.h / 2 || 1);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/**
 * The edges on `side` of box `id`, in order: left to right along a top or bottom, top to bottom along a left or right.
 * An edge belongs to both its ends, whichever way it points. Self-loops are left out.
 */
export function edgesOn(/** @type {Box} */ box, /** @type {Side} */ side, /** @type {Edge[]} */ edges) {
  const along = side === 'top' || side === 'bottom' ? 'x' : 'y';
  /** @type {{ id: string, at: Point }[]} */
  const found = [];
  for (const e of edges) {
    if (e.from === e.to) continue;
    const at = e.from === box.id ? e.start : e.to === box.id ? e.end : null;
    if (at && sideOf(box, at) === side) found.push({ id: e.id, at });
  }
  return found.sort((a, b) => a.at[along] - b.at[along]).map((f) => f.id);
}

/**
 * Where a plain arrow `key` goes from `at`, or null for nowhere. From a node or a box, the first edge on that side.
 * From an edge reached by arrow K (`trail`), K goes on to its far end and the opposite arrow back; the cross arrows step
 * through the side's edges, wrapping within the side. From an edge reached any other way, an arrow goes to the end that
 * lies that way from the edge's middle (both do: the nearer), and the cross arrows do nothing.
 * @param {{ boxes: Box[], edges: Edge[] }} graph
 * @param {Target} at
 * @param {string} key
 * @param {Trail | null} trail from the last arrow, if it selected `at`
 * @returns {{ target: Target, trail: Trail | null } | null}
 */
export function walk({ boxes, edges }, at, key, trail) {
  const arrow = SIDES[key];
  if (!arrow) return null;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const end = (/** @type {string} */ id) => {
    const b = byId.get(id);
    return b ? { target: /** @type {Target} */ ({ kind: b.kind, id }), trail: null } : null;
  };
  if (at.kind !== 'edge') {
    const box = byId.get(at.id);
    const list = box ? edgesOn(box, arrow.side, edges) : [];
    return list.length ? { target: { kind: 'edge', id: list[0] }, trail: { edge: list[0], from: at.id, key, edges: list } } : null;
  }
  const edge = edges.find((e) => e.id === at.id);
  if (!edge) return null;
  if (trail?.edge === at.id) {
    const far = edge.from === trail.from ? edge.to : edge.from;
    if (key === trail.key) return end(far);
    if (key === OPPOSITE[trail.key]) return end(trail.from);
    const n = trail.edges.length, k = trail.edges.indexOf(at.id);
    // The cross arrows: towards the end of the side (right, or down) is next.
    const next = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
    const id = trail.edges[(k + next + n) % n];
    return { target: { kind: 'edge', id }, trail: { ...trail, edge: id } };
  }
  // By the ends' middles, not where the line meets them: simpler, and only an edge entering a large box from behind
  // its middle could tell them apart. Should one turn up, compare `edge.start` and `edge.end` instead.
  const [vx, vy] = arrow.v;
  const ahead = [edge.from, edge.to].map((id) => ({ id, b: byId.get(id) }))
    .filter((e) => e.b && (e.b.x - edge.mid.x) * vx + (e.b.y - edge.mid.y) * vy > 0)
    .sort((p, q) => dist(/** @type {Box} */ (p.b), edge.mid) - dist(/** @type {Box} */ (q.b), edge.mid));
  return ahead.length ? end(ahead[0].id) : null;
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
 * top), those ahead (their middle more than a pixel beyond its middle along the arrow); the ones overlapping it across
 * the arrow first, nearest along it; else the nearest; leftmost or topmost breaking ties. Nothing ahead inside a
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
  const overlaps = (/** @type {Box} */ b) => (horizontal
    ? Math.abs(b.y - from.y) < (b.h + from.h) / 2
    : Math.abs(b.x - from.x) < (b.w + from.w) / 2);
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
