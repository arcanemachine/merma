// Every action on every node and edge of every fixture, as { name, kind, src, out, gone?, keep?, at?, swap? } for the
// browser parse check. `gone`: the node deleted; `keep`: for each edge left, its index before; `at`: the edge changed
// in place (`swap`: turned around), and `want` what it should be: { type, stroke } as Mermaid names an arrow,
// { label } a label as written, or { sameLabel } the label it had.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARROWS, addConnected, connect, deleteEdge, deleteNode, edges, quoteLabel, relabel, reverseEdge, setEdgeArrow,
  setEdgeLabel,
} from '../web/patch/flowchart.mjs';
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
  for (const id of list) {
    const other = list.find((x) => x !== id);
    cases.push({ name: `${name} add ${id}`, kind: 'add', src, out: addConnected(src, id).text });
    cases.push({ name: `${name} connect ${id}->${other}`, kind: 'connect', src, out: connect(src, id, other).text });
    cases.push({ name: `${name} relabel ${id}`, kind: 'relabel', src, out: relabel(src, id, 'Say "hi" #1 <b> & [x]; 東京 🚀').text });
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
