import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byPlace, edgeStep, nearest, step } from '../web/navigate.mjs';
import { direction } from '../web/patch/flowchart.mjs';

// A top-down diagram, as drawn:
//          start
//        /       \
//     check     charge
//        \       /
//         record
//           |
//          done
const box = (/** @type {string} */ id, /** @type {number} */ x, /** @type {number} */ y) => ({ id, x, y, w: 60, h: 30 });
const boxes = [box('start', 100, 0), box('check', 50, 100), box('charge', 150, 100), box('record', 100, 200), box('done', 100, 300)];
const links = [
  { from: 'start', to: 'charge' }, { from: 'start', to: 'check' },
  { from: 'check', to: 'record' }, { from: 'charge', to: 'record' }, { from: 'record', to: 'done' },
];
const td = { boxes, links, direction: /** @type {const} */ ('TB') };

/** Run `keys` from `at`, carrying the trail; the ids visited, with null where a key went nowhere. */
function run(/** @type {any} */ graph, /** @type {string} */ at, /** @type {string[]} */ keys) {
  let trail = null, here = at;
  const seen = [];
  for (const key of keys) {
    const next = step(graph, here, key, trail);
    seen.push(next?.id ?? null);
    if (next) { here = next.id; trail = next.trail; }
  }
  return seen;
}

test('Down goes to the leftmost node this one points to, whatever the file order', () => {
  assert.deepEqual(run(td, 'start', ['ArrowDown']), ['check']);
});

