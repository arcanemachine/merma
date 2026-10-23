import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byPlace, heading, leaving, nearest, nest, retrace, skip, walk } from '../web/navigate.mjs';

// A diagram as drawn (middles on screen), like the demo's:
//
//                order (wide)
//          ╱       │        ╲
//      check     wait      note        check ──▶ aside (leaves check's bottom, enters aside's left side)
//                  │
//                paid (a diamond: all four edges leave its corners and bottom heading down)
//          ╱     │      │      ╲
//      retry   ship    mail   receipt          ship is a subgraph box, with pack inside it
const node = (/** @type {string} */ id, /** @type {number} */ x, /** @type {number} */ y, w = 60, h = 30) =>
  ({ kind: /** @type {const} */ ('node'), id, x, y, w, h });
const sub = (/** @type {string} */ id, /** @type {number} */ x, /** @type {number} */ y, w = 200, h = 120) =>
  ({ kind: /** @type {const} */ ('subgraph'), id, x, y, w, h });
const boxes = nest([
  node('order', 200, 0, 120, 40), node('check', 100, 100), node('wait', 200, 100), node('note', 300, 100),
  node('aside', 300, 160), node('paid', 200, 200),
  node('retry', 50, 300), sub('ship', 180, 340), node('pack', 180, 340), node('mail', 320, 300), node('receipt', 420, 300),
]);
/** An edge between two points, heading `out` from the first and `back` from the second (20 px along, as measured). */
const P = (/** @type {number} */ x, /** @type {number} */ y) => ({ x, y });
const step = { D: [0, 20], U: [0, -20], L: [-20, 0], R: [20, 0] };
const edge = (/** @type {string} */ from, /** @type {string} */ to, /** @type {[number, number]} */ s, /** @type {'D'|'U'|'L'|'R'} */ out,
  /** @type {[number, number]} */ e, /** @type {'D'|'U'|'L'|'R'} */ back) => ({
  id: `${from}-${to}`, from, to,
  start: P(...s), startOut: P(s[0] + step[out][0], s[1] + step[out][1]),
  end: P(...e), endOut: P(e[0] + step[back][0], e[1] + step[back][1]),
  mid: P((s[0] + e[0]) / 2, (s[1] + e[1]) / 2),
});
const edges = [
  edge('order', 'wait', [200, 20], 'D', [200, 85], 'U'),
  edge('order', 'note', [250, 20], 'D', [300, 85], 'U'),
  edge('order', 'check', [150, 20], 'D', [100, 85], 'U'),
  edge('check', 'aside', [100, 115], 'D', [270, 160], 'L'),
  edge('wait', 'paid', [200, 115], 'D', [200, 180], 'U'),
  // Out of the diamond's left and right corners, heading down at once.
  edge('paid', 'retry', [170, 200], 'D', [50, 285], 'U'),
  edge('paid', 'receipt', [230, 200], 'D', [420, 285], 'U'),
  edge('paid', 'mail', [205, 220], 'D', [320, 285], 'U'),
  edge('paid', 'ship', [195, 220], 'D', [180, 280], 'U'),
];
const graph = { boxes, edges };
const at = (/** @type {'node' | 'subgraph' | 'edge'} */ kind, /** @type {string} */ id) => ({ kind, id });
/** Where each of `keys` goes, pressed one after another from `from`; null where one went nowhere. */
function run(/** @type {{ kind: any, id: string }} */ from, /** @type {string[]} */ keys) {
  let here = from;
  return keys.map((key) => {
    const next = walk(graph, here, key);
    if (next) here = next;
    return next ? `${next.kind} ${next.id}` : null;
  });
}

test('heading is the larger move, down or up when equal', () => {
  assert.equal(heading(P(0, 0), P(3, 20)), 'ArrowDown');
  assert.equal(heading(P(0, 0), P(-20, 3)), 'ArrowLeft');
  assert.equal(heading(P(0, 0), P(10, -10)), 'ArrowUp');
});

test('the edges leaving a node one way run left to right (top to bottom sideways), coming in or going out', () => {
  assert.deepEqual(leaving(edges, 'order', 'ArrowDown'), ['order-check', 'order-wait', 'order-note']);
  assert.deepEqual(leaving(edges, 'paid', 'ArrowDown'), ['paid-retry', 'paid-ship', 'paid-mail', 'paid-receipt']);
  // The edge from check comes into aside from the left: it leaves aside heading left.
  assert.deepEqual(leaving(edges, 'aside', 'ArrowLeft'), ['check-aside']);
  assert.deepEqual(leaving(edges, 'wait', 'ArrowUp'), ['order-wait']);
});

