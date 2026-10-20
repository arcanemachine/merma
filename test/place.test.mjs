import { test } from 'node:test';
import assert from 'node:assert/strict';
import { place } from '../web/place.mjs';

const BOUNDS = { left: 0, top: 0, right: 500, bottom: 400 };
const rect = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });
const SIZE = { width: 100, height: 80 };

test('to the right of the anchor, top aligned, when there is room', () => {
  assert.deepEqual(place(rect(100, 50, 40, 20), SIZE, BOUNDS), { left: 148, top: 50, flipped: false });
});

test('to the left when there is no room on the right', () => {
  assert.deepEqual(place(rect(380, 50, 40, 20), SIZE, BOUNDS), { left: 272, top: 50, flipped: true });
});

test('kept inside when there is room on neither side', () => {
  const p = place(rect(50, 50, 400, 20), SIZE, BOUNDS);
  assert.equal(p.flipped, false);
  assert.equal(p.left, 400);
});

test('pushed up when it would run off the bottom', () => {
  assert.equal(place(rect(100, 380, 40, 20), SIZE, BOUNDS).top, 320);
});

test('at a point, with no gap', () => {
  assert.deepEqual(place(rect(30, 40, 0, 0), SIZE, BOUNDS, { gap: 0 }), { left: 30, top: 40, flipped: false });
});

test('above an anchor, or below it when there is no room above', () => {
  assert.deepEqual(place(rect(100, 300, 60, 30), SIZE, BOUNDS, { side: 'above' }), { left: 100, top: 212, flipped: false });
  assert.deepEqual(place(rect(100, 30, 60, 30), SIZE, BOUNDS, { side: 'above' }), { left: 100, top: 68, flipped: true });
});

test('below an anchor, or above it when there is no room below', () => {
  assert.deepEqual(place(rect(100, 30, 60, 30), SIZE, BOUNDS, { side: 'below' }), { left: 100, top: 68, flipped: false });
  assert.deepEqual(place(rect(100, 340, 60, 30), SIZE, BOUNDS, { side: 'below' }), { left: 100, top: 252, flipped: true });
});

test('a box bigger than the bounds keeps its start edge inside them', () => {
  assert.deepEqual(place(rect(10, 10, 0, 0), { width: 600, height: 500 }, BOUNDS, { gap: 0 }), { left: 0, top: 0, flipped: false });
});