test('Left and Right step through the nodes the same parent points to, in screen order, without wrapping', () => {
  assert.deepEqual(run(td, 'start', ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']),
    ['check', 'charge', null, 'check', null]);
});

test('Up goes back to the node the run came from, not the leftmost parent', () => {
  assert.deepEqual(run(td, 'start', ['ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowUp']), ['check', 'charge', 'record', 'charge']);
});

test('Up with no run to go back along goes to the leftmost parent', () => {
  assert.deepEqual(run(td, 'record', ['ArrowUp']), ['check']);
});

test('at a merge, Up picks a parent and Left and Right step through the parents', () => {
  assert.deepEqual(run(td, 'record', ['ArrowUp', 'ArrowRight', 'ArrowRight']), ['check', 'charge', null]);
  // Parents that are not siblings of each other: still the parents.
  const graph = { ...td, boxes: [...boxes, box('side', 200, 200)], links: [...links, { from: 'side', to: 'done' }] };
  assert.deepEqual(run(graph, 'done', ['ArrowUp', 'ArrowRight']), ['record', 'side']);
});

test('Up keeps going back along the run', () => {
  assert.deepEqual(run(td, 'start', ['ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp']),
    ['check', 'charge', 'record', 'done', 'record', 'charge', 'start']);
});

test('nowhere to go is null: Down from the last node, Up from the first', () => {
  assert.deepEqual(run(td, 'done', ['ArrowDown']), [null]);
  assert.deepEqual(run(td, 'start', ['ArrowUp']), [null]);
});

test('Left and Right on a node nothing points to step through the others like it', () => {
  const graph = { ...td, boxes: [...boxes, box('lone', 300, 0)] };
  assert.deepEqual(run(graph, 'start', ['ArrowRight', 'ArrowLeft']), ['lone', 'start']);
});

test('edges to what is not drawn as a node, and self-loops, are left out', () => {
  const graph = { ...td, links: [...links, { from: 'done', to: 'pay' }, { from: 'done', to: 'done' }] };
  assert.deepEqual(run(graph, 'done', ['ArrowDown']), [null]);
});

test('the arrows turn with the direction', () => {
  // The same diagram laid out left to right: x and y swapped.
  // Siblings go top to bottom, even where x would order them the other way.
  const lr = { links, direction: /** @type {const} */ ('LR'), boxes: boxes.map((b) => box(b.id, b.y + (b.id === 'check' ? 9 : 0), b.x)) };
  assert.deepEqual(run(lr, 'start', ['ArrowRight', 'ArrowDown', 'ArrowLeft']), ['check', 'charge', 'start']);
  assert.deepEqual(run(lr, 'start', ['ArrowDown']), [null]);
  // Bottom to top: drawn upside down, Up goes forward.
  const bt = { links, direction: /** @type {const} */ ('BT'), boxes: boxes.map((b) => box(b.id, b.x, -b.y)) };
  assert.deepEqual(run(bt, 'start', ['ArrowUp', 'ArrowRight', 'ArrowDown']), ['check', 'charge', 'start']);
  const rl = { links, direction: /** @type {const} */ ('RL'), boxes: boxes.map((b) => box(b.id, -b.y, b.x)) };
  assert.deepEqual(run(rl, 'start', ['ArrowLeft', 'ArrowRight']), ['check', 'start']);
});

test('nearest finds the node whose middle is closest, and null with none', () => {
  assert.equal(nearest(boxes, 140, 110), 'charge');
  assert.equal(nearest([], 0, 0), null);
});

test('direction reads the header, TD being TB, and defaults to TB', () => {
  assert.equal(direction('flowchart LR\n  A --> B'), 'LR');
  assert.equal(direction('---\ntitle: x\n---\n%% note\ngraph td\n  A'), 'TB');
  assert.equal(direction('flowchart RL'), 'RL');
  assert.equal(direction('flowchart BT'), 'BT');
  assert.equal(direction('flowchart\n  A --> B'), 'TB');
});

test('byPlace goes to the nearest node within 45° of the arrow, connected or not', () => {
  // check and charge are not connected to each other.
  assert.equal(byPlace(boxes, 'check', 'ArrowRight'), 'charge');
  assert.equal(byPlace(boxes, 'charge', 'ArrowLeft'), 'check');
  // record is straight above done, start further up.
  assert.equal(byPlace(boxes, 'done', 'ArrowUp'), 'record');
  // From check, record is down and to the right at 63° from Right: Down takes it, Right does not.
  assert.equal(byPlace(boxes, 'check', 'ArrowDown'), 'record');
  assert.equal(byPlace(boxes, 'record', 'ArrowRight'), null);
});

test('byPlace finds nothing past the edge, and does not wrap', () => {
  assert.equal(byPlace(boxes, 'start', 'ArrowUp'), null);
  assert.equal(byPlace(boxes, 'done', 'ArrowDown'), null);
});

// The same diagram's edges, by made-up SVG ids.
const edgeList = links.map((l) => ({ id: `${l.from}-${l.to}`, from: l.from, to: l.to }));
const tdEdges = { boxes, edges: edgeList, direction: /** @type {const} */ ('TB') };
const node = (/** @type {string} */ id) => ({ kind: /** @type {const} */ ('node'), id });
const edge = (/** @type {string} */ id) => ({ kind: /** @type {const} */ ('edge'), id });

test('from a node, forward selects its leftmost outgoing edge, and back its leftmost incoming one', () => {
  assert.equal(edgeStep(tdEdges, node('start'), 'ArrowDown', null)?.id, 'start-check');
  assert.equal(edgeStep(tdEdges, node('record'), 'ArrowUp', null)?.id, 'check-record');
  // By screen, not file order.
  assert.equal(edgeStep({ ...tdEdges, edges: [...edgeList].reverse() }, node('record'), 'ArrowUp', null)?.id, 'check-record');
  assert.equal(edgeStep(tdEdges, node('done'), 'ArrowDown', null), null);
  assert.equal(edgeStep(tdEdges, node('start'), 'ArrowRight', null), null);
});

test('from an edge, forward and back go to its ends', () => {
  assert.deepEqual(edgeStep(tdEdges, edge('start-charge'), 'ArrowDown', null), { kind: 'node', id: 'charge', group: [] });
  assert.deepEqual(edgeStep(tdEdges, edge('start-charge'), 'ArrowUp', null), { kind: 'node', id: 'start', group: [] });
});

test('the cross arrows step through the edges an edge was reached among, without wrapping', () => {
  // Reached going back from record: its incoming edges.
  const up = edgeStep(tdEdges, node('record'), 'ArrowUp', null);
  const right = edgeStep(tdEdges, edge('check-record'), 'ArrowRight', up?.group ?? null);
  assert.equal(right?.id, 'charge-record');
  assert.equal(edgeStep(tdEdges, edge('charge-record'), 'ArrowRight', right?.group ?? null), null);
  // With no group, the edges leaving the same node.
  assert.equal(edgeStep(tdEdges, edge('start-check'), 'ArrowRight', null)?.id, 'start-charge');
});

test('edges turn with the direction too', () => {
  const lr = { edges: edgeList, direction: /** @type {const} */ ('LR'), boxes: boxes.map((b) => box(b.id, b.y, b.x)) };
  assert.equal(edgeStep(lr, node('start'), 'ArrowRight', null)?.id, 'start-check');
  assert.equal(edgeStep(lr, edge('start-check'), 'ArrowDown', null)?.id, 'start-charge');
  assert.equal(edgeStep(lr, edge('start-check'), 'ArrowRight', null)?.id, 'check');
});
