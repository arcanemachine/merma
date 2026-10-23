# Using merma

What the page does, control by control. What goes here: what each gesture, key and menu item does. What does not: why
the page works the way it does (`docs/ux.md`), what the words mean (`GLOSSARY.md`), how to start merma (`README.md`).
The page's Help panel is a short subset of this guide: the gestures and the keys that work outside menus. Menu letters
are shown in the menus, and digits in the pickers, so Help does not list them.

## Viewing

- The wheel zooms at the cursor, and so does a pinch on a touch screen; a drag moves the diagram.
- A double-click (or double-tap) on empty space (not on a subgraph), **Fit to window** in the empty-space menu, or F
  fits the diagram to the window. The diagram is fitted when the page opens; after that, edits keep the view as it
  is (a diagram that grows can run past the edge: fit it again). Until you zoom or move it, a change in the window's
  size fits it again; once you have, a reload of the tab keeps your view too.
- The page follows the file: save it anywhere (your editor, an agent) and the diagram updates within a second. A save
  with a syntax error keeps the last good render on screen, with the error above it.
- **Export ▴** in the footer opens a menu: **Copy SVG** and **Download SVG** export the diagram as the browser drew
  it.
- The header shows the file's path on one line, cut at the start when it is long so the file name stays in view;
  hover for all of it. Click or tap it to copy the whole path.

## Selecting

In a flowchart, click a node, an edge's line or label, a subgraph (anywhere on its box that is not a node or an
edge), or the diagram's title, to select it: it is outlined in blue (the title is underlined). After an edit, what it acted on stays selected (a new node or edge
included), so you can go on from it: N adds the next node, Enter edits it, M opens its menu. A delete, undo and
redo leave nothing selected. Click empty space to deselect. Right-click it (or long-press on a touch screen) for its
menu. Other diagram types are view-only.

A subgraph written with no id (`subgraph "Order log"`, or a title with spaces) is known only by the name Mermaid gives
it, which changes as subgraphs come and go: such a subgraph stays selected only while the file is unchanged. An edit
that has to name it in the file (Edit title, Connect to…) first gives it an id of its own, `s1`, in the same edit:
`subgraph s1 ["Order log"]`. When the file already names it by Mermaid's name (`style subGraph1 …`), that would
break those lines, so Edit title and Connect to… are greyed and say to give it an id in the file instead. A subgraph
whose id has `-` or `.` in it (valid in Mermaid, not here) cannot be selected.

Edges can be selected only when merma can match the drawn edges to the text, edge for edge (an edge match). When it
cannot (a node id with `-` or `.`, a label spread over several lines), the page says so, and edges and deleting nodes
are left to the file.

## Menus

A menu stays open until you click anywhere else on the page or press Escape. M opens the selection's menu, or
with nothing selected the empty-space menu. Each item's key is underlined: press it to run the item.
Up and Down move between items, Enter runs one. An item that does not apply right now is greyed: it says why when you
point at it or choose it. ▸ opens a submenu: click it, press its key, or press Right; Escape, its key again or
another click on it closes it.

### Node menu

