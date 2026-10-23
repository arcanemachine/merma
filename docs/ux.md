# UX rules

How the page behaves, and why. Read before changing anything the user sees. What goes here: rules that hold across
the page, each with its reason. What does not: what each control does (`docs/guide.md`), what words mean
(`GLOSSARY.md`), what is planned.

## The file comes first

- Every action is one small text edit to the `.mmd` file, and one undo step. Nothing the page adds (positions,
  selection, view) is written into the file. The file is shared with editors and agents; the page is a view of it.
- No edit moves an edge: `linkStyle N` styles the Nth edge in the file, so moving one restyles others.
- The page never redraws as a preview while you choose (a shape, an arrow type): a redraw is a save, and agents
  watching the file would see each keypress. The choice is shown beside what you are editing, and saved on Enter.

## Words

- Help reads like the menus: each row's action is verb + noun, no articles or asides ("Fit to window", "Edit label").
  When a gesture or key does different things depending on what it is on or what is selected, it gets a row per case,
  and the case is named on the left ("Double-click empty space", "N with a node selected"). One action whatever the
  target ("Open menu": the target's own menu) is one row, and so is a key that backs out of whatever is open ("Cancel
  or deselect").

- Mermaid's word wherever it has one: node, edge, label, shape, subgraph, title, direction, arrow type, length. A word
  of merma's own needs a reason, given in `GLOSSARY.md`. Readers who know Mermaid should not have to translate.
- No em dashes in the page's text (the user): a colon or parentheses instead ("Current: Diamond (Decision)").
- Menu labels are in sentence case and read verb + noun, from a fixed set of verbs, so one label predicts the next:

  | Verb | Means | Examples |
  |---|---|---|
  | Add | makes a new thing | Add node, Add connected node |
  | Edit | changes a thing's own properties | Edit label, Edit title, Edit arrow type ▸, Edit node |
  | Remove | clears a property; the thing stays | Remove label |
  | Delete | the thing goes | Delete node, Delete edge |
  | Connect, Reverse, Move | what they say | Connect to…, Reverse edge, Move edge… |
  | Fit | changes the view, not the file | Fit to window |
  | Copy, Download | take the diagram out of the page | Copy SVG, Download SVG |

- An ellipsis (…) means "then you do something" (click a node, drag a handle), nothing else. ▸ opens a submenu. ▴ on
  a button opens a menu above it (Export ▴): the footer's other buttons act at once.
- A submenu or picker is titled with the noun alone ("Shape"); the verb is on the item that opens it.

## Gestures and keys

- One gesture, one kind of outcome. A gesture that adds never deletes; removing is always a deliberate Delete. When
  there is nothing to add, it shows what exists instead of changing anything.
- No hidden affordances. A shortcut is shown where its item is: a letter underlined, or a digit in a picker. Names
  show as text: a picker's line names the entry under the pointer, else the one with keyboard focus, else the current
  one. On touch, which
  has no hover, that is the current one only (a known trade: the picker stays open after a pick, so a tap shows it).
- Not every key needs a hint on the page (the user). A hint goes on the page only where it fits and is worth its
  space; the guide holds the rest. A little friction while learning is fine when what the page shows leads the way:
  the strip's digits say there is a way in, and Down from the label box is it.
- Nothing moves under the pointer: a menu or picker never changes its items while it is open, and a notice lies over
  the top of the diagram instead of pushing it down (a fitted diagram leaves room for one line of it), since a diagram
  that moved as Connect to… asked for a click would put another node under the click aimed at.
  For the same reason an edit keeps the view (the user): the diagram is fitted when the page opens, and again only on
  Fit to window or, until the view is zoomed or moved, a change in the window's size. A diagram that grows can run
  past the edge; that is the price of nodes staying put. An open menu keeps its place across renders too, so after
  someone else's edit it can sit apart from its node until it is reopened: following the node would move it under the
  pointer whenever a pick resizes the node.
- Menus open on click (right-click, long-press, or their key) and stay open until clicked away or Escape. Submenus open
  on click too, never on hover.
- A click away is a click anywhere else on the page, header and footer included. Whatever waits for a click (a menu,
  Connect to…) ends on one, as on Escape. The label box is the exception (the user): a click or tap away, or Tab,
  keeps what you typed (it saves, as Enter does); only Escape discards it. In the box an add opened, Escape takes the
  add back too (the user): it cancels what was started, and what was started is the add. Undo takes a save back, which
  is what makes saving on a click away safe, and a touch screen has no other sure way to save. A press on Undo or Redo
  that started that save, as its click away, does not wait for it: it says the save is still going and to press again,
  rather than doing nothing silently or two things at once. An emptied label or title (which cannot be saved) is kept
  as it was, with a notice (the user), and the click goes on as after any save (the reviewer): a click away is not the
  deliberate save Enter is, so it does not hold you in the box. Enter on one is refused with an error. What cannot be
  saved for any other reason (a shape the label cannot take, another edit still saving) keeps the box open with its
  error, and the click that left it does nothing. A click away onto another item selects that item once the save is
  drawn.
- No hover styling on the diagram, where a highlight would say something is selectable when it is not; except where
  hovering tells you something can be dragged. Menu and picker items do highlight under the pointer, as every menu
  does, and the item under the pointer is the focused one, so there is only ever one highlight and Enter runs it.
- Arrow keys in a picker wrap within their row or column, never on into the next: Right at a row's end goes to its
  start, Down at the bottom to the top of the same column. So a key always moves along one line of the grid, and
  Left does not close a picker in a submenu (Escape does). The strip's one exception: Up from its top row goes back to
  the label box above it.
- In the strip, selected and focused are apart (the user): the fill is the selected shape, moved only by a click, a
  digit or Enter; the outline is keyboard focus, moved by the arrows. While focus is not in the grid, the outline
  stays where the arrows go on from (the user): Up or Escape back to the label leaves it on the shape last focused, and
  Down returns there; a pick moves it to the picked shape. A picker in a menu keeps it on the current entry instead,
  since there the item under the pointer is the focused one. Enter in the grid selects and goes back to the
  label; only Enter in the label saves, so each Enter has one meaning. Escape in the grid keeps what was selected
  there. A picker in a menu saves on each pick, so there the item under the pointer takes focus, as in any menu.
- Keys never depend on the keyboard layout or fight the browser: Ctrl/Alt + digit are taken by browsers for tabs, so
  pickers use plain digits.

## Greyed out or left out

- A menu shows the items for that kind of thing (node, edge, subgraph, empty space). An item of that kind that does
  not apply right now is greyed out, not hidden, so items keep their place and their keys. It says why on hover, and
  in the notice when its key is pressed or it is tapped.
- An item for another kind of thing is left out.
- Items run make, change, rearrange, delete: Add and Connect, then Edit and Remove, then Reverse and Move, then Delete,
  last and set apart. A view action (Fit to window), which changes nothing in the file, goes last and set apart in the
  same way. Within a group, the most used first.
- This is a balance, not a fixed rule: hide what would only be noise.

## After an edit

- An edit leaves what it acted on selected, its menu closed, so the next action can follow at once: the node or
  subgraph whose label or title changed, the edge whose label, arrow type or direction changed, the node or subgraph
  just added and named (N again adds the next one from it), the edge Connect to… made. Enter on an unchanged label
  does the same: it looks no different. A delete selects nothing, since the item is gone.
- A pick in the arrow-type picker is the one edit that keeps its menu open, on the new current entry, so
  the next pick can follow; a click away or Escape closes it. Picking the current entry writes nothing.
- Undo and redo select nothing: an undo can take back an add, and what it selects would depend on the edit it undid.

## Messages

- An edit that worked shows no message: the redrawn diagram shows what it did. Screen readers, which cannot see the
  redraw, hear a line for it ('Connected "Take order" to "Order log"').
- A toast is only for a result you cannot see on screen ("Copied!", "SVG downloaded"), and fades; it never says what
  to do. A notice says what to do next, or why something was not done, and stays. An error is never a toast.
- A message names a node by its label as drawn, in quotes, never by its id in the file, which the page does not show.
- Mouse first, then keyboard: "Click away or press Escape to cancel." Most people point; the key is the shortcut.
- A notice is one of three kinds, by what was lost:
  - **info** (blue): what to do next ("Click the node the edge goes to"), and nothing else.
  - **warning** (amber): the page will not do this here, and nothing was tried: a greyed item's key, "Nothing to
    undo", merma unable to match the edges, an emptied label kept on a click away. The no is firm; the colour says
    nothing was lost.
  - **error** (red): something you tried did not happen: "Not saved: …", an undo refused because the file changed, an
    empty label on Enter.
- Screen readers hear an error at once, interrupting (an `alert`), and the others when they are free (a `status`), so
  pressing a greyed item's key over and over does not keep cutting in.

## One way to do each thing

- One look, one meaning: a style used for one role (the small note after a Help heading says what the section is
  limited to, "Editing flowcharts") is not reused for another (a usage note gets a look of its own). Two roles in one
  look tell the reader they are the same kind of thing.

- Like things share one component: one menu, one picker for arrow types and shapes. A new kind of choice uses them
  rather than a look of its own.
