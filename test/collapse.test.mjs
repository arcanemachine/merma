import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawnAs, drawnEdges, isCollapsed, prune, setView, viewText } from '../web/collapse.mjs';

/** @typedef {import('../web/collapse.mjs').SubgraphInfo} SubgraphInfo */

// outer [Outer] { inner [Inner] { b, c }, d }, "Order log" { f }, as Mermaid's db reads them.
/** @returns {SubgraphInfo[]} */
const subs = (outer = 'expanded') => [
  { id: 'inner', title: 'Inner', members: ['c', 'b'], view: 'expanded' },
  { id: 'outer', title: 'Outer', members: ['inner', 'd'], view: /** @type {'collapsed' | 'expanded'} */ (outer) },
  { id: 'subGraph2', title: 'Order log', members: ['f'], view: 'expanded' },
];
const none = () => /** @type {import('../web/collapse.mjs').Overrides} */ (new Map());

test('a subgraph is collapsed by the page\'s view, else the file\'s', () => {
  assert.equal(isCollapsed('outer', subs('collapsed'), none()), true);
  assert.equal(isCollapsed('outer', subs('collapsed'), setView(none(), subs('collapsed'), 'outer', 'expanded')), false);
  assert.equal(isCollapsed('inner', subs(), setView(none(), subs(), 'inner', 'collapsed')), true);
});

test('a view the file already has is no override', () => {
  assert.equal(setView(none(), subs('collapsed'), 'outer', 'collapsed').size, 0);
  const o = setView(none(), subs(), 'inner', 'collapsed');
  assert.equal(setView(o, subs(), 'inner', 'expanded').size, 0, 'expanding again forgets it');
});

test('the page\'s lines go after the file\'s last byte, on a line of their own', () => {
  const text = 'flowchart TD\n  a --> b\n%% last';
  const o = setView(none(), subs(), 'inner', 'collapsed');
  const out = viewText(text, o, subs());
  assert.ok(out.startsWith(text), 'every offset in the file holds');
  assert.equal(out.slice(text.length), '\ninner@{ view: collapsed }\n');
  assert.equal(viewText(text, none(), subs()), text, 'nothing to add: the file as it is');
});

test('a subgraph no longer in the file is dropped, so no stray node is drawn for it', () => {
  const o = setView(none(), subs(), 'inner', 'collapsed');
  const gone = subs().filter((s) => s.id !== 'inner');
  assert.equal(prune(o, gone).size, 0);
  assert.equal(viewText('flowchart TD', o, gone), 'flowchart TD');
});

test('an id-less subgraph\'s view is dropped when its generated id now names another title', () => {
  const o = setView(none(), subs(), 'subGraph2', 'collapsed');
  assert.equal(o.get('subGraph2')?.title, 'Order log');
  assert.equal(prune(o, subs()).size, 1);
  const shifted = subs().map((s) => (s.id === 'subGraph2' ? { ...s, title: 'Archive' } : s));
  assert.equal(prune(o, shifted).size, 0);
  assert.equal(setView(none(), subs(), 'inner', 'collapsed').get('inner')?.title, null, 'a written id needs no title');
});

test('collapsed in the file, expanded in the page: an agent\'s edit elsewhere keeps it expanded', () => {
  const o = setView(none(), subs('collapsed'), 'outer', 'expanded');
  assert.equal(prune(o, subs('collapsed')).size, 1);
  assert.equal(isCollapsed('outer', subs('collapsed'), prune(o, subs('collapsed'))), false);
  assert.equal(prune(o, subs('expanded')).size, 0, 'the file expanding it too leaves nothing to override');
});

test('a hidden item is drawn as the outermost collapsed subgraph holding it', () => {
  const inner = setView(none(), subs(), 'inner', 'collapsed');
  assert.equal(drawnAs('b', subs(), inner), 'inner');
  assert.equal(drawnAs('inner', subs(), inner), 'inner', 'a collapsed box is drawn as itself');
  assert.equal(drawnAs('d', subs(), inner), 'd');
  const both = setView(inner, subs(), 'outer', 'collapsed');
  assert.equal(drawnAs('b', subs(), both), 'outer');
  assert.equal(drawnAs('inner', subs(), both), 'outer');
  assert.equal(drawnAs('f', subs(), both), 'f');
});

// Each case as Mermaid 12.2.0 drew it in the browser.
test('edges inside a collapsed box are not drawn; edges to its contents are, to the box', () => {
  const s = [
    { id: 'inner', title: 'inner', members: ['c', 'b'], view: /** @type {const} */ ('collapsed') },
    { id: 'other', title: 'other', members: ['g'], view: /** @type {const} */ ('expanded') },
  ];
  const e = (/** @type {string} */ from, /** @type {string} */ to) => ({ from, to });
  const drawn = (/** @type {{ from: string, to: string }[]} */ list, o = none()) =>
    drawnEdges(list, s, o).map((x) => `${x.from}-${x.to}`);
  assert.deepEqual(drawn([e('a', 'b'), e('b', 'c'), e('c', 'e')]), ['a-b', 'c-e'], 'inner edge dropped, the others kept');
  assert.deepEqual(drawn([e('x', 'inner'), e('x', 'b')]), ['x-inner', 'x-b'], 'to the box and into it, both drawn');
  assert.deepEqual(drawn([e('b', 'inner'), e('a', 'b')]), ['a-b'], 'from its contents to itself: dropped');
  assert.deepEqual(drawn([e('inner', 'inner'), e('b', 'b')]), ['inner-inner'], 'its own self-loop kept, a hidden one not');
  assert.deepEqual(drawn([e('b', 'g')], setView(none(), s, 'other', 'collapsed')), ['b-g'], 'box to box, drawn');
  assert.deepEqual(drawn([e('b', 'c')], setView(none(), s, 'inner', 'expanded')), ['b-c'], 'expanded: all drawn');
});