- **Add connected node** adds a new node with an edge from this one, then opens the node panel on it. The edge is
  appended at the end of the file; if the node's last statement is inside a subgraph, the new node is declared there,
  so it joins the same subgraph. (`class`, `style` and `click` lines don't count: they usually sit at the bottom.)
- **Connect to…**, then a click on another node or a subgraph, adds `<a> --> <b>` at the end of the file, outside any
  subgraph, so neither node moves. Mermaid draws an edge to a subgraph to its box. A click anywhere else, or Escape,
  cancels. By keyboard, the arrows reach the node to connect to, along the edges from this one (outlined dashed, and
  read out), and Enter connects to it; only nodes are reached this way, not subgraphs.
- **Edit node** opens the node panel on it: its label and its shape (below).
- **Delete node** removes the node from every statement, with its edges, its `style` and `click` lines and its name in
  `class` lines. Greyed without an edge match.

### Edge menu

- **Edit label** edits the edge's label in place, in the label box: Enter, a click or tap away, or Tab saves,
  Shift+Enter starts a new line, Escape cancels. It is written as `-->|"label"|`.
- **Remove label** removes it. Greyed when the edge has none.
- **Edit arrow type ▸** opens the arrow types, each named on the line under them, as the strip names shapes; click one
  or press its digit, and the picker stays open on the new arrow type for another pick, until a click away or Escape;
  each pick is its own change and undo step. The arrow changes and keeps its label and its length (`---->` asks for a longer edge, and stays longer). An arrow merma does not offer (`o--o`) shows as
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

### Subgraph menu

- **Add node** adds a new node inside the subgraph, before its `end`, then opens the node panel on it.
- **Add subgraph** adds an empty subgraph inside this one (`subgraph s1 ["New subgraph"]` and its `end`), then opens
  the label box on its title (Escape there takes the add back, as for a node). Mermaid draws an empty subgraph as its
  title alone, until it has nodes.
- **Connect to…**, then a click on a node or another subgraph, adds an edge from this subgraph, as from a node. By
  keyboard, the first arrow reaches the node nearest the middle of the view.
- **Edit title** edits the title in place, in the label box, saved as an edge label is: `subgraph pay [Payment]` becomes
  `subgraph pay ["New title"]`. A title that is also the id keeps it: `subgraph Payment` becomes
  `subgraph Payment ["New title"]`. A title cannot be empty: Enter on an emptied one is refused, and a click away or Tab
  keeps the title as it was.

Deleting a subgraph is not supported yet: Delete or Backspace on one says so. Edit it in the file.

### Title menu

The diagram's title is the frontmatter's `title:`, drawn over the diagram; a diagram with none has no title to select.
- **Edit title** edits it in place, in the label box: `title: Old` becomes `title: New title`, or
  `title: "Step: one"` where YAML would read the plain words otherwise. A title cannot be empty, as for a subgraph. A
  title written over several lines (`title: >`) is refused: edit it in the file.

Removing the title is not supported: Delete or Backspace on it says so.

### Empty space

Right-click empty space (or press M with nothing selected) for **Add node** and **Add subgraph**, which add them at the
top level, at the end of the file. Mermaid lays the diagram out, so what you add lands where the layout puts it.
**Fit to window**, last, fits the diagram to the window, as F does anywhere.

## The node panel

Edit node, Enter, F2 or a double-click on a node, and adding one (Add connected node, Add node, N), open its panel:
the label box over the node, and a strip of the shapes under it, the node's shape selected (a new node's is
Rectangle). Nothing is drawn until Enter in the label box, or a click or tap away, or Tab, which writes the label
and the shape as one change (only what changed); for a node just added, it is undone together with the add. Only
Escape closes the panel without writing. On a node just added, Escape takes the add back, as if it never was (Redo
does not bring it back); from the shapes it takes two, since the first goes back to the label. On a touch screen, tap
away and then Undo. Once the panel an add opened is closed, Undo is the way back.

- **The label:** Shift+Enter starts a new line (written as `<br>`). A label cannot be empty: Enter on an emptied
  label is refused, and the panel stays open with the error; a click or tap away, or Tab, keeps the label as it was
  (still saving a shape picked meanwhile) and says so. A node drawn with none (a shape such as `bolt`) can still
  change shape with its label left empty. Only the label changes, where the node is first given a
  shape; a node that only appears bare gets brackets at its first appearance.
