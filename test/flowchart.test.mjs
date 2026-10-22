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
  edgeBySvgId, deleteEdge, deleteNode, setEdgeLabel, setEdgeArrow, reverseEdge, arrowType, ARROWS, subgraphs,
  setSubgraphTitle, addSubgraph, subgraphRefusal, setShape, shapeOf, BRACKETS,
} from '../web/patch/flowchart.mjs';
import { NODE_SHAPES } from '../web/shapes.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');
const NODE_IDS = JSON.parse(fixture('node-ids.json'));
const EDGE_IDS = JSON.parse(fixture('edge-ids.json'));
const SUBGRAPH_IDS = JSON.parse(fixture('subgraph-ids.json'));

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
  assert.equal(freeId('flowchart TD\n  subgraph s1\n  end\n', 's'), 's2');
});

// --- subgraphs -----------------------------------------------------------------------------------------------

test('subgraphs gives the ids Mermaid gives, for every fixture', () => {
  for (const [name, ids] of Object.entries(SUBGRAPH_IDS)) {
    assert.deepEqual(subgraphs(fixture(name)).map((s) => s.id).sort(), ids, name);
  }
});

test('subgraphs: an id-less subgraph is subGraph<k>, k counting every subgraph by the order of its end', () => {
  const list = subgraphs(fixture('12-subgraph-ids.mmd'));
  const by = (id) => list.find((s) => s.id === id);
  assert.deepEqual(list.map((s) => [s.id, s.written]), [
    ['pay', true], ['subGraph1', false], ['Shipping', true], ['outer', true], ['subGraph3', false], ['tight', true],
    ['subGraph6', false], ['Single', true],
  ]);
  assert.equal(list[by('tight').parent].id, 'outer');
  assert.equal(by('pay').parent, null);
});

test('setSubgraphTitle rewrites only the title, keeping the id, in every form', () => {
  const src = fixture('12-subgraph-ids.mmd');
  const line = (text, n) => text.split('\n')[n];
  const title = (id, n) => line(setSubgraphTitle(src, id, 'New #1').text, n);
  assert.equal(title('pay', 2), '  subgraph pay ["New #35;1"]');
  assert.equal(title('tight', 15), '    subgraph tight["New #35;1"]');
  assert.equal(title('Shipping', 8), '  subgraph Shipping ["New #35;1"]');
  assert.equal(title('Single', 22), '  subgraph "Single" ["New #35;1"]');
  // A subgraph with no id gets one, or a title with no whitespace would become its id.
  assert.equal(title('subGraph1', 5), '  subgraph s1 ["New #35;1"]');
  assert.equal(title('subGraph6', 19), '  subgraph s1 ["New #35;1"]');
  for (const id of ['pay', 'subGraph1']) assert.equal(lineDiff(src, setSubgraphTitle(src, id, 'X').text).added.length, 1);
  // The id it has after, for the page to select it again.
  assert.deepEqual(['pay', 'Shipping', 'Single', 'subGraph1'].map((id) => setSubgraphTitle(src, id, 'X').id),
    ['pay', 'Shipping', 'Single', 's1']);
  assert.throws(() => setSubgraphTitle(src, 'nope', 'X'), /not in the file/);
});

test('a subgraph with no id is not given one when the file already names it by Mermaid\'s id', () => {
  const src = 'flowchart TD\n  subgraph "A b"\n    x\n  end\n  style subGraph0 fill:#eee\n';
  assert.match(subgraphRefusal(src, 'subGraph0'), /name it subGraph0/);
  assert.throws(() => setSubgraphTitle(src, 'subGraph0', 'X'), /name it subGraph0/);
  assert.throws(() => connect(src, 'x', 'subGraph0'), /name it subGraph0/);
  assert.equal(subgraphRefusal(fixture('12-subgraph-ids.mmd'), 'subGraph1'), null);
  assert.equal(subgraphRefusal(fixture('12-subgraph-ids.mmd'), 'pay'), null);
});

