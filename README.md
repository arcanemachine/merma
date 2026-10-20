# merma

A live view of Mermaid diagram files in the browser, with point-and-click editing. Point it at a `.mmd` file and the
page re-renders within a second whenever the file changes, whoever saves it: you in your editor, or an agent. Edits
made in the page are written back into the file as small text changes, so the file stays plain Mermaid and the only
source of truth.

No runtime dependencies beyond Node (22 or later). The page loads Mermaid 12.2.0 from a CDN.

## Run

```bash
merma serve [port] [host]       # defaults 63762, 127.0.0.1
```

Then open `http://localhost:<port>/?f=<absolute path to a .mmd file>`. With no `?f=`, the page shows a scratch
diagram, `/tmp/mermaid-diagrams/scratch.mmd`, created on start if missing.

| Setting | What it does |
|---|---|
| `MERMA_ROOTS` | Folders whose `.mmd` files may be served, comma-separated. Default `/tmp/mermaid-diagrams/` |
| `MERMA_PATH_MAP` | `server=host` path prefixes, comma-separated. The page shows a file's host path, for a server in a container |
| `MERMA_IDLE` | Seconds with no requests before the server exits. Default 300. An open page polls every second, so the server runs while any tab is open |
| `MERMA_HOSTS` | Host names the page may be opened under, besides `localhost`, `127.0.0.1` and `[::1]` (and the bound address, when it is a single one), comma-separated. Requests addressed to any other name are refused, which stops DNS rebinding |

Binding to anything other than `127.0.0.1` lets anyone who can reach the machine read and edit the served diagrams:
there is no login.

## The page

The wheel zooms at the cursor, a drag moves the diagram, and a double-click on empty space (or Reset view) fits it
to the window. Once you have zoomed or moved it, edits keep your view, and so does a reload of the tab. A save with a
syntax error keeps the last good render on screen, with the error above it. Copy SVG and Download SVG export the
diagram as the browser drew it. Help lists the controls.

## Updates

The page polls its file once a second with `If-None-Match`, so an unchanged file comes back as a bodiless 304 (in
the browser's network panel, `-status-code:304` hides those). Every response also carries the build id of the code
the server has; when it differs from the one the page was loaded with, the page reloads itself, as soon as no edit
is in progress. So open pages pick up a new version of merma without anyone reloading them, and a server run from a
working copy reloads its pages on every save.

## Editing

In a flowchart, click a node to select it, and right-click it (or long-press on a touch screen) for its menu:

- **Add connected node** adds a new node with an edge from this one, then opens Rename on it. The edge is appended at
  the end of the file; if the node's last statement is inside a subgraph, the new node is declared there, so it
  joins the same subgraph. (`class`, `style` and `click` lines don't count: they usually sit at the bottom.)
- **Connect to…**, then a click on another node, adds `<a> --> <b>` at the end of the file, outside any subgraph, so
  neither node moves.
- **Rename** (or double-click the node, or Enter or F2 on a selected one) edits the label in place: Enter saves,
  Shift+Enter starts a new line (written as `<br>`), Escape cancels. Only the label changes, where the node is first
  given a shape; a node that only appears bare gets brackets at its first appearance.
- **Delete node** (or Delete or Backspace on a selected one) removes the node from every statement, with its edges,
  its `style` and `click` lines and its name in `class` lines.

Click an edge's line or its label to select it, and right-click it for its menu:

- **Edit label** (or double-click the edge, or Enter or F2 on a selected one) edits the label in place; the label is
  written as `-->|"label"|`, and an empty one removes it.
- **Reverse** turns the edge around (`A --> B` becomes `B --> A`, same arrow and label). Mermaid places nodes partly by
  the order it first meets them, so the layout may shift a little.
- The **arrow types** (`-->`, `---`, `-.->`, `==>`, `--o`, `--x`, `<-->`, `~~~` and more) change the arrow, keeping
  its label and its length (`---->` asks for a longer edge, and stays longer).
- **Delete edge** (or Delete or Backspace) removes it. Its nodes stay.

A connector shared with other edges (`A --> B & C`) is split just enough that only the chosen edge changes. A deleted edge's statement is rewritten in place: a chain is split there, and an `&` group
is written one statement per start node, so every other edge keeps its place. `linkStyle` numbers follow: the deleted
edge's goes, and the ones after it move down. A node left out of a rewritten statement is kept as a bare statement when
it has a shape or label there, or when nothing else in its subgraph names it, so no node disappears or moves.
Edges can be selected only when merma can match the drawn edges to the text, edge for edge; when it cannot (a node id
with `-` or `.`, a label spread over several lines), the page says so, and edges and node deletes are left to the
file.

Right-click empty space to add a node; over a subgraph, it goes inside that subgraph. **N** adds a node too: connected
to the selected one, if any. Mermaid lays the diagram out, so a new node lands where the layout puts it.

No edit ever puts an edge before an existing one or changes the order of the edges: `linkStyle N` styles the Nth edge
in the file, so that would restyle the edges after it.

**Ctrl+Z** (Cmd+Z) undoes the page's last edit (adding a node and naming it count as one), as long as the file has not
changed since; it is refused otherwise, so it never throws away someone else's change. **Ctrl+Shift+Z** (Cmd+Shift+Z)
or **Ctrl+Y** redoes an undone edit, on the same terms.

Every other byte of the file stays as it was: comments, directives, frontmatter, spacing. Each edit is checked with
Mermaid's parser before it is saved, and saved only over the version the page last read: if the file changed in the
meantime (an agent, your editor), the save is refused, nothing is written, and the page shows the new version. Other
diagram types are view-only.

## Layout

| Path | What it is |
|---|---|
| `bin/merma.js` | The command line: settings, the scratch file, idle exit |
| `server/server.js` | The routes (listed at the top of the file) |
| `server/files.js` | Which files may be served, reading them, and writing over a known version |
| `server/build.js` | The build id: which version of the code a page is running |
| `web/index.html`, `web/style.css` | The page's markup and styles |
| `web/main.mjs` | Wires the parts together; the header and footer |
| `web/source.mjs` | The diagram file: polled from the server, and saved over the version last read |
| `web/viewer.mjs` | Rendering, zoom, move and fit; reports clicks |
| `web/editor.mjs` | Selection, the node and empty-space menus, keys, renaming in place, saving, undo |
| `web/history.mjs` | The undo stack and when an undo is safe |
| `web/patch/flowchart.mjs` | The text edits themselves: pure functions, no DOM |
| `test/` | `npm test`; `test/fixtures/` holds hand-written flowcharts every edit is tested against |
| `checks/` | Checks that need a browser (`checks/README.md`) |
| `GLOSSARY.md` | The words merma uses, in the page, the docs and the code |

## License

MIT
