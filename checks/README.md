# Browser checks

Checks that need Mermaid itself, which runs only in a browser. Run them after changing `web/patch/`.

## Every edit parses

`gen-cases.mjs` applies every edit (add, connect, rename) to every node of every fixture in `test/fixtures/`.
`parse-check.js` runs each result through Mermaid's parser in the page, and checks that no existing node changed
subgraph (an edge line inside a subgraph pulls its nodes into that subgraph).

1. Start merma with a root you can write to, and open any diagram in that root in a browser.
2. Write the cases next to it, as a `.mmd` file so the server will hand it to the page:
   `node checks/gen-cases.mjs > <that root>/_cases.json.mmd`
3. In that page, evaluate `checks/parse-check.js` (a single async function; with pw-repl, flatten it to one line:
   `pw-repl send eval --all "$(tr '\n' ' ' < checks/parse-check.js)"`).
4. It returns `{ cases, fails }`. `fails` must be empty. Delete `_cases.json.mmd` afterwards.
