// Where an arrow key moves the selection, from the diagram as drawn: no DOM (the editor measures and passes it in).
// docs/ux.md gives the rules and why. The arrows are screen directions. Plain arrows walk edges: from a node or a
// subgraph's box, an arrow selects an edge leaving it that way; on an edge, the arrow along it goes to that end and the
// other two step to the edges beside it. Ctrl+Arrows skip the edge, or jump by place when there is none that way.

/** @typedef {{ x: number, y: number }} Point */
/**
 * A node or a subgraph's box, by its middle and size on screen (GLOSSARY's box: either one). `parent` is the subgraph it
 * is drawn in, or null.
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

/** Every node and subgraph drawn inside subgraph `id`, at any depth. */
export function within(/** @type {Box[]} */ boxes, /** @type {string} */ id) {
  const parent = new Map(boxes.map((b) => [b.id, b.parent ?? null]));
  const inside = new Set();
  for (const b of boxes) {
    for (let p = parent.get(b.id); p; p = parent.get(p) ?? null) if (p === id) { inside.add(b.id); break; }
  }
  return inside;
}

/**
 * The edges leaving `id` heading `key` (for a subgraph, with `inside` from within(): also those crossing its border
 * from inside), in order across that way by where they meet it (two out of a diamond's
 * corners are told apart there): left to right for up and down, top to bottom for left and right. An edge belongs to
 * both its ends, whichever way it points; so does a self-loop, once when both its ends head the same way.
 */
export function leaving(/** @type {Edge[]} */ edges, /** @type {string} */ id, /** @type {string} */ key, inside = new Set()) {
  const across = vertical(key) ? 'x' : 'y';
  /** @type {{ id: string, at: Point }[]} */
  const found = [];
  for (const e of edges) {
    const [a, b] = endsOf(e);
    if (e.from === e.to) {
      const end = [a, b].find((x) => x.id === id && x.dir === key);
      if (end) found.push({ id: e.id, at: end.at });
      continue;
    }
    for (const [end, other] of [[a, b], [b, a]]) {
      // A subgraph's own edges, and those crossing its border from a node inside it, which head as they leave that node
      // (not as they cross the border: should a line that leaves sideways and bends out through the bottom surprise,
      // measure the heading where it leaves the subgraph's rect instead).
      const crossing = inside.has(end.id) && !inside.has(other.id) && other.id !== id;
      if ((end.id === id || crossing) && end.dir === key) found.push({ id: e.id, at: end.at });
    }
  }
  return found.sort((a, b) => a.at[across] - b.at[across]).map((f) => f.id);
}

/**
 * Where a plain arrow `key` goes from `at`, or null for nowhere. From a node or a box: the first edge leaving it that
 * way; none: null, and the caller goes by place. From an edge: the arrow along it goes to the end you arrive at
 * travelling that way (the one end it leaves heading the other way); the other two step across the edges beside it
 * (across()), never to a node. Only on a bend that leaves both ends heading the same way does an arrow go to the end
 * lying further that way from the edge's middle.
 * @param {{ boxes: Box[], edges: Edge[] }} graph
 * @param {Target} at
 * @param {string} key
 * @param {{ id: string, key: string } | null} [from] how the edge was reached: from node or box `id` by arrow `key`
 * @returns {Target | null}
 */
