# Browser checks

Checks that need Mermaid itself, which runs only in a browser. Run them after changing `web/patch/`.

## Every edit parses

`gen-cases.mjs` applies the node edits (add connected, connect, rename, delete) to every node, and deletes every edge,
of every fixture in `test/fixtures/`. It does not yet cover `addNode`; add it there when changing that function.
`parse-check.js` runs each result through Mermaid's parser in the page, and checks that no existing node changed
subgraph (an edge line inside a subgraph pulls its nodes into that subgraph). For a delete, it also checks with
Mermaid that every other node is still there, and that the edges left are the old ones in the old order, each with
its old `linkStyle` style.

1. Start merma with a root you can write to, and open any diagram in that root in a browser.
2. Write the cases next to it, as a `.mmd` file so the server will hand it to the page:
   `node checks/gen-cases.mjs > <that root>/_cases.json.mmd`
3. In that page, evaluate `checks/parse-check.js` (a single async function; with pw-repl, flatten it to one line:
   `pw-repl send eval --all "$(tr '\n' ' ' < checks/parse-check.js)"`).
4. It returns `{ cases, fails }`. `fails` must be empty. Delete `_cases.json.mmd` afterwards.

## Mermaid's own ids for the fixtures

`test/fixtures/node-ids.json` and `edge-ids.json` hold the node ids and edge ids (in Mermaid's order) that Mermaid
itself gives each flowchart fixture; the unit tests check the edits against them. Regenerate both after adding or
changing a fixture:

1. As above, open any diagram in a root you can write to, and write the fixtures next to it:
   `node checks/fixtures-json.mjs > <that root>/_fixtures.json.mmd`
2. Evaluate `checks/fixture-ids.js` in the page the same way. It returns `{ nodes, edges, fails }`; `fails` lists any
   fixture whose edges Mermaid drew in another order than it numbered them, and must be empty.
3. Write `nodes` to `node-ids.json` and `edges` to `edge-ids.json`, and delete `_fixtures.json.mmd`.
