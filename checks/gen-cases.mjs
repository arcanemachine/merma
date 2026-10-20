// Every action on every node of every fixture, as { name, kind, src, out } for the browser parse check.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addConnected, connect, relabel } from '../web/patch/flowchart.mjs';
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
  }
}
process.stdout.write(JSON.stringify(cases));
