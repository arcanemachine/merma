// Tests for web/patch/flowchart.mjs.
// Exact cases first, then properties checked for every node and edge of every fixture (node-ids.json and
// edge-ids.json hold the ids Mermaid itself reported for each fixture: checks/README.md). Whether the results parse
// is checked in the browser, where Mermaid runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addConnected, addNode, connect, relabel, freeId, isFlowchart, quoteLabel, nodeIdFromSvgId, subgraphIdFromSvgId, edges,
  edgeBySvgId, deleteEdge, deleteNode,
} from '../web/patch/flowchart.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');
const NODE_IDS = JSON.parse(fixture('node-ids.json'));
const EDGE_IDS = JSON.parse(fixture('edge-ids.json'));

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

test('addConnected on a top-level node appends one line, the edge and the new node, at the end', () => {
  const { text, id } = addConnected(fixture('01-basic.mmd'), 'C');
  assert.equal(id, 'n1');
  assert.equal(text, fixture('01-basic.mmd') + '  C --> n1["New node"]\n');
});

test('addConnected inside a subgraph declares the node there and appends the edge at the end', () => {
  const src = fixture('06-subgraphs-classes.mmd');
  const { text } = addConnected(src, 'charge');
  assert.ok(text.includes('    charge[Charge card] --> record[Record]\n    n1["New node"]\n  end\n'), text);
  assert.ok(text.endsWith('  click start "https://example.com" "Open"\n  charge --> n1\n'), text);
});

test('no added edge comes before an existing one, so linkStyle keeps styling the same edges', () => {
  const src = fixture('10-linkstyle-subgraph.mmd');
  for (const id of ['A', 'C', 'D']) {
    const { text } = addConnected(src, id);
    const before = src.split('\n'), after = text.split('\n');
    // Every line up to the last of the original is unchanged except for an added node declaration, and the new edge
    // is the last line: so the original edges keep their numbers.
    assert.ok(after.at(-2).includes(`${id} --> n1`), text);
    assert.deepEqual(after.filter((l) => !/n1/.test(l)), before, text);
  }
});

test('a node in a subgraph keeps its new neighbour there, even when class or style lines name it last', () => {
  const src = 'flowchart TD\n  subgraph s\n    A --> B\n  end\n  class A,B foo\n  style B fill:#eef\n';
  assert.equal(addConnected(src, 'B').text,
    'flowchart TD\n  subgraph s\n    A --> B\n    n1["New node"]\n  end\n  class A,B foo\n  style B fill:#eef\n  B --> n1\n');
  const archive = addConnected(fixture('06-subgraphs-classes.mmd'), 'archive').text;
  assert.ok(archive.includes('    done --> archive[(Archive)]\n    n1["New node"]\n  end\n'), archive);
});

test('addNode appends a standalone node, or puts one inside a subgraph before its end', () => {
  assert.equal(addNode(fixture('01-basic.mmd')).text, fixture('01-basic.mmd') + '  n1["New node"]\n');
  const inside = addNode(fixture('06-subgraphs-classes.mmd'), { subgraph: 'pay' }).text;
  assert.ok(inside.includes('    charge[Charge card] --> record[Record]\n    n1["New node"]\n  end\n'), inside);
  const empty = addNode('flowchart TD\n  A\n  subgraph s\n  end\n', { subgraph: 's' }).text;
  assert.equal(empty, 'flowchart TD\n  A\n  subgraph s\n    n1["New node"]\n  end\n');
  assert.throws(() => addNode(fixture('01-basic.mmd'), { subgraph: 'nope' }), /not in the file/);
});

test('an end inside a label does not close a subgraph', () => {
  const src = 'flowchart TD\n  subgraph s\n    A["the end"] --> B\n  end\n';
  assert.equal(addNode(src, { subgraph: 's' }).text, 'flowchart TD\n  subgraph s\n    A["the end"] --> B\n    n1["New node"]\n  end\n');
});

