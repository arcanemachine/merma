// What the keyboard does to the selection, and to Connect to…'s candidate: the arrows, O and I. navigate.mjs gives the
// rules from the diagram as drawn; this keeps the trail of arrow moves to retrace, and I's place inside each subgraph.
// The editor measures the diagram and selects; it tells this when a selection was not made by a key, to forget both.

import { byPlace, enter, heading, nearest, nest, retrace, skip, walk } from './navigate.mjs';

/** @typedef {import('./editor.mjs').Item} Item */
/** @typedef {{ boxes: import('./navigate.mjs').Box[], edges: import('./navigate.mjs').Edge[] }} Graph */

const TITLE = /** @type {Item} */ ({ kind: 'title', id: '' });
/** A selected edge as a box for moving by place: its middle, in the innermost subgraph around it. */
const EDGE = '\0edge';

/**
 * @param {object} deps
 * @param {() => Graph} deps.layout the diagram as drawn, measured on screen
 * @param {(item: Item) => void} deps.select select by key: said aloud and brought into view, the trail kept
 * @param {(item: Item) => void} deps.markCandidate move Connect to…'s candidate
 * @param {(message: string, kind: 'warning') => void} deps.notice
 * @param {() => Element | undefined} deps.titleEl the diagram's title as drawn
 * @param {{ selected(): Item | null, connecting(): boolean, candidate(): Item | null, edgesOk(): boolean }} deps.state
 */
