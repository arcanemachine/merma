// Every flowchart fixture as { name: text }, for the browser check that records Mermaid's own ids (fixture-ids.js).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isFlowchart } from '../web/patch/flowchart.mjs';
const F = join(import.meta.dirname, '..', 'test', 'fixtures');
const out = {};
for (const name of readdirSync(F).filter((n) => n.endsWith('.mmd')).sort()) {
  const text = readFileSync(join(F, name), 'utf8');
  if (isFlowchart(text)) out[name] = text;
}
process.stdout.write(JSON.stringify(out));
