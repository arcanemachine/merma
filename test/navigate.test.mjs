import { test } from 'node:test';
import assert from 'node:assert/strict';
import { across, byPlace, enter, heading, leaving, nearest, nest, retrace, skip, walk, within } from '../web/navigate.mjs';

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
      if (next.kind === 'edge') came = here.kind === 'edge' ? across(g, here.id, key, came)?.from ?? null : { id: here.id, key };
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

test("a diamond's corner edges count as down: Down, then Right steps through all four, and Up goes back", () => {
  assert.deepEqual(run(at('node', 'paid'), ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp']),
    ['edge paid-retry', 'edge paid-ship', 'edge paid-mail', 'edge paid-receipt', null, 'node paid']);
  // Paging never lands on a node (the user): Retry has no other edge at its top, so Left finds nothing.
  assert.deepEqual(run(at('node', 'paid'), ['ArrowDown', 'ArrowLeft']), ['edge paid-retry', null]);
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
  assert.deepEqual(run(at('node', 'r'), ['ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowLeft'], g),
    ['edge r-c', 'edge p-r', null, 'edge r-c']);
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

test('by place: straight ahead first, however far, then the nearest off to the side', () => {
  // The demo's Boxing, inside Shipping: Send is nearer, below and to the left; Shipping's border is straight below.
  const nested = nest([sub('ship', 100, 100, 200, 160), sub('box', 150, 80, 60, 60), node('send', 70, 130, 40, 10)]);
  assert.deepEqual(byPlace(nested, 'box', 'ArrowDown'), at('subgraph', 'ship'));
  // A far node straight right beats a near one up and to the right.
  const row = nest([node('here', 0, 0, 40, 20), node('near', 60, -40, 40, 20), node('far', 400, 0, 40, 20)]);
  assert.deepEqual(byPlace(row, 'here', 'ArrowRight'), at('node', 'far'));
  // Nothing straight ahead: the nearest to the side.
  const off = nest([node('here', 0, 0, 40, 20), node('near', 60, -40, 40, 20), node('far', 400, 60, 40, 20)]);
  assert.deepEqual(byPlace(off, 'here', 'ArrowRight'), at('node', 'near'));
  // Weigh parcel, Left: its own subgraph's border is straight ahead and nearer than Print label outside it.
  const weigh = nest([sub('ship', 100, 100, 240, 160), node('label', 20, 100, 40, 20), sub('box', 150, 100, 60, 60),
    node('weigh', 155, 110, 40, 10)]);
  assert.deepEqual(byPlace(weigh, 'weigh', 'ArrowLeft'), at('subgraph', 'box'));
});

test("Ctrl lands on the outermost box around the far end that the place you leave is not in: a level a press", () => {
  // o holds m and box b, which holds k and n; s is outside, above. Edges s→n, m→n, k→n, each coming down into n.
  const boxes = nest([node('s', 100, -100), sub('o', 100, 100, 300, 240), node('m', 0, 40), sub('b', 150, 120, 140, 120),
    node('k', 150, 90, 40, 20), node('n', 150, 150, 40, 20)]);
  const g = { boxes, edges: [edge('s', 'n', [100, -85], 'D', [140, 140], 'U'), edge('m', 'n', [0, 55], 'D', [150, 140], 'U'),
    edge('k', 'n', [150, 100], 'D', [160, 140], 'U')] };
  assert.deepEqual(skip(g, at('node', 's'), 'ArrowDown'), at('subgraph', 'o'));
  assert.deepEqual(skip(g, at('node', 'm'), 'ArrowDown'), at('subgraph', 'b'));
  assert.deepEqual(skip(g, at('node', 'k'), 'ArrowDown'), at('node', 'n'));
  // From an edge: the end it leaves is where it stands; the yes edge from Paid to Shipping, Ctrl+Up, is the box.
  assert.deepEqual(skip(g, at('edge', 's-n'), 'ArrowDown'), at('subgraph', 'o'));
  assert.deepEqual(skip(g, at('edge', 'k-n'), 'ArrowDown'), at('node', 'n'));
  // From the box o, Up: s-n crosses its border from n inside; the far end, s, is outside every subgraph.
  assert.deepEqual(skip(g, at('subgraph', 'o'), 'ArrowUp'), at('node', 's'));
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
  // Left and Right page edges only: none beside it.
  assert.equal(walk(u, at('edge', 'l-r'), 'ArrowRight'), null);
  assert.equal(walk(u, at('edge', 'l-r'), 'ArrowLeft'), null);
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

test("paging past the last edge at one end carries on among those at the edge's other end, from its place there", () => {
  // The demo's Paid and Retry: p's down edges are p-r and p-x; r's top edges are r-c (up to c) and p-r.
  const g = { boxes: nest([node('p', 100, 0), node('c', 0, 0), node('r', 50, 100), node('x', 150, 100)]), edges: [
    edge('r', 'c', [40, 85], 'U', [0, 15], 'D'), edge('p', 'r', [95, 15], 'D', [60, 85], 'U'),
    edge('p', 'x', [105, 15], 'D', [150, 85], 'U')] };
  // The user: Paid, Down, Left → Retry's edge to Charge card; Right → back; Right → Paid's next; Right: nothing.
  assert.deepEqual(run(at('node', 'p'), ['ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'ArrowRight'], g),
    ['edge p-r', 'edge r-c', null, 'edge p-r', 'edge p-x', null]);
  // From Retry: Up, Right → p-r; Right carries on into p's set.
  assert.deepEqual(run(at('node', 'r'), ['ArrowUp', 'ArrowRight', 'ArrowRight'], g), ['edge r-c', 'edge p-r', 'edge p-x']);
  // The set it was found among is where it now counts as reached from.
  assert.deepEqual(across(g, 'p-r', 'ArrowLeft', { id: 'p', key: 'ArrowDown' }),
    { to: at('edge', 'r-c'), from: { id: 'r', key: 'ArrowUp' } });
});

test("an edge that turns: an arrow along one end's axis pages the edges at the other end", () => {
  // a-s leaves a heading down and comes into s's left side; b-s comes into s's left side lower down. a-z also leaves
  // a heading down: Down does not page a's down edges, which head along it.
  const g = { boxes: nest([node('a', 0, 0), node('b', 0, 100), node('s', 100, 60, 60, 80), node('z', 20, 200)]), edges: [
    edge('a', 's', [0, 15], 'D', [70, 40], 'L'), edge('b', 's', [30, 100], 'R', [70, 80], 'L'),
    edge('a', 'z', [10, 15], 'D', [20, 185], 'U')] };
  assert.deepEqual(walk(g, at('edge', 'a-s'), 'ArrowDown'), at('edge', 'b-s'));
  assert.deepEqual(walk(g, at('edge', 'b-s'), 'ArrowUp'), at('edge', 'a-s'));
  // Up along a-s still goes to a, the end it leaves heading down.
  assert.deepEqual(walk(g, at('edge', 'a-s'), 'ArrowUp'), at('node', 'a'));
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

test('across: the end reached from when it lands there, else the other end, which then counts as reached from', () => {
  assert.deepEqual(across(graph, 'paid-receipt', 'ArrowLeft', { id: 'receipt', key: 'ArrowUp' })?.from, { id: 'paid', key: 'ArrowDown' });
  assert.deepEqual(across(graph, 'order-wait', 'ArrowRight', { id: 'order', key: 'ArrowDown' })?.from, { id: 'order', key: 'ArrowDown' });
  // Clicked: its source.
  assert.deepEqual(across(graph, 'order-wait', 'ArrowRight')?.from, { id: 'order', key: 'ArrowDown' });
  assert.equal(across(graph, 'wait-paid', 'ArrowRight'), null);
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
  // Down from pay: its two crossing edges, not paid's inside one; then on among log's top edges, never to paid's.
  assert.deepEqual(run(at('subgraph', 'pay'), ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight'], g),
    ['edge paid-ship', 'edge paid-log', 'edge far-log', null]);
  // Up from pay: paid-far is its only crossing edge going up: far's edges going down.
  assert.deepEqual(across(g, 'paid-far', 'ArrowRight', { id: 'pay', key: 'ArrowUp' })?.from, { id: 'far', key: 'ArrowDown' });
  // An edge not among the box's: the box's edges land nothing, so it pages only at its own far end (last there).
  assert.equal(across(g, 'far-log', 'ArrowRight', { id: 'pay', key: 'ArrowDown' }), null);
});

test('the arrow that brought you to a box from outside carries you on into it, through the side you entered', () => {
  // ship holds pack (top left), label (below it) and tape (right of pack, lower).
  const inner = nest([sub('ship', 100, 100, 200, 160), node('pack', 60, 50), node('tape', 160, 70), node('label', 60, 150),
    node('done', 100, 260), node('paid', 100, -60)]);
  const move = (/** @type {any} */ from, /** @type {string} */ key) => ({ from, to: at('subgraph', 'ship'), key, ctrl: false });
  const g = { boxes: inner, edges: [edge('pack', 'label', [60, 65], 'D', [60, 135], 'U')] };
  const edgeIn = at('edge', 'paid-ship');
  assert.deepEqual(enter([move(edgeIn, 'ArrowDown')], g, at('subgraph', 'ship'), 'ArrowDown'), at('node', 'pack'));
  assert.deepEqual(enter([move(at('node', 'done'), 'ArrowUp')], g, at('subgraph', 'ship'), 'ArrowUp'), at('node', 'label'));
  assert.deepEqual(enter([move(edgeIn, 'ArrowRight')], g, at('subgraph', 'ship'), 'ArrowRight'), at('node', 'pack'));
  assert.deepEqual(enter([move(edgeIn, 'ArrowLeft')], g, at('subgraph', 'ship'), 'ArrowLeft'), at('node', 'tape'));
  // Another arrow: the box walks its edges.
  assert.equal(enter([move(edgeIn, 'ArrowDown')], g, at('subgraph', 'ship'), 'ArrowRight'), null);
  // Selected without arrows (a click, a find, O), or climbed out of: as if entered from the top, for Down only.
  assert.deepEqual(enter([], g, at('subgraph', 'ship'), 'ArrowDown'), at('node', 'pack'));
  assert.equal(enter([], g, at('subgraph', 'ship'), 'ArrowUp'), null);
  assert.deepEqual(enter([move(at('node', 'label'), 'ArrowUp')], g, at('subgraph', 'ship'), 'ArrowDown'), at('node', 'pack'));
  assert.equal(enter([move(at('node', 'label'), 'ArrowUp')], g, at('subgraph', 'ship'), 'ArrowUp'), null);
  // A climb by place from an edge inside it counts as from inside too, not as entering by its arrow.
  assert.equal(enter([move(at('edge', 'pack-label'), 'ArrowLeft')], g, at('subgraph', 'ship'), 'ArrowLeft'), null);
  // A row is what overlaps the nearest child: read forwards from the top, backwards from the bottom.
  const level = nest([sub('row', 100, 100, 200, 100), node('r', 160, 82, 60, 34), node('l', 40, 80)]);
  const by = (/** @type {string} */ key) => [{ from: at('node', 'top'), to: at('subgraph', 'row'), key, ctrl: false }];
  const lg = { boxes: level, edges: [] };
  assert.deepEqual(enter(by('ArrowDown'), lg, at('subgraph', 'row'), 'ArrowDown'), at('node', 'l'));
  // r's bottom is lower by a few pixels, but they are one row: the rightmost, not the lowest.
  assert.deepEqual(enter(by('ArrowUp'), lg, at('subgraph', 'row'), 'ArrowUp'), at('node', 'r'));
  // Two in a column, entered from the left: the topmost; from the right: the bottommost.
  const col = nest([sub('col', 100, 100, 100, 200), node('a', 100, 40), node('b', 105, 150)]);
  const cg = { boxes: col, edges: [] };
  const into = (/** @type {string} */ key) => [{ from: at('node', 'top'), to: at('subgraph', 'col'), key, ctrl: false }];
  assert.deepEqual(enter(into('ArrowRight'), cg, at('subgraph', 'col'), 'ArrowRight'), at('node', 'a'));
  assert.deepEqual(enter(into('ArrowLeft'), cg, at('subgraph', 'col'), 'ArrowLeft'), at('node', 'b'));
  // Only from the box the last move ended at.
  assert.equal(enter([move(edgeIn, 'ArrowDown')], g, at('node', 'done'), 'ArrowDown'), null);
});