test("a diamond's corner edges count as down: Down, then Right steps through all four, and Up goes back", () => {
  assert.deepEqual(run(at('node', 'paid'), ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp']),
    ['edge paid-retry', 'edge paid-ship', 'edge paid-mail', 'edge paid-receipt', null, 'node paid']);
});

test('on an edge, the arrow along it goes to the end that way', () => {
  assert.deepEqual(run(at('node', 'paid'), ['ArrowDown', 'ArrowDown']), ['edge paid-retry', 'node retry']);
  assert.deepEqual(run(at('node', 'retry'), ['ArrowUp', 'ArrowUp']), ['edge paid-retry', 'node paid']);
});

test('across an edge: the edges beside it at its top end, not where it was reached from, without wrapping', () => {
  // Up from wait reaches order-wait; Right and Left step through order's downward edges.
  assert.deepEqual(run(at('node', 'wait'), ['ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowUp']),
    ['edge order-wait', 'edge order-note', null, 'edge order-wait', 'node order']);
  assert.deepEqual(run(at('node', 'wait'), ['ArrowUp', 'ArrowLeft', 'ArrowLeft']), ['edge order-wait', 'edge order-check', null]);
});

test('an edge alone at its top end steps among those at its other end', () => {
  // wait-paid is wait's only downward edge; at paid it is the only upward one too: nowhere to step.
  assert.deepEqual(run(at('edge', 'wait-paid'), ['ArrowRight']), [null]);
});

test('an edge that turns: the arrows go to the end that lies that way', () => {
  // check-aside leaves check heading down and comes into aside from the left.
  assert.deepEqual(run(at('edge', 'check-aside'), ['ArrowUp']), ['node check']);
  assert.deepEqual(run(at('edge', 'check-aside'), ['ArrowRight']), ['node aside']);
});

test('an edge to a subgraph lands on its box; a node with no edge that way climbs to its subgraph', () => {
  assert.deepEqual(run(at('edge', 'paid-ship'), ['ArrowDown']), ['subgraph ship']);
  assert.deepEqual(run(at('node', 'pack'), ['ArrowUp', 'ArrowUp', 'ArrowUp']), ['subgraph ship', 'edge paid-ship', 'node paid']);
  // At the top level, with nothing that way: nowhere.
  assert.deepEqual(run(at('node', 'order'), ['ArrowUp']), [null]);
});

test('Ctrl skips the edge to its far end, or finds nothing for the caller to jump by place', () => {
  assert.deepEqual(skip(graph, at('node', 'wait'), 'ArrowDown'), at('node', 'paid'));
  assert.deepEqual(skip(graph, at('node', 'paid'), 'ArrowDown'), at('node', 'retry'));
  assert.deepEqual(skip(graph, at('edge', 'paid-ship'), 'ArrowDown'), at('subgraph', 'ship'));
  assert.equal(skip(graph, at('node', 'order'), 'ArrowUp'), null);
  assert.equal(skip(graph, at('edge', 'order-wait'), 'ArrowRight'), null);
});

test('nest finds the subgraph each box is drawn in', () => {
  const parents = Object.fromEntries(boxes.map((b) => [b.id, b.parent]));
  assert.equal(parents.pack, 'ship');
  assert.equal(parents.order, null);
  assert.equal(parents.ship, null);
});

test('nest puts a subgraph in the one around it, never in a smaller one over its middle', () => {
  const parents = Object.fromEntries(nest([sub('outer', 0, 0, 300, 200), sub('inner', 0, 0, 100, 50), node('n', 0, 0)]).map((b) => [b.id, b.parent]));
  assert.deepEqual(parents, { outer: null, inner: 'outer', n: 'inner' });
});

test('by place: one in the row (its middle within the span) comes first, nearest along the arrow', () => {
  // x is nearer in a straight line, but only y lies under a.
  const three = nest([node('a', 100, 0), node('x', 170, 40), node('y', 100, 150)]);
  assert.deepEqual(byPlace(three, 'a', 'ArrowDown'), at('node', 'y'));
  // A box mostly above, a little ahead, is not in the row; one squarely beside it is.
  const row = nest([node('here', 0, 0, 60, 40), node('above', 20, -30, 100, 40), node('beside', 150, 10)]);
  assert.deepEqual(byPlace(row, 'here', 'ArrowRight'), at('node', 'beside'));
});

test('by place: nothing in the row, the nearest ahead; nothing ahead, nowhere (no wrap)', () => {
  const two = nest([node('a', 0, 0), node('b', 200, 100)]);
  assert.deepEqual(byPlace(two, 'a', 'ArrowDown'), at('node', 'b'));
  assert.equal(byPlace(two, 'b', 'ArrowDown'), null);
});

test('by place: a box straight below is not to the side for being a fraction across', () => {
  const column = nest([node('a', 100, 0), node('b', 100.4, 100)]);
  assert.equal(byPlace(column, 'a', 'ArrowRight'), null);
});

test('by place inside a subgraph: its own items, then its box; from outside, the box, not inside it', () => {
  const inside = nest([sub('s', 100, 100, 200, 100), node('a', 50, 100), node('b', 150, 100), node('c', 100, 300)]);
  assert.deepEqual(byPlace(inside, 'a', 'ArrowRight'), at('node', 'b'));
  assert.deepEqual(byPlace(inside, 'b', 'ArrowRight'), at('subgraph', 's'));
  assert.deepEqual(byPlace(inside, 'c', 'ArrowUp'), at('subgraph', 's'));
});

test('by place breaks a tie by leftmost (topmost going sideways)', () => {
  const overlapping = nest([node('a', 100, 0), node('l', 50, 100), node('r', 150, 100)]);
  assert.deepEqual(byPlace(overlapping, 'a', 'ArrowDown'), at('node', 'l'));
  const apart = nest([node('a', 100, 0), node('r', 200, 100), node('l', 0, 100)]);
  assert.deepEqual(byPlace(apart, 'a', 'ArrowDown'), at('node', 'l'));
});

test("by place from an edge goes from its middle's level, not its start's", () => {
  // The edge leaves `in` inside s and ends at `down` outside it; its middle is outside s.
  const placed = nest([sub('s', 100, 100, 200, 100), node('in', 100, 100), node('down', 100, 300), node('far', 300, 200),
    { kind: /** @type {const} */ ('node'), id: 'edge', x: 100, y: 200, w: 0, h: 0 }]);
  assert.equal(placed.find((b) => b.id === 'edge')?.parent, null);
  assert.deepEqual(byPlace(placed, 'edge', 'ArrowRight'), at('node', 'far'));
});

test('nearest finds the box whose middle is closest, and null with none', () => {
  assert.equal(nearest(boxes, 290, 110), 'note');
  assert.equal(nearest([], 0, 0), null);
});

test('a loop-back that leaves both ends the same way: an arrow goes to the end further that way', () => {
  // Both ends leave heading down, in a U under them; l sits higher than r.
  const u = { boxes: nest([node('l', 0, 0), node('r', 200, 20)]), edges: [edge('l', 'r', [0, 15], 'D', [200, 35], 'D')] };
  assert.deepEqual(walk(u, at('edge', 'l-r'), 'ArrowLeft'), at('node', 'l'));
  assert.deepEqual(walk(u, at('edge', 'l-r'), 'ArrowRight'), at('node', 'r'));
  assert.deepEqual(walk(u, at('edge', 'l-r'), 'ArrowUp'), at('node', 'l'));
});

test('retrace takes back the last move with its opposite key and the same modifier, and nothing else', () => {
  const move = { from: at('edge', 'paid-retry'), to: at('node', 'retry'), key: 'ArrowDown', ctrl: false };
  assert.equal(retrace([move], at('node', 'retry'), 'ArrowUp', false), move);
  assert.equal(retrace([move], at('node', 'retry'), 'ArrowUp', true), null);
  assert.equal(retrace([move], at('node', 'retry'), 'ArrowLeft', false), null);
  assert.equal(retrace([move], at('node', 'paid'), 'ArrowUp', false), null);
  assert.equal(retrace([], at('node', 'retry'), 'ArrowUp', false), null);
});

test('a lone edge: the cross arrows stop, even with an end a little that way', () => {
  // b sits a few pixels right of the edge's middle.
  const lone = { boxes: nest([node('a', 0, 0), node('b', 6, 100)]), edges: [edge('a', 'b', [0, 15], 'D', [6, 85], 'U')] };
  assert.equal(walk(lone, at('edge', 'a-b'), 'ArrowRight'), null);
  assert.equal(walk(lone, at('edge', 'a-b'), 'ArrowLeft'), null);
});
