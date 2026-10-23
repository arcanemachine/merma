import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byPlace, edgesOn, nearest, nest, sideOf, walk } from '../web/navigate.mjs';

// A diagram as drawn (middles on screen):
//
//              start (wide, 120 × 40)  ──────────────▶ side
//            ╱      │       ╲
//        check    charge    log
//                   │
//         ┌──── pay (subgraph) ────┐
//         │   card ──▶ bank        │
//         └────────────────────────┘
const node = (/** @type {string} */ id, /** @type {number} */ x, /** @type {number} */ y, w = 60, h = 30) =>
  ({ kind: /** @type {const} */ ('node'), id, x, y, w, h });
const boxes = nest([
  node('start', 200, 0, 120, 40), node('side', 400, 0),
  node('check', 100, 100), node('charge', 200, 100), node('log', 300, 100),
  { kind: /** @type {const} */ ('subgraph'), id: 'pay', x: 200, y: 250, w: 300, h: 100 },
  node('card', 150, 260), node('bank', 250, 260),
]);
// Where each edge meets its ends: the outer edges under `start` meet it 50 px out and only 20 px down.
const edge = (/** @type {string} */ from, /** @type {string} */ to, /** @type {[number, number]} */ s, /** @type {[number, number]} */ e) =>
  ({ id: `${from}-${to}`, from, to, start: { x: s[0], y: s[1] }, end: { x: e[0], y: e[1] }, mid: { x: (s[0] + e[0]) / 2, y: (s[1] + e[1]) / 2 } });
const edges = [
  edge('start', 'charge', [200, 20], [200, 85]),
  edge('start', 'log', [250, 20], [300, 85]),
  edge('start', 'check', [150, 20], [100, 85]),
  edge('start', 'side', [260, 0], [370, 0]),
  edge('charge', 'pay', [200, 115], [200, 200]),
  edge('card', 'bank', [180, 260], [220, 260]),
];
const graph = { boxes, edges };
const at = (/** @type {'node' | 'subgraph' | 'edge'} */ kind, /** @type {string} */ id) => ({ kind, id });

/** Run `keys` with walk() from `from`, carrying the trail; the targets reached, null where a key went nowhere. */
function run(/** @type {{ kind: any, id: string }} */ from, /** @type {string[]} */ keys) {
  let trail = null, here = from;
  const seen = [];
  for (const key of keys) {
    const next = walk(graph, here, key, trail);
    seen.push(next ? `${next.target.kind} ${next.target.id}` : null);
    if (next) { here = next.target; trail = next.trail; }
  }
  return seen;
}

test('a side is measured against the box, not by angle: an edge spread along a wide bottom is on the bottom', () => {
  const start = /** @type {any} */ (boxes[0]);
  // 50 px out and 20 px down is 22° from the horizontal, yet the bottom of a 120 × 40 box.
  assert.equal(sideOf(start, { x: 250, y: 20 }), 'bottom');
  assert.equal(sideOf(start, { x: 260, y: 0 }), 'right');
  assert.equal(sideOf(start, { x: 200, y: -20 }), 'top');
  // Exactly a corner: top or bottom.
  assert.equal(sideOf(start, { x: 260, y: 20 }), 'bottom');
});

test('the edges on a side run left to right (top to bottom on a side), whatever the file order and the arrowheads', () => {
  const start = /** @type {any} */ (boxes[0]);
  assert.deepEqual(edgesOn(start, 'bottom', edges), ['start-check', 'start-charge', 'start-log']);
  assert.deepEqual(edgesOn(start, 'right', edges), ['start-side']);
  // An edge belongs to both its ends: one coming in counts too.
  assert.deepEqual(edgesOn(/** @type {any} */ (boxes[2]), 'top', edges), ['start-check']);
});

