# Using merma

What the page does, control by control. What goes here: what each gesture, key and menu item does. What does not: why
the page works the way it does (`docs/ux.md`), what the words mean (`GLOSSARY.md`), how to start merma (`README.md`).
The page's Help panel is a short subset of this guide: the gestures and the keys that work outside menus. Menu letters
are shown in the menus (underlined, or at the right of the item), and digits in the pickers, so Help does not list
them.

## Viewing

- The wheel zooms at the cursor, and so does a pinch on a touch screen; a drag moves the diagram. None of them closes
  anything: the label box, find, Help, a menu and Connect to… stay open, and only a click away (or Escape) closes them.
- A double-click (or double-tap) on empty space (not on a subgraph), **Fit to window** in the empty-space menu, or F
  with nothing selected fits the diagram to the window; F with an item selected centers it instead, at the zoom it
  has (the title is fitted with the diagram), as **Center in window** in a node's, an edge's or a subgraph's menu
  does. 0 zooms to actual size. The diagram is fitted when the page opens; after that, edits keep the view as it
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
break those lines, so Edit title and Connect to… are grayed and say to give it an id in the file instead. A subgraph
whose id has `-` or `.` in it (valid in Mermaid, not here) cannot be selected.

Edges can be selected only when merma can match the drawn edges to the text, edge for edge (an edge match). When it
cannot (a node id with `-` or `.`, a label spread over several lines), the page says so, and edges and deleting nodes
are left to the file.

## Menus

A menu stays open until you click anywhere else on the page or press Escape. M opens the selection's menu, or
with nothing selected the empty-space menu. Each item's key is underlined: press it to run the item.
Up and Down move between items, Enter runs one. An item that does not apply right now is grayed: it says why when you
point at it or choose it. ▸ opens a submenu: click it, press its key, or press Right; Escape, its key again or
another click on it closes it.

### Node menu

- **Add connected node** adds a new node with an edge from this one, then opens the node panel on it. The edge is
  appended at the end of the file; if the node's last statement is inside a subgraph, the new node is declared there,
  so it joins the same subgraph. (`class`, `style` and `click` lines don't count: they usually sit at the bottom.)
- **Connect to…**, then a click on a node or a subgraph, adds `<a> --> <b>` at the end of the file, outside any
  subgraph, so neither node moves. Mermaid draws an edge to a subgraph to its box. A click on the node itself adds a
  self-loop, `<a> --> <a>`. A click anywhere else, or Escape, cancels. By keyboard, a dashed outline starts on the
  node itself (Enter at once makes a self-loop); the arrows move it by the same rules as the selection (Moving by
  keyboard, below), read out as it goes, and Enter connects to it; on an edge, Enter is refused.
- **Edit node** opens the node panel on it: its label and its shape (below).
- **Delete node** removes the node from every statement, with its edges, its `style` and `click` lines and its name in
  `class` lines. Grayed without an edge match. Reached by the arrows, the item you came from is selected after it
  (the first one still there); clicked, nothing is.

### Edge menu

- **Edit label** edits the edge's label in place, in the label box: Enter, a click or tap away, or Tab saves,
  Shift+Enter starts a new line, Escape cancels. It is written as `-->|"label"|`. Empty it to remove the label.
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
  partly by the order it first meets them, so the layout may shift a little. Grayed on a self-loop (a node connected
  to itself), which has no direction to reverse.
- **Delete edge** removes it. Its nodes stay. The item you came from by the arrows is selected after it, else its
  source node.

### Subgraph menu

- **Add node** adds a new node inside the subgraph, before its `end`, then opens the node panel on it.
- **Add subgraph** adds an empty subgraph inside this one (`subgraph s1 ["New subgraph"]` and its `end`), then opens
  the label box on its title (Escape there takes the add back, as for a node). Mermaid draws an empty subgraph as its
  title alone, until it has nodes.
- **Connect to…**, then a click on a node or another subgraph, adds an edge from this subgraph, as from a node, and by
  keyboard the same way.
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
**Find…** (/) opens the find (below). **Fit to window**, last, fits the diagram to the window, as F does with nothing
selected.

## The node panel

Edit node, Enter, F2 or a double-click on a node, and adding one (Add connected node, Add node, N), open its panel:
the label box over the node, and a strip of the shapes under it, the node's shape selected (a new node's is
Rectangle). Nothing is drawn until Enter in the label box, or a click or tap away, or Tab, which writes the label
and the shape as one change (only what changed); for a node just added, it is undone together with the add. Only
Escape closes the panel without writing. On a node just added, Escape takes the add back, as if it never was (Redo
does not bring it back); from the shapes it takes two, since the first goes back to the label. On a touch screen, tap
away and then Undo. Once the panel an add opened is closed, Undo takes the add back.

