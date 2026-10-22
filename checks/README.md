# Browser checks

Checks that need a browser: Mermaid itself (run after changing `web/patch/`), and accessibility (after changing
anything under `web/`).

## Every edit parses

`gen-cases.mjs` applies the node edits (add connected, connect, edit label, every shape, delete) to every node, the edge edits
(delete, label, unlabel, reverse, every arrow type) to every edge, and the subgraph edits (edit title, add a node or a
subgraph in it, connect to and from it) to every subgraph, of every fixture in `test/fixtures/`, plus adding a node
and a subgraph at the top level.
`parse-check.js` runs each result through Mermaid's parser in the page, and checks that no existing node changed
subgraph (an edge line inside a subgraph pulls its nodes into that subgraph), that what was added inside a subgraph is
in it, and that a new subgraph title is drawn as asked. For a delete, it also checks with
Mermaid that every other node is still there, and that the edges left are the old ones in the old order, each with
its old `linkStyle` style; for an edge edit, that every edge is in its place with its style, and that the changed one
has the arrow type and drawn label asked for; for a shape, that the node has it, with its label and classes, and that
no other node changed.

1. Start merma with a root you can write to, and open any diagram in that root in a browser.
2. Write the cases next to it, as a `.mmd` file so the server will hand it to the page:
   `node checks/gen-cases.mjs > <that root>/_cases.json.mmd`
3. In that page, run `checks/parse-check.js`: `pw-repl send eval --file=checks/parse-check.js`. It takes longer than
   one `eval` may (15 s), so it starts in the background and returns `started`; repeat
   `pw-repl send eval --all "window.__check"` until it is not null.
4. It gives `{ cases, fails }`. `fails` must be empty. Delete `_cases.json.mmd` afterwards.

## Every shape draws

After changing `web/shapes.mjs` or an icon: `checks/shapes.js` draws a node of every shape with Mermaid (12.2.0 parses
a shape name it lacks, then fails to draw it), and every picker icon in the page, checking that each has a size and
stays inside its frame. `pw-repl send eval --timeout=60s --file=checks/shapes.js` in any merma page; it returns the
failures, `[]` to pass.

## Mermaid's own ids for the fixtures

`test/fixtures/node-ids.json`, `edge-ids.json` and `subgraph-ids.json` hold the node ids, edge ids (in Mermaid's order)
and subgraph ids that Mermaid itself gives each flowchart fixture; the unit tests check the edits against them.
Regenerate them after adding or changing a fixture:

1. As above, open any diagram in a root you can write to, and write the fixtures next to it:
   `node checks/fixtures-json.mjs > <that root>/_fixtures.json.mmd`
2. Run `checks/fixture-ids.js` in the page: `pw-repl send eval --all --file=checks/fixture-ids.js`. It returns
   `{ nodes, edges, subgraphs, fails }`; `fails` lists any fixture whose edges Mermaid drew in another order than it
   numbered them, and must be empty.
3. Write `nodes` to `node-ids.json`, `edges` to `edge-ids.json` and `subgraphs` to `subgraph-ids.json`, and delete
   `_fixtures.json.mmd`.

## Clicking an edge

`checks/edge-point.js` gives a point on an edge's line that no node covers, for a click in a check or a UAT brief:
`pw-repl send eval --file=checks/edge-point.js 'path[data-page-only][data-page-edge="<id>"]'` prints `X Y`, then
`pw-repl send mouse click X Y` (add `right` for a right-click).

## Accessibility

Two tools, both for checks only: each script loads its tool from the CDN at a pinned version, never in the page's own
code. Run them on a development server, never the shared one, and reload the page afterwards (the tools stay loaded in
it).

**The scan**, after any change under `web/`: `checks/a11y-scan.js` runs axe-core (WCAG 2.2 A and AA, and axe's best
practices) on what the page shows now, leaving out the diagram, and lists each violation as `[rule, impact, count,
first targets]`. Pass: `[]`. `pw-repl send eval --all --timeout=30s --file=checks/a11y-scan.js`. Scan it in each of
these states, since each shows other elements and colours: nothing open; a node menu; an edge menu with a greyed
item; a subgraph menu; the empty-space menu; the arrow-type picker; the shape picker; the strip, with focus in its
grid; each notice kind (Connect to… for info, a greyed item's key for warning, an empty label on Enter for error); the
label box; Help. With `'#stage'` after the file it scans only the diagram: that is Mermaid's
markup, so its findings are recorded as Mermaid's and never fixed here.

**The virtual screen reader**, after a change to messages, live regions, names or roles: `checks/a11y-heard.js` runs
Guidepup's virtual screen reader, a model of a screen reader built from the page's roles, names and live regions (not
VoiceOver or NVDA). Run it once to start listening, do the action (`press`, `mouse click`), wait about 100 ms (longer
when the action saves and redraws), and run it again: it returns what was announced, as `"polite: …"` or
`"assertive: …"`. With a selector after the file (`'#help'`) it reads that element from the top instead, item by
item. It reads the text of the diagram's `<style>` element aloud, which real screen readers skip.
