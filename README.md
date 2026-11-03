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

Then open `http://localhost:<port>/?f=<absolute path to a .mmd file>`, adding `&part=<subgraph id>` to open it fitted to
one subgraph (`docs/guide.md`, Viewing). With no `?f=`, the page shows a scratch
diagram, `/tmp/mermaid-diagrams/scratch.mmd`, created on start if missing.

Either way the server runs until you stop it (Ctrl+C), unless `MERMA_IDLE` is set.

| Setting | What it does |
|---|---|
| `MERMA_ROOTS` | For `serve`: folders whose `.mmd` files may be served, comma-separated. Default `/tmp/mermaid-diagrams/` |
| `MERMA_PATH_MAP` | `server=host` path prefixes, comma-separated. The page shows a file's host path, for a server in a container |
| `MERMA_IDLE` | Seconds with no requests before the server exits. Unset or 0: it runs until stopped. An open page polls every second, but a browser may freeze or unload a tab left in the background, which then stops asking |
| `BROWSER` | For `merma <file>`: a command to open the page with, arguments allowed (`firefox --new-tab`). Unset: the address is only printed |
| `MERMA_MAX_EDGES` | The most edges a diagram may have. Default: Mermaid's 500 |
| `MERMA_MAX_TEXT` | The most characters a diagram's code may have, leaving out comments and frontmatter. Default: Mermaid's 50,000. Mermaid's drawing slows as diagrams grow, so a higher limit is no promise of a quick render |
| `MERMA_HOSTS` | Host names the page may be opened under, besides `localhost`, `127.0.0.1` and `[::1]` (and the bound address, when it is a single one), comma-separated. Requests addressed to any other name are refused, which stops DNS rebinding |

Binding to anything other than `127.0.0.1` lets anyone who can reach the machine read and edit the served diagrams:
there is no login.

## A skill for agents

`merma skill` prints an agent skill (`SKILL.md`) that teaches an agent to use merma: serve a diagram, hand the page
to the user, and work on the same file with them. Save it as `merma/SKILL.md` in the folder your agent reads skills
from:

```bash
mkdir -p <skills folder>/merma
merma skill > <skills folder>/merma/SKILL.md
```

It is stamped with the version it came from and a hash of its text, so an agent can tell when its saved copy differs
from the merma in use and offer to update it, keeping its Custom rules section.

## Using it

`docs/guide.md` says what every gesture, menu item and key does; the page's Help button lists the main ones.

## Layout

| Path | What it is |
|---|---|
| `bin/merma.js` | The command line: opening one file, serving folders, settings, idle exit |
| `run.sh` | Runs `bin/merma.js` from a checkout |
| `server/server.js` | The routes (listed at the top of the file) |
| `server/files.js` | Which files may be served, reading them, and writing over a known version |
| `server/build.js` | The build id: which version of merma's code a page is running |
| `web/index.html`, `web/style.css` | The page's markup and styles |
| `web/main.mjs` | Wires the parts together; the header and footer |
| `web/source.mjs` | The diagram file: polled from the server, and saved over the version last read |
| `web/viewer.mjs` | Rendering, zoom, move and fit; reports clicks |
| `web/limits.mjs` | Mermaid's size limits: telling a render or save over one apart, and what the page says |
| `web/editor.mjs` | Selection, what each menu item and key does, the label box, saving, undo |
| `web/keys.mjs` | What the arrows, O and I do to the selection and to Connect to…'s candidate: the trail to retrace, and I's place inside |
| `web/menu-items.mjs` | What each menu holds, its keys, and the keys the page answers outside menus: data, no DOM |
| `web/menu.mjs`, `web/picker.mjs` | A menu drawn from its items; a grid of choices (arrow types, shapes), in a menu or under a text field |
| `web/arrow-types.mjs`, `web/shapes.mjs` | The arrow types and the shapes, each in a fixed, numbered order, with their names and icons |
| `web/icons.mjs` | The frame every icon shares |
| `web/grid.mjs` | Where an arrow key moves focus in a picker's grid |
| `web/navigate.mjs` | Where an arrow key moves the selection: along edges, or to the next thing that way |
| `web/find.mjs` | Find on /: which drawn items match, best first |
| `web/blink.mjs` | When find's current match blinks |
| `web/notices.mjs` | The notice's rows: a mode's notice, and what was refused in it under it |
| `web/place.mjs` | Where a menu goes so that it stays on screen |
| `web/frame.mjs` | The view that shows find's matches all at once |
| `web/collapse.mjs` | Collapsed subgraphs, page-side: the text the page draws, and what a hidden item is drawn as |
| `web/turn.mjs` | Rotate and flip, page-side: the directions the page draws the diagram with |
| `web/code-panel.mjs` | The code panel: the file's code, its dock, its handle and Follow selection |
| `web/dock.mjs` | Where the code panel docks, and how big it may be |
| `web/history.mjs` | The undo stack and when an undo is safe |
| `web/patch/flowchart.mjs` | The text edits themselves: pure functions, no DOM |
| `test/` | `npm test`; `test/fixtures/` holds hand-written flowcharts every edit is tested against |
| `skill/SKILL.md`, `server/skill.js` | The agent skill, and its stamp (`merma skill`) |
| `checks/` | Checks that need a browser (`checks/README.md`) |
| `tsconfig.json`, `web/tsconfig.json`, `types/` | Type-checking (`npm run typecheck`): the Node side, the page, and declarations JSDoc cannot make (Mermaid's CDN module). Not shipped |
| `GLOSSARY.md` | The words merma uses, in the page, the docs and merma's code |
| `docs/guide.md`, `docs/ux.md` | How to use the page; the rules it follows, and why |

## License

MIT