test('from a node, an arrow selects the first edge on that side; nothing there, nowhere', () => {
  assert.deepEqual(run(at('node', 'start'), ['ArrowDown']), ['edge start-check']);
  assert.deepEqual(run(at('node', 'start'), ['ArrowRight']), ['edge start-side']);
  assert.deepEqual(run(at('node', 'start'), ['ArrowUp']), [null]);
});

test('on an edge, the same arrow follows it to the far end, and the opposite goes back', () => {
  assert.deepEqual(run(at('node', 'start'), ['ArrowDown', 'ArrowDown']), ['edge start-check', 'node check']);
  assert.deepEqual(run(at('node', 'start'), ['ArrowDown', 'ArrowUp']), ['edge start-check', 'node start']);
  // Reached by Right, Right goes on whatever the line's shape.
  assert.deepEqual(run(at('node', 'start'), ['ArrowRight', 'ArrowRight']), ['edge start-side', 'node side']);
});

test("the cross arrows step through the side's edges, wrapping within the side", () => {
  assert.deepEqual(run(at('node', 'start'), ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft']),
    ['edge start-check', 'edge start-charge', 'edge start-log', 'edge start-check', 'edge start-log']);
  // Then on down the one stepped to.
  assert.deepEqual(run(at('node', 'start'), ['ArrowDown', 'ArrowRight', 'ArrowDown']),
    ['edge start-check', 'edge start-charge', 'node charge']);
});

test('an edge can be walked against its arrowhead', () => {
  assert.deepEqual(run(at('node', 'check'), ['ArrowUp', 'ArrowUp']), ['edge start-check', 'node start']);
});

test("an edge to a subgraph lands on its box, and the box walks its edges like a node", () => {
  assert.deepEqual(run(at('node', 'charge'), ['ArrowDown', 'ArrowDown']), ['edge charge-pay', 'subgraph pay']);
  assert.deepEqual(run(at('subgraph', 'pay'), ['ArrowUp', 'ArrowUp']), ['edge charge-pay', 'node charge']);
});

test('an edge reached any other way: each arrow goes to the end that lies that way, and the cross arrows do nothing', () => {
  assert.deepEqual(run(at('edge', 'start-log'), ['ArrowDown']), ['node log']);
  assert.deepEqual(run(at('edge', 'start-log'), ['ArrowUp']), ['node start']);
  assert.deepEqual(run(at('edge', 'start-charge'), ['ArrowLeft']), [null]);
});

test('nest finds the subgraph each box is drawn in', () => {
  const parents = Object.fromEntries(boxes.map((b) => [b.id, b.parent]));
  assert.deepEqual(parents, { start: null, side: null, check: null, charge: null, log: null, pay: null, card: 'pay', bank: 'pay' });
});

test('nest puts a subgraph in the one around it, never in a smaller one over its middle', () => {
  const sub = (/** @type {string} */ id, /** @type {number} */ w, /** @type {number} */ h) => ({ kind: /** @type {const} */ ('subgraph'), id, x: 0, y: 0, w, h });
  const parents = Object.fromEntries(nest([sub('outer', 300, 200), sub('inner', 100, 50), node('n', 0, 0)]).map((b) => [b.id, b.parent]));
  assert.deepEqual(parents, { outer: null, inner: 'outer', n: 'inner' });
});

test('by place: what overlaps across the arrow comes first, nearest along it', () => {
  // Below start (x 140–260): charge overlaps it; check and log do not, though log is no further.
  assert.deepEqual(byPlace(boxes, 'start', 'ArrowDown'), at('node', 'charge'));
  assert.deepEqual(byPlace(boxes, 'check', 'ArrowRight'), at('node', 'charge'));
  // Below charge: the pay box, not the nodes inside it.
  assert.deepEqual(byPlace(boxes, 'charge', 'ArrowDown'), at('subgraph', 'pay'));
});

test('by place: a box straight below is not to the side for being a fraction across', () => {
  const column = nest([node('a', 100, 0), node('b', 100.4, 100)]);
  assert.equal(byPlace(column, 'a', 'ArrowRight'), null);
});

test('by place: nothing overlapping, the nearest ahead; nothing ahead, nowhere (no wrap)', () => {
  assert.deepEqual(byPlace(boxes, 'side', 'ArrowDown'), at('node', 'log'));
  assert.equal(byPlace(boxes, 'side', 'ArrowRight'), null);
  assert.equal(byPlace(boxes, 'start', 'ArrowUp'), null);
});

test('by place inside a subgraph: its own items, then its box', () => {
  assert.deepEqual(byPlace(boxes, 'card', 'ArrowRight'), at('node', 'bank'));
  assert.deepEqual(byPlace(boxes, 'bank', 'ArrowRight'), at('subgraph', 'pay'));
  // Up from inside: nothing in pay above card, so pay's box, not charge outside it.
  assert.deepEqual(byPlace(boxes, 'card', 'ArrowUp'), at('subgraph', 'pay'));
});

test('by place: an overlapping box comes before a nearer one off to the side', () => {
  // x is nearer in a straight line, but only y lies under a.
  const three = nest([node('a', 100, 0), node('x', 170, 40), node('y', 100, 150)]);
  assert.deepEqual(byPlace(three, 'a', 'ArrowDown'), at('node', 'y'));
});

test('by place: a box mostly above, a little ahead, is not in the row; one squarely beside it is', () => {
  // As "Take order" sits above and right of "In stock?" in the demo, with "Wait for stock" further right.
  const row = nest([node('here', 0, 0, 60, 40), node('above', 20, -30, 100, 40), node('beside', 150, 10)]);
  assert.deepEqual(byPlace(row, 'here', 'ArrowRight'), at('node', 'beside'));
});

test('by place breaks a tie by leftmost (topmost going sideways)', () => {
  const overlapping = nest([node('a', 100, 0), node('l', 50, 100), node('r', 150, 100)]);
  assert.deepEqual(byPlace(overlapping, 'a', 'ArrowDown'), at('node', 'l'));
  const apart = nest([node('a', 100, 0), node('r', 200, 100), node('l', 0, 100)]);
  assert.deepEqual(byPlace(apart, 'a', 'ArrowDown'), at('node', 'l'));
});

test('nearest finds the box whose middle is closest, and null with none', () => {
  assert.equal(nearest(boxes, 290, 110), 'log');
  assert.equal(nearest([], 0, 0), null);
});

test("on a left or right side, Up and Down step through its edges, Down being next, wrapping", () => {
  const boxesLR = nest([node('hub', 0, 0, 60, 60), node('a', 200, -100), node('b', 200, 0), node('c', 200, 100)]);
  const fan = ['a', 'b', 'c'].map((id, k) => edge('hub', id, [30, -20 + 20 * k], [170, -100 + 100 * k]));
  const g = { boxes: boxesLR, edges: fan };
  let here = /** @type {any} */ ({ kind: 'node', id: 'hub' }), tr = null;
  const seen = [];
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp']) {
    const next = walk(g, here, key, tr);
    seen.push(next?.target.id ?? null);
    if (next) { here = next.target; tr = next.trail; }
  }
  assert.deepEqual(seen, ['hub-a', 'hub-b', 'hub-c', 'hub-a', 'hub-c']);
});

test("by place from an edge goes from its middle's level, not its start's", () => {
  // The edge leaves `in` inside sub and ends at `down` outside it; its middle is outside sub.
  const sub = { kind: /** @type {const} */ ('subgraph'), id: 'sub', x: 100, y: 100, w: 200, h: 100 };
  const placed = nest([sub, node('in', 100, 100), node('down', 100, 300), node('far', 300, 200),
    { kind: /** @type {const} */ ('node'), id: 'edge', x: 100, y: 200, w: 0, h: 0 }]);
  assert.equal(placed.find((b) => b.id === 'edge')?.parent, null);
  assert.deepEqual(byPlace(placed, 'edge', 'ArrowRight'), at('node', 'far'));
});