test('connect to and from a subgraph appends the edge; one with no id gets one in the same edit', () => {
  const src = fixture('12-subgraph-ids.mmd');
  assert.ok(connect(src, 'start', 'Shipping').text.endsWith('  Shipping --> log\n  start --> Shipping\n'));
  assert.ok(connect(src, 'Single', 'pay').text.endsWith('  Single --> pay\n'));
  const text = connect(src, 'subGraph1', 'subGraph6').text;
  assert.deepEqual(lineDiff(src, text).added, ['  subgraph s1 ["Order log"]', '  subgraph s2 ["Two words"]', '  s1 --> s2']);
});

test('addSubgraph appends an empty one at the top level, or puts one inside a subgraph before its end', () => {
  const src = fixture('12-subgraph-ids.mmd');
  const top = addSubgraph(src);
  assert.equal(top.id, 's1');
  assert.ok(top.text.endsWith('  Shipping --> log\n  subgraph s1 ["New subgraph"]\n  end\n'));
  assert.equal(addSubgraph(src, { parent: 'subGraph3' }).text,
    src.replace('      step[Step]\n', '      step[Step]\n      subgraph s1 ["New subgraph"]\n      end\n'));
  assert.equal(addSubgraph(src, { parent: 'Single' }).text,
    src.replace('  subgraph "Single"\n', '  subgraph "Single"\n    subgraph s1 ["New subgraph"]\n    end\n'));
  // A file with no trailing newline is kept without one.
  assert.equal(addSubgraph('flowchart TD\n  A').text, 'flowchart TD\n  A\n  subgraph s1 ["New subgraph"]\n  end');
});

test('addNode into a subgraph with no id, or with whitespace in its title', () => {
  const src = fixture('12-subgraph-ids.mmd');
  assert.equal(addNode(src, { subgraph: 'subGraph6' }).text, src.replace('    w1\n', '    w1\n    n1["New node"]\n'));
  assert.equal(addNode(src, { subgraph: 'subGraph1' }).text,
    src.replace('    log[(Log)]\n', '    log[(Log)]\n    n1["New node"]\n'));
  assert.throws(() => addNode(src, { subgraph: 'Two' }), /not in the file/);
});

