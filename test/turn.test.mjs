// Rotate and flip (web/turn.mjs): the directions the page draws a flowchart with, the file untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDir, subgraphDir, turnable, turnDir, turnText } from '../web/turn.mjs';

const R = { rotate: true, flip: false }, F = { rotate: false, flip: true }, RF = { rotate: true, flip: true };
const NONE = { rotate: false, flip: false };

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
  assert.equal(turnText(src, NONE), src);
});

test('turnText gives a header with no direction one, the default turned', () => {
  assert.equal(turnText('flowchart\n  a --> b\n', R), 'flowchart LR\n  a --> b\n');
  assert.equal(turnText('graph\n  a --> b\n', F), 'graph BT\n  a --> b\n');
});

test('a subgraph turned on its own: its own line turned on top of the whole turn, or a line of its own', () => {
  const src = 'flowchart TD\n  subgraph s\n    direction LR\n    a --> b\n  end\n  subgraph t\n    c --> d\n  end\n';
  assert.equal(turnText(src, NONE, new Map([['s', F]])), src.replace('direction LR', 'direction RL'));
  // The whole diagram rotated (s: LR → TB), then s flipped on its own: BT.
  assert.equal(turnText(src, R, new Map([['s', F]])),
    src.replace('flowchart TD', 'flowchart LR').replace('direction LR', 'direction BT'));
  // t has no line: it takes the diagram's (TD), rotated on its own to LR, on a line of its own at its contents' indent.
  assert.equal(turnText(src, NONE, new Map([['t', R]])), src.replace('subgraph t\n', 'subgraph t\n    direction LR\n'));
  // Inside a rotated diagram, t takes LR; rotated on its own as well, it goes back to TB.
  assert.equal(turnText(src, R, new Map([['t', R]])),
    src.replace('flowchart TD', 'flowchart LR').replace('direction LR', 'direction TB').replace('subgraph t\n', 'subgraph t\n    direction TB\n'));
});

test('a nested subgraph with no line takes what the subgraph around it is drawn with', () => {
  const src = 'flowchart TD\n  subgraph s\n    direction LR\n    subgraph u\n      e --> f\n    end\n  end\n';
  assert.equal(turnText(src, NONE, new Map([['u', F]])), src.replace('subgraph u\n', 'subgraph u\n      direction RL\n'));
});

test('turnText leaves what is not a flowchart alone; baseDir and subgraphDir read the file\'s own directions', () => {
  assert.equal(turnText('sequenceDiagram\n  a->>b: hi\n', R), 'sequenceDiagram\n  a->>b: hi\n');
  assert.equal(baseDir('flowchart LR\n  a --> b\n'), 'LR');
  assert.equal(baseDir('graph\n  a --> b\n'), 'TB');
  assert.equal(subgraphDir('flowchart TD\n  subgraph s\n    direction RL\n    a\n  end\n', 's'), 'RL');
  assert.equal(subgraphDir('flowchart TD\n  subgraph s\n    a\n  end\n', 's'), null);
});

test('turnable: only a subgraph none of whose nodes links out, nor its direct nodes into one inside it (as Mermaid draws)', () => {
  const subs = [{ id: 's', members: ['a', 'b', 't'] }, { id: 't', members: ['c', 'd'] }];
  const yes = (edges) => turnable('s', subs, edges);
  assert.equal(yes([{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }]), true);
  assert.equal(yes([{ from: 'a', to: 'b' }, { from: 'b', to: 'x' }]), false, 'a node out');
  assert.equal(yes([{ from: 'x', to: 'a' }]), false, 'a node in');
  assert.equal(yes([{ from: 'x', to: 's' }, { from: 's', to: 'x' }]), true, 'edges to its box do not count');
  assert.equal(yes([{ from: 'b', to: 'c' }]), false, 'into a subgraph inside it');
  assert.equal(yes([{ from: 'd', to: 'x' }]), false, 'a node inside it, deeper, out');
  assert.equal(turnable('t', subs, [{ from: 'c', to: 'd' }, { from: 'a', to: 'b' }]), true);
  assert.equal(turnable('t', subs, [{ from: 'b', to: 'c' }]), false);
  assert.equal(turnable('nope', subs, []), false);
});