test('nested subgraphs: a node is added to the innermost one', () => {
  const src = 'flowchart TD\n  subgraph outer\n    subgraph inner\n      A --> B\n    end\n    C\n  end\n';
  const { text } = addConnected(src, 'B');
  assert.equal(text, 'flowchart TD\n  subgraph outer\n    subgraph inner\n      A --> B\n      n1["New node"]\n    end\n    C\n  end\n  B --> n1\n');
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
  assert.equal(quoteLabel('two\nlines'), '"two<br>lines"');
  assert.equal(quoteLabel('a<b\r\nc'), '"a#lt;b<br>c"');
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

test('subgraphIdFromSvgId', () => {
  assert.equal(subgraphIdFromSvgId('d3-pay', 'd3'), 'pay');
  assert.equal(subgraphIdFromSvgId('x-pay', 'd3'), null);
});

test('nodeIdFromSvgId', () => {
  assert.equal(nodeIdFromSvgId('d3-flowchart-charge-12', 'd3'), 'charge');
  assert.equal(nodeIdFromSvgId('d3-flowchart-a-b-2', 'd3'), 'a-b');
  assert.equal(nodeIdFromSvgId('d3-L_A_B_0', 'd3'), null);
});

// --- edges ---------------------------------------------------------------------------------------------------

const slice = (text, span) => text.slice(span.start, span.end);

test('edges reads every connector as Mermaid does', () => {
  const src = fixture('11-edge-kinds.mmd');
  const got = edges(src).slice(0, 17).map((e) => [e.from, slice(src, e.link), e.arrow, e.to]);
  assert.deepEqual(got, [
    ['A', '-->', '-->', 'B'], ['A', '---', '---', 'C'], ['A', '-.->', '-.->', 'D'], ['A', '==>', '==>', 'E'],
    ['A', '--o', '--o', 'F'], ['A', '--x', '--x', 'G'], ['A', '<-->', '<-->', 'H'], ['A', 'o--o', 'o--o', 'B'],
    ['A', 'x--x', 'x--x', 'C'], ['A', '~~~', '~~~', 'D'], ['A', '---->', '---->', 'E'], ['A', '-..->', '-..->', 'F'],
    ['A', '===>', '===>', 'G'], ['A', '---o', '---o', 'B'], ['A', '---x', '---x', 'B'], ['Ao', '--o', '--o', 'B'],
    ['A', '-->', '-->', 'B'],
  ]);
});

test('edges finds each label, in text form or between pipes, and its arrow without it', () => {
  const src = fixture('11-edge-kinds.mmd');
  const got = edges(src).filter((e) => e.label)
    .map((e) => [slice(src, e.link), e.arrow, e.label.text, slice(src, e.label)]);
  assert.deepEqual(got, [
    ['-- a-b -->', '-->', 'a-b', 'a-b'], ['-. maybe .->', '-.->', 'maybe', 'maybe'],
    ['== strong ==>', '==>', 'strong', 'strong'], ['-->|pipe|', '-->', 'pipe', 'pipe'],
  ]);
  const tricky = fixture('07-tricky-labels.mmd');
  const quoted = edges(tricky).find((e) => e.label);
  assert.equal(quoted.label.text, '"label with | pipe"');
  assert.equal(slice(tricky, quoted.label), '"label with | pipe"');
  assert.equal(edges('flowchart LR\n  A <-- both --> B\n')[0].arrow, '<-->');
});

test('edges keeps each node reference whole: shape, label and class', () => {
  const src = 'flowchart LR\n  a1["x --> y; z"] --> b1([Two words]):::hot --> c1@{ shape: circle }\n';
  const got = edges(src).map((e) => [slice(src, e.fromRef), slice(src, e.toRef)]);
  assert.deepEqual(got, [['a1["x --> y; z"]', 'b1([Two words]):::hot'], ['b1([Two words]):::hot', 'c1@{ shape: circle }']]);
});

test('edges expands chains and & groups in Mermaid\'s order, one step per connector', () => {
  const src = 'flowchart LR\n  A & B e9@--> C & D --> E\n';
  const got = edges(src).map((e) => [e.index, e.from, e.to, e.step, e.userId, e.svgId]);
  assert.deepEqual(got, [
    [0, 'A', 'C', 0, null, 'L_A_C_0'], [1, 'A', 'D', 0, null, 'L_A_D_0'],
    [2, 'B', 'C', 0, 'e9', 'e9'], [3, 'B', 'D', 0, null, 'L_B_D_0'],
    [4, 'C', 'E', 1, null, 'L_C_E_0'], [5, 'D', 'E', 1, null, 'L_D_E_0'],
  ]);
  for (const e of edges(src)) assert.equal(slice(src, e.statement), 'A & B e9@--> C & D --> E');
});

test('edges numbers repeats of a pair as Mermaid does, and an edge id only once', () => {
  const src = 'flowchart LR\n  A --> B\n  A e1@--> B\n  A e1@--> B\n  A --> B\n';
  assert.deepEqual(edges(src).map((e) => e.svgId), ['L_A_B_0', 'e1', 'L_A_B_3', 'L_A_B_4']);
  assert.equal(edgeBySvgId(src, 'L_A_B_3').index, 2);
  assert.equal(edgeBySvgId(src, 'L_A_B_2'), null);
});

test('edges splits statements at semicolons, and finds none in comments, style lines or subgraph titles', () => {
  const src = 'flowchart LR\n  %% A --> Z\n  C --> D; D --> C\n  linkStyle 0 stroke:red\n  style C fill:#eef;\n'
    + '  class C,D hot\n  click C "https://example.com"\n  subgraph s [A --> B]\n    E --> F\n  end\n'
    + '  E e1@--> F\n  e1@{ animate: true }\n';
  const got = edges(src).map((e) => [e.from, e.to, slice(src, e.statement)]);
  assert.deepEqual(got, [
    ['C', 'D', 'C --> D'], ['D', 'C', 'D --> C'], ['E', 'F', 'E --> F'], ['E', 'F', 'E e1@--> F'],
  ]);
});

test('edges reads statements after a semicolon on the header line', () => {
  const src = 'flowchart LR; A --> B\n  A --> C\n  linkStyle 1 stroke:red\n';
  assert.deepEqual(edges(src).map((e) => e.svgId), ['L_A_B_0', 'L_A_C_0']);
  assert.equal(deleteEdge(src, 'L_A_C_0').text, 'flowchart LR; A --> B\n  C\n');
});

test('edges of a diagram that is not a flowchart is empty', () => {
  assert.deepEqual(edges(fixture('90-sequence.mmd')), []);
  assert.deepEqual(edges('stateDiagram-v2\n  [*] --> A\n  A --> B\n'), []);
});

for (const [name, ids] of Object.entries(EDGE_IDS)) {
  const src = fixture(name);
  for (const svgId of ids) {
    test(`${name} ${svgId}: deleteEdge removes that edge only, and keeps every node`, () => {
      const { text } = deleteEdge(src, svgId);
      const sig = (e) => `${e.from} ${e.arrow} ${e.label?.text ?? ''} ${e.to}`;
      assert.deepEqual(edges(text).map(sig), edges(src).filter((e) => e.svgId !== svgId).map(sig));
      for (const node of NODE_IDS[name]) assert.match(text, new RegExp(`(?<![\\p{L}\\p{N}_])${node}(?![\\p{L}\\p{N}_])`, 'u'), node);
    });
  }
}

for (const [name, ids] of Object.entries(EDGE_IDS)) {
  test(`${name}: edges gives every edge Mermaid draws, in its order, with its id`, () => {
    const src = fixture(name);
    const found = edges(src);
    assert.deepEqual(found.map((e) => e.svgId), ids);
    for (const e of found) {
      assert.ok(e.statement.start <= e.fromRef.start && e.fromRef.end <= e.link.start, `${e.svgId} from`);
      assert.ok(e.link.end <= e.toRef.start && e.toRef.end <= e.statement.end, `${e.svgId} to`);
      assert.ok(slice(src, e.fromRef).startsWith(e.from) && slice(src, e.toRef).startsWith(e.to), e.svgId);
      if (e.label) assert.ok(e.link.start < e.label.start && e.label.end < e.link.end, `${e.svgId} label`);
    }
  });
}

// --- deleting ------------------------------------------------------------------------------------------------

test('deleteEdge removes a one-edge statement, keeping each node where it is defined or only named there', () => {
  assert.equal(deleteEdge(fixture('01-basic.mmd'), 'L_A_B_0').text,
    'flowchart TD\n  A[Start]\n  B{OK?}\n  B -->|yes| C[Done]\n  B -->|no| D[Retry]\n  D --> A\n');
  assert.equal(deleteEdge(fixture('01-basic.mmd'), 'L_D_A_0').text,
    'flowchart TD\n  A[Start] --> B{OK?}\n  B -->|yes| C[Done]\n  B -->|no| D[Retry]\n');
});

test('deleteEdge drops that edge\'s linkStyle and moves the later numbers down', () => {
  assert.equal(deleteEdge(fixture('10-linkstyle-subgraph.mmd'), 'L_A_B_0').text,
    'flowchart LR\n  A[Start]\n  B[Middle]\n  subgraph box [Inside]\n    C[First] --> D[Second]\n  end\n  B --> C\n'
    + '  D --> E[Out]\n  linkStyle 1 stroke:blue\n');
  assert.equal(deleteEdge('flowchart LR\n  A --> B\n  B --> C\n  C --> D\n  linkStyle 0,1,2 stroke:red\n', 'L_B_C_0').text,
    'flowchart LR\n  A --> B\n  C --> D\n  linkStyle 0,1 stroke:red\n');
});

test('deleteEdge splits a chain or an & group without moving any other edge', () => {
  assert.equal(deleteEdge('flowchart LR\n  X --> A & B --> C & D --> E\n', 'L_B_D_0').text,
    'flowchart LR\n  X --> A & B\n  A --> C & D\n  B --> C\n  C & D --> E\n');
  assert.equal(deleteEdge('flowchart LR\n  A & B --> C & D\n', 'L_A_C_0').text, 'flowchart LR\n  A --> D\n  B --> C & D\n');
  assert.equal(deleteEdge('flowchart LR\n  A[One] --> B & C((Two)) --> D\n', 'L_A_C_0').text,
    'flowchart LR\n  A[One] --> B\n  B & C((Two)) --> D\n');
});

test('deleteEdge keeps a node in its subgraph when its other mentions are outside it', () => {
  assert.equal(deleteEdge('flowchart LR\n  subgraph s\n    A --> B\n  end\n  B --> C\n', 'L_A_B_0').text,
    'flowchart LR\n  subgraph s\n    A\n    B\n  end\n  B --> C\n');
});

test('deleteEdge takes out only its statement on a shared line, and its edge id line', () => {
  assert.equal(deleteEdge('flowchart LR\n  C --> D; D --> C\n  A --> C & D\n', 'L_C_D_0').text,
    'flowchart LR\n  D --> C\n  A --> C & D\n');
  assert.equal(deleteEdge('flowchart LR\n  A e1@--> B\n  e1@{ animate: true }\n  A --> B\n', 'e1').text,
    'flowchart LR\n  A --> B\n');
  assert.throws(() => deleteEdge(fixture('01-basic.mmd'), 'L_A_Z_0'), /not in the file/);
});

test('deleteNode removes the node from every statement, with its style, click and class lines', () => {
  assert.equal(deleteNode(fixture('06-subgraphs-classes.mmd'), 'archive').text,
    'flowchart TD\n  classDef warn fill:#fdd,stroke:#c00\n  start[Begin] --> pay\n  subgraph pay [Payment]\n    direction LR\n'
    + '    charge[Charge card] --> record[Record]\n  end\n  record --> done[Finished]:::warn\n  subgraph tail\n    done\n  end\n'
    + '  style start fill:#eef\n  click start "https://example.com" "Open"\n');
  assert.equal(deleteNode('flowchart LR\n  A --> B\n  class A,B hot\n', 'B').text, 'flowchart LR\n  A\n  class A hot\n');
  assert.equal(deleteNode('flowchart LR\n  X --> A & B --> C & D --> E\n', 'C').text, 'flowchart LR\n  X --> A & B --> D --> E\n');
  assert.equal(deleteNode(fixture('10-linkstyle-subgraph.mmd'), 'C').text,
    'flowchart LR\n  A[Start] --> B[Middle]\n  subgraph box [Inside]\n    D[Second]\n  end\n  D --> E[Out]\n'
    + '  linkStyle 0 stroke:red\n');
});

test('deleteNode keeps a neighbour named twice only by the deleted node\'s statements', () => {
  assert.equal(deleteNode('flowchart LR\n  X --> B\n  B --> X\n', 'X').text, 'flowchart LR\n  B\n');
});

test('deleteNode on the last line keeps a file with no trailing newline without one', () => {
  assert.equal(deleteNode(fixture('09-no-trailing-newline.mmd'), 'B').text, 'flowchart TD\n  A[First]');
});

test('deleteNode removes the node\'s own style and click lines and reports how many edges went', () => {
  const { text, edges: count } = deleteNode(fixture('06-subgraphs-classes.mmd'), 'start');
  assert.equal(count, 1);
  assert.ok(!/style start|click start/.test(text), text);
  assert.ok(text.includes('  class archive warn\n'), text);
});

test('deleteEdge in an & group writes one statement per start, merging starts with the same ends', () => {
  assert.equal(deleteEdge('flowchart LR\n  A & B & C --> D & E\n', 'L_C_E_0').text,
    'flowchart LR\n  A & B --> D & E\n  C --> D\n');
  assert.equal(deleteEdge('flowchart LR\n  A & B --> C[See] & D\n', 'L_A_D_0').text,
    'flowchart LR\n  A --> C[See]\n  B --> C & D\n');
});

test('an edge id stays on its own edge, or goes with it', () => {
  assert.equal(deleteEdge('flowchart LR\n  A & B e1@--> C\n  e1@{ animate: true }\n', 'L_A_C_0').text,
    'flowchart LR\n  A\n  B e1@--> C\n  e1@{ animate: true }\n');
  assert.equal(deleteEdge('flowchart LR\n  A & B e1@--> C\n  e1@{ animate: true }\n', 'e1').text,
    'flowchart LR\n  B\n  A --> C\n');
});

test('a rewritten statement that shares its line stays on it, joined with semicolons', () => {
  assert.equal(deleteEdge('flowchart LR\n  A --> B --> C; X --> Y\n', 'L_A_B_0').text,
    'flowchart LR\n  A; B --> C; X --> Y\n');
});

test('deleting the last line of a file with no trailing newline keeps it without one', () => {
  assert.equal(deleteNode('flowchart TD\n  A\n  A --> B', 'B').text, 'flowchart TD\n  A');
});

test('deletes refuse a statement they cannot read whole', () => {
  assert.throws(() => deleteNode('flowchart LR\n  A --> B --> -C\n', 'B'), /not one this editor can change/);
});

// --- properties over every node of every fixture -------------------------------------------------------------

for (const [name, ids] of Object.entries(NODE_IDS)) {
  const src = fixture(name);
  for (const id of ids) {
    test(`${name} ${id}: add appends its edge last, with at most a node declaration elsewhere`, () => {
      const { text, id: newId } = addConnected(src, id);
      const d = lineDiff(src, text);
      assert.deepEqual(d.removed, [], 'nothing removed');
      const edge = text.trimEnd().split('\n').at(-1).trim();
      if (d.added.length === 1) assert.equal(edge, `${id} --> ${newId}["New node"]`);
      else {
        assert.equal(d.added.length, 2);
        assert.equal(edge, `${id} --> ${newId}`);
        assert.ok(d.added.some((l) => l.trim() === `${newId}["New node"]`), d.added.join('|'));
      }
    });

    test(`${name} ${id}: deleteNode leaves every other edge in order and every other node`, () => {
      const { text } = deleteNode(src, id);
      const sig = (e) => `${e.from} ${e.arrow} ${e.label?.text ?? ''} ${e.to}`;
      assert.deepEqual(edges(text).map(sig), edges(src).filter((e) => e.from !== id && e.to !== id).map(sig));
      for (const other of ids.filter((x) => x !== id)) {
        assert.match(text, new RegExp(`(?<![\\p{L}\\p{N}_])${other}(?![\\p{L}\\p{N}_])`, 'u'), `${other} lost`);
      }
      assert.ok(!edges(text).some((e) => e.from === id || e.to === id));
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
