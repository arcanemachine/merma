import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hide, mode, NONE, show } from '../web/notices.mjs';

const PICK = 'Pick the node or subgraph to connect to. Press Escape or click away to cancel.';

test('with no mode, a notice shows alone, and hiding it leaves nothing', () => {
  const { state } = show(NONE, 'Nothing to undo.', 'info');
  assert.deepEqual(state, { base: null, top: { text: 'Nothing to undo.', kind: 'info' } });
  assert.deepEqual(hide(state), { state: NONE, shown: true });
});

test("a refusal in a mode shows over the mode's notice, which stays", () => {
  const { state } = show(mode(PICK).state, 'An edge cannot be connected to.', 'warning');
  assert.deepEqual(state.base, { text: PICK, kind: 'info' });
  assert.deepEqual(state.top, { text: 'An edge cannot be connected to.', kind: 'warning' });
});

test("hiding takes the overlay only; with none, the mode's notice stays and nothing was shown", () => {
  const base = mode(PICK).state;
  const over = show(base, 'An edge cannot be connected to.', 'warning').state;
  assert.deepEqual(hide(over), { state: base, shown: true });
  assert.deepEqual(hide(base), { state: base, shown: false });
});

test('one overlay at most: a second replaces the first, and the same one again is heard again', () => {
  const base = mode(PICK).state;
  const first = show(base, 'An edge cannot be connected to.', 'warning');
  const second = show(first.state, 'The title cannot be picked.', 'warning');
  assert.deepEqual(second.state.top, { text: 'The title cannot be picked.', kind: 'warning' });
  assert.equal(second.state.base, base.base);
  assert.deepEqual(show(first.state, 'An edge cannot be connected to.', 'warning').speak,
    { region: 'status', text: 'An edge cannot be connected to.' });
});

test('an error is heard at once, anything else when the reader is free; hiding says nothing', () => {
  assert.equal(show(NONE, 'Not saved: x', 'error').speak?.region, 'alert');
  assert.equal(show(NONE, 'x', 'warning').speak?.region, 'status');
  assert.equal(show(NONE, 'x', 'info').speak?.region, 'status');
  assert.deepEqual(mode(PICK).speak, { region: 'status', text: PICK });
  assert.equal('speak' in hide(show(NONE, 'x', 'error').state), false);
});

test('ending a mode leaves nothing, its overlay included; starting one shows its notice only', () => {
  assert.deepEqual(mode(null), { state: NONE, speak: null });
  assert.deepEqual(mode(PICK).state, { base: { text: PICK, kind: 'info' }, top: null });
});
