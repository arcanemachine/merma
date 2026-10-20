# merma

A live view of Mermaid diagram files in the browser, with point-and-click editing. Point it at a `.mmd` file and the
page re-renders within a second whenever the file changes, whoever saves it: you in your editor, or an agent. Edits
made in the page are written back into the file as small text changes, so the file stays plain Mermaid and the only
source of truth.

No runtime dependencies beyond Node (22 or later). The page loads Mermaid 12.2.0 from a CDN.

## Run

```bash
./run.sh path/to/diagram.mmd    # from a checkout; the same as: merma path/to/diagram.mmd
```

It prints the page's address; open it. Only that file is served, on a free port. Give a port as well
(`merma diagram.mmd 6378`) to get the same address each time: if a merma already serves the file there, it prints
that address instead of starting another (and if the merma there serves other files, it says so and takes a free
port).

To serve every diagram in some folders, from one long-running server:

```bash
merma serve [port] [host]       # defaults 63762, 127.0.0.1
```

Then open `http://localhost:<port>/?f=<absolute path to a .mmd file>`. With no `?f=`, the page shows a scratch
diagram, `/tmp/mermaid-diagrams/scratch.mmd`, created on start if missing.

Either way the server stops on its own a while after the last page is closed (`MERMA_IDLE`).

| Setting | What it does |
|---|---|
| `MERMA_ROOTS` | For `serve`: folders whose `.mmd` files may be served, comma-separated. Default `/tmp/mermaid-diagrams/` |
| `MERMA_PATH_MAP` | `server=host` path prefixes, comma-separated. The page shows a file's host path, for a server in a container |
| `MERMA_IDLE` | Seconds with no requests before the server exits. Default 300. An open page polls every second, so the server runs while any tab is open |
| `BROWSER` | For `merma <file>`: a command to open the page with, arguments allowed (`firefox --new-tab`). Unset: the address is only printed |
| `MERMA_HOSTS` | Host names the page may be opened under, besides `localhost`, `127.0.0.1` and `[::1]` (and the bound address, when it is a single one), comma-separated. Requests addressed to any other name are refused, which stops DNS rebinding |

Binding to anything other than `127.0.0.1` lets anyone who can reach the machine read and edit the served diagrams:
there is no login.

## Using it

`docs/guide.md` says what every gesture, menu item and key does; the page's Help button lists the main ones.

## Layout

| Path | What it is |
|---|---|
| `bin/merma.js` | The command line: opening one file, serving folders, settings, idle exit |
| `run.sh` | Runs `bin/merma.js` from a checkout |
| `server/server.js` | The routes (listed at the top of the file) |
| `server/files.js` | Which files may be served, reading them, and writing over a known version |
| `server/build.js` | The build id: which version of the code a page is running |
| `web/index.html`, `web/style.css` | The page's markup and styles |
| `web/main.mjs` | Wires the parts together; the header and footer |
| `web/source.mjs` | The diagram file: polled from the server, and saved over the version last read |
| `web/viewer.mjs` | Rendering, zoom, move and fit; reports clicks |
| `web/editor.mjs` | Selection, what each menu item and key does, the label box, saving, undo |
| `web/menu-items.mjs` | What each menu holds, its keys, and the keys the page answers outside menus: data, no DOM |
| `web/menu.mjs`, `web/picker.mjs` | A menu drawn from its items; a grid of choices (arrow types) |
| `web/arrow-types.mjs` | The arrow types in their fixed, numbered order, with their names and icons |
| `web/place.mjs` | Where a menu goes so that it stays on screen |
| `web/history.mjs` | The undo stack and when an undo is safe |
| `web/patch/flowchart.mjs` | The text edits themselves: pure functions, no DOM |
| `test/` | `npm test`; `test/fixtures/` holds hand-written flowcharts every edit is tested against |
| `checks/` | Checks that need a browser (`checks/README.md`) |
| `GLOSSARY.md` | The words merma uses, in the page, the docs and the code |
| `docs/guide.md`, `docs/ux.md` | How to use the page; the rules it follows, and why |

## License

MIT
