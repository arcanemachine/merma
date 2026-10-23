import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beside, byPlace, enter, heading, leaving, nearest, nest, retrace, skip, walk, within } from '../web/navigate.mjs';

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
/**
 * Where each of `keys` goes, pressed one after another from `from`, telling walk() the node an edge was reached from,
 * as the editor does; null where one went nowhere.
 */
function run(/** @type {{ kind: any, id: string }} */ from, /** @type {string[]} */ keys, g = graph) {
  let here = from;
  /** @type {{ id: string, key: string } | null} */
  let came = null;
  return keys.map((key) => {
    const next = walk(g, here, key, here.kind === 'edge' ? came : null);
    if (next) {
      came = next.kind === 'edge' && here.kind !== 'edge' ? { id: here.id, key } : came;
      here = next;
    }
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

test("a diamond's corner edges count as down: Down, then Right steps through all four, and on to the last one's end", () => {
  assert.deepEqual(run(at('node', 'paid'), ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight']),
    ['edge paid-retry', 'edge paid-ship', 'edge paid-mail', 'edge paid-receipt', 'node receipt']);
  // At the first edge, Left goes on to its end lying left (the user: Paid, Down, Left is Retry).
  assert.deepEqual(run(at('node', 'paid'), ['ArrowDown', 'ArrowLeft']), ['edge paid-retry', 'node retry']);
});

test('on an edge, the arrow along it goes to the end that way', () => {
  assert.deepEqual(run(at('node', 'paid'), ['ArrowDown', 'ArrowDown']), ['edge paid-retry', 'node retry']);
  assert.deepEqual(run(at('node', 'retry'), ['ArrowUp', 'ArrowUp']), ['edge paid-retry', 'node paid']);
});

test("across an edge reached from a node: that node's edges going that way; alone there, those at its other end", () => {
  // order-wait is wait's only upward edge: order's downward edges, as from Receipt up to Paid's.
  assert.deepEqual(run(at('node', 'wait'), ['ArrowUp', 'ArrowRight', 'ArrowLeft', 'ArrowUp']),
    ['edge order-wait', 'edge order-note', 'edge order-wait', 'node order']);
  assert.deepEqual(run(at('node', 'receipt'), ['ArrowUp', 'ArrowLeft', 'ArrowLeft']),
    ['edge paid-receipt', 'edge paid-mail', 'edge paid-ship']);
  assert.deepEqual(run(at('node', 'order'), ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowLeft']),
    ['edge order-check', 'edge order-wait', 'edge order-note', 'edge order-wait']);
});

test("across an edge reached any other way (a click): its source's edges going its way", () => {
  // order-wait's source is order: its downward edges, whichever way they point.
  assert.deepEqual(walk(graph, at('edge', 'order-wait'), 'ArrowRight'), at('edge', 'order-note'));
  // Alone at both ends: nothing.
  assert.equal(walk(graph, at('edge', 'wait-paid'), 'ArrowRight'), null);
});

test("an edge coming in and one going out of the same side are stepped between", () => {
  // Retry's case: p comes into r's top, and r goes up to c; Up from r, then Right.
  const g = { boxes: nest([node('p', 100, 0), node('c', 0, 0), node('r', 50, 100)]), edges: [
    edge('r', 'c', [40, 85], 'U', [0, 15], 'D'), edge('p', 'r', [100, 15], 'D', [60, 85], 'U')] };
  assert.deepEqual(run(at('node', 'r'), ['ArrowUp', 'ArrowRight', 'ArrowLeft'], g), ['edge r-c', 'edge p-r', 'edge r-c']);
  // Past the last, on to its end lying that way: p, up and to the right.
  assert.deepEqual(run(at('node', 'r'), ['ArrowUp', 'ArrowRight', 'ArrowRight'], g), ['edge r-c', 'edge p-r', 'node p']);
  // Clicked, r-c's source is r: the same two.
  assert.deepEqual(walk(g, at('edge', 'r-c'), 'ArrowRight'), at('edge', 'p-r'));
});

test('an edge that turns: the arrows go to the end that lies that way', () => {
  // check-aside leaves check heading down and comes into aside from the left.
  assert.deepEqual(run(at('edge', 'check-aside'), ['ArrowUp']), ['node check']);
  assert.deepEqual(run(at('edge', 'check-aside'), ['ArrowRight']), ['node aside']);
});

test('an edge to a subgraph lands on its box; a node with no edge that way finds nothing, for the caller to go by place', () => {
  assert.deepEqual(run(at('edge', 'paid-ship'), ['ArrowDown']), ['subgraph ship']);
  assert.deepEqual(run(at('node', 'pack'), ['ArrowUp']), [null]);
  // By place, nothing nearer above pack than its subgraph's top border: the box, then walking on from it.
  assert.deepEqual(byPlace(boxes, 'pack', 'ArrowUp'), at('subgraph', 'ship'));
  assert.deepEqual(run(at('subgraph', 'ship'), ['ArrowUp', 'ArrowUp']), ['edge paid-ship', 'node paid']);
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

test('by place: the nearest thing wholly that way, node or subgraph, at any depth', () => {
  // Inside ship: label, and to its right the nested box holding tape.
  const placed = nest([sub('ship', 150, 100, 300, 160), node('label', 50, 100), sub('box', 200, 110, 120, 80), node('tape', 200, 110)]);
  assert.deepEqual(byPlace(placed, 'label', 'ArrowRight'), at('subgraph', 'box'));
  // Without the box, the node inside it is nearer than ship's right border.
  const flat = nest([sub('ship', 150, 100, 300, 160), node('label', 50, 100), node('tape', 200, 110)]);
  assert.deepEqual(byPlace(flat, 'label', 'ArrowRight'), at('node', 'tape'));
  // A box mostly above, a little ahead, is not wholly to the right.
  const row = nest([node('here', 0, 0, 60, 40), node('above', 20, -30, 100, 40), node('beside', 150, 10)]);
  assert.deepEqual(byPlace(row, 'here', 'ArrowRight'), at('node', 'beside'));
});

test('by place: the subgraph around it counts by its border, when nothing inside is nearer', () => {
  // charge in pay; check outside, further up than pay's top border.
  const placed = nest([sub('pay', 100, 150, 200, 100), node('charge', 100, 150), node('check', 100, 20)]);
  assert.deepEqual(byPlace(placed, 'charge', 'ArrowUp'), at('subgraph', 'pay'));
  assert.deepEqual(byPlace(placed, 'pay', 'ArrowUp'), at('node', 'check'));
});

test('by place: nothing that way, nowhere (no wrap)', () => {
  const two = nest([node('a', 0, 0), node('b', 200, 100)]);
  assert.deepEqual(byPlace(two, 'a', 'ArrowDown'), at('node', 'b'));
  assert.equal(byPlace(two, 'b', 'ArrowDown'), null);
});

test('by place: a box straight below is not to the side for being a fraction across', () => {
  const column = nest([node('a', 100, 0), node('b', 100.4, 100)]);
  assert.equal(byPlace(column, 'a', 'ArrowRight'), null);
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

test('a loop-back that leaves both ends the same way: Up or Down goes to the end further that way', () => {
  // Both ends leave heading down, in a U under them; l sits higher than r.
  const u = { boxes: nest([node('l', 0, 0), node('r', 200, 20)]), edges: [edge('l', 'r', [0, 15], 'D', [200, 35], 'D')] };
  assert.deepEqual(walk(u, at('edge', 'l-r'), 'ArrowUp'), at('node', 'l'));
  // None beside it: Right goes on to the end lying right, Left to the one lying left.
  assert.deepEqual(walk(u, at('edge', 'l-r'), 'ArrowRight'), at('node', 'r'));
  assert.deepEqual(walk(u, at('edge', 'l-r'), 'ArrowLeft'), at('node', 'l'));
});

test('retrace takes back the last move with its opposite key and the same modifier, and nothing else', () => {
  const move = { from: at('edge', 'paid-retry'), to: at('node', 'retry'), key: 'ArrowDown', ctrl: false };
  assert.equal(retrace([move], at('node', 'retry'), 'ArrowUp', false), move);
  assert.equal(retrace([move], at('node', 'retry'), 'ArrowUp', true), null);
  assert.equal(retrace([move], at('node', 'retry'), 'ArrowLeft', false), null);
  assert.equal(retrace([move], at('node', 'paid'), 'ArrowUp', false), null);
  assert.equal(retrace([], at('node', 'retry'), 'ArrowUp', false), null);
});

test('a lone edge: a cross arrow goes on to an end lying that way from its middle, else nowhere', () => {
  // b sits a few pixels right of the edge's middle, a a few pixels left.
  const lone = { boxes: nest([node('a', 0, 0), node('b', 6, 100)]), edges: [edge('a', 'b', [0, 15], 'D', [6, 85], 'U')] };
  assert.deepEqual(walk(lone, at('edge', 'a-b'), 'ArrowRight'), at('node', 'b'));
  assert.deepEqual(walk(lone, at('edge', 'a-b'), 'ArrowLeft'), at('node', 'a'));
  const straight = { boxes: nest([node('a', 0, 0), node('b', 0, 100)]), edges: [edge('a', 'b', [0, 15], 'D', [0, 85], 'U')] };
  assert.equal(walk(straight, at('edge', 'a-b'), 'ArrowRight'), null);
});

test("a subgraph's box also owns the edges crossing its border from inside, at any depth", () => {
  // pay holds paid; deeper, ship holds box, which holds tape.
  const g = {
    boxes: nest([sub('pay', 100, 100, 200, 100), node('paid', 100, 100), node('retry', 60, 130),
      sub('ship', 100, 300, 200, 120), sub('box', 130, 310, 80, 60), node('tape', 130, 310), node('log', 260, 220)]),
    edges: [
      edge('paid', 'retry', [90, 115], 'D', [60, 115], 'U'),
      edge('paid', 'log', [110, 115], 'D', [260, 205], 'U'),
      edge('paid', 'ship', [100, 115], 'D', [100, 240], 'U'),
      edge('log', 'tape', [260, 235], 'D', [130, 295], 'U'),
    ],
  };
  assert.deepEqual(leaving(g.edges, 'pay', 'ArrowDown', within(g.boxes, 'pay')), ['paid-ship', 'paid-log']);
  assert.deepEqual(walk(g, at('subgraph', 'pay'), 'ArrowDown'), at('edge', 'paid-ship'));
  assert.deepEqual(skip(g, at('subgraph', 'pay'), 'ArrowDown'), at('subgraph', 'ship'));
  // log-tape crosses both box's and ship's borders.
  assert.deepEqual(walk(g, at('subgraph', 'box'), 'ArrowUp'), at('edge', 'log-tape'));
  assert.deepEqual(walk(g, at('subgraph', 'ship'), 'ArrowUp'), at('edge', 'paid-ship'));
  assert.deepEqual(leaving(g.edges, 'ship', 'ArrowUp', within(g.boxes, 'ship')), ['paid-ship', 'log-tape']);
});

test('beside: the end reached from when it has others there, else the other end, which then counts as reached from', () => {
  assert.deepEqual(beside(graph, 'paid-receipt', { id: 'receipt', key: 'ArrowUp' }), { id: 'paid', key: 'ArrowDown' });
  assert.deepEqual(beside(graph, 'order-wait', { id: 'order', key: 'ArrowDown' }), { id: 'order', key: 'ArrowDown' });
  // Clicked: its source.
  assert.deepEqual(beside(graph, 'order-wait'), { id: 'order', key: 'ArrowDown' });
  assert.equal(beside(graph, 'wait-paid'), null);
});

test("from a subgraph's box, across a crossing edge: the box's set, and alone there, the outside end's", () => {
  const g = {
    boxes: nest([sub('pay', 100, 100, 200, 100), node('paid', 100, 100), node('retry', 60, 130),
      node('ship', 60, 260), node('log', 160, 260), node('far', 300, 0)]),
    edges: [
      // The inside edge leaves paid rightmost, so paid's own set goes on past the box's.
      edge('paid', 'retry', [112, 115], 'D', [60, 115], 'U'),
      edge('paid', 'ship', [95, 115], 'D', [60, 245], 'U'),
      edge('paid', 'log', [105, 115], 'D', [160, 245], 'U'),
      edge('paid', 'far', [115, 85], 'U', [300, 15], 'D'),
      edge('far', 'log', [310, 15], 'D', [170, 245], 'U'),
    ],
  };
  // Down from pay: its two crossing edges, not paid's inside one; then on to log, the last one's end lying right.
  assert.deepEqual(run(at('subgraph', 'pay'), ['ArrowDown', 'ArrowRight', 'ArrowRight'], g), ['edge paid-ship', 'edge paid-log', 'node log']);
  // Up from pay: paid-far is its only crossing edge going up: far's edges going down.
  assert.deepEqual(beside(g, 'paid-far', { id: 'pay', key: 'ArrowUp' }), { id: 'far', key: 'ArrowDown' });
});

test('the arrow that brought you to a box from outside carries you on into it, through the side you entered', () => {
  // ship holds pack (top left), label (below it) and tape (right of pack, lower).
  const inner = nest([sub('ship', 100, 100, 200, 160), node('pack', 60, 50), node('tape', 160, 70), node('label', 60, 150),
    node('done', 100, 260), node('paid', 100, -60)]);
  const move = (/** @type {any} */ from, /** @type {string} */ key) => ({ from, to: at('subgraph', 'ship'), key, ctrl: false });
  const edgeIn = at('edge', 'paid-ship');
  assert.deepEqual(enter([move(edgeIn, 'ArrowDown')], inner, at('subgraph', 'ship'), 'ArrowDown'), at('node', 'pack'));
  assert.deepEqual(enter([move(at('node', 'done'), 'ArrowUp')], inner, at('subgraph', 'ship'), 'ArrowUp'), at('node', 'label'));
  assert.deepEqual(enter([move(edgeIn, 'ArrowRight')], inner, at('subgraph', 'ship'), 'ArrowRight'), at('node', 'pack'));
  assert.deepEqual(enter([move(edgeIn, 'ArrowLeft')], inner, at('subgraph', 'ship'), 'ArrowLeft'), at('node', 'tape'));
  // Another arrow, a click (no path), or a climb from inside: the box walks its edges.
  assert.equal(enter([move(edgeIn, 'ArrowDown')], inner, at('subgraph', 'ship'), 'ArrowRight'), null);
  assert.equal(enter([], inner, at('subgraph', 'ship'), 'ArrowDown'), null);
  assert.equal(enter([move(at('node', 'label'), 'ArrowUp')], inner, at('subgraph', 'ship'), 'ArrowUp'), null);
  // Level with each other: the leftmost going down.
  const level = nest([sub('row', 100, 100, 200, 100), node('r', 160, 80), node('l', 40, 80)]);
  const down = [{ from: at('node', 'top'), to: at('subgraph', 'row'), key: 'ArrowDown', ctrl: false }];
  assert.deepEqual(enter(down, level, at('subgraph', 'row'), 'ArrowDown'), at('node', 'l'));
  // Only from the box the last move ended at.
  assert.equal(enter([move(edgeIn, 'ArrowDown')], inner, at('node', 'done'), 'ArrowDown'), null);
});
