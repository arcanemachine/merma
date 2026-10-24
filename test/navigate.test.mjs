import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRESH, across, back, byPlace, enter, half, heading, leaving, moved, nearest, nest, skip, walk, within } from '../web/navigate.mjs';

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
/** Where walk() goes, without the fan it stepped in. */
const go = (/** @type {Parameters<typeof walk>} */ ...args) => walk(...args)?.to ?? null;
/**
 * Where each of `keys` goes, pressed one after another from `from`, telling walk() the node an edge was reached from,
 * as the editor does; null where one went nowhere.
 */
function run(/** @type {{ kind: any, id: string }} */ from, /** @type {string[]} */ keys, g = graph) {
  let here = from;
  /** @type {{ id: string, key: string } | null} */
  let came = null;
  return keys.map((key) => {
    const moved = walk(g, here, key, here.kind === 'edge' ? came : null);
    const next = moved?.to;
    if (next) {
      if (next.kind === 'edge') came = moved.fan ?? { id: here.id, key };
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
  // Stepping across never lands on a node (the user): Retry has no other edge at its top, so Left finds nothing.
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
  assert.deepEqual(go(graph, at('edge', 'order-wait'), 'ArrowRight'), at('edge', 'order-note'));
  // Alone at both ends: nothing.
  assert.equal(go(graph, at('edge', 'wait-paid'), 'ArrowRight'), null);
});

test("an edge coming in and one going out of the same side are stepped between", () => {
  // Retry's case: p comes into r's top, and r goes up to c; Up from r, then Right.
  const g = { boxes: nest([node('p', 100, 0), node('c', 0, 0), node('r', 50, 100)]), edges: [
    edge('r', 'c', [40, 85], 'U', [0, 15], 'D'), edge('p', 'r', [100, 15], 'D', [60, 85], 'U')] };
  assert.deepEqual(run(at('node', 'r'), ['ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowLeft'], g),
    ['edge r-c', 'edge p-r', null, 'edge r-c']);
  // Clicked, r-c's source is r: the same two.
  assert.deepEqual(go(g, at('edge', 'r-c'), 'ArrowRight'), at('edge', 'p-r'));
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

test('by place: straight ahead only, however far; nothing straight, nothing', () => {
  // The demo's Boxing, inside Shipping: Send is nearer, below and to the left; Shipping's border is straight below.
  const nested = nest([sub('ship', 100, 100, 200, 160), sub('box', 150, 80, 60, 60), node('send', 70, 130, 40, 10)]);
  assert.deepEqual(byPlace(nested, 'box', 'ArrowDown'), at('subgraph', 'ship'));
  // A far node straight right beats a near one up and to the right.
  const row = nest([node('here', 0, 0, 40, 20), node('near', 60, -40, 40, 20), node('far', 400, 0, 40, 20)]);
  assert.deepEqual(byPlace(row, 'here', 'ArrowRight'), at('node', 'far'));
  // Nothing straight ahead: nothing, however near something off to the side is (the user).
  const off = nest([node('here', 0, 0, 40, 20), node('near', 60, -40, 40, 20), node('far', 400, 60, 40, 20)]);
  assert.equal(byPlace(off, 'here', 'ArrowRight'), null);
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

test("a self-loop belongs to its node's edges at its ends; on it, along goes back to its node, across steps or stops", () => {
  // a's loop leaves its left side; a-b also leaves a heading left, lower down.
  const loop = edge('a', 'a', [-30, -5], 'L', [-30, 5], 'L');
  const g = { boxes: nest([node('a', 0, 0), node('b', -200, 40)]), edges: [loop, edge('a', 'b', [-30, 8], 'L', [-170, 40], 'R')] };
  assert.deepEqual(leaving(g.edges, 'a', 'ArrowLeft'), ['a-a', 'a-b']);
  assert.deepEqual(leaving(g.edges, 'a', 'ArrowRight'), []);
  assert.deepEqual(go(g, at('node', 'a'), 'ArrowLeft'), at('edge', 'a-a'));
  assert.deepEqual(go(g, at('edge', 'a-a'), 'ArrowRight'), at('node', 'a'));
  assert.deepEqual(go(g, at('edge', 'a-a'), 'ArrowDown'), at('edge', 'a-b'));
  // A step across a loop says the fan it stepped in, as on any edge.
  assert.deepEqual(walk(g, at('edge', 'a-a'), 'ArrowDown')?.fan, { id: 'a', key: 'ArrowLeft' });
  // Nothing to page that way: nothing, as on any edge.
  assert.equal(go(g, at('edge', 'a-a'), 'ArrowUp'), null);
  // A loop out of one side and back into another counts at both, reached either way; across, it steps through the fan it was
  // reached in; along that fan's axis, back to its node.
  const frame = edge('s', 's', [0, 50], 'D', [5, -50], 'U');
  const sg = { boxes: nest([sub('s', 0, 0, 100, 100), node('in', 0, 0), node('top', 40, -150), node('low', 40, 150)]),
    edges: [frame, edge('top', 's', [40, -135], 'D', [40, -50], 'U'), edge('s', 'low', [40, 50], 'D', [40, 135], 'U')] };
  assert.deepEqual(leaving(sg.edges, 's', 'ArrowUp', within(sg.boxes, 's')), ['s-s', 'top-s']);
  assert.deepEqual(leaving(sg.edges, 's', 'ArrowDown', within(sg.boxes, 's')), ['s-s', 's-low']);
  assert.deepEqual(go(sg, at('edge', 's-s'), 'ArrowRight', { id: 's', key: 'ArrowUp' }), at('edge', 'top-s'));
  assert.deepEqual(go(sg, at('edge', 's-s'), 'ArrowRight', { id: 's', key: 'ArrowDown' }), at('edge', 's-low'));
  assert.deepEqual(go(sg, at('edge', 's-s'), 'ArrowUp', { id: 's', key: 'ArrowDown' }), at('subgraph', 's'));
  // A loop out of the right side and back into the top, reached in the top's fan: Left steps through that fan.
  const corner = { boxes: nest([node('q', 0, 0), node('r', -40, -100)]),
    edges: [edge('q', 'q', [30, 0], 'R', [10, -15], 'U'), edge('q', 'r', [-10, -15], 'U', [-40, -85], 'D')] };
  assert.deepEqual(go(corner, at('edge', 'q-q'), 'ArrowLeft', { id: 'q', key: 'ArrowUp' }), at('edge', 'q-r'));
  // Back on the box from its own loop, which frames it: by the arrow, as if gone round it that way (the user); with no
  // trail (the box clicked), the top.
  const box = at('subgraph', 's'), loopEdge = at('edge', 's-s');
  const round = (/** @type {string} */ key) => [{ from: box, to: loopEdge, key: 'ArrowDown', ctrl: false },
    { from: loopEdge, to: box, key, ctrl: false }];
  assert.equal(half(round('ArrowUp'), sg, box), 'bottom');
  assert.equal(half(round('ArrowDown'), sg, box), 'top');
  assert.equal(half([], sg, box), 'top');
  // Across a loop with nothing more to page: nothing, as on any edge (the user: not back to its node).
  assert.equal(go(sg, at('edge', 's-s'), 'ArrowLeft', { id: 's', key: 'ArrowUp' }), null);
  // Ctrl has no far end on a loop to skip to: past it, a-b's.
  assert.deepEqual(skip(g, at('node', 'a'), 'ArrowLeft'), at('node', 'b'));
  assert.equal(skip({ boxes: g.boxes, edges: [loop] }, at('node', 'a'), 'ArrowLeft'), null);
});

test('by place: nothing that way, nowhere (no wrap)', () => {
  const two = nest([node('a', 0, 0), node('b', 20, 100)]);
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
  // Both off to the side: neither.
  const apart = nest([node('a', 100, 0), node('r', 200, 100), node('l', 0, 100)]);
  assert.equal(byPlace(apart, 'a', 'ArrowDown'), null);
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
  assert.deepEqual(go(u, at('edge', 'l-r'), 'ArrowUp'), at('node', 'l'));
  // Left and Right page edges only: none beside it.
  assert.equal(go(u, at('edge', 'l-r'), 'ArrowRight'), null);
  assert.equal(go(u, at('edge', 'l-r'), 'ArrowLeft'), null);
});

test('back takes back the latest move into here, with its opposite key and the same modifier, and cuts the trail before it', () => {
  const down = { from: at('node', 'wait'), to: at('edge', 'wait-paid'), key: 'ArrowDown', ctrl: false };
  const onto = { from: at('edge', 'wait-paid'), to: at('node', 'paid'), key: 'ArrowDown', ctrl: false };
  const away = { from: at('node', 'paid'), to: at('edge', 'paid-retry'), key: 'ArrowDown', ctrl: false };
  const cursor = { trail: [down, onto, away], came: null };
  // Found deeper than the last move: back to where it came from, the moves after it gone.
  assert.deepEqual(back(cursor, at('edge', 'wait-paid'), 'ArrowUp', false),
    { to: at('node', 'wait'), cursor: { trail: [], came: null } });
  // Back onto an edge: it counts as reached from the item just left, by this arrow.
  assert.deepEqual(back({ trail: [down, onto], came: null }, at('node', 'paid'), 'ArrowUp', false),
    { to: at('edge', 'wait-paid'), cursor: { trail: [down], came: { id: 'paid', key: 'ArrowUp' } } });
  assert.equal(back(cursor, at('edge', 'paid-retry'), 'ArrowUp', true), null);
  assert.equal(back(cursor, at('edge', 'paid-retry'), 'ArrowLeft', false), null);
  assert.equal(back(cursor, at('node', 'retry'), 'ArrowUp', false), null);
  assert.equal(back(FRESH, at('node', 'paid'), 'ArrowUp', false), null);
  // Reached twice, the latest by another key: that one is how you got here, so the older is not retraced.
  const again = { from: at('node', 'check'), to: at('node', 'paid'), key: 'ArrowRight', ctrl: false };
  assert.equal(back({ trail: [down, onto, again], came: null }, at('node', 'paid'), 'ArrowUp', false), null);
});

test('moved: a step across stays off the trail and counts from its fan; any other move goes on it', () => {
  const onto = { from: at('node', 'paid'), to: at('edge', 'paid-retry'), key: 'ArrowDown', ctrl: false };
  const one = moved(FRESH, onto);
  assert.deepEqual(one, { trail: [onto], came: { id: 'paid', key: 'ArrowDown' } });
  const fan = { id: 'paid', key: 'ArrowDown' };
  assert.deepEqual(moved(one, { from: at('edge', 'paid-retry'), to: at('edge', 'paid-ship'), key: 'ArrowRight', ctrl: false }, fan),
    { trail: [onto], came: fan });
  const off = { from: at('edge', 'paid-retry'), to: at('node', 'retry'), key: 'ArrowDown', ctrl: false };
  assert.deepEqual(moved(one, off), { trail: [onto, off], came: null });
});

/**
 * Where each of `keys` goes from `from`, as the editor's cursor goes: back() first, else walk(), the cursor after each
 * by moved(); null where one went nowhere.
 */
function press(/** @type {{ kind: any, id: string }} */ from, /** @type {string[]} */ keys, g = graph) {
  let here = from;
  /** @type {import('../web/navigate.mjs').Cursor} */
  let cursor = FRESH;
  return keys.map((key) => {
    const retraced = back(cursor, here, key, false);
    if (retraced) {
      here = retraced.to;
      cursor = retraced.cursor;
      return `${here.kind} ${here.id}`;
    }
    const went = walk(g, here, key, here.kind === 'edge' ? cursor.came : null);
    if (!went) return null;
    cursor = moved(cursor, { from: here, to: went.to, key, ctrl: false }, went.fan);
    here = went.to;
    return `${here.kind} ${here.id}`;
  });
}

test('the opposite arrow goes back the way you came, past steps across, which it never undoes', () => {
  // Stepped across to paid-ship, then up and down again: back on paid-ship every time (the user found the second time
  // went to paid-retry, when coming back onto an edge restarted the trail).
  assert.deepEqual(press(at('node', 'paid'), ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowDown']),
    ['edge paid-retry', 'edge paid-ship', 'node paid', 'edge paid-ship', 'node paid', 'edge paid-ship', 'node paid', 'edge paid-ship']);
  // Back up a step across to the edge first reached in that fan, then on back the way you came.
  assert.deepEqual(press(at('node', 'wait'), ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp']),
    ['edge wait-paid', 'node paid', 'edge paid-retry', 'edge paid-ship', 'node paid', 'edge paid-ship', 'edge paid-retry', 'node paid', 'edge wait-paid', 'node wait']);
  // An edge reached by a step has no way back of its own: from its end and back onto it, Up walks on (the user: back
  // from Order log, you are in its fan).
  assert.deepEqual(press(at('node', 'paid'), ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'ArrowUp']),
    ['edge paid-retry', 'edge paid-ship', 'edge paid-mail', 'node mail', 'edge paid-mail', 'node paid']);
});

test('a lone edge: the cross arrows stop, even with an end a little that way', () => {
  // b sits a few pixels right of the edge's middle.
  const lone = { boxes: nest([node('a', 0, 0), node('b', 6, 100)]), edges: [edge('a', 'b', [0, 15], 'D', [6, 85], 'U')] };
  assert.equal(go(lone, at('edge', 'a-b'), 'ArrowRight'), null);
  assert.equal(go(lone, at('edge', 'a-b'), 'ArrowLeft'), null);
});

test("stepping past the last edge at one end carries on among those at the edge's other end, from its place there", () => {
  // The demo's Paid and Retry: p's down edges are p-r and p-x; r's top edges are r-c (up to c) and p-r.
  const g = { boxes: nest([node('p', 100, 0), node('c', 0, 0), node('r', 50, 100), node('x', 150, 100)]), edges: [
    edge('r', 'c', [40, 85], 'U', [0, 15], 'D'), edge('p', 'r', [95, 15], 'D', [60, 85], 'U'),
    edge('p', 'x', [105, 15], 'D', [150, 85], 'U')] };
  // The user: Paid, Down, Left → Retry's edge to Charge card; Right → back; Right → Paid's next; Right: nothing.
  assert.deepEqual(run(at('node', 'p'), ['ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'ArrowRight'], g),
    ['edge p-r', 'edge r-c', null, 'edge p-r', 'edge p-x', null]);
  // From Retry: Up, Right → p-r; Right carries on into p's fan.
  assert.deepEqual(run(at('node', 'r'), ['ArrowUp', 'ArrowRight', 'ArrowRight'], g), ['edge r-c', 'edge p-r', 'edge p-x']);
  // The fan it was found among is where it now counts as reached from.
  assert.deepEqual(across(g, 'p-r', 'ArrowLeft', { id: 'p', key: 'ArrowDown' }),
    { to: at('edge', 'r-c'), from: { id: 'r', key: 'ArrowUp' } });
});

test("an edge that turns: an arrow along one end's axis steps through the edges at the other end", () => {
  // a-s leaves a heading down and comes into s's left side; b-s comes into s's left side lower down. a-z also leaves
  // a heading down: Down does not page a's down edges, which head along it.
  const g = { boxes: nest([node('a', 0, 0), node('b', 0, 100), node('s', 100, 60, 60, 80), node('z', 20, 200)]), edges: [
    edge('a', 's', [0, 15], 'D', [70, 40], 'L'), edge('b', 's', [30, 100], 'R', [70, 80], 'L'),
    edge('a', 'z', [10, 15], 'D', [20, 185], 'U')] };
  assert.deepEqual(go(g, at('edge', 'a-s'), 'ArrowDown'), at('edge', 'b-s'));
  assert.deepEqual(go(g, at('edge', 'b-s'), 'ArrowUp'), at('edge', 'a-s'));
  // Up along a-s still goes to a, the end it leaves heading down.
  assert.deepEqual(go(g, at('edge', 'a-s'), 'ArrowUp'), at('node', 'a'));
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
  assert.deepEqual(go(g, at('subgraph', 'pay'), 'ArrowDown'), at('edge', 'paid-ship'));
  assert.deepEqual(skip(g, at('subgraph', 'pay'), 'ArrowDown'), at('subgraph', 'ship'));
  // log-tape crosses both box's and ship's borders.
  assert.deepEqual(go(g, at('subgraph', 'box'), 'ArrowUp'), at('edge', 'log-tape'));
  assert.deepEqual(go(g, at('subgraph', 'ship'), 'ArrowUp'), at('edge', 'paid-ship'));
  assert.deepEqual(leaving(g.edges, 'ship', 'ArrowUp', within(g.boxes, 'ship')), ['paid-ship', 'log-tape']);
});

test('across: the end reached from when it lands there, else the other end, which then counts as reached from', () => {
  assert.deepEqual(across(graph, 'paid-receipt', 'ArrowLeft', { id: 'receipt', key: 'ArrowUp' })?.from, { id: 'paid', key: 'ArrowDown' });
  assert.deepEqual(across(graph, 'order-wait', 'ArrowRight', { id: 'order', key: 'ArrowDown' })?.from, { id: 'order', key: 'ArrowDown' });
  // Clicked: its source.
  assert.deepEqual(across(graph, 'order-wait', 'ArrowRight')?.from, { id: 'order', key: 'ArrowDown' });
  assert.equal(across(graph, 'wait-paid', 'ArrowRight'), null);
});

test("from a subgraph's box, across a crossing edge: the box's fan, and alone there, the outside end's", () => {
  const g = {
    boxes: nest([sub('pay', 100, 100, 200, 100), node('paid', 100, 100), node('retry', 60, 130),
      node('ship', 60, 260), node('log', 160, 260), node('far', 300, 0)]),
    edges: [
      // The inside edge leaves paid rightmost, so paid's own fan goes on past the box's.
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
  // An edge not among the box's: the box's edges land nothing, so it steps only at its own far end (last there).
  assert.equal(across(g, 'far-log', 'ArrowRight', { id: 'pay', key: 'ArrowDown' }), null);
});

test("a box's half is where you came from against its middle: Down goes in at the top, Up at the bottom", () => {
  // ship (y 20–180, middle 100) holds pack (top left), tape (right, a little lower) and label (bottom left).
  const inner = nest([sub('ship', 100, 100, 200, 160), node('pack', 60, 50), node('tape', 160, 70), node('label', 60, 150),
    node('done', 100, 260), node('paid', 100, -60), node('side', -60, 160)]);
  const into = edge('paid', 'ship', [100, -45], 'D', [100, 20], 'U');
  // A long label hangs its middle below the box's middle; it still meets the box at the top.
  const labelled = { ...edge('far', 'ship', [140, -45], 'D', [140, 20], 'U'), id: 'far-ship', mid: P(140, 150) };
  const g = { boxes: inner, edges: [into, labelled, edge('pack', 'label', [60, 65], 'D', [60, 135], 'U'),
    edge('side', 'ship', [-30, 160], 'R', [0, 160], 'L')] };
  const ship = at('subgraph', 'ship');
  const by = (/** @type {any} */ from) => [{ from, to: ship, key: 'ArrowDown', ctrl: false }];
  // From above: the top. Down → the top row's leftmost; Up is the box's edges.
  assert.equal(half(by(at('edge', 'paid-ship')), g, ship), 'top');
  assert.deepEqual(enter(by(at('edge', 'paid-ship')), g, ship, 'ArrowDown'), at('node', 'pack'));
  assert.equal(enter(by(at('edge', 'paid-ship')), g, ship, 'ArrowUp'), null);
  assert.equal(half(by(at('edge', 'far-ship')), g, ship), 'top');
  // From below: the bottom. Up → the bottom row's rightmost; Down is the box's edges.
  assert.equal(half(by(at('node', 'done')), g, ship), 'bottom');
  assert.deepEqual(enter(by(at('node', 'done')), g, ship, 'ArrowUp'), at('node', 'label'));
  assert.equal(enter(by(at('node', 'done')), g, ship, 'ArrowDown'), null);
  // Climbed out of: by where the inner item lies. An edge inside, by its middle (here level: the top).
  assert.equal(half(by(at('node', 'label')), g, ship), 'bottom');
  assert.equal(half(by(at('node', 'pack')), g, ship), 'top');
  assert.equal(half(by(at('edge', 'pack-label')), g, ship), 'top');
  // An edge into its side, where it meets it: below the middle, the bottom.
  assert.equal(half(by(at('edge', 'side-ship')), g, ship), 'bottom');
  // No move that ended here (a click, a find, O): the top. Left and Right never go in.
  assert.equal(half([], g, ship), 'top');
  assert.deepEqual(enter([], g, ship, 'ArrowDown'), at('node', 'pack'));
  assert.equal(enter([], g, ship, 'ArrowRight'), null);
  // A row is what overlaps the nearest child: forwards from the top, backwards from the bottom.
  const level = nest([sub('row', 100, 100, 200, 100), node('r', 160, 82, 60, 34), node('l', 40, 80), node('under', 100, 300)]);
  const lg = { boxes: level, edges: [] };
  const up = [{ from: at('node', 'under'), to: at('subgraph', 'row'), key: 'ArrowUp', ctrl: false }];
  assert.deepEqual(enter([], lg, at('subgraph', 'row'), 'ArrowDown'), at('node', 'l'));
  // r's bottom is lower by a few pixels, but they are one row: the rightmost, not the lowest.
  assert.deepEqual(enter(up, lg, at('subgraph', 'row'), 'ArrowUp'), at('node', 'r'));
  // Only from the box the last move ended at: a trail that ended elsewhere is no move here, so the top.
  assert.equal(enter(by(at('edge', 'paid-ship')), g, at('node', 'done'), 'ArrowDown'), null);
  assert.equal(half([{ from: at('node', 'done'), to: at('node', 'label'), key: 'ArrowUp', ctrl: false }], g, ship), 'top');
});