- **The label:** Shift+Enter starts a new line (written as `<br>`). A label cannot be empty: Enter on an emptied
  label is refused, and the panel stays open with the error; a click or tap away, or Tab, keeps the label as it was
  (still saving a shape picked meanwhile) and says so. A node drawn with none (a shape such as `bolt`) can still
  change shape with its label left empty. Only the label changes, where the node is first given a
  shape; a node that only appears bare gets brackets at its first appearance.
- **The shapes:** click one to select it. Or press Down (from the label's last line) to go into them: the arrows move
  (wrapping within their row or column), a digit selects one of the first ten and Shift+digit one of the next ten, by
  the number row's keys whatever they type on your layout (holding Shift turns their digits dark and the first ten's
  gray), Enter selects the one with the outline and goes
  back to the label, and Up from the top row or Escape goes back to the label, keeping what was selected.
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
| Shift+1 | Odd | Odd | `A>text]` |
| Shift+2 | Lean left | Data input/output | `A[\text\]` |
| Shift+3 | Trapezoid base bottom | Priority action | `A[/text\]` |
| Shift+4 | Trapezoid base top | Manual operation | `A[\text/]` |
| Shift+5 | Double circle | Stop | `A(((text)))` |
| Shift+6 | Stacked document | Multi-document | `A@{ shape: docs }` |
| Shift+7 | Sloped rectangle | Manual input | `A@{ shape: sl-rect }` |
| Shift+8 | Half-rounded rectangle | Delay | `A@{ shape: delay }` |
| Shift+9 | Bow tie rectangle | Stored data | `A@{ shape: bow-rect }` |
| Shift+0 | Curved trapezoid | Display | `A@{ shape: curv-trap }` |

## Keys

Outside menus, and not while typing in the label box. Keys are case-insensitive, here and in menus, and a letter
here does just what it does in the selected item's menu:

| Key | Does |
|---|---|
| N | Add a node: connected to the selected node, or inside the selected subgraph |
| R with an edge selected | Reverse it |
| C with a node or subgraph selected | Connect to… |
| Enter or F2 | Edit the selected node (its panel), the selected edge's label, or the selected subgraph's or diagram's title |
| Enter with nothing selected | Select the node nearest the middle of the view |
| Arrows with something selected | Walk the edges: an edge leaving that way, then on along it; across an edge, step to the next; with no edge, the next thing straight that way; the opposite arrow goes back (below) |
| Ctrl+Arrows (Option on a Mac) with something selected | Skip the edge to the node at its far end; with none, the next thing straight that way (below) |
| / (wherever it is on your keyboard) | Find in the whole diagram (below) |
| Space with an edge selected | Walk the other end's edges: the cross arrows step that end's fan (the tick moves there) |
| O | Select the subgraph the selection is in |
| I with a subgraph selected | Go into it: the item you last left it by, else its top-left one |
| Up from the top row, Down from the title | Select the diagram's title, and back to the nearest node below it |
| Delete or Backspace | Delete the selected node or edge |
| M (or the menu key, or Shift+F10) | Open the selection's menu; with nothing selected, the empty-space menu |
| F | Fit the diagram to the window (in any diagram, not only flowcharts); with an item selected, center it instead |
| Arrows with nothing selected | Move the diagram a tenth of the view; with Ctrl half of it, with Shift a fiftieth (in any diagram) |
| + (or =) and - | Zoom in and out, keeping the middle of the view where it is (in any diagram) |
| 0 | Zoom to actual size, keeping the middle of the view where it is (in any diagram) |
| Escape | Cancel Connect to…, or deselect (the arrows then move the diagram); Enter then selects it again |
| Ctrl \| ⌘+Z | Undo the page's last edit |
| Ctrl \| ⌘+Shift+Z or Ctrl+Y | Redo |

Ctrl | ⌘ is Ctrl on Linux and Windows, ⌘ (Cmd) on macOS. Help shows the keys for your system; a toggle at its bottom
switches between Windows and Linux, and macOS.

A double-click on a node or an edge edits its label too, and one on a subgraph its title.

### Moving by keyboard

The diagram is one stop for Tab. Each item reached is read out to screen readers, and brought into view when it is off
screen; one already in view moves nothing. The arrows are the diagram's wherever the keyboard is, except in the label
box, a menu or Help; while Help is open, no key acts on the diagram. A key with nowhere to go does nothing.

**Plain arrows walk the edges**, two presses a step (node, edge, node), and always mean their direction on screen.

