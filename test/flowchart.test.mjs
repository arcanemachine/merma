// Tests for web/patch/flowchart.mjs.
// Exact cases first, then properties checked for every node of every fixture (node-ids.json holds the ids Mermaid
// itself reported for each fixture). Whether the results parse is checked in the browser, where Mermaid runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addConnected, connect, relabel, freeId, isFlowchart, quoteLabel, nodeIdFromSvgId,
} from '../web/patch/flowchart.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');
const NODE_IDS = JSON.parse(fixture('node-ids.json'));

/** Lines removed from `a` and added in `b`, by a plain longest-common-subsequence diff. */
function lineDiff(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const removed = [], added = [];
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(x[i++]); else added.push(y[j++]);
  }
  removed.push(...x.slice(i));
  added.push(...y.slice(j));
  return { removed, added };
}

// --- exact cases ---------------------------------------------------------------------------------------------

test('addConnected appends an edge to a new node after the node\'s last line', () => {
  const { text, id } = addConnected(fixture('01-basic.mmd'), 'C');
  assert.equal(id, 'n1');
  assert.equal(text, 'flowchart TD\n  A[Start] --> B{OK?}\n  B -->|yes| C[Done]\n  C --> n1["New node"]\n'
    + '  B -->|no| D[Retry]\n  D --> A\n');
});

test('addConnected keeps a node inside its subgraph, with that indentation', () => {
  const { text } = addConnected(fixture('06-subgraphs-classes.mmd'), 'charge');
  assert.match(text, /    charge\[Charge card\] --> record\[Record\]\n    charge --> n1\["New node"\]\n  end\n/);
});

test('addConnected skips ids that appear anywhere, labels included', () => {
  assert.equal(addConnected(fixture('07-tricky-labels.mmd'), 'A').id, 'n2');
});

test('addConnected after a line with no trailing newline keeps the file without one', () => {
  const { text } = addConnected(fixture('09-no-trailing-newline.mmd'), 'B');
  assert.equal(text, 'flowchart TD\n  A[First] --> B[Second]\n  B --> n1["New node"]');
});

test('connect appends a top-level edge after the last line', () => {
  const { text } = connect(fixture('06-subgraphs-classes.mmd'), 'charge', 'archive');
  assert.ok(text.endsWith('  click start "https://example.com" "Open"\n  charge --> archive\n'));
});

test('connect after trailing blank lines puts the edge after the last content and keeps the blanks', () => {
  const { text } = connect('flowchart TD\n  A --> B\n\n\n', 'B', 'A');
  assert.equal(text, 'flowchart TD\n  A --> B\n  B --> A\n\n\n');
});

test('relabel replaces only the label inside the node\'s shape', () => {
  assert.equal(relabel(fixture('01-basic.mmd'), 'B', 'Is it OK?').text,
    'flowchart TD\n  A[Start] --> B{"Is it OK?"}\n  B -->|yes| C[Done]\n  B -->|no| D[Retry]\n  D --> A\n');
});

test('relabel keeps every shape', () => {
  const src = fixture('05-chains-shapes.mmd');
  const expected = {
    A: 'A["X"]', B: 'B(("X"))', C: 'C{{"X"}}', D: 'D[/"X"/]', E: 'E[\\"X"\\]', F: 'F>"X"]', G: 'G[["X"]]',
    H: 'H(["X"])', I: 'I((("X")))', J: 'J[/"X"\\]', K: 'K[\\"X"/]',
  };
  for (const [id, want] of Object.entries(expected)) assert.ok(relabel(src, id, 'X').text.includes(want), id);
});

test('relabel of a bare node adds brackets at its first appearance only', () => {
  assert.equal(relabel(fixture('02-graph-header-bare.mmd'), 'B', 'Bee').text,
    'graph LR\n    A --> B["Bee"]\n    B --> C\n    C --> A\n');
});

test('relabel of a node first named in a style line labels it in its first edge', () => {
  const src = 'flowchart TD\n  style A fill:#eef\n  A --> B\n';
  assert.equal(relabel(src, 'A', 'Ay').text, 'flowchart TD\n  style A fill:#eef\n  A["Ay"] --> B\n');
});

