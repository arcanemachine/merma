import { test } from 'node:test';
import assert from 'node:assert/strict';
import { axis, defaultDock, panelSize, resolveDock } from '../web/dock.mjs';

test('Default docks left on a wide main and at the bottom on a tall one', () => {
  assert.equal(defaultDock(1200, 700), 'left');
  assert.equal(defaultDock(390, 700), 'bottom');
});

test('a square main counts as tall: the bottom', () => {
  assert.equal(defaultDock(600, 600), 'bottom');
});

test('a chosen dock holds whatever main\'s shape', () => {
  assert.equal(resolveDock('top', 1200, 700), 'top');
  assert.equal(resolveDock('left', 390, 700), 'left');
  assert.equal(resolveDock('default', 390, 700), 'bottom');
});

test('a left dock divides the width, top and bottom the height', () => {
  assert.deepEqual(['left', 'top', 'bottom'].map((d) => axis(/** @type {any} */ (d))), ['x', 'y', 'y']);
});

test('with no size set, the panel takes a third', () => {
  assert.equal(panelSize(null, 1200), 400);
});

test('a size set is kept when it fits', () => {
  assert.equal(panelSize(500, 1200), 500);
});

test('never under the minimum while the diagram keeps its share', () => {
  assert.equal(panelSize(40, 1200), 160);
});

test('the diagram keeps 40%: a size past it is cut to 60% of main', () => {
  assert.equal(panelSize(1000, 1200), 720);
});

test('where the minimum and the diagram\'s share clash, the diagram wins', () => {
  assert.equal(panelSize(40, 200), 120);
});