test('deleting an edge to or from a subgraph leaves no line naming the subgraph', () => {
  const src = fixture('12-subgraph-ids.mmd');
  assert.equal(deleteEdge(src, 'L_start_pay_0').text, src.replace('  start[Begin] --> pay\n', '  start[Begin]\n'));
  assert.equal(deleteEdge(src, 'L_Shipping_log_0').text, src.replace('  Shipping --> log\n', ''));
  assert.equal(deleteNode(src, 'start').text, src.replace('  start[Begin] --> pay\n', ''));
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
  assert.equal(edges('flowchart LR\n  A -- "a --> b" --> B\n')[0].label.text, '"a --> b"');
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
    test(`${name} ${svgId}: label, arrow and reverse change that edge only`, () => {
      const sig = (e) => `${e.from} ${e.arrow} ${e.label?.text ?? ''} ${e.to}`;
      const before = edges(src), at = before.findIndex((e) => e.svgId === svgId);
      const expect = (change) => before.map((e, k) => (k === at ? change(e) : e)).map(sig);
      assert.deepEqual(edges(setEdgeLabel(src, svgId, 'New').text).map(sig), expect((e) => ({ ...e, label: { text: '"New"' } })));
      assert.deepEqual(edges(reverseEdge(src, svgId).text).map(sig), expect((e) => ({ ...e, from: e.to, to: e.from })));
      const { text } = setEdgeArrow(src, svgId, '-.->');
      assert.equal(arrowType(edges(text)[at].arrow), '-.->');
      assert.deepEqual(edges(text).map(sig).filter((_, k) => k !== at), before.map(sig).filter((_, k) => k !== at));
    });

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

// --- changing edges ------------------------------------------------------------------------------------------

test('setEdgeLabel replaces only the connector of a one-to-one edge, keeping the chain and its spacing', () => {
  assert.equal(setEdgeLabel('flowchart LR\n  A  -->  B --> C\n', 'L_A_B_0', 'x').text, 'flowchart LR\n  A  -->|"x"|  B --> C\n');
  assert.equal(setEdgeLabel('flowchart LR\n  A -- yes --> B\n', 'L_A_B_0', 'Say "hi"').text,
    'flowchart LR\n  A -->|"Say #quot;hi#quot;"| B\n');
  assert.equal(setEdgeLabel('flowchart LR\n  A -->|yes| B\n', 'L_A_B_0', '  ').text, 'flowchart LR\n  A --> B\n');
});

test('setEdgeLabel on a shared connector gives only that edge its own statement', () => {
  assert.equal(setEdgeLabel('flowchart LR\n  A --> B & C --> D\n', 'L_A_C_0', 'x').text,
    'flowchart LR\n  A --> B\n  A -->|"x"| C\n  B & C --> D\n');
});

test('setEdgeArrow keeps the label and the length', () => {
  assert.equal(setEdgeArrow('flowchart LR\n  A ---->|"a | b"| B\n', 'L_A_B_0', '-.->').text, 'flowchart LR\n  A -...->|"a | b"| B\n');
  assert.equal(setEdgeArrow('flowchart LR\n  A -- yes --> B\n', 'L_A_B_0', '==>').text, 'flowchart LR\n  A ==>|"yes"| B\n');
  assert.equal(setEdgeArrow('flowchart LR\n  A -- say "hi" (x) --> B\n', 'L_A_B_0', '==>').text,
    'flowchart LR\n  A ==>|"say #quot;hi#quot; (x)"| B\n');
  assert.equal(setEdgeArrow('flowchart LR\n  A -- "quoted" --> B\n', 'L_A_B_0', '==>').text, 'flowchart LR\n  A ==>|"quoted"| B\n');
  assert.equal(setEdgeArrow('flowchart LR\n  A -->|yes| B\n', 'L_A_B_0', '==>').text, 'flowchart LR\n  A ==>|yes| B\n');
  assert.equal(setEdgeArrow('flowchart LR\n  A e1@--> B\n', 'e1', '--x').text, 'flowchart LR\n  A e1@--x B\n');
  assert.throws(() => setEdgeArrow('flowchart LR\n  A --> B\n', 'L_A_B_0', '-->>'), /Not an arrow type/);
});

test('arrowType names an arrow at any length, and ARROWS gives each back', () => {
  for (const [type, make] of Object.entries(ARROWS)) {
    assert.equal(arrowType(make(0)), type);
    assert.equal(arrowType(make(2)), type);
  }
  assert.equal(arrowType('---->'), '-->');
  assert.equal(arrowType('o--o'), null);
});

test('reverseEdge turns a lone edge around, keeping each node\'s shape', () => {
  assert.equal(reverseEdge('flowchart LR\n  A[Start] --> B\n', 'L_A_B_0').text, 'flowchart LR\n  B --> A[Start]\n');
});

test('reverseEdge splits a chain only around the reversed edge, so linkStyle still styles it', () => {
  assert.equal(reverseEdge('flowchart LR\n  A --> B --> C --> D\n', 'L_B_C_0').text,
    'flowchart LR\n  A --> B\n  C --> B\n  C --> D\n');
  assert.equal(reverseEdge('flowchart LR\n  A --> B --> C\n  linkStyle 1 stroke:red\n', 'L_B_C_0').text,
    'flowchart LR\n  A --> B\n  C --> B\n  linkStyle 1 stroke:red\n');
});

test('reversing pairs of an & product keeps every edge in its place', () => {
  const once = reverseEdge('flowchart LR\n  A & B --> C & D\n', 'L_A_C_0').text;
  assert.equal(reverseEdge(once, 'L_B_C_0').text, 'flowchart LR\n  C --> A\n  A --> D\n  C --> B\n  B --> D\n');
});

test('an edge id stays on its pair when the pair is reversed', () => {
  assert.equal(reverseEdge('flowchart LR\n  A & B e1@--> C\n', 'e1').text, 'flowchart LR\n  A --> C\n  C e1@--> B\n');
});

test('setShape between bracket shapes swaps the brackets and keeps the label\'s bytes', () => {
  const src = fixture('05-chains-shapes.mmd');
  for (const [at, [open, close]] of Object.entries(BRACKETS)) {
    assert.equal(setShape(src, 'D', at).text, src.replace('D[/Four/]', `D${open}Four${close}`), at);
  }
  const quoted = fixture('07-tricky-labels.mmd');
  assert.equal(setShape(quoted, 'A', 'diam').text, quoted.replace('A["Say #quot;hi#quot; [now]"]', 'A{"Say #quot;hi#quot; [now]"}'));
});

test('setShape to a shape with no brackets writes @{ shape, label }, quoting an unquoted label as written', () => {
  assert.equal(setShape(fixture('01-basic.mmd'), 'A', 'doc').text, fixture('01-basic.mmd').replace('A[Start]', 'A@{ shape: doc, label: "Start" }'));
  const quoted = fixture('07-tricky-labels.mmd');
  assert.equal(setShape(quoted, 'B', 'doc').text, quoted.replace('B["Ünïcödé — 東京"]', 'B@{ shape: doc, label: "Ünïcödé — 東京" }'));
  assert.equal(setShape('flowchart TD\n  A[/ say "hi" /]\n', 'A', 'doc').text, 'flowchart TD\n  A@{ shape: doc, label: "say #quot;hi#quot;" }\n');
  const markup = 'flowchart TD\n  A[a #amp; <b>b</b>] --> B\n';
  assert.equal(setShape(markup, 'A', 'doc').text, 'flowchart TD\n  A@{ shape: doc, label: "a #amp; <b>b</b>" } --> B\n');
});

test('setShape refuses, for a shape with no brackets, a label with a } and a Markdown label; brackets take both', () => {
  assert.throws(() => setShape('flowchart TD\n  A["a } b"]\n', 'A', 'doc'), /has a \} in it/);
  const md = 'flowchart TD\n  A["`**bold** text`"] --> B\n';
  assert.throws(() => setShape(md, 'A', 'docs'), /is Markdown/);
  assert.equal(setShape(md, 'A', 'diam').text, 'flowchart TD\n  A{"`**bold** text`"} --> B\n');
});

test('setShape on @{ } changes or adds only the shape key', () => {
  const src = fixture('08-new-shape-syntax.mmd');
  assert.ok(setShape(src, 'A', 'diam').text.includes('A@{ shape: diam, label: "New syntax" }'));
  assert.equal(setShape('flowchart TD\n  A@{ label: "x" }\n', 'A', 'hex').text, 'flowchart TD\n  A@{ shape: hex, label: "x" }\n');
  assert.equal(setShape('flowchart TD\n  A@{}\n', 'A', 'hex').text, 'flowchart TD\n  A@{ shape: hex }\n');
  assert.equal(setShape('flowchart TD\n  A@{ shape: "circle" }\n', 'A', 'doc').text, 'flowchart TD\n  A@{ shape: doc }\n');
});

test('setShape keeps a :::class before @{ }, where Mermaid takes it, and reads a shape written after one', () => {
  const src = 'flowchart TD\n  A[x]:::hot --> B:::hot\n';
  assert.equal(setShape(src, 'A', 'doc').text, 'flowchart TD\n  A:::hot@{ shape: doc, label: "x" } --> B:::hot\n');
  assert.equal(setShape(src, 'B', 'doc').text, 'flowchart TD\n  A[x]:::hot --> B:::hot@{ shape: doc }\n');
  assert.equal(setShape(src, 'A', 'diam').text, 'flowchart TD\n  A{x}:::hot --> B:::hot\n');
  const written = 'flowchart TD\n  A:::hot@{ shape: doc, label: "x" }\n';
  assert.equal(shapeOf(written, 'A'), 'doc');
  assert.equal(setShape(written, 'A', 'hex').text, 'flowchart TD\n  A:::hot@{ shape: hex, label: "x" }\n');
});

test('setShape on a bare node shapes its first appearance, labelled with its id', () => {
  const src = fixture('02-graph-header-bare.mmd');
  assert.equal(setShape(src, 'B', 'diam').text, 'graph LR\n    A --> B{B}\n    B --> C\n    C --> A\n');
  assert.equal(setShape(src, 'B', 'doc').text, 'graph LR\n    A --> B@{ shape: doc }\n    B --> C\n    C --> A\n');
  assert.equal(setShape('flowchart TD\n  style A fill:#eef\n  A --> B\n', 'A', 'circle').text,
    'flowchart TD\n  style A fill:#eef\n  A((A)) --> B\n');
});

test('setShape and shapeOf go by the last mention with a shape, as Mermaid does', () => {
  const src = 'flowchart TD\n  A[x] --> B\n  A(y) --> C\n  A --> D\n';
  assert.equal(shapeOf(src, 'A'), 'rounded');
  assert.equal(setShape(src, 'A', 'diam').text, 'flowchart TD\n  A[x] --> B\n  A{y} --> C\n  A --> D\n');
  const mixed = 'flowchart TD\n  A@{ shape: doc }\n  A[x] --> B\n  A@{ label: "y" }\n';
  assert.equal(shapeOf(mixed, 'A'), 'rect');
  assert.equal(setShape(mixed, 'A', 'hex').text, 'flowchart TD\n  A@{ shape: doc }\n  A{{x}} --> B\n  A@{ label: "y" }\n');
});

test('shapeOf reads brackets, @{ shape }, and bare nodes as rect; a name merma does not list as written', () => {
  const src = fixture('05-chains-shapes.mmd');
  const expected = { A: 'rect', B: 'circle', C: 'hex', D: 'lean-r', E: 'lean-l', F: 'odd', G: 'fr-rect', H: 'stadium', I: 'dbl-circ', J: 'trap-b', K: 'trap-t' };
  for (const [id, at] of Object.entries(expected)) assert.equal(shapeOf(src, id), at, id);
  assert.equal(shapeOf(fixture('08-new-shape-syntax.mmd'), 'B'), 'circle');
  assert.equal(shapeOf(fixture('02-graph-header-bare.mmd'), 'B'), 'rect');
  assert.equal(shapeOf('flowchart TD\n  A@{ shape: bolt }\n', 'A'), 'bolt');
  assert.equal(shapeOf('flowchart TD\n  A@{ shape: "circle" }\n', 'A'), 'circle');
});

test('setShape refuses what is not a shape name', () => {
  assert.throws(() => setShape(fixture('01-basic.mmd'), 'A', 'doc }'), /Not a shape name/);
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

    test(`${name} ${id}: setShape to every shape changes one line, reads back as that shape, and no other node's`, () => {
      const others = ids.filter((x) => x !== id).map((x) => [x, shapeOf(src, x)]);
      for (const { key } of NODE_SHAPES) {
        const { text } = setShape(src, id, key);
        const d = lineDiff(src, text);
        if (shapeOf(src, id) !== key) assert.equal(d.removed.length, 1, key);
        assert.equal(shapeOf(text, id), key);
        for (const [x, was] of others) assert.equal(shapeOf(text, x), was, `${key}: ${x} changed`);
      }
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
