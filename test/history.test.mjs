import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../web/history.mjs';

test('undo walks back through edits, newest first', () => {
  const h = createHistory();
  h.record('v0', 'v1');
  h.record('v1', 'v2');
  assert.deepEqual(h.peek('v2'), { ok: true, text: 'v1' });
  h.pop();
  assert.deepEqual(h.peek('v1'), { ok: true, text: 'v0' });
  h.pop();
  assert.deepEqual(h.peek('v0'), { ok: false, reason: 'empty' });
});

test('an edit recorded into the newest entry is undone together with it', () => {
  const h = createHistory();
  const add = h.record('v0', 'v1');
  h.record('v1', 'v2', add);
  assert.equal(h.size, 1);
  assert.deepEqual(h.peek('v2'), { ok: true, text: 'v0' });
});

test('recording into an entry that is no longer the newest makes a new entry', () => {
  const h = createHistory();
  const add = h.record('v0', 'v1');
  h.record('v1', 'v2');
  h.record('v2', 'v3', add);
  assert.equal(h.size, 3);
  assert.deepEqual(h.peek('v3'), { ok: true, text: 'v2' });
});

test('after an outside change nothing is undone, and the history is cleared', () => {
  const h = createHistory();
  h.record('v0', 'v1');
  h.record('v1', 'v2');
  assert.deepEqual(h.peek('v2 plus an agent edit'), { ok: false, reason: 'changed' });
  assert.equal(h.size, 0);
  assert.deepEqual(h.peek('v1'), { ok: false, reason: 'empty' });
});

test('redo puts back what undo took, and undo can take it again', () => {
  const h = createHistory();
  h.record('v0', 'v1');
  h.pop();
  assert.deepEqual(h.peekRedo('v0'), { ok: true, text: 'v1' });
  h.redone();
  assert.equal(h.redoSize, 0);
  assert.deepEqual(h.peek('v1'), { ok: true, text: 'v0' });
});

test('a new edit after an undo leaves nothing to redo', () => {
  const h = createHistory();
  h.record('v0', 'v1');
  h.pop();
  h.record('v0', 'v2');
  assert.deepEqual(h.peekRedo('v2'), { ok: false, reason: 'empty' });
});

test('after an outside change nothing is redone, and the redo stack is cleared', () => {
  const h = createHistory();
  h.record('v0', 'v1');
  h.record('v1', 'v2');
  h.pop();
  h.pop();
  assert.deepEqual(h.peekRedo('v0 plus an agent edit'), { ok: false, reason: 'changed' });
  assert.equal(h.redoSize, 0);
});
