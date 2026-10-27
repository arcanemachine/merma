import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLINKS, BLINK_HALF, createBlink } from '../web/blink.mjs';

const phases = (/** @type {ReturnType<typeof createBlink>} */ b, /** @type {number} */ from) =>
  Array.from({ length: 2 * BLINKS + 2 }, (_, k) => b.phase(from + (k + 0.5) * BLINK_HALF));

test('a new current match blinks on and off a third of a second each, seven times, then stays on', () => {
  const b = createBlink();
  b.show('node:A', 1000, false);
  assert.deepEqual(phases(b, 1000), [
    'on', 'off', 'on', 'off', 'on', 'off', 'on', 'off', 'on', 'off', 'on', 'off', 'on', 'off', 'steady', 'steady',
  ]);
  assert.ok(2 * BLINKS * BLINK_HALF <= 5000, 'stops within WCAG 2.2.2\'s 5 s');
});

test('the same current match keeps its phase; a different one starts again', () => {
  const b = createBlink();
  b.show('node:A', 0, false);
  b.show('node:A', 1.5 * BLINK_HALF, false);
  assert.equal(b.phase(1.5 * BLINK_HALF), 'off');
  b.show('edge:L_A_B_0', 1.5 * BLINK_HALF, false);
  assert.equal(b.phase(1.5 * BLINK_HALF), 'on');
  assert.equal(b.phase(2.6 * BLINK_HALF), 'off');
});

test('again starts the same current match afresh', () => {
  const b = createBlink();
  b.show('node:A', 0, false);
  b.show('node:A', 20 * BLINK_HALF, false, true);
  assert.equal(b.phase(21.5 * BLINK_HALF), 'off');
});

test('under reduced motion, and with no match, it never blinks', () => {
  const b = createBlink();
  b.show('node:A', 0, true);
  assert.ok(phases(b, 0).every((p) => p === 'steady'));
  b.show(null, 0, false);
  assert.ok(phases(b, 0).every((p) => p === 'steady'));
});

test('next says when the phase changes, and nothing once steady', () => {
  const b = createBlink();
  b.show('node:A', 0, false);
  assert.equal(Math.round(b.next(100) ?? -1), Math.round(BLINK_HALF - 100));
  assert.equal(b.phase(100 + (b.next(100) ?? 0) + 1), 'off');
  assert.equal(b.next(2 * BLINKS * BLINK_HALF + 1), null);
});
