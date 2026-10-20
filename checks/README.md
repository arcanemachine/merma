# Browser checks

Checks that need Mermaid itself, which runs only in a browser. Run them after changing `web/patch/`.

## Every edit parses

`gen-cases.mjs` applies the node edits (add connected, connect, rename, delete) to every node, and the edge edits
(delete, label, unlabel, reverse, every arrow type) to every edge, of every fixture in `test/fixtures/`. It does not yet cover `addNode`; add it there when changing that function.
`parse-check.js` runs each result through Mermaid's parser in the page, and checks that no existing node changed
subgraph (an edge line inside a subgraph pulls its nodes into that subgraph). For a delete, it also checks with
Mermaid that every other node is still there, and that the edges left are the old ones in the old order, each with
its old `linkStyle` style; for an edge edit, that every edge is in its place with its style, and that the changed one
has the arrow type and drawn label asked for.

1. Start merma with a root you can write to, and open any diagram in that root in a browser.
2. Write the cases next to it, as a `.mmd` file so the server will hand it to the page:
   `node checks/gen-cases.mjs > <that root>/_cases.json.mmd`
3. In that page, run `checks/parse-check.js`: `pw-repl send eval --file=checks/parse-check.js`. It takes longer than
   one `eval` may (15 s), so it starts in the background and returns `started`; repeat
   `pw-repl send eval --all "window.__check"` until it is not null.
4. It gives `{ cases, fails }`. `fails` must be empty. Delete `_cases.json.mmd` afterwards.

## Mermaid's own ids for the fixtures

`test/fixtures/node-ids.json` and `edge-ids.json` hold the node ids and edge ids (in Mermaid's order) that Mermaid
itself gives each flowchart fixture; the unit tests check the edits against them. Regenerate both after adding or
changing a fixture:

1. As above, open any diagram in a root you can write to, and write the fixtures next to it:
   `node checks/fixtures-json.mjs > <that root>/_fixtures.json.mmd`
2. Run `checks/fixture-ids.js` in the page: `pw-repl send eval --all --file=checks/fixture-ids.js`. It returns
   `{ nodes, edges, fails }`; `fails` lists any fixture whose edges Mermaid drew in another order than it numbered
   them, and must be empty.
3. Write `nodes` to `node-ids.json` and `edges` to `edge-ids.json`, and delete `_fixtures.json.mmd`.

## Clicking an edge

`checks/edge-point.js` gives a point on an edge's line that no node covers, for a click in a check or a UAT brief:
`pw-repl send eval --file=checks/edge-point.js 'path[data-page-only][data-page-edge="<id>"]'` prints `X Y`, then
`pw-repl send mouseclick X Y` (add `right` for a right-click).