- **The shapes:** click one to select it. Or press Down (from the label's last line) to go into them: the arrows move
  (wrapping within their row or column), a digit selects one of the first ten, Enter selects the one with the outline
  and goes back to the label, and Up from the top row or Escape goes back to the label, keeping what was selected.
  The selected shape is filled; the outline is where the arrows are. The line under them names the shape under the
  pointer, else the one the arrows are on, else the selected one ("Current: Rectangle (Process)").
- **What is written:** the shape changes where Mermaid takes it from, the node's last mention with one, and the label
  stays as written. Shapes with brackets keep that form (`B{OK?}`); the others are written
  `B@{ shape: doc, label: "OK?" }`, after any `:::class`. A label with a `}`, or a Markdown label, cannot move into
  that form: Enter says so, and the panel stays open with what you typed. A shape merma does not offer (`bolt`) is
  named on the line, with none selected.

| Digit | Shape | Meaning | Syntax |
|---|---|---|---|
| 1 | Rectangle | Process | `A[text]` |
| 2 | Rounded rectangle | Event | `A(text)` |
| 3 | Diamond | Decision | `A{text}` |
| 4 | Stadium | Terminal point | `A([text])` |
| 5 | Cylinder | Database | `A[(text)]` |
| 6 | Lean right | Data input/output | `A[/text/]` |
| 7 | Framed rectangle | Subprocess | `A[[text]]` |
| 8 | Hexagon | Prepare conditional | `A{{text}}` |
| 9 | Circle | Start | `A((text))` |
| 0 | Document | Document | `A@{ shape: doc }` |
|  | Odd | Odd | `A>text]` |
|  | Lean left | Data input/output | `A[\text\]` |
|  | Trapezoid base bottom | Priority action | `A[/text\]` |
|  | Trapezoid base top | Manual operation | `A[\text/]` |
|  | Double circle | Stop | `A(((text)))` |
|  | Stacked document | Multi-document | `A@{ shape: docs }` |
|  | Sloped rectangle | Manual input | `A@{ shape: sl-rect }` |
|  | Half-rounded rectangle | Delay | `A@{ shape: delay }` |
|  | Bow tie rectangle | Stored data | `A@{ shape: bow-rect }` |
|  | Curved trapezoid | Display | `A@{ shape: curv-trap }` |

## Keys

Outside menus, and not while typing in the label box. Keys are case-insensitive, here and in menus:

| Key | Does |
|---|---|
| N | Add a node: connected to the selected node, or inside the selected subgraph |
| Enter or F2 | Edit the selected node (its panel), the selected edge's label, or the selected subgraph's or diagram's title |
| Enter with nothing selected | Select the node nearest the middle of the view |
| Arrows with a node selected | Select the next node along the edges (below) |
| Shift+Arrows with a node selected | Select the nearest node that way on screen, connected or not |
| Ctrl+Arrows (Option on a Mac) with a node or edge selected | Select its edges, and step between them (below) |
| Arrows with an edge selected | Down and Up to the nodes at its ends; Left and Right to the edges beside it |
| 1–9, 0 with a node selected | Give it that shape, by its digit in the node panel's shapes; the shape it has writes nothing |
| 1–9, 0 with an edge selected | Give it that arrow type, by its digit in Edit arrow type ▸ |
| Up from the top row, Down from the title | Select the diagram's title, and back to the nearest node below it |
| Delete or Backspace | Delete the selected node or edge |
| M | Open the selection's menu; with nothing selected, the empty-space menu |
| F | Fit the diagram to the window (in any diagram, not only flowcharts) |
| Arrows or Shift+Arrows with nothing selected | Move the diagram, a tenth of the view at a time (in any diagram) |
| + (or =) and - | Zoom in and out, keeping the middle of the view where it is (in any diagram) |
| Escape | Cancel Connect to…, or deselect (the arrows then move the diagram) |
| Ctrl \| ⌘+Z | Undo the page's last edit |
| Ctrl \| ⌘+Shift+Z or Ctrl+Y | Redo |

Ctrl | ⌘ is Ctrl on Linux and Windows, ⌘ (Cmd) on macOS. Help shows the keys for your system; a toggle at its bottom
switches between Windows and Linux, and macOS.

A double-click on a node or an edge edits its label too, and one on a subgraph its title.

### Moving along the edges

The diagram is one stop for Tab. With a node selected, the arrows follow the edges, as the diagram is drawn top to
bottom: Down goes to the node this one points to (the leftmost, when there are several), Left and Right step through
the other nodes the same node points to, and Up goes back the way you came, or else to the leftmost node pointing to
this one. Where several nodes point to one, Up picks one of them and Left and Right step through the rest. Left and
Right stop at the last one; they do not wrap. "Leftmost" and "next" are where the nodes are drawn, not their order in
the file. In a diagram drawn left to right (`flowchart LR`) the arrows turn with it: Right goes forward, Up and Down
step through, and likewise for `BT` and `RL`. A subgraph's own `direction` is not followed. Each node reached is read
out to screen readers, and brought into view when it is off screen; one already in view moves nothing. The arrows are
the diagram's wherever the keyboard is, except in the label box, a menu or Help; while Help is open, no key acts on
the diagram.

Up from a node where Up has nowhere else to go, along the edges or on screen, selects the diagram's title, when there
is one; Down from the title goes to the node nearest below it. Shift+Arrows never reach the title.

Ctrl+Arrows (Alt+Arrows also work; Option+Arrows on a Mac, where macOS keeps Ctrl+Arrows) select edges: from a node,
Ctrl+Down selects the first edge leaving it and Ctrl+Up the first edge coming into it ("first" is leftmost on screen,
by the node at the other end). With an edge selected, Down goes to the node it points to and Up to the node it comes
from, and Left and Right, with or without Ctrl, step through the edges it was reached among (else the edges leaving
the same node), without wrapping. They turn with the diagram's direction, as the plain arrows do. Each edge reached is
read out by its two ends.

Shift+Arrows go by place instead: to the nearest node in that direction on screen (its middle within 45° of the
arrow), connected or not. Nothing there, nothing happens; they do not wrap. In Connect to… they move the node to
connect to the same way.

## Undo and redo

Undo takes back the page's last edit (adding a node or a subgraph and naming it count as one), as long as the file has not changed
since; it is refused otherwise, so it never throws away someone else's change. Redo puts an undone edit back, on the
same terms. **Undo** and **Redo** in the footer do the same, and are greyed when there is nothing to undo or redo. A
press on either while an edit is still saving (a label box's own save, started by that press as a click away) does
nothing but say so: press again.

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
