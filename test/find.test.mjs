import { test } from 'node:test';
import assert from 'node:assert/strict';
import { find } from '../web/find.mjs';

const item = (/** @type {string} */ id, /** @type {string} */ text, x = 0, y = 0) => ({ kind: /** @type {const} */ ('node'), id, text, x, y });
const ids = (/** @type {{ id: string }[]} */ list) => list.map((i) => i.id);

test('find ignores case and runs of spaces', () => {
  assert.deepEqual(ids(find([item('a', 'Take  Order'), item('b', 'Pack')], 'take order')), ['a']);
});

test('find ranks the whole text, then a start, then a word start, then anywhere', () => {
  const items = [item('any', 'Unpaid', 0, 0), item('word', 'Not paid', 0, 1), item('start', 'Paid twice', 0, 2), item('whole', 'Paid', 0, 3)];
  assert.deepEqual(ids(find(items, 'paid')), ['whole', 'start', 'word', 'any']);
});

test('within a rank, top to bottom, then left to right', () => {
  const items = [item('low', 'Send', 0, 50), item('right', 'Send', 20, 10), item('left', 'Send', 10, 10)];
  assert.deepEqual(ids(find(items, 'send')), ['left', 'right', 'low']);
});

test('an empty or blank query finds nothing, and so does no match', () => {
  assert.deepEqual(find([item('a', 'Pack')], ''), []);
  assert.deepEqual(find([item('a', 'Pack')], '   '), []);
  assert.deepEqual(find([item('a', 'Pack')], 'ship'), []);
});
