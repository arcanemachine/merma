// Every action on every node, edge and subgraph of every fixture, as { name, kind, src, out, gone?, keep?, at?, swap?,
// renamed?, into?, title? } for the browser parse check. `gone`: the node deleted; `keep`: for each edge left, its
// index before; `at`: the edge changed in place (`swap`: turned around), and `want` what it should be: { type, stroke }
// as Mermaid names an arrow, { label } a label as written, or { sameLabel } the label it had. `renamed`: a subgraph
// given an id, { from, to }; `into`: { id, subgraph } a node or subgraph added inside another; `title`: { id, text }
// the subgraph retitled, and its new title as written. `shape`: { id, refs } the node given a shape, and that shape
// written alone each way it can be (`@{ }`, brackets), for Mermaid's names for it. `move`: { side, to, index } an edge
// (`at`) given node or subgraph `to` at its `from` or `to` end, found at `index` after. `moves`: { id, which, to } node
// or subgraph `id`'s edges moved to `to` (moveEdges), each with its linkStyle style. `merge`: { id, edges } node `id`
// merged into another (mergeNode): gone, with `edges` edges left. `relocate`: { id, to } a node or subgraph moved
// into subgraph `to` (null: the top level), the edges the same, each with its style. `blocks`: for each node, the
// subgraph blockOf says Mermaid draws it in (null: the top level). `cut`: a node moved by a cut (moveIntoEdge, or
// moveCut without edges), with `relocate` where it should be drawn and `edges` how many edges Mermaid should draw. `paste`: { id, of, edges } node `of` copied and pasted
// as `id` (pasteNode): drawn with its shape, label and classes, and `edges` edges in all. `pasteSubgraph`: { pairs, blocks,
// edges } a subgraph copied and pasted (pasteSubgraph): each [original, copy] node pair drawn alike, each new node in
// the subgraph `blocks` names, and `edges` edges in all.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARROWS, BRACKETS, addConnected, addNode, addSubgraph, blockOf, connect, copyNode, copySubgraph, deleteEdge, deleteNode, edges, freeId, quoteLabel,
  mergeNode, moveCut, moveEdges, moveIntoEdge, moveNode, moveSubgraph, pasteNode, pasteSubgraph, relabel, retarget, reverseEdge, setEdgeArrow, setEdgeLabel, setShape, setSubgraphTitle, setTitle, subgraphRefusal,
  subgraphs,
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
    // Each end moved to every node, and to every subgraph that can be named.
    const sgs = subgraphs(src).filter((s) => s.end !== null && !subgraphRefusal(src, s.id));
    for (const [end, side] of [['start', 'from'], ['end', 'to']]) {
      for (const to of [...list, ...sgs.map((s) => s.id)]) {
        if (to === e[side]) continue;
        const sg = sgs.find((s) => s.id === to);
        const renamed = sg && !sg.written ? { from: sg.id, to: freeId(src, 's') } : null;
        const { text: out, index } = retarget(src, e.svgId, end, to);
        cases.push({ name: `${name} move ${end} of ${e.svgId} to ${to}`, kind: 'move', src, out, at, renamed,
          move: { side, to: renamed?.to ?? to, index } });
      }
    }
  }
}
// Each node's and subgraph's edges moved, each side and both, to a node at either end of the list and to each subgraph.
for (const [name, list, src] of sources) {
  const sgs = subgraphs(src).filter((s) => s.end !== null && !subgraphRefusal(src, s.id));
  for (const id of [...list, ...sgs.filter((s) => s.written).map((s) => s.id)]) {
    if (!edges(src).some((e) => e.from === id || e.to === id)) continue;
    const targets = new Set([list.find((n) => n !== id), list.findLast((n) => n !== id), ...sgs.map((s) => s.id)]);
    for (const to of targets) {
      if (!to || to === id) continue;
      const sg = sgs.find((s) => s.id === to);
      const renamed = sg && !sg.written ? { from: sg.id, to: freeId(src, 's') } : null;
      for (const which of ['starts', 'ends', 'all']) {
        const { text: out, count } = moveEdges(src, id, which, to);
        if (!count) continue;
        cases.push({ name: `${name} move ${which} of ${id} to ${to}`, kind: 'moves', src, out, renamed,
          moves: { id, which, to: renamed?.to ?? to } });
      }
    }
  }
}
// Each node merged into a node at either end of the list.
for (const [name, list, src] of sources) {
  for (const id of list) {
    for (const into of new Set([list.find((n) => n !== id), list.findLast((n) => n !== id)])) {
      if (!into) continue;
      const { text: out } = mergeNode(src, id, into);
      cases.push({ name: `${name} merge ${id} into ${into}`, kind: 'merge', src, out, gone: id, merge: { id, edges: edges(out).length } });
    }
  }
}
// Where blockOf says each node is drawn, for Mermaid to confirm; then each node and subgraph moved everywhere it can go.
for (const [name, list, src] of sources) {
  cases.push({ name: `${name} blocks`, kind: 'blocks', src, out: src, blocks: Object.fromEntries(list.map((id) => [id, blockOf(src, id)?.id ?? null])) });
  const targets = [null, ...subgraphs(src).filter((s) => s.end !== null).map((s) => s.id)];
  for (const id of list) {
    for (const to of targets) {
      const { text: out } = moveNode(src, id, to);
      if (out !== src) cases.push({ name: `${name} move ${id} into ${to}`, kind: 'relocate', src, out, relocate: { id, to } });
    }
  }
  for (const sg of subgraphs(src).filter((s) => s.end !== null && s.written)) {
    for (const to of targets) {
      let out;
      try { ({ text: out } = moveSubgraph(src, /** @type {string} */ (sg.id), to)); } catch { continue; }
      if (out !== src) cases.push({ name: `${name} move subgraph ${sg.id} into ${to}`, kind: 'relocate', src, out, relocate: { id: sg.id, to } });
    }
  }
}
// Each node copied and pasted: at the top level with its edges, beside itself without; the first node into each
// subgraph, and onto each edge.
for (const [name, list, src] of sources) {
  const pasted = (/** @type {string} */ what, /** @type {string} */ of, /** @type {{ text: string, id: string }} */ r, /** @type {string | null} */ sg) =>
    cases.push({ name: `${name} paste ${of} ${what}`, kind: 'paste', src, out: r.text, paste: { id: r.id, of, edges: edges(r.text).length },
      ...(sg ? { into: { id: r.id, subgraph: sg } } : {}) });
  for (const id of list) {
    const c = copyNode(src, id);
    pasted('at the top level', id, pasteNode(src, c, null), null);
    pasted('beside itself', id, pasteNode(src, c, { kind: 'node', id }, false), blockOf(src, id)?.id ?? null);
  }
  if (!list.length) continue;
  const first = copyNode(src, list[0]);
  for (const sg of subgraphs(src).filter((s) => s.end !== null)) {
    pasted(`into ${sg.id}`, list[0], pasteNode(src, first, { kind: 'subgraph', id: /** @type {string} */ (sg.id) }), sg.id);
  }
  for (const e of edges(src)) pasted(`onto ${e.svgId}`, list[0], pasteNode(src, first, { kind: 'edge', svgId: e.svgId, side: 'first' }), null);
}
// Each subgraph copied and pasted: at the top level with its edges, and into each subgraph without its outside edges.
for (const [name, , src] of sources) {
  const all = subgraphs(src).filter((s) => s.end !== null);
  for (const sg of all) {
    const c = copySubgraph(src, /** @type {string} */ (sg.id));
    /** @type {(b: any) => string[]} */
    const nodesOf = (b) => [...b.nodes.map((/** @type {any} */ n) => n.id), ...b.blocks.flatMap(nodesOf)];
    for (const [what, into, withEdges] of /** @type {const} */ ([['at the top level', null, true],
      ...all.map((t) => [`into ${t.id}`, { kind: 'subgraph', id: t.id }, false])])) {
      const r = pasteSubgraph(src, c, /** @type {any} */ (into), withEdges);
      const news = nodesOf(copySubgraph(r.text, r.id).block);
      cases.push({ name: `${name} paste subgraph ${sg.id} ${what}`, kind: 'paste-subgraph', src, out: r.text,
        pasteSubgraph: { pairs: nodesOf(c.block).map((n, k) => [n, news[k]]),
          blocks: Object.fromEntries(news.map((n) => [n, blockOf(r.text, n)?.id ?? null])), edges: edges(r.text).length } });
    }
  }
}
// Each node cut and moved: into every edge not its own (drawn in the block the edge's first half is written in), and
// everywhere it can go without its edges.
for (const [name, list, src] of sources) {
  const targets = [null, ...subgraphs(src).filter((s) => s.end !== null).map((s) => s.id)];
  for (const id of list) {
    for (const e of edges(src).filter((x) => x.from !== id && x.to !== id)) {
      const { text: out } = moveIntoEdge(src, id, e.svgId);
      cases.push({ name: `${name} cut ${id} into ${e.svgId}`, kind: 'cut', src, out, relocate: { id, to: blockOf(out, id)?.id ?? null }, edges: edges(out).length });
    }
    for (const to of targets) {
      const { text: out } = moveCut(src, id, to, false);
      if (out !== src) cases.push({ name: `${name} cut ${id} into ${to} without edges`, kind: 'cut', src, out, relocate: { id, to }, edges: edges(out).length });
    }
  }
}
process.stdout.write(JSON.stringify(cases));