export function createKeys({ layout, select, markCandidate, notice, titleEl, state }) {
  /** @type {import('./navigate.mjs').Move[]} the arrow moves since the selection last changed otherwise, to retrace */
  let trail = [];
  /** @type {import('./navigate.mjs').Move[]} the candidate's arrow moves, to retrace, as `trail` is the selection's */
  let candidateTrail = [];
  /**
   * subgraph → the item last selected inside it, for I; while connecting, where the candidate was. Kept only while
   * keys select: a click, a find or an edit forgets it (the user). Never pruned: I checks an entry against what is
   * drawn inside now.
   * @type {Map<string, string>}
   */
  const inside = new Map();
  const selection = () => /** @type {Item} */ (state.selected());

  /** An arrow key, with Ctrl or not, on the selection or, in Connect to…, the candidate. */
  function arrow(/** @type {string} */ key, /** @type {boolean} */ ctrl) {
    const graph = layout();
    if (state.connecting()) {
      // The candidate moves by the same rules as the selection, with a trail of its own; it may rest on an edge, which
      // Enter refuses, but never on the title.
      const moved = step(graph, state.candidate() ?? selection(), candidateTrail, key, ctrl);
      if (moved.next && moved.next.kind !== 'title') { candidateTrail = moved.trail; markCandidate(moved.next); }
      return;
    }
    const moved = step(graph, selection(), trail, key, ctrl);
    if (moved.next) {
      select(moved.next);
      trail = moved.trail;
    }
  }

  /**
   * Where arrow `key` (with Ctrl or not) takes a cursor, the selection or Connect to…'s candidate, from `here` with the
   * arrow moves `trail` behind it (navigate.mjs gives the rules): the item it reaches, or null, and the trail after the
   * move. Leaving a subgraph for its own box sets where I goes back to there.
   * @param {Graph} graph
   * @param {Item} here
   * @param {import('./navigate.mjs').Move[]} trail
   * @param {string} key
   * @param {boolean} ctrl
   * @returns {{ next: Item | null, trail: import('./navigate.mjs').Move[] }}
   */
  function step(graph, here, trail, key, ctrl) {
    if (here.kind === 'title') {
      // Down from the title goes to the nearest node or box below it.
      const t = titleEl()?.getBoundingClientRect();
      const below = graph.boxes.filter((b) => !b.parent && t && b.y > t.bottom);
      const id = t && key === 'ArrowDown' && nearest(below, t.left + t.width / 2, t.bottom);
      const hit = id && below.find((b) => b.id === id);
      return { next: hit ? { kind: hit.kind, id: hit.id } : null, trail: [] };
    }
    const at = /** @type {import('./navigate.mjs').Target} */ (here);
    // The opposite key takes the last move back, retracing the way it came.
    const back = retrace(trail, at, key, ctrl);
    if (back) {
      // Back onto an edge from a node: it now counts as reached from that node by this arrow, so Left and Right step
      // that node's edges rather than take back the steps before it (the user).
      const rest = back.from.kind === 'edge' && at.kind !== 'edge'
        ? [{ from: at, to: back.from, key, ctrl, came: { id: at.id, key } }]
        : trail.slice(0, -1);
      return { next: back.from, trail: rest };
    }
    /** The next thing that way by place, from `here` (an edge from its middle); none upwards, and nothing at all drawn above: the title. */
    const placed = () => {
      let boxes = graph.boxes, from = at.id;
      if (at.kind === 'edge') {
        const e = graph.edges.find((x) => x.id === at.id);
        if (!e) return null;
        boxes = [...boxes, { kind: /** @type {const} */ ('node'), id: EDGE, x: e.mid.x, y: e.mid.y, w: 0, h: 0 }];
        from = EDGE;
      }
      boxes = nest(boxes);
      const found = byPlace(boxes, from, key);
      if (found || key !== 'ArrowUp' || !titleEl()) return found;
      const self = boxes.find((b) => b.id === from);
      const above = self && boxes.some((b) => b !== self && b.kind === 'node' && b.y < self.y - self.h / 2);
      return self && !above ? TITLE : null;
    };
    /** @type {Item | null} */
    let next = null;
    /** @type {{ id: string, key: string } | null} for a move onto an edge: the node it was reached from */
    let came = null;
    if (ctrl) {
      // Ctrl skips the edge plain would select; with none that way, it goes by place.
      next = (state.edgesOk() ? skip(graph, at, key) : null) ?? placed();
    } else if (at.kind === 'edge') {
      // Across an edge, among the edges of the node it was reached from, which the trail keeps while stepping across.
      const last = trail.at(-1);
      came = last && last.to.kind === 'edge' && last.to.id === at.id ? last.came ?? null : null;
      // An edge reached any other way (a click, a find): its source, the way it leaves it.
      const e = graph.edges.find((x) => x.id === at.id);
      if (!came && e) came = { id: e.from, key: heading(e.start, e.startOut) };
      const moved = walk(graph, at, key, came);
      next = moved?.to ?? null;
      // Stepped across to another edge: it counts as reached from the end whose edges it was found among.
      came = moved?.fan ?? null;
    } else {
      if (!state.edgesOk()) {
        notice("The drawn edges don't match the file's text (no edge match), so edges can't be selected.", 'warning');
        return { next: null, trail };
      }
      // On into a box the same arrow brought you to, else an edge leaving that way, else the next thing that way.
      next = enter(trail, graph, at, key) ?? walk(graph, at, key)?.to ?? null;
      if (next?.kind === 'edge') came = { id: at.id, key };
      next ??= placed();
    }
    if (!next) return { next: null, trail };
    // Leaving a subgraph for its own box: I comes back here.
    if (next.kind === 'subgraph' && at.kind !== 'edge' && graph.boxes.find((b) => b.id === at.id)?.parent === next.id) {
      inside.set(next.id, at.id);
    }
    if (next.kind === 'title') return { next, trail: [] };
    return { next, trail: [...trail, { from: at, to: /** @type {import('./navigate.mjs').Target} */ (next), key, ctrl, came }] };
  }

  /** O: the subgraph the selection (or, in Connect to…, the candidate) is drawn in; at the top, nothing. */
  function out() {
    const connecting = state.connecting();
    const from = connecting ? state.candidate() ?? selection() : state.selected();
    if (!from || from.kind === 'title') return false;
    const { boxes, edges: lines } = layout();
    let parent = boxes.find((b) => b.id === from.id && b.kind === from.kind)?.parent;
    if (from.kind === 'edge') {
      const e = lines.find((x) => x.id === from.id);
      parent = e ? nest([...boxes, { kind: 'node', id: EDGE, x: e.mid.x, y: e.mid.y, w: 0, h: 0 }]).find((b) => b.id === EDGE)?.parent : null;
    }
    if (!parent) return true;
    const sub = /** @type {Item} */ ({ kind: 'subgraph', id: parent });
    if (from.kind !== 'edge') inside.set(parent, from.id);
    if (connecting) { markCandidate(sub); candidateTrail = []; } else byKey(sub);
    return true;
  }
  /** I: into the selected subgraph (or candidate), to the item last selected there, else its top-left one. */
  function into() {
    const connecting = state.connecting();
    const from = connecting ? state.candidate() : state.selected();
    if (from?.kind !== 'subgraph') return Boolean(from);
    const { boxes } = layout();
    const children = boxes.filter((b) => b.parent === from.id);
    const last = children.find((b) => b.id === inside.get(from.id));
    const first = last ?? children.sort((p, q) => p.y - q.y || p.x - q.x)[0];
    if (!first) return true;
    const item = /** @type {Item} */ ({ kind: first.kind, id: first.id });
    if (connecting) { markCandidate(item); candidateTrail = []; } else byKey(item);
    return true;
  }
  /** O and I select by key, keeping I's place inside, but start the trail afresh: they are not arrow moves. */
  function byKey(/** @type {Item} */ item) {
    select(item);
    trail = [];
  }

  return {
    arrow,
    out,
    into,
    /** A selection not made by a key (a click, a find, an edit): the trail starts again, and I forgets where you were. */
    forget() { trail = []; inside.clear(); },
    /** Connect to… starts: its candidate has no moves yet. */
    forgetCandidate() { candidateTrail = []; },
    /** Where the keyboard goes back to after `sel` is deleted: the items the trail came from, latest first. */
    fallback: (/** @type {Item} */ sel) => /** @type {Item[]} */ (trail.map((m) => m.from).reverse()
      .filter((i) => !(i.kind === sel.kind && i.id === sel.id))),
  };
}
