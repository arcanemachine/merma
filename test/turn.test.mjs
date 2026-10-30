// Rotate and flip (web/turn.mjs): the directions the page draws a flowchart with, the file untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDir, turnDir, turnText } from '../web/turn.mjs';

const R = { rotate: true, flip: false }, F = { rotate: false, flip: true }, RF = { rotate: true, flip: true };

test('rotate turns top-down sideways and back, keeping which way it reads; flip reverses it', () => {
  assert.deepEqual(['TB', 'TD', 'BT', 'LR', 'RL'].map((d) => turnDir(d, R)), ['LR', 'LR', 'RL', 'TB', 'BT']);
  assert.deepEqual(['TB', 'TD', 'BT', 'LR', 'RL'].map((d) => turnDir(d, F)), ['BT', 'BT', 'TB', 'RL', 'LR']);
  assert.equal(turnDir('TD', RF), 'RL');
});

test('turnText swaps the header and every subgraph direction in place, and leaves the rest as it was', () => {
  const src = '---\ntitle: T\n---\n%% c\nflowchart TD\n  subgraph s\n    direction LR\n    a --> b\n  end\n  x --> s\n';
  const out = turnText(src, R);
  assert.equal(out, src.replace('flowchart TD', 'flowchart LR').replace('direction LR', 'direction TB'));
  assert.equal(out.length, src.length);
  assert.equal(turnText(src, { rotate: false, flip: false }), src);
});

test('turnText gives a header with no direction one, the default turned', () => {
  assert.equal(turnText('flowchart\n  a --> b\n', R), 'flowchart LR\n  a --> b\n');
  assert.equal(turnText('graph\n  a --> b\n', F), 'graph BT\n  a --> b\n');
});

test('turnText leaves what is not a flowchart alone; baseDir reads the file\'s own direction', () => {
  assert.equal(turnText('sequenceDiagram\n  a->>b: hi\n', R), 'sequenceDiagram\n  a->>b: hi\n');
  assert.equal(baseDir('flowchart LR\n  a --> b\n'), 'LR');
  assert.equal(baseDir('graph\n  a --> b\n'), 'TB');
});
