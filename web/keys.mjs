// What the keyboard does to the selection, and to Connect to…'s candidate: the arrows, O, I and Space. navigate.mjs gives the
// rules from the diagram as drawn; this keeps each cursor's trail of arrow moves to retrace, and I's place inside each
// subgraph.
// The editor measures the diagram and selects; it tells this when a selection was not made by a key, to forget both.

import { FRESH, back, byPlace, enter, heading, moved, nearest, nest, otherEnd, skip, stepBack, walk } from './navigate.mjs';

/** @typedef {import('./editor.mjs').Item} Item */
/** @typedef {{ boxes: import('./navigate.mjs').Box[], edges: import('./navigate.mjs').Edge[] }} Graph */
/** @typedef {import('./navigate.mjs').Cursor} Cursor */

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
  /** @type {Cursor} where the selection came from by arrow, since it last changed otherwise */
  let cursor = FRESH;
  /** @type {Cursor} the same for Connect to…'s candidate */
  let candidateCursor = FRESH;
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
      const went = step(graph, state.candidate() ?? selection(), candidateCursor, key, ctrl);
      if (went.next && went.next.kind !== 'title') { candidateCursor = went.cursor; markCandidate(went.next); }
      return;
    }
    const went = step(graph, selection(), cursor, key, ctrl);
    if (went.next) {
      // The cursor first: the selection's mark shows the end it counts from.
      cursor = went.cursor;
      select(went.next);
    }
  }

  /**
   * Where arrow `key` (with Ctrl or not) takes a cursor, the selection or Connect to…'s candidate, from `here`
   * (navigate.mjs gives the rules): the item it reaches, or null, and the cursor after the move. Leaving a subgraph for
   * its own box sets where I goes back to there.
   * @param {Graph} graph
   * @param {Item} here
   * @param {Cursor} cursor
   * @param {string} key
   * @param {boolean} ctrl
   * @returns {{ next: Item | null, cursor: Cursor }}
   */
  function step(graph, here, cursor, key, ctrl) {
    if (here.kind === 'title') {
      // Down from the title goes to the nearest node or box below it.
      const t = titleEl()?.getBoundingClientRect();
      const below = graph.boxes.filter((b) => !b.parent && t && b.y > t.bottom);
      const id = t && key === 'ArrowDown' && nearest(below, t.left + t.width / 2, t.bottom);
      const hit = id && below.find((b) => b.id === id);
      return { next: hit ? { kind: hit.kind, id: hit.id } : null, cursor: FRESH };
    }
    const at = /** @type {import('./navigate.mjs').Target} */ (here);
    // The opposite key takes back the latest move into here, before any rule: a box's crossing edge can head one way
    // where it leaves the node inside and another where it crosses the border, so walk() is no guide to which arrow
    // goes back along it.
    const retraced = (ctrl ? null : stepBack(cursor, at, key)) ?? back(cursor, at, key, ctrl);
    if (retraced) return { next: retraced.to, cursor: retraced.cursor };
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
    /** @type {import('./navigate.mjs').Fan | null} after a step across: the fan the edge reached counts as reached from */
    let fan = null;
    if (ctrl) {
      // Ctrl skips the edge plain would select; with none that way, it goes by place.
      next = (state.edgesOk() ? skip(graph, at, key) : null) ?? placed();
    } else if (at.kind === 'edge') {
      // Across an edge, among the edges of the fan it was reached from; reached any other way (a click, a find), its
      // source's, the way it leaves it.
      const e = graph.edges.find((x) => x.id === at.id);
      const came = cursor.came ?? (e ? { id: e.from, key: heading(e.start, e.startOut) } : null);
      const went = walk(graph, at, key, came);
      next = went?.to ?? null;
      fan = went?.fan ?? null;
    } else {
      if (!state.edgesOk()) {
        notice("The drawn edges don't match the file's text (no edge match), so edges can't be selected.", 'warning');
        return { next: null, cursor };
      }
      // On into a box the same arrow brought you to, else an edge leaving that way, else the next thing that way.
      next = enter(cursor.trail, graph, at, key) ?? walk(graph, at, key)?.to ?? placed();
    }
    if (!next) return { next: null, cursor };
    // Leaving a subgraph for its own box: I comes back here.
    if (next.kind === 'subgraph' && at.kind !== 'edge' && graph.boxes.find((b) => b.id === at.id)?.parent === next.id) {
      inside.set(next.id, at.id);
    }
    if (next.kind === 'title') return { next, cursor: FRESH };
    const to = /** @type {import('./navigate.mjs').Target} */ (next);
    return { next, cursor: moved(cursor, { from: at, to, key, ctrl }, fan) };
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
    if (connecting) { markCandidate(sub); candidateCursor = FRESH; } else byKey(sub);
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
    if (connecting) { markCandidate(item); candidateCursor = FRESH; } else byKey(item);
    return true;
  }
  /** O and I select by key, keeping I's place inside, but start the trail afresh: they are not arrow moves. */
  function byKey(/** @type {Item} */ item) {
    cursor = FRESH;
    select(item);
  }

  /**
   * Space: a selected edge counts as reached from its other end, so the cross arrows step that end's edges (the user).
   * Not a move: the arrival into the edge leaves the trail, as after a step across, and the steps across are cleared,
   * since what they counted from no longer holds. Returns the end it now counts
   * from, or null when there is no edge selected or no other end.
   */
  function other() {
    const sel = state.selected();
    if (state.connecting() || sel?.kind !== 'edge') return null;
    const to = otherEnd(layout(), sel.id, cursor.came);
    if (!to) return null;
    cursor = { trail: cursor.trail.filter((m) => !(m.to.kind === 'edge' && m.to.id === sel.id)), came: to };
    return to;
  }

  return {
    arrow,
    out,
    into,
    other,
    /** Where the selection's keys are (its trail, an edge's counted end), to put back with restore(). */
    cursor: () => cursor,
    restore(/** @type {Cursor} */ saved) { cursor = saved; },
    /** On a selected edge, the end it counts as reached from (null: its source). */
    came: () => cursor.came,
    /** A selected edge counts as reached from `fan` (null: its source): a click on its line on that end's side. */
    countFrom(/** @type {import('./navigate.mjs').Fan | null} */ fan) { cursor = { trail: cursor.trail, came: fan }; },
    /** A selection not made by a key (a click, a find, an edit): the trail starts again, and I forgets where you were. */
    forget() { cursor = FRESH; inside.clear(); },
    /** Connect to… starts: its candidate has no moves yet. */
    forgetCandidate() { candidateCursor = FRESH; },
    /** Where the keyboard goes back to after `sel` is deleted: the items the trail came from, latest first. */
    fallback: (/** @type {Item} */ sel) => /** @type {Item[]} */ (cursor.trail.map((m) => m.from).reverse()
      .filter((i) => !(i.kind === sel.kind && i.id === sel.id))),
  };
}