export function walk({ boxes, edges }, at, key, from = null) {
  if (!SIDES[key]) return null;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const box = (/** @type {string} */ id) => {
    const b = byId.get(id);
    return b ? /** @type {Target} */ ({ kind: b.kind, id }) : null;
  };
  if (at.kind !== 'edge') {
    const first = leaving(edges, at.id, key, at.kind === 'subgraph' ? within(boxes, at.id) : undefined)[0];
    return first ? { kind: 'edge', id: first } : null;
  }
  const edge = edges.find((e) => e.id === at.id);
  if (!edge) return null;
  // A self-loop: along it, back to its node; across it, its node's other edges at the end it was reached by (else
  // where it starts), or nothing, as on any edge.
  if (edge.from === edge.to) {
    const axis = from?.id === edge.from ? from.key : endsOf(edge)[0].dir;
    if (vertical(axis) === vertical(key)) return box(edge.from);
    return across({ boxes, edges }, edge.id, key, from)?.to ?? null;
  }
  const ends = endsOf(edge);
  // Along the edge: the end it leaves heading back towards us.
  const along = ends.filter((end) => end.dir === OPPOSITE[key]);
  if (along.length === 1) return box(along[0].id);
  if (!along.length) {
    const step = across({ boxes, edges }, edge.id, key, from);
    if (step) return step.to;
    // Nothing beside it that way: a cross arrow stops (only a U, both ends one way, falls to where the ends lie).
    if (ends.some((end) => vertical(end.dir) !== vertical(key))) return null;
  }
  // The end further that way from the middle, if it lies that way at all.
  const [vx, vy] = SIDES[key].v;
  const beyond = (/** @type {Box} */ b) => (b.x - edge.mid.x) * vx + (b.y - edge.mid.y) * vy;
  const ahead = ends.map((end) => byId.get(end.id)).filter((b) => b && beyond(b) > 0)
    .sort((p, q) => beyond(/** @type {Box} */ (q)) - beyond(/** @type {Box} */ (p)));
  return ahead[0] ? box(ahead[0].id) : null;
}

/**
 * Stepping across edge `id` with arrow `key`: the edge beside it that way, without wrapping, among the edges at the end it
 * was reached from that leave heading as it does there (`from`; reached any other way, its source, the node the file
 * writes first, which every edge has); past the last of them, on among those at its other end, from its place there.
 * Edges heading along `key`'s axis are not stepped across by it. Returns the edge and the end whose edges it was found among
 * (where it now counts as reached from), or null.
 * @param {{ boxes: Box[], edges: Edge[] }} graph
 * @param {string} id
 * @param {string} key
 * @param {{ id: string, key: string } | null} [from]
 * @returns {{ to: Target, from: { id: string, key: string } } | null}
 */
export function across({ boxes, edges }, id, key, from = null) {
  const edge = edges.find((e) => e.id === id);
  if (!edge || !SIDES[key]) return null;
  const ends = endsOf(edge);
  // Reached from a subgraph's box by an edge crossing its border: the box, whose other end is the one outside it.
  const box = from && boxes.find((b) => b.id === from.id && b.kind === 'subgraph');
  const outside = box ? within(boxes, box.id) : null;
  const start = from && (box || ends.some((end) => end.id === from.id)) ? from : { id: ends[0].id, key: ends[0].dir };
  const other = ends.find((end) => (outside ? !outside.has(end.id) && end.id !== start.id : end.id !== start.id));
  const forward = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
  for (const fan of other ? [start, { id: other.id, key: other.dir }] : [start]) {
    if (vertical(fan.key) === vertical(key)) continue;
    const kind = boxes.find((b) => b.id === fan.id)?.kind;
    const list = leaving(edges, fan.id, fan.key, kind === 'subgraph' ? within(boxes, fan.id) : undefined);
    const k = list.indexOf(id);
    if (k >= 0 && k + forward >= 0 && k + forward < list.length) return { to: { kind: 'edge', id: list[k + forward] }, from: fan };
  }
  return null;
}

/**
 * Where Ctrl+Arrow `key` goes from `at`: past the edge plain `key` would select, to its far end; from an edge, to the
 * end that way. An end inside subgraphs that the place you leave is not in (from an edge, the end you leave) lands on
 * the outermost of their boxes, as a box is nearer than anything inside it: Ctrl goes in a level a press. With no edge
 * that way, null: the caller jumps by place instead.
 * @param {{ boxes: Box[], edges: Edge[] }} graph boxes from nest()
 * @param {Target} at
 * @param {string} key
 * @returns {Target | null}
 */
