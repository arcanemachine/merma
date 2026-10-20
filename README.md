# merma

A live view of Mermaid diagram files in the browser, with point-and-click editing. Point it at a `.mmd` file and the
page re-renders within a second whenever the file changes, whoever saves it: you in your editor, or an agent. Edits
made in the page are written back into the file as small text changes, so the file stays plain Mermaid and the only
source of truth.

No dependencies beyond Node (22 or later). The page loads Mermaid 12.2.0 from a CDN.

## Run

```bash
merma serve [port] [host]       # defaults 6376, 127.0.0.1
```

Then open `http://localhost:<port>/?f=<absolute path to a .mmd file>`. With no `?f=`, the page shows a scratch
diagram, `/tmp/mermaid-diagrams/scratch.mmd`, created on start if missing.

| Setting | What it does |
|---|---|
| `MERMA_ROOTS` | Folders whose `.mmd` files may be served, comma-separated. Default `/tmp/mermaid-diagrams/` |
| `MERMA_PATH_MAP` | `server=host` path prefixes, comma-separated. The page shows a file's host path, for a server in a container |
| `MERMA_IDLE` | Seconds with no requests before the server exits. Default 300. An open page polls every second, so the server runs while any tab is open |

Binding to anything other than `127.0.0.1` lets anyone who can reach the machine read the served diagrams: there is
no login.

## The page

The wheel zooms at the cursor, a drag moves the diagram, and a double-click (or Reset view) fits it to the window.
Once you have zoomed or moved it, edits keep your view. A save with a syntax error keeps the last good render on
screen, with the error above it. Copy SVG and Download SVG export the diagram as the browser drew it.

## Editing

In a flowchart, click a node for its menu:

- **Add connected node** adds `<node> --> n1["New node"]` after the node's last line (so a node in a subgraph gets its
  new neighbour in the same subgraph), then opens Rename on it.
- **Connect to…**, then a click on another node, adds `<a> --> <b>` at the end of the file, outside any subgraph, so
  neither node moves.
- **Rename** edits the label in place: Enter saves, Escape cancels. Only the label changes, where the node is first
  given a shape; a node that only appears bare gets brackets at its first appearance.

Every other byte of the file stays as it was: comments, directives, frontmatter, spacing. Each edit is checked with
Mermaid's parser before it is saved, and saved only over the version the page last read: if the file changed in the
meantime (an agent, your editor), the save is refused, nothing is written, and the page shows the new version. Other
diagram types are view-only.

## Layout

| Path | What it is |
|---|---|
| `bin/merma.js` | The command line: settings, the scratch file, idle exit |
| `server/server.js` | The routes (listed at the top of the file) |
| `server/files.js` | Which files may be served, and reading them |
| `web/index.html`, `web/style.css` | The page's markup and styles |
| `web/main.mjs` | Wires the parts together; the header and footer |
| `web/source.mjs` | The diagram file: polled from the server, and saved over the version last read |
| `web/viewer.mjs` | Rendering, zoom, move and fit; reports clicks |
| `web/editor.mjs` | Selection, the node menu, renaming in place, saving |
| `web/patch/flowchart.mjs` | The text edits themselves: pure functions, no DOM |
| `test/` | `npm test`; `test/fixtures/` holds hand-written flowcharts every edit is tested against |
| `checks/` | Checks that need a browser (`checks/README.md`) |

## License

MIT
