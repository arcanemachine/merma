import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frame } from '../web/frame.mjs';

const AREA = { width: 1000, height: 608, top: 8 };   // 600 high below the top padding
const PAD = 24;
const box = (/** @type {number} */ left, /** @type {number} */ top, /** @type {number} */ w, /** @type {number} */ h) => ({ left, top, right: left + w, bottom: top + h });
/** Where a stage point lands on screen in a view. */
const at = (/** @type {{ x: number, y: number, k: number }} */ v, /** @type {number} */ x, /** @type {number} */ y) => ({ x: v.x + x * v.k, y: v.y + y * v.k });

test('boxes that fit at the zoom the view has are centered, at that zoom', () => {
  const v = /** @type {NonNullable<ReturnType<typeof frame>>} */ (frame([box(100, 100, 50, 20), box(300, 400, 50, 20)], AREA, PAD, 1));
  assert.equal(v.k, 1);
  // The boxes span 100..350 across and 100..420 down: their middle goes to the middle of the area below the padding.
  assert.deepEqual(at(v, 225, 260), { x: 500, y: 308 });
});

test('boxes too far apart zoom out just enough to fit, the margin kept', () => {
  const v = /** @type {NonNullable<ReturnType<typeof frame>>} */ (frame([box(0, 0, 10, 10), box(1990, 290, 10, 10)], AREA, PAD, 1));
  assert.equal(v.k, (1000 - 2 * PAD) / 2000);
  assert.equal(at(v, 0, 0).x, PAD);
  assert.equal(at(v, 2000, 0).x, 1000 - PAD);
});

test('the top padding is kept clear: a frame of boxes too tall fits below it', () => {
  const v = /** @type {NonNullable<ReturnType<typeof frame>>} */ (frame([box(0, 0, 10, 10), box(0, 1190, 10, 10)], AREA, PAD, 1));
  assert.equal(v.k, (600 - 2 * PAD) / 1200);
  assert.equal(at(v, 0, 0).y, 8 + PAD);
  assert.equal(at(v, 0, 1200).y, 608 - PAD);
});

test('never zooms in: boxes that would fit larger keep the zoom the view has', () => {
  assert.equal(frame([box(0, 0, 10, 10), box(40, 40, 10, 10)], AREA, PAD, 0.5)?.k, 0.5);
});

test('one box is centered', () => {
  const v = /** @type {NonNullable<ReturnType<typeof frame>>} */ (frame([box(700, 900, 40, 20)], AREA, PAD, 2));
  assert.equal(v.k, 2);
  assert.deepEqual(at(v, 720, 910), { x: 500, y: 308 });
});

test('no boxes, no frame', () => {
  assert.equal(frame([], AREA, PAD, 1), null);
});