export function skip(graph, at, key) {
  let far = null, from = at.id;
  if (at.kind === 'edge') {
    const end = walk(graph, at, key);
    if (!end || end.kind === 'edge') return null;
    const edge = graph.edges.find((e) => e.id === at.id);
    far = end.id;
    from = edge?.from === far ? edge.to : edge?.from ?? far;
  } else {
    const inside = at.kind === 'subgraph' ? within(graph.boxes, at.id) : new Set();
    // A self-loop has no far end to skip to.
    const first = leaving(graph.edges, at.id, key, inside).find((id) => graph.edges.some((e) => e.id === id && e.from !== e.to));
    const edge = graph.edges.find((e) => e.id === first);
    if (!edge) return null;
    far = edge.from === at.id || inside.has(edge.from) ? edge.to : edge.from;
  }
  const parent = new Map(graph.boxes.map((b) => [b.id, b.parent ?? null]));
  const around = (/** @type {string} */ id) => {
    const out = [];
    for (let p = parent.get(id); p; p = parent.get(p) ?? null) out.push(p);
    return out;
  };
  const mine = new Set([from, ...around(from)]);
  const land = around(far).filter((p) => !mine.has(p)).at(-1) ?? far;
  const b = graph.boxes.find((x) => x.id === land);
  return b ? { kind: b.kind, id: land } : null;
}

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
 * The next thing that way from box `at`, by place, for an arrow with no edge that way and for Ctrl's jump: the nearest
 * node or subgraph box lying wholly that way (going right, its left edge past `at`'s right edge), at any depth,
 * measured box to box, straight ahead only (overlapping `at` across the arrow: straight below, going down; nothing
 * off to the side, the user); the topmost wins a tie going sideways, the leftmost going up or down. The subgraphs `at`
 * is drawn in count by their border on that side, which is always straight ahead, so with nothing nearer inside it,
 * the arrow reaches its subgraph's box.
 * Nothing that way: null; nothing wraps. To go from something with no box (an edge), pass a box of no size at its
 * middle through nest().
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
  const horizontal = vx !== 0;
  // A box's near and far edges along the arrow, and its span across it.
  const ahead = (/** @type {Box} */ b) => (horizontal ? vx * b.x - b.w / 2 : vy * b.y - b.h / 2);
  const behind = (/** @type {Box} */ b) => (horizontal ? vx * b.x + b.w / 2 : vy * b.y + b.h / 2);
  const across = (/** @type {Box} */ b) => (horizontal ? [b.y - b.h / 2, b.y + b.h / 2] : [b.x - b.w / 2, b.x + b.w / 2]);
  const parents = new Map(boxes.map((b) => [b.id, b.parent ?? null]));
  const ancestors = new Set();
  for (let p = from.parent ?? null; p; p = parents.get(p) ?? null) ancestors.add(p);
  const [lo, hi] = across(from);
  /** @type {{ b: Box, d: number, straight: boolean }[]} */
  const found = [];
  for (const b of boxes) {
    // What is inside `at` never lies wholly beyond it, so needs no test of its own.
    if (b === from) continue;
    if (ancestors.has(b.id)) {
      // A subgraph around it, by its border on that side.
      const gap = behind(b) - behind(from);
      if (gap > 1) found.push({ b, d: gap, straight: true });
      continue;
    }
    const along = ahead(b) - behind(from);
    if (along < -1) continue;
    const [blo, bhi] = across(b);
    const aside = Math.max(0, blo - hi, lo - bhi);
    found.push({ b, d: Math.hypot(Math.max(0, along), aside), straight: aside <= 1 });
  }
  const first = (/** @type {Box} */ b) => (horizontal ? b.y - b.h / 2 : b.x - b.w / 2);
  found.sort((p, q) => p.d - q.d || first(p.b) - first(q.b));
  const next = found.find((f) => f.straight)?.b;
  return next ? { kind: next.kind, id: next.id } : null;
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
 * Which half of subgraph box `at` you are at: where the item you came from lies against the box's middle (an edge
 * where it meets the box, else at its middle), "top" on a tie; with no move that ended here (a click, a find, O, an
 * edit), the top; from the box's own self-loop, by the arrow: Up the bottom, else the top.
 * @param {Move[]} trail
 * @param {{ boxes: Box[], edges: Edge[] }} graph
 * @param {Target} at
 * @returns {'top' | 'bottom'}
 */