- **From a box** (a node, or a subgraph's box), an arrow selects the first edge leaving it that way: Down an
  edge that heads down as it leaves (whichever way it points, and wherever on the outline it starts: the edges out of
  a diamond's lower corners head down), Right one that heads right, and so on; the leftmost first (for Left and Right,
  the topmost). A subgraph's edges include those crossing its border from a node inside it. These edges, all leaving
  one box the same way, are its **fan** that way.
- **On an edge**, the arrow along it goes to the box at that end. The other two **step** across: to the edge
  beside it in the fan at the end you came from (for an edge you clicked on its line, the end on the click's side of its
  label, or of its middle with none; on its label, or found, its source, the node written first in the file), and past the last one there, on into the fan at its
  other end, from its place there. They never land on a node, and stop at the last edge. From "Paid?", Down, then
  Right, Right, Right steps through its four edges; from the edge labelled no, Left steps on to Retry's edge to Charge
  card. A short blue bar across a selected edge near one end, the **end tick**, shows the end whose edges they step.
  **Space** switches to the other end: on the "yes" edge from "Paid?" to "Order log", reached from "Order log", Space
  then Left steps through "Paid?"'s edges instead. The opposite cross arrow steps back: Right then Left puts you back
  where you were, counting from the same end.
- **With no edge that way**, an arrow goes to the nearest box straight that way (overlapping you across the
  arrow, nested or not; the topmost or leftmost on a tie), else nothing: nothing off to the side. The subgraph you are
  in counts by its border, so with nothing nearer inside, you reach its box: from Print label, Right is Boxing; from
  Charge card, Up is Payment.
- **Into a subgraph.** The arrow that brought you to a subgraph goes on in; the other arrows walk its edges, as a
  node's do, and Ctrl+Arrow skips past it. Down goes in to the leftmost item along its top, Right to the topmost along
  its left side, Up to the rightmost along its bottom, Left to the lowest along its right side. Coming back out, the
  same arrow goes in again. Reaching a subgraph's box from inside it, the arrow you came out by goes on; the opposite one
  goes back in. A subgraph you clicked or found (or reached with O or Enter) goes in as if you had walked to it: the
  way the boxes beside it run (Down in a top-down diagram, Right in a left-right one), whichever way its own contents
  run.
- **A self-loop** (a node or a subgraph connected to itself) belongs to its box's fans at both its ends. Along it, an
  arrow goes back to its node; across it, the arrows step, or do nothing.

**The trail**: the opposite arrow takes back the move that brought you where you are, and again the one before, so you
can retrace your steps; steps across edges are passed over, never undone. An edge you step to has no way back of its own:
the arrow along it goes on to its end. Coming back onto an edge from a node, Left and Right step through that node's
edges. A click, a find, O, I, an edit or Escape starts the trail afresh.

**Ctrl+Arrows skip the edge** (Alt+Arrows also work; Option+Arrows on a Mac, where macOS keeps Ctrl+Arrows): to the
box at the far end of the edge the plain arrow would select, else the next thing straight that way. A far end
inside subgraphs you are not in lands on the outermost of their boxes, so Ctrl goes in a level a press. From an edge,
Ctrl+Arrow goes to the end that way. With nothing selected, Alt+Left and Alt+Right are the browser's (back and
forward).

**O and I** go out of and into subgraphs: O selects the subgraph the selection is in; I, on a subgraph, selects the
item you last left it by with O or an arrow, else its top-left one. A click, a find or an edit forgets that. At the
top, or with nothing inside, they do nothing.

Up (or Ctrl+Up) from a box with nowhere else to go, and nothing drawn above it, selects the diagram's title,
when there is one; Down from the title goes to the box nearest below it.

**Ways out**, wherever you are: / (find looks through the whole diagram), Ctrl+Arrows (they jump),
Up to the title, or Escape and a click. Escape clears the selection; Enter brings it back.

**Find** with / (or **Find…** in the empty-space menu, the way in on a phone): type, and every node, edge label,
subgraph and title holding what you typed (ignoring case), on screen or off, is outlined in amber (for an edge label,
its edge's line turns amber). The current match is filled: as you type, the best one on screen, else the best; the
count says how many are off screen ("2 of 5, 3 off screen"). Typing never moves the view. Tab and Shift+Tab move to
the next match and the one before; the first of them with any match off screen also moves the view once so every match
is on screen, zooming out only if they do not fit. Enter selects the current match, centering it when it is off
screen, and so does a click on it (or on anything else in the diagram); with nothing found, Enter does nothing. Escape closes the find and puts
back what was selected, and the view from before the find unless you moved it since; a click outside the diagram puts
back the selection and leaves the view where it is. The best match is the whole text, then one starting with it, then a
word starting with it, then any; higher first. Tab stays in the find box, and Escape is the way out of it. / again
shows what you last looked for, selected, so typing replaces it.

In Connect to…, the dashed outline starts on the node or subgraph the edge comes from and moves by the same rules as
the selection, through edges (Enter on one is refused), with I and O; Enter connects to the outlined one.

## Undo and redo

Undo takes back the page's last edit (adding a node or a subgraph and naming it count as one), as long as the file has not changed
since; it is refused otherwise, so it never throws away someone else's change. Redo puts an undone edit back, on the
same terms. Undo selects what was selected before the edit, so you see what came back; Redo selects what the edit
selected, unless you have moved since, when your selection stays. After a delete, the item you came from by the arrows
is selected (an edge's source, for one you clicked). **Undo** and **Redo** in the footer do the same, and are grayed when there is nothing to undo or redo. A
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
