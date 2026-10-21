# Using merma

What the page does, control by control. What goes here: what each gesture, key and menu item does. What does not: why
the page works the way it does (`docs/ux.md`), what the words mean (`GLOSSARY.md`), how to start merma (`README.md`).
The page's Help panel is a short subset of this guide: the gestures and the keys that work outside menus. Menu letters
are shown in the menus, and digits in the pickers, so Help does not list them.

## Viewing

- The wheel zooms at the cursor, and so does a pinch on a touch screen; a drag moves the diagram.
- A double-click on empty space, or **Reset view**, fits the diagram to the window. Once you have zoomed or moved it,
  edits keep your view, and so does a reload of the tab.
- The page follows the file: save it anywhere (your editor, an agent) and the diagram updates within a second. A save
  with a syntax error keeps the last good render on screen, with the error above it.
- **Copy SVG** and **Download SVG** export the diagram as the browser drew it.
- Click the file's path in the header to copy it.

## Selecting

In a flowchart, click a node, or an edge's line or label, to select it: it glows. Click empty space to deselect.
Right-click it (or long-press on a touch screen) for its menu. Other diagram types are view-only.

Edges can be selected only when merma can match the drawn edges to the text, edge for edge (an edge match). When it
cannot (a node id with `-` or `.`, a label spread over several lines), the page says so, and edges and deleting nodes
are left to the file.

## Menus

A menu stays open until you click anywhere else on the page or press Escape. M opens the selected node's or edge's
menu, or with nothing selected the empty-space menu. Each item's key is underlined: press it to run the item.
Up and Down move between items, Enter runs one. An item that does not apply right now is greyed: it says why when you
point at it or choose it. ▸ opens a submenu: click it, or press Right; Left or Escape closes it.

### Node menu

- **Add connected node** adds a new node with an edge from this one, then opens the label box on it. The edge is
  appended at the end of the file; if the node's last statement is inside a subgraph, the new node is declared there,
  so it joins the same subgraph. (`class`, `style` and `click` lines don't count: they usually sit at the bottom.)
- **Connect to…**, then a click on another node, adds `<a> --> <b>` at the end of the file, outside any subgraph, so
  neither node moves. A click anywhere else, or Escape, cancels.
- **Edit label** edits the label in place (the label box): Enter saves, Shift+Enter starts a new line (written as
  `<br>`), Escape cancels. Only the label changes, where the node is first given a shape; a node that only appears
  bare gets brackets at its first appearance.
- **Delete node** removes the node from every statement, with its edges, its `style` and `click` lines and its name in
  `class` lines. Greyed without an edge match.

### Edge menu

- **Edit label** edits the edge's label in place; it is written as `-->|"label"|`.
- **Remove label** removes it. Greyed when the edge has none.
- **Edit arrow type ▸** opens the arrow types; click one or press its digit. The arrow changes and keeps its label and
  its length (`---->` asks for a longer edge, and stays longer). An arrow merma does not offer (`o--o`) shows as
  "Other".

  | Digit | Arrow type | Syntax |
  |---|---|---|
  | 1 | Arrow | `-->` |
  | 2 | Line | `---` |
  | 3 | Dotted arrow | `-.->` |
  | 4 | Dotted line | `-.-` |
  | 5 | Thick arrow | `==>` |
  | 6 | Thick line | `===` |
  | 7 | Circle | `--o` |
  | 8 | Cross | `--x` |
  | 9 | Two-way arrow | `<-->` |
  | 0 | Invisible | `~~~` |

- **Reverse edge** turns the edge around (`A --> B` becomes `B --> A`, same arrow and label). Mermaid places nodes
  partly by the order it first meets them, so the layout may shift a little.
- **Delete edge** removes it. Its nodes stay.

### Empty space

Right-click empty space (or press M with nothing selected) for **Add node**; over a subgraph it reads **Add node in**
and the subgraph's title, and the node goes inside that subgraph. Mermaid lays the diagram out, so a new node lands
where the layout puts it.

## Keys

Outside menus, and not while typing in the label box. Keys are case-insensitive, here and in menus:

| Key | Does |
|---|---|
| N | Add a node, connected to the selected node if there is one |
| Enter or F2 | Edit the selected node's or edge's label |
| Delete or Backspace | Delete the selected node or edge |
| M | Open the selected node's or edge's menu; with nothing selected, Add node |
| Escape | Cancel Connect to…, or deselect |
| Ctrl \| ⌘+Z | Undo the page's last edit |
| Ctrl \| ⌘+Shift+Z or Ctrl+Y | Redo |

Ctrl | ⌘ is Ctrl on Linux and Windows, ⌘ (Cmd) on macOS. Help shows the keys for your system; a toggle at its bottom
switches between Windows and Linux, and macOS.

A double-click on a node or an edge edits its label too.

## Undo and redo

Undo takes back the page's last edit (adding a node and naming it count as one), as long as the file has not changed
since; it is refused otherwise, so it never throws away someone else's change. Redo puts an undone edit back, on the
same terms.

## What an edit changes

- Every other byte of the file stays as it was: comments, directives, frontmatter, spacing.
- Each edit is checked with Mermaid's parser before it is saved, and saved only over the version the page last read:
  if the file changed in the meantime (an agent, your editor), the save is refused, nothing is written, and the page
  shows the new version.
- No edit puts an edge before an existing one or changes the order of the edges (why: `docs/ux.md`).
- A connector shared with other edges (`A --> B & C`) is split just enough that only the chosen edge changes. A deleted
  edge's statement is rewritten in place: a chain is split there, and an `&` group is written one statement per start
  node, so every other edge keeps its place. `linkStyle` numbers follow: the deleted edge's goes, and the ones after it
  move down. A node left out of a rewritten statement is kept as a bare statement when it has a shape or label there,
  or when nothing else in its subgraph names it, so no node disappears or moves.

## Updates to merma itself

Every response from the server carries the build id of the code it has; when that differs from the one the page was
loaded with, the page reloads itself as soon as no edit is in progress. So open pages pick up a new version of merma
without anyone reloading them. The page polls its file once a second with `If-None-Match`, so an unchanged file comes
back as a bodiless 304 (in the browser's network panel, `-status-code:304` hides those).