export function half(trail, { boxes, edges }, at) {
  const last = trail.at(-1);
  const box = boxes.find((b) => b.id === at.id);
  if (!box || !last || last.to.kind !== at.kind || last.to.id !== at.id) return 'top';
  let y = null;
  if (last.from.kind === 'edge') {
    const e = edges.find((x) => x.id === last.from.id);
    // From the box's own self-loop, which frames it and has no position to read: by the arrow, as if gone round the
    // loop that way (the user): Up comes in at the bottom, else at the top.
    if (e && e.from === e.to && e.from === at.id) return last.key === 'ArrowUp' ? 'bottom' : 'top';
    if (e) {
      y = e.to === at.id ? e.end.y : e.from === at.id ? e.start.y : e.mid.y;
    }
  } else {
    y = boxes.find((b) => b.id === last.from.id)?.y ?? null;
  }
  return y !== null && y > box.y ? 'bottom' : 'top';
}

/**
 * Where plain arrow `key` goes from subgraph box `at` into it: at its top (half()), Down goes in at the top row's
 * leftmost item inside; at its bottom, Up goes in at the bottom row's rightmost, like reading a page backwards. Null for any
 * other key or half (the box walks its edges), and for an empty box. A row is the items inside overlapping the one
 * nearest the side entered (only overlap with that one counts).
 * @param {Move[]} trail
 * @param {{ boxes: Box[], edges: Edge[] }} graph boxes from nest()
 * @param {Target} at
 * @param {string} key
 * @returns {Target | null}
 */
export function enter(trail, graph, at, key) {
  if (at.kind !== 'subgraph') return null;
  const where = half(trail, graph, at);
  const down = key === 'ArrowDown';
  if (!(down && where === 'top') && !(key === 'ArrowUp' && where === 'bottom')) return null;
  const children = graph.boxes.filter((b) => b.parent === at.id);
  // An item's edge facing the side entered, measured going in; its span up and down.
  const depth = (/** @type {Box} */ b) => (down ? b.y - b.h / 2 : -(b.y + b.h / 2));
  const nearest = children.sort((p, q) => depth(p) - depth(q))[0];
  if (!nearest) return null;
  const [lo, hi] = [nearest.y - nearest.h / 2, nearest.y + nearest.h / 2];
  const row = children.filter((b) => b.y - b.h / 2 <= hi + 1 && b.y + b.h / 2 >= lo - 1);
  // From the top, the least left edge; from the bottom, the greatest right edge.
  const first = row.sort((p, q) => (down ? (p.x - p.w / 2) - (q.x - q.w / 2) : (q.x + q.w / 2) - (p.x + p.w / 2)))[0];
  return { kind: first.kind, id: first.id };
}

/**
 * A move made by an arrow key, kept so the opposite key can take it back: from `from` to `to` by `key`, with Ctrl or
 * not.
 * `came`, for a move onto an edge: the node it was reached from and by which arrow, kept while stepping across.
 * @typedef {{ from: Target, to: Target, key: string, ctrl: boolean, came?: { id: string, key: string } | null }} Move
 */

/**
 * The move that `key` (with Ctrl or not) takes back from `at`: the last one, when it ended at `at` and `key` is its
 * opposite with the same modifier; else null, and the rules decide.
 * @param {Move[]} trail
 * @param {Target} at
 * @param {string} key
 * @param {boolean} ctrl
 */
export function retrace(trail, at, key, ctrl) {
  const last = trail.at(-1);
  return last && last.to.kind === at.kind && last.to.id === at.id && key === OPPOSITE[last.key] && ctrl === last.ctrl
    ? last : null;
}
