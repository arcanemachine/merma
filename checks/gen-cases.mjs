// Every action on every node, edge and subgraph of every fixture, as { name, kind, src, out, gone?, keep?, at?, swap?,
// renamed?, into?, title? } for the browser parse check. `gone`: the node deleted; `keep`: for each edge left, its
// index before; `at`: the edge changed in place (`swap`: turned around), and `want` what it should be: { type, stroke }
// as Mermaid names an arrow, { label } a label as written, or { sameLabel } the label it had. `renamed`: a subgraph
// given an id, { from, to }; `into`: { id, subgraph } a node or subgraph added inside another; `title`: { id, text }
// the subgraph retitled, and its new title as written. `shape`: { id, refs } the node given a shape, and that shape
// written alone each way it can be (`@{ }`, brackets), for Mermaid's names for it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARROWS, BRACKETS, addConnected, addNode, addSubgraph, connect, deleteEdge, deleteNode, edges, freeId, quoteLabel,
  relabel, reverseEdge, setEdgeArrow, setEdgeLabel, setShape, setSubgraphTitle, setTitle, subgraphs,
} from '../web/patch/flowchart.mjs';
import { NODE_SHAPES } from '../web/shapes.mjs';
// Mermaid's db names for each arrow type: [type, stroke].
const DRAWN = {
  '-->': ['arrow_point', 'normal'], '---': ['arrow_open', 'normal'], '-.->': ['arrow_point', 'dotted'],
  '-.-': ['arrow_open', 'dotted'], '==>': ['arrow_point', 'thick'], '===': ['arrow_open', 'thick'],
  '--o': ['arrow_circle', 'normal'], '--x': ['arrow_cross', 'normal'], '<-->': ['double_arrow_point', 'normal'],
  '~~~': ['arrow_open', 'invisible'],
};
const F = join(import.meta.dirname, '..', 'test', 'fixtures');
const ids = JSON.parse(readFileSync(join(F, 'node-ids.json'), 'utf8'));
const cases = [];
const sources = Object.entries(ids).map(([name, list]) => [name, list, readFileSync(join(F, name), 'utf8')]);
// Text-form labels with characters a pipe label takes only quoted, moved into pipes by an arrow change.
sources.push(['text-form labels', [], 'flowchart LR\n  A -- yes (maybe): [b] {c} --> B\n  B -- it says: hi --> C\n  C -- "a --> b" --> A\n']);
for (const [name, list, src] of sources) {
  cases.push({ name: `${name} add node`, kind: 'add', src, out: addNode(src).text });
  cases.push({ name: `${name} add subgraph`, kind: 'add', src, out: addSubgraph(src).text });
  // The diagram's title, in a fixture whose frontmatter has one: drawn exactly as typed.
  for (const title of ['New title', 'Step: one', '#1 "best"', '- item', '2024', 'true', 'null', '~', 'a: b # c']) {
    let out;
    try { out = setTitle(src, title).text; } catch { break; }
    cases.push({ name: `${name} diagram title ${title}`, kind: 'diagram-title', src, out, diagramTitle: title });
  }
  for (const sg of subgraphs(src).filter((s) => s.end !== null)) {
    const renamed = sg.written ? null : { from: sg.id, to: freeId(src, 's') };
    const now = renamed?.to ?? sg.id;
    const title = 'Say "hi" #1 <b> & [x]';
    cases.push({ name: `${name} title ${sg.id}`, kind: 'title', src, out: setSubgraphTitle(src, sg.id, title).text, renamed, title: { id: now, text: quoteLabel(title) } });
    const node = addNode(src, { subgraph: sg.id });
    cases.push({ name: `${name} add node in ${sg.id}`, kind: 'add', src, out: node.text, into: { id: node.id, subgraph: sg.id } });
    const inner = addSubgraph(src, { parent: sg.id });
    cases.push({ name: `${name} add subgraph in ${sg.id}`, kind: 'add', src, out: inner.text, into: { id: inner.id, subgraph: sg.id } });
    for (const other of list.slice(0, 1)) {
      cases.push({ name: `${name} connect ${other}->${sg.id}`, kind: 'connect', src, out: connect(src, other, sg.id).text, renamed });
      cases.push({ name: `${name} connect ${sg.id}->${other}`, kind: 'connect', src, out: connect(src, sg.id, other).text, renamed });
    }
  }
  for (const id of list) {
    const other = list.find((x) => x !== id);
    cases.push({ name: `${name} add ${id}`, kind: 'add', src, out: addConnected(src, id).text });
    cases.push({ name: `${name} connect ${id}->${other}`, kind: 'connect', src, out: connect(src, id, other).text });
    cases.push({ name: `${name} relabel ${id}`, kind: 'relabel', src, out: relabel(src, id, 'Say "hi" #1 <b> & [x]; 東京 🚀').text });
    for (const { key } of NODE_SHAPES) {
      const b = BRACKETS[key];
      const refs = [`flowchart TD\n  X@{ shape: ${key} }\n`, ...(b ? [`flowchart TD\n  X${b[0]}x${b[1]}\n`] : [])];
      cases.push({ name: `${name} shape ${key} ${id}`, kind: 'shape', src, out: setShape(src, id, key).text, shape: { id, refs } });
    }
    const keep = edges(src).filter((e) => e.from !== id && e.to !== id).map((e) => e.index);
    cases.push({ name: `${name} delete node ${id}`, kind: 'delete', src, out: deleteNode(src, id).text, gone: id, keep });
  }
  const all = edges(src);
  for (const e of all) {
    const keep = all.filter((x) => x !== e).map((x) => x.index);
    cases.push({ name: `${name} delete edge ${e.svgId}`, kind: 'delete', src, out: deleteEdge(src, e.svgId).text, keep });
    const at = e.index;
    for (const label of ['Say "hi" #1', 'two\nlines']) {
      const want = { label: quoteLabel(label) };
      cases.push({ name: `${name} label ${e.svgId}`, kind: 'change', src, out: setEdgeLabel(src, e.svgId, label).text, at, want });
    }
    cases.push({ name: `${name} unlabel ${e.svgId}`, kind: 'change', src, out: setEdgeLabel(src, e.svgId, '').text, at, want: { label: null } });
    cases.push({ name: `${name} reverse ${e.svgId}`, kind: 'change', src, out: reverseEdge(src, e.svgId).text, at, swap: true, want: { sameLabel: true } });
    for (const arrow of Object.keys(ARROWS)) {
      const [type, stroke] = DRAWN[arrow];
      const want = { type, stroke, sameLabel: Boolean(e.label) };
      cases.push({ name: `${name} arrow ${arrow} ${e.svgId}`, kind: 'change', src, out: setEdgeArrow(src, e.svgId, arrow).text, at, want });
    }
  }
}
process.stdout.write(JSON.stringify(cases));
