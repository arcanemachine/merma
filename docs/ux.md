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
- Menu labels are in sentence case and read verb + noun, from a fixed set of verbs, so one label predicts the next:

  | Verb | Means | Examples |
  |---|---|---|
  | Add | makes a new thing | Add node, Add connected node |
  | Edit | changes one property of a thing | Edit label, Edit title, Edit arrow type ▸ |
  | Remove | clears a property; the thing stays | Remove label |
  | Delete | the thing goes | Delete node, Delete edge |
  | Connect, Reverse, Move | what they say | Connect to…, Reverse edge, Move edge… |

- An ellipsis (…) means "then you do something" (click a node, drag a handle), nothing else. ▸ opens a submenu.
- A submenu or picker is titled with the noun alone ("Shape"); the verb is on the item that opens it.

## Gestures and keys

- One gesture, one kind of outcome. A gesture that adds never deletes; removing is always a deliberate Delete. When
  there is nothing to add, it shows what exists instead of changing anything.
- No hidden affordances. A shortcut is shown where its item is: a letter underlined, or a digit in a picker. Names
  show on hover and also as text, since touch has no hover.
- Nothing moves under the pointer: a menu or picker never changes its items while it is open.
- Menus open on click (right-click, long-press, or their key) and stay open until clicked away or Escape. Submenus open
  on click too, never on hover.
- A click away is a click anywhere else on the page, header and footer included. Whatever waits for a click (a menu,
  Connect to…) ends on one, as on Escape.
- No hover styling on the diagram, where a highlight would say something is selectable when it is not; except where
  hovering tells you something can be dragged. Menu and picker items do highlight under the pointer, as every menu
  does, and the item under the pointer is the focused one, so there is only ever one highlight and Enter runs it.
- Keys never depend on the keyboard layout or fight the browser: Ctrl/Alt + digit are taken by browsers for tabs, so
  pickers use plain digits.

## Greyed out or left out

- A menu shows the items for that kind of thing (node, edge, subgraph, empty space). An item of that kind that does
  not apply right now is greyed out, not hidden, so items keep their place and their keys. It says why on hover, and
  in the notice when its key is pressed or it is tapped.
- An item for another kind of thing is left out.
- Items run make, change, rearrange, delete: Add and Connect, then Edit and Remove, then Reverse and Move, then Delete,
  last and set apart. Within a group, the most used first.
- This is a balance, not a fixed rule: hide what would only be noise.

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
    undo", merma unable to match the edges. The no is firm; the colour says nothing was lost.
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
