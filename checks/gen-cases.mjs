// Every action on every node and edge of every fixture, as { name, kind, src, out, gone?, keep? } for the browser
// parse check. `gone`: the node deleted; `keep`: for each edge left, its index before.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addConnected, connect, deleteEdge, deleteNode, edges, relabel } from '../web/patch/flowchart.mjs';
const F = join(import.meta.dirname, '..', 'test', 'fixtures');
const ids = JSON.parse(readFileSync(join(F, 'node-ids.json'), 'utf8'));
const cases = [];
for (const [name, list] of Object.entries(ids)) {
  const src = readFileSync(join(F, name), 'utf8');
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
  }
}
process.stdout.write(JSON.stringify(cases));
