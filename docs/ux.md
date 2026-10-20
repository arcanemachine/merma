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
  on click too, never on hover. No hover styling, except where hovering tells you something can be dragged.
- Keys never depend on the keyboard layout or fight the browser: Ctrl/Alt + digit are taken by browsers for tabs, so
  pickers use plain digits.

## Greyed out or left out

- A menu shows the items for that kind of thing (node, edge, subgraph, empty space). An item of that kind that does
  not apply right now is greyed out, not hidden, so items keep their place and their keys. It says why on hover, and
  in the notice when its key is pressed or it is tapped.
- An item for another kind of thing is left out.
- This is a balance, not a fixed rule: hide what would only be noise.

## Messages

- A toast says what happened ("Saved", "Connected C to B"), and fades. A notice says what to do next, or what was not
  saved and why, and stays. An error is never a toast.

## One way to do each thing

- Like things share one component: one menu, one picker for arrow types and shapes. A new kind of choice uses them
  rather than a look of its own.
