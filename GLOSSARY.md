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
| **shape** | How a node is drawn: `[box]`, `(rounded)`, `{decision}`, `((circle))`… or `@{ shape: … }`. Each has a name and a **meaning**, Mermaid's "Shape Name" and "Semantic Name": Diamond (Decision). |
| **edge** | A line between two nodes (Mermaid's term in its ids and current docs; its older docs say "link"). |
| **heading** | Of an edge at one of its ends: up, down, left or right, the way it goes as it leaves that end (`docs/ux.md` says how it is measured). merma's own: Mermaid has no word for it, and the arrow keys need one. |
| **arrow** | An edge's connector syntax without its label: `-->`, `---`, `-.->`, `==>`, `--o`, `--x`, `<-->`, `~~~`… |
| **arrow type** | Which of those an arrow is, at any length (`---->` is a long `-->`): Arrow, Line, Dotted arrow, Dotted line, Thick arrow, Thick line, Circle, Cross, Two-way arrow (Mermaid: "multi directional"), Invisible. |
| **length** | How much longer than its shortest form an arrow is; it asks Mermaid for a longer edge. |
| **edge label** | An edge's text, as `-->|label|` (pipe form) or `-- label -->` (text form). merma writes the pipe form. |
| **edge id** | A name given to an edge in the file: `A e1@--> B`. Its settings go in an `e1@{ … }` statement. |
| **connector** | Everything between an edge's two nodes in the file: edge id, arrow and label. |
| **chain** | Several edges in one statement: `A --> B --> C`. |
| **`&` group** | Several nodes on one side of a connector: `A & B --> C`, which is two edges. |
| **subgraph** | A box around nodes (Mermaid's term): `subgraph id [Title]` … `end`. |
| **box** | A node or a subgraph (drawn as its box): what an edge can join, and what the arrows land on besides edges. merma's own: Mermaid has no word for the two together. "A subgraph's box" is that subgraph as drawn. |
| **self-loop** | An edge from a node or a subgraph back to itself: `A --> A`. |
| **contents** | What a subgraph holds: its nodes and nested subgraphs, as Mermaid draws them. Never "children": parent and child are words for edges. |
| **subgraph id** | The name a subgraph has in the file (`pay` in `subgraph pay [Payment]`, or `Payment` in `subgraph Payment`). One written with none (`subgraph "Order log"`) is `subGraph<k>` to Mermaid, k counting every subgraph in the order their `end`s come. |
| **subgraph title** | The text shown on a subgraph. |
| **title** | The diagram's title, the frontmatter's `title:`, drawn over the diagram (Mermaid's word). Alone, "title" is this one; a subgraph's is its subgraph title. |
| **connect** | Make an edge between two nodes or subgraphs by pointing (Connect to…). |
| **`linkStyle`** | Styles an edge by its number: the Nth edge in the file. Why no edit ever reorders edges. |
| **`classDef`, `class`, `style`** | Named styles, applying them to nodes, and one-off node styles. |

## The page

Mermaid has no words for the page around the diagram, so these are merma's own: plain words where one fits, and a
note where merma had to make one up.

| Word | Meaning |
|---|---|
| **page** | merma in the browser, showing one file. |
| **view** | Where the diagram sits on screen: **zoom** (wheel, pinch, + and -), **move** (drag, arrows with nothing selected), **fit** (Fit to window, F, double-click). |
| **render** | Mermaid drawing the diagram from the file's text. A file that does not parse keeps the last good render. |
| **item** | A node, an edge or a subgraph: what can be selected, and what a menu belongs to. A menu's entries are **menu items**. merma's own; not "element", which in the code means a DOM element. |
| **select**, **selection**, **deselect** | Clicking a node, an edge or a subgraph marks it: it is **outlined** in blue. One item at a time, for now. Deselect: let go of it (click empty space, or Escape). |
| **fan** | The edges leaving a box one way (by their heading), left to right, or top to bottom: Down from a node selects the first of its down fan. merma's own. |
| **step across** | What the cross arrows do on an edge: to the edge beside it in a fan, never onto a node. Not "page", which is merma in the browser. merma's own. |
| **counted end** | The end a selected edge counts as reached from, whose fan the cross arrows step; marked by the end tick, and switched by Space or by clicking the line near the other end. merma's own. |
| **end tick** | The short blue bar across a selected edge near its counted end. merma's own. |
| **trail** | The arrow moves since the selection was last set another way, steps across left out: the opposite arrow retraces them, and a click, a find, O, I, an edit or Escape starts a new one. merma's own. |
| **place inside** | For each subgraph, the item you last left it by, which I goes back to; kept while keys select, forgotten on a click, a find or an edit. Not the trail. merma's own. |
| **find** | The / box: every item in the diagram holding what you typed is marked, on screen or off, and Enter selects the current match. The browser's word for the same thing (Find in page); not "search". |
| **menu** | What right-click (or long-press) opens: the **node menu**, the **edge menu**, the **subgraph menu**, or the **empty-space menu**. Its items read verb + noun (`docs/ux.md`). |
| **submenu** | A menu opened from a menu item marked ▸, by a click on it (never by hovering). |
| **picker** | A grid of choices drawn as small icons, each with its digit, named by what it picks: the **arrow type picker** (Edit arrow type ▸) and the **shape picker**. Shows the current one. |
| **grayed** | A menu item that does not apply right now: still there, with its reason. |
| **label box** | The text box laid over a node's or an edge's label, or a subgraph's title, to edit it in place (Edit node, Edit label, Edit title). merma's own. |
| **node panel** | A node's label box with the shape picker under it: what Edit node, Enter, F2, a double-click on a node and adding a node open. Enter in the label writes both. merma's own: one place to edit a node. |
| **shape picker** | The picker laid under a node's label box: click a shape, or Down from the label goes into it. |
| **toast** | A short message at the top right that fades on its own, for a result not visible on screen: "Copied!", "SVG downloaded". Never an error. |
| **notice** | The bar above the diagram, of three kinds: **info** (blue: what to do next, or nothing to do), **warning** (amber: something you asked for refused or kept back, or a risk to the file), **error** (red: something you tried that did not happen). `docs/ux.md` says which is which. |
| **color words** | **info**, **success**, **warning**, **error**: each a background and a text color that reads on it (`--info-bg`, `--info-fg`…, in `web/style.css`). Notices use three; success is the toasts'. |
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
| **UAT** | Acceptance testing: by Haiku agents for behavior, by the user for look and feel. |