test('relabel with the @{ } syntax changes or adds the label key', () => {
  const src = fixture('08-new-shape-syntax.mmd');
  assert.ok(relabel(src, 'A', 'Changed').text.includes('A@{ shape: rect, label: "Changed" }'));
  assert.ok(relabel(src, 'B', 'Added').text.includes('B@{ label: "Added", shape: circle }'));
});

test('relabel escapes characters that would break the label', () => {
  assert.equal(quoteLabel('Say "hi" #1 <b> & [x]; |p|'), '"Say #quot;hi#quot; #35;1 #lt;b#gt; #amp; [x]; |p|"');
  assert.equal(quoteLabel('two\nlines'), '"two lines"');
});

test('a label word that matches an id is not taken for the node', () => {
  // D's label says "n1 is not a node"; the edge label holds a pipe inside quotes.
  const src = fixture('07-tricky-labels.mmd');
  assert.equal(relabel(src, 'D', 'Dee').text, src.replace('D["n1 is not a node"]', 'D["Dee"]'));
});

test('edits refuse unknown nodes and odd ids', () => {
  assert.throws(() => addConnected(fixture('01-basic.mmd'), 'Z'), /not in the file/);
  assert.throws(() => connect(fixture('01-basic.mmd'), 'A', 'Z'), /not in the file/);
  assert.throws(() => relabel(fixture('01-basic.mmd'), 'A B', 'x'), /Not a node id/);
});

test('isFlowchart sees through frontmatter, directives and comments', () => {
  for (const name of Object.keys(NODE_IDS)) assert.ok(isFlowchart(fixture(name)), name);
  assert.equal(isFlowchart(fixture('90-sequence.mmd')), false);
});

test('freeId', () => {
  assert.equal(freeId('flowchart TD\n  n1 --> n2\n  n10\n'), 'n3');
});

test('nodeIdFromSvgId', () => {
  assert.equal(nodeIdFromSvgId('d3-flowchart-charge-12', 'd3'), 'charge');
  assert.equal(nodeIdFromSvgId('d3-flowchart-a-b-2', 'd3'), 'a-b');
  assert.equal(nodeIdFromSvgId('d3-L_A_B_0', 'd3'), null);
});

// --- properties over every node of every fixture -------------------------------------------------------------

for (const [name, ids] of Object.entries(NODE_IDS)) {
  const src = fixture(name);
  for (const id of ids) {
    test(`${name} ${id}: add inserts exactly one line`, () => {
      const { text, id: newId } = addConnected(src, id);
      const d = lineDiff(src, text);
      assert.deepEqual(d.removed, [], 'nothing removed');
      assert.equal(d.added.length, 1);
      assert.equal(d.added[0].trim(), `${id} --> ${newId}["New node"]`);
    });

    test(`${name} ${id}: connect inserts exactly one line`, () => {
      const other = ids.find((x) => x !== id);
      const { text } = connect(src, id, other);
      const d = lineDiff(src, text);
      assert.deepEqual(d.removed, []);
      assert.deepEqual(d.added.map((l) => l.trim()), [`${id} --> ${other}`]);
    });

    test(`${name} ${id}: relabel changes one line, and only just after the node id`, () => {
      const { text } = relabel(src, id, 'Renamed');
      const d = lineDiff(src, text);
      assert.equal(d.removed.length, 1);
      assert.equal(d.added.length, 1);
      const [old, now] = [d.removed[0], d.added[0]];
      // Nothing before the node changed: the new line starts with the old one up to the end of some mention of the id.
      const idEnds = [...old.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${id}(?![\\p{L}\\p{N}_])`, 'gu'))]
        .map((m) => m.index + id.length);
      assert.ok(idEnds.some((end) => now.startsWith(old.slice(0, end))), `changed before ${id}: ${old} -> ${now}`);
      assert.ok(now.includes('"Renamed"'), now);
    });
  }
}
