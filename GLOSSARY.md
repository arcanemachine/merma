# Glossary

The words merma uses, in the page, the docs and the code. Use them as written here, and add a word here when a new
one comes in. Where Mermaid has a word, it is used; a word of merma's own says why. "Mermaid's word" means the one in
the flowchart syntax page of the Mermaid version pinned in `web/viewer.mjs` (12.2.0), or in the ids and `data-*`
attributes it draws. Where Mermaid has two words, one is used and the other noted, as for edge. A word in `code` is
Mermaid syntax.

## The diagram

| Word | Meaning |
|---|---|
| **diagram** | What a `.mmd` file describes and the page shows. |
| **file** | The `.mmd` file. The only source of truth: merma reads it, and writes edits into it. |
| **flowchart** | A diagram whose header is `flowchart` or `graph`: the only type merma edits. Others are view-only. |
| **header** | The `flowchart TD` line (after any frontmatter, directives and comments). |
| **direction** | `TD` / `TB`, `BT`, `LR`, `RL` on the header: which way the diagram runs. A subgraph can set its own. |
| **frontmatter** | The `---` block at the top of the file (title, config). |
| **directive** | An `%%{init: …}%%` line. |
| **comment** | A `%% …` line. |
| **statement** | One instruction in the file: a line, or part of a line between `;`. |
| **node** | A box in the diagram (Mermaid's term). |
| **node id** | The name a node has in the file (`charge` in `charge[Charge card]`). Never shown on the page, except as the text of a node drawn with no label. |
| **label** | The text shown on a node or an edge. |
| **shape** | How a node is drawn: `[box]`, `(rounded)`, `{decision}`, `((circle))`… or `@{ shape: … }`. |
| **edge** | A line between two nodes (Mermaid's term in its ids and current docs; its older docs say "link"). |
| **arrow** | An edge's connector syntax without its label: `-->`, `---`, `-.->`, `==>`, `--o`, `--x`, `<-->`, `~~~`… |
| **arrow type** | Which of those an arrow is, at any length (`---->` is a long `-->`): Arrow, Line, Dotted arrow, Dotted line, Thick arrow, Thick line, Circle, Cross, Two-way arrow (Mermaid: "multi directional"), Invisible. |
| **length** | How much longer than its shortest form an arrow is; it asks Mermaid for a longer edge. |
| **edge label** | An edge's text, as `-->|label|` (pipe form) or `-- label -->` (text form). merma writes the pipe form. |
| **edge id** | A name given to an edge in the file: `A e1@--> B`. Its settings go in an `e1@{ … }` statement. |
| **connector** | Everything between an edge's two nodes in the file: edge id, arrow and label. |
| **chain** | Several edges in one statement: `A --> B --> C`. |
| **`&` group** | Several nodes on one side of a connector: `A & B --> C`, which is two edges. |
| **subgraph** | A box around nodes (Mermaid's term): `subgraph id [Title]` … `end`. |
| **subgraph title** | The text shown on a subgraph. |
| **connect** | Make an edge between two nodes by pointing (Connect to…). |
| **`linkStyle`** | Styles an edge by its number: the Nth edge in the file. Why no edit ever reorders edges. |
| **`classDef`, `class`, `style`** | Named styles, applying them to nodes, and one-off node styles. |

## The page

Mermaid has no words for the page around the diagram, so these are merma's own: plain words where one fits, and a
note where merma had to make one up.

| Word | Meaning |
|---|---|
| **page** | merma in the browser, showing one file. |
| **view** | Where the diagram sits on screen: **zoom** (wheel), **move** (drag), **fit** (Reset view, double-click). |
| **render** | Mermaid drawing the diagram from the file's text. A file that does not parse keeps the last good render. |
| **select**, **selection**, **deselect** | Clicking a node or an edge marks it: it **glows**. One item at a time, for now. Deselect: let go of it (click empty space, or Escape). |
| **menu** | What right-click (or long-press) opens: the **node menu**, the **edge menu**, or the **empty-space menu**. Its items read verb + noun (`docs/ux.md`). |
| **submenu** | A menu opened from a menu item marked ▸, by a click on it (never by hovering). |
| **picker** | A grid of choices drawn as small icons, each with its digit: the arrow types (later the shapes). Shows the current one. |
| **greyed** | A menu item that does not apply right now: still there, with its reason. |
| **label box** | The text box laid over a node's or an edge's label to edit it in place (Edit label). merma's own. |
| **toast** | A short message at the top right that fades on its own, for a result not visible on screen: "Copied!", "SVG downloaded". Never an error. |
| **notice** | The bar above the diagram, of three kinds: **info** (blue, what to do next), **warning** (amber, what merma will not do here), **error** (red, what was not saved and why). `docs/ux.md` says which is which. |
| **edit** | One action that changes the file, written as a small text change and saved over the version it started from. |
| **undo**, **redo** | Taking back the page's own last edit, and putting it back; refused once the file has changed since. |
| **hit path** | The wide invisible line over each edge that makes it easy to click. merma's own. |
| **edge match** | Whether merma's reading of the edges agrees, edge for edge, with what Mermaid drew. Without it, edges can't be selected and nodes can't be deleted. merma's own. |
| **page marker** | A `data-page-…` attribute merma adds to the drawing; the SVG export leaves them out. merma's own. |

## Working on merma

| Word | Meaning |
|---|---|
| **scanner** | `edges()` and `statements()` in `web/patch/flowchart.mjs`: merma's reading of a flowchart's text. |
| **rewrite** | How an edit changes a statement in place without moving any other edge. |
| **build id** | Which version of merma's code a page is running; a page reloads itself when the server has another. |
| **shared server** | The merma server on port 63762, run from the live worktree. |
| **land** | Put committed, checked, reviewed work on the shared server (`./live.sh land`). |
| **fixture** | A hand-written test diagram in `test/fixtures/`. |
| **browser check** | A check that needs Mermaid itself, run in a browser (`checks/README.md`). |
| **mutation check** | Breaking the code on purpose to see a test fail (`checks/mutate.sh`). |
| **UAT** | Acceptance testing: by Haiku agents for behaviour, by the user for look and feel. |
