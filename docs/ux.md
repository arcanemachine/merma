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
  and the case is named on the left ("Double-click empty space", "N on a node"). One action whatever the target ("Open
  menu": the target's own menu) is one row, and so is a key that backs out of whatever is open ("Cancel or deselect").
  Keys that depend on the selection go under "Keys with nothing selected" and "Keys with something selected": the
  page names the two cases, never a mode the user must keep track of (the user).

- Mermaid's word wherever it has one: node, edge, label, shape, subgraph, title, direction, arrow type, length. A word
  of merma's own needs a reason, given in `GLOSSARY.md`. Readers who know Mermaid should not have to translate.
- No em dashes in the page's text (the user): a colon or parentheses instead ("Current: Diamond (Decision)").
- Menu labels are in sentence case and read verb + noun, from a fixed set of verbs, so one label predicts the next:

  | Verb | Means | Examples |
  |---|---|---|
  | Add | makes a new thing | Add node, Add connected node |
  | Edit | changes a thing's own properties | Edit label, Edit title, Edit arrow type ▸, Edit node |
  | Remove | clears a property; the thing stays | (none yet: emptying a label removes it) |
  | Delete | the thing goes | Delete node, Delete edge |
  | Connect, Reverse, Move | what they say | Connect to…, Reverse edge, Move edge… |
  | Fit, Center | change the view, not the file | Fit to window, Center in window |
  | Copy, Download | take the diagram out of the page | Copy SVG, Download SVG |

- An ellipsis (…) means "then you do something" (click a node, drag a handle), nothing else. ▸ opens a submenu. ▴ on
  a button opens a menu above it (Export ▴): the footer's other buttons act at once.
- A submenu or picker is titled with the noun alone ("Shape"); the verb is on the item that opens it.

## Gestures and keys

- One gesture, one kind of outcome. A gesture that adds never deletes; removing is always a deliberate Delete. When
  there is nothing to add, it shows what exists instead of changing anything.
- A letter outside a menu does exactly what it does in the selected item's menu (the user): R reverses a selected
  edge, as the edge menu's R does. So a letter never means two things. And a letter works outside menus only when no
  other key does the job (the user): Enter and F2 edit, Delete deletes, so E and D stay in menus; R, C and N have no
  other key. Escape, or a click away, is the one way out of every wait; C while connecting does nothing.
- No hidden affordances. A shortcut is shown where its item is: a letter underlined, a digit in a picker, or a key
  shown at the right of a label it is not a letter of (Center in window, F: F is the view key everywhere). Names
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
  pointer whenever a pick resizes the node. On a pan or zoom an open menu moves with the diagram: an item's menu with
  its item, the empty-space menu with the point it was opened at.
- Menus open on click (right-click, long-press, or their key) and stay open until clicked away or Escape. Submenus open
  on click too, never on hover.
- A drag is never a cancel (the user: it had bitten more than once). In the diagram, where a press can become a pan
  or a pinch, a press-and-drag, a pinch or the wheel closes nothing and cancels nothing: not a menu, Help, the label
  box, find or Connect to…; only a click (a release without a drag, as the viewer's slop decides) does. Outside the
  diagram there is nothing to drag, so a press there is a click in practice, and its focus move saves the label box.
- A click away is a click anywhere else on the page, header and footer included. Whatever waits for a click (a menu,
  Connect to…, Help, find) ends on one, as on Escape. The label box is the exception (the user): a click or tap away, or Tab,
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
- No hover styling on the diagram, where a highlight would say something is selectable when it is not. The pointer
  says what a click does instead (the user): the pointing finger on anything a click selects (a node, an edge with
  the band around its line, a subgraph, the title), the browser's own hand everywhere else, where a drag moves the
  diagram. Menu and picker items do highlight under the pointer, as every menu
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
- Outside a field, a menu and a dialog, the arrows are the diagram's, even with a footer button focused: the page has
  nothing else for them. While Help is open, every key is its own (arrows scroll it, Escape closes it), and the page
  answers none.
- An item reached by keys that is off screen is brought into view, the least move that shows it with a margin; one in
  view moves nothing (the user), for the same reason an edit keeps the view. A view moved that way counts as yours, as
  after a drag: a change in the window's size no longer refits it.
- Moving by keyboard, as one model (the user settled each rule in UAT, case by case, as "press X, get Y"):
  - The arrows are screen directions: Up is up, Right is right, wherever you are. Plain arrows walk the edges, two
    presses a step, node, edge, node, so the edge is where you choose (the user found jumping straight to "the next
    node" picked far-off nodes and trapped you in loops). An edge belongs to both its ends, and arrowheads play no part
    (the user: an edge is an edge); a self-loop too belongs to its node at both its ends.
  - An edge heads the way it goes just after it leaves a node, measured 20 px along its line, not where on the outline
    it starts: the edges out of a diamond's lower corners head down, and Down from it offers all of them, left to right.
    Twenty pixels, because a curve leaving a corner has turned by then, and a short edge has not yet reached its next
    bend. A box's edges leaving one way are its fan that way.
  - On an edge, the cross arrows step across, and never land on a node (the user: "when I'm at an edge, I'm paging
    between edges"): to the edge beside it in the fan at the end you came from, then on into the fan at its other end,
    from its place there, so every edge sharing a node with it is reachable sideways. An edge clicked or found counts as
    reached from its source (the node the file writes first: every edge has one). They stop at the last edge rather than
    wrap: Right always means right. An earlier version went on to the end node past the last edge; the user tried it and
    chose stepping across.
  - With no edge leaving that way, an arrow goes to the nearest box (node or subgraph) straight that way, else nothing
    (the user tried nearest-anywhere and edges-by-place, and disliked both: Boxing, Down reached Send, off to the side;
    Shipping, Right reached Wait for stock, far up). A subgraph you are in counts by its border, always straight ahead,
    so with nothing nearer inside you reach its box. The price: a node off every row and column, with no edges, is
    reached only by a click or a find.
  - A subgraph's box walks its own edges like a node, including those crossing its border from a node inside it, so no
    way out of a subgraph is hidden from its box. Into a subgraph (the user): the arrow that brought you to its box goes
    on in, and the other three walk its edges; Ctrl+Arrow is the way past. So a left-right diagram is walked by Right
    as a top-down one is by Down (the user tried left-right flowcharts, where only Down went in, at the top, and Right
    walked past everything inside). It goes in to the item nearest the side it enters by, first in reading order along
    that side: from the top the leftmost, from the left the topmost, and backwards from the bottom (the rightmost) and
    from the right (the lowest), like reading a page backwards. What lies along a side is what overlaps the item
    nearest it, so a few pixels never decide it. Going back out keeps the arrow that first brought you, so in, out and
    in again is the same arrow each time; back from the box's own self-loop, it is the arrow you went round it by.
    Reaching the box from inside it (an arrow to its border) is coming out: that arrow walks on, and only the opposite
    goes back in (Retry, Down reaches the Payment box; Down again goes on to its edges, not back in).
  - A box selected any other way (a click, a find, O, an edit, Enter) goes in as if you had walked to it (the user: in
    a top-down diagram a click is like coming in from the top): the way the boxes beside it run as drawn, by most of
    the edges between them, else a level up, else Down. Never by its own contents, which may run another way (a
    `direction LR` subgraph in a top-down diagram still goes in by Down, as when walked to), and never by the file's
    `direction` line, which Mermaid ignores when a node inside links outside. The user weighed a click's position, and
    chose not: nothing on screen would show the line.
  - The opposite arrow goes back the way you came (the user): it takes back the latest move into where you are, past
    any steps across, which it never undoes, and what came after that move is gone. Every other key follows the rules
    from where you are; a click, a find, O, I, an edit or Escape starts afresh. An edge counts as reached from the item
    you just left, by an arrow or going back, and the cross arrows step that item's fan (the user: from Order log,
    Left should step through Order log's edges, not undo an earlier step).
  - The way back belongs to the fan you are in. An edge reached by stepping across has no way back of its own, so the
    arrow along it walks to its end, the node (Paid?, not the Payment box it crosses out of), and the trail behind the
    fan you left is not retraced (the user: back from Order log you are in its fan, and going up to Payment "would not
    make sense there").
  - Ctrl+Arrows skip the edge, like Ctrl+Arrow jumping a word (the user); with no edge that way they go straight that
    way by place. A far end inside subgraphs you are not in lands on the outermost of their boxes (the user: from
    Shipping, Ctrl+Up should be Payment, as from In stock, Ctrl+Down is), so Ctrl goes in a level a press; I and O go in
    and out.
  - I goes back to the item you last left a subgraph by, while keys select; a click, a find or an edit forgets it (the
    user: keeping it across a click was backwards). It is not the trail: one item per subgraph, not a list of steps.
  - Escape clears the selection, and Enter brings it back; a click on empty space forgets it (the user: you lose your
    place otherwise). With nothing to bring back, Enter selects the middle node.
  - After a delete, the keyboard keeps its place: the item you came from by the arrows, the first still drawn; an edge's
    source for an edge clicked; nothing for a node clicked. Undo selects what was selected before the edit, so you see
    what came back; redo selects what the edit selected only if you have not moved since (the user: it should not pull
    you away).
  - F fits the diagram; with an item selected it centers it at the zoom it has (the user), the title excepted, as
    Center in window does in its menu. A fit is a true reset (the user): F, Fit to window and a double-click on empty
    space always fit the whole diagram, whatever the view was. 0 zooms to actual size, as a browser's Ctrl+0 does; not =, which is the unshifted + on
    a US keyboard.
  - Connect to… moves its outline by these same rules, through edges, which Enter refuses (the user); it starts on the
    item itself, so Enter at once makes a self-loop.
- Movement that finds nothing does nothing, like the end of a list: no notice, I and O at their limit included (the
  user: a notice there is clutter).
- Keys never depend on the keyboard layout or fight the browser: Ctrl/Alt + digit are taken by browsers for tabs, so
  pickers use plain digits. A digit is read by its key's place on the number row, so it is the same key on every
  layout; Shift+digit (the second ten shapes) is that key with Shift held, whatever it types. On AZERTY, where the
  number row types digits only with Shift, the key marked 1 picks shape 1 unshifted and shape 11 with Shift.

## Grayed out or left out

- A menu shows the items for that kind of thing (node, edge, subgraph, empty space). An item of that kind that does
  not apply right now is grayed out, not hidden, so items keep their place and their keys. It says why on hover, and
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
- merma refuses only what it cannot write correctly, or what would break the file (a subgraph with no id in the file,
  which an edge would have to name); a legal edit that Mermaid draws badly is yours to make, with Undo as the net (the
  user: "is it really our place to refuse legitimate actions?"). A subgraph connected to itself is allowed, though
  Mermaid draws it as a frame round the box and may rearrange what is inside.
- A notice is one of three kinds, by what it means for you; each fits one case only:
  - **info** (blue): nothing you asked for was refused: what to do next ("Click the node the edge goes to"), or
    nothing to do ("Nothing to undo").
  - **warning** (amber): you asked, and it was refused, or kept back, with nothing lost (the user: trying something
    not allowed is not just information): a grayed item's key or click, Enter on an edge in Connect to…, "Deleting a
    subgraph is not supported yet", an emptied label kept on a click away, a node kept because the file changed;
    merma unable to match the edges, so an edit could hit the wrong one (the file at risk).
  - **error** (red): something you tried did not happen: "Not saved: …", an undo refused because the file changed, an
    empty label on Enter, a press while another edit saves.
- The colors come in pairs, a background and a text color that reads on it, one pair per kind; `success` (green)
  is the toasts'. GLOSSARY names them.
- Screen readers hear an error at once, interrupting (an `alert`), and the others when they are free (a `status`), so
  pressing a grayed item's key over and over does not keep cutting in. This follows "something tried that failed", not
  the color, so re-sorting info and warning moves nothing here.

## One way to do each thing

- One look, one meaning: a style used for one role (the small note after a Help heading says what the section is
  limited to, "Editing flowcharts") is not reused for another (a usage note gets a look of its own). Two roles in one
  look tell the reader they are the same kind of thing.

- Like things share one component: one menu, one picker for arrow types and shapes. A new kind of choice uses them
  rather than a look of its own.
