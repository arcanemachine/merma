# UX rules

How the page behaves, and why. Read before changing anything the user sees. What goes here: rules that hold across
the page, each with its reason. What does not: what each control does (`docs/guide.md`), what words mean
(`GLOSSARY.md`), what is planned.

## The file comes first

- Every action is one small text edit to the `.mmd` file, and one undo step. Nothing the page adds (positions,
  selection, the view: fit, center, zoom and move, collapse, rotate and flip, find) is written into the file. The file
  is shared with editors and agents; the page is a view of it.
- Collapsing a subgraph is view state, the page's by design (the user: a collapse in the page never affects the file):
  the page draws the file with Mermaid's own `id@{ view: collapsed }` (or `expanded`) lines after its last byte, so no
  offset moves, and keeps them for the tab (sessionStorage), not for the file. It is no undo step. The default state is
  the file's, changed by editing the file (the code panel). The code panel and Download Mermaid show the file;
  Copy SVG and Download SVG show what you see, collapse included. H toggles it, separate from O and I, which move: I
  on a collapsed subgraph expands it to go in, and O never collapses (moving out would hide where you were). Escape
  never expands.
- Mermaid's size limits (`maxEdges`, `maxTextSize`) are merma's settings, never the file's: Mermaid lets only the page
  that loads it raise them. Over one, the last good render stays, and the error names the setting, not Mermaid's
  advice to call `mermaid.initialize`. The text limit counts what the page draws, so the lines collapse and turn
  append can take a file just under it over; the page then draws the file as written, with a warning.
- Rotate and flip are view state too (the user: for fitting a wide or a tall window), drawn as collapse is: each
  direction in the text Mermaid gets (the header's, every subgraph's `direction`) is swapped in place, two letters for
  two, so no offset moves; a header with none gets one, since Mermaid ignores a top-level `direction` line. Kept for
  the tab with the file's direction then; a change to the file's own direction drops them, so an agent turning the file
  is not turned back. One toggle each, not a choice of four (the user may ask for more after trying). The whole turn
  turns every subgraph with it (the user: the picture turns as a whole), and a subgraph can be turned on its own as
  well, on top of that (the user: "a la carte"): its own line turned, or, with none, a `direction` line of its own in
  the drawn text (on its own line: on the `subgraph` line it does not parse). Only where Mermaid draws it in a direction
  of its own, seen in 12.2.0: none of its nodes linked to a node outside it, nor its own nodes to one in a subgraph
  inside it (edges to a subgraph's box do not count). That is most subgraphs grayed, all of the "Simple" demo's; it is
  Mermaid's layout rule, not a setting. The view fits after a turn.
- No edit moves an edge: `linkStyle N` styles the Nth edge in the file, so moving one restyles others. The one exception
  is a move of an edge's end (Reassign end… and Reassign start…, and Merge into…, which moves each of the node's edges so) on
  an edge written inside a subgraph block when its new end is named outside that block: an edge line pulls both its ends
  into its block, so the line moves out, after the last edge, and its `linkStyle` number goes with it (the others after
  it move down one).
- The page never redraws as a preview while you choose (a shape, an arrow type): a redraw is a save, and agents
  watching the file would see each keypress. The choice is shown beside what you are editing, and saved on Enter.

## Words

- Help reads like the menus: each row's action is verb + noun, no articles or asides ("Fit to window", "Edit label").
  When a gesture or key does different things depending on what it is on or what is selected, it gets a row per case,
  and the case is named on the left ("Double-click empty space", "N on node"). One action whatever the target ("Open
  menu": the target's own menu) is one row, and so is a key that backs out of whatever is open ("Cancel or deselect").
  Keys that depend on the selection go under "Keys with nothing selected" and "Keys with something selected": the
  page names the two cases, never a mode the user must keep track of (the user).
- Help's keys go by the key within each section, so a key is found by its letter (the user): punctuation and digits,
  then letters, then named keys (Arrows, Backspace, Delete, Down, Enter, Esc, F2, F10, Space, Up), each key's forms
  together, plain, Shift, Ctrl, Ctrl+Shift. One row per shortcut ("Delete" and "Backspace" are two rows), each saying
  what it does in at most 45 characters, so every row fits on one line; the panel is as wide as its rows, and at most
  half the window's height (800px on a tall one), scrolling inside, or the whole screen on a phone; its Close button
  stays in view at the bottom, since on a phone there is nothing outside it to tap. The tests in
  `test/menu-items.test.mjs` hold the order and the length.

- Mermaid's word wherever it has one: node, edge, label, shape, subgraph, title, direction, arrow type, length. A word
  of merma's own needs a reason, given in `GLOSSARY.md`. Readers who know Mermaid should not have to translate.
- No em dashes in the page's text (the user): a colon or parentheses instead ("Current: Diamond (Decision)").
- Menu labels are in sentence case and read verb + noun, from a fixed set of verbs, so one label predicts the next:

  | Verb | Means | Examples |
  |---|---|---|
  | Add | makes a new thing | Add node, Add connected node |
  | Insert | makes a new thing inside another, which it splits | Insert node |
  | Edit | changes a thing's own properties | Edit label, Edit title, Edit arrow type ▸, Edit node |
  | Remove | clears a property; the thing stays | (none yet: emptying an edge's label removes it) |
  | Delete | the thing goes | Delete node, Delete edge |
  | Connect, Reverse, Reassign | what they say | Connect to…, Connect from…, Reverse edge, Reassign end…, Reassign start… |
  | Merge | one thing goes into another, which takes its edges | Merge into… |
  | Move | puts a thing in another subgraph, its edges kept | Move node here, Move subgraph here (after a cut) |
  | Find | looks through the diagram | Find… |
  | Fit, Center | change the view, not the file | Fit to window, Center in window |
  | Collapse, Expand | change how a subgraph is drawn in this tab, not the file | Collapse subgraph, Expand subgraph |
  | Copy, Download | take the diagram out of the page | Copy SVG, Download SVG, Download Mermaid |

- An ellipsis (…) means "then you do something" (click a node, type), nothing else. ▸ opens a submenu. ▴ on
  a button opens a menu above it (Export ▴): the footer's other buttons act at once.
- A submenu or picker is titled with the noun alone ("Shape"); the verb is on the item that opens it.

## Gestures and keys

- One gesture, one kind of outcome. A gesture that adds never deletes; removing is always a deliberate Delete. When
  there is nothing to add, it shows what exists instead of changing anything.
- Shift shows a key's extra cost before it is pressed (the user, "a rule emerging here"): where a key's Shift form
  deletes what the plain form keeps (Ctrl+Shift+V a cut node's edges, Shift+D a subgraph's contents), what would go
  glows pale red while Shift is held where the key would act, and while that item is in focus or under the pointer in
  the menu, so mouse and keyboard see it alike. On a node or an edge, which hold nothing, Shift+D, Shift+Delete and
  Shift+Backspace do what the plain key does. Any Shift key shows the glow for a moment (Shift+F on a subgraph); a
  subgraph's contents hidden in a collapsed box get no mark, and the announcement counts what went.
- Deleting a subgraph (the user wants two): Delete subgraph (D, Delete, Backspace) takes the box alone, unwrapping
  it: its `subgraph`, own `direction` and `end` lines go, and so do the edges to the subgraph itself; what it held
  keeps its lines and is drawn where Mermaid then draws it (the block around it, or another block that also names a
  node). Delete subgraph and contents (Shift+D, Shift+Delete, Shift+Backspace) takes every node Mermaid draws in it,
  each with its edges as Delete node takes them, then the boxes; a line inside it naming only nodes drawn elsewhere
  stays. Both are one edit, one undo, and work on a collapsed box.
- A letter outside a menu does exactly what it does in the selected item's menu (the user): R reverses a selected
  edge, as the edge menu's R does. So a letter never means two things. And a letter works outside menus only when no
  other key does the job (the user): R, C, N and M have no other key. D is the exception (the user: the home row): it
  deletes outside menus as Delete and Backspace do, on a node, an edge or a subgraph. A key is a
  letter of its label where one fits: M is Merge into… on a node. A letter keeps one meaning across kinds: C picks what
  an edge goes to and Shift+C what it comes from, on a node (Connect to…, Connect from…) and on an edge (Reassign end…,
  Reassign start…) alike (the user). The Edit items have no menu key at all (the user): Enter and F2 already edit the
  selection, quicker than opening a menu, and in an open menu Enter runs the item in focus. So E is free. S is Add
  subgraph, inside a selected subgraph or at the top level; on a node it is left for wrapping it in a subgraph.
- The selection's menu opens with . (period), the menu key or Shift+F10 (the user wanted M back for a letter; "." is
  Gmail's key for its "More" menu). Keys are matched by the character typed, so on AZERTY . is Shift+;.
- Reassign end… (C) and Reassign start… (Shift+C) move the end their key names, whatever the tick (the user, in place
  of one Reassign edge… on E that moved the end at the tick): "end" and "start" are the text's (`A --> B`: start A,
  end B). Their candidate starts on the edge itself, as Connect to…'s does on its item. Space, wherever the candidate
  is, or a click on the edge's line nearer the other end moves that one instead (the user; with several edges, later,
  Space would swap only the one the candidate is on). The tick stays through the pick, dashed at the end that moves,
  as what a pick will change is; the notice stays as it was. Outside a pick the tick only says which end's edges the
  cross arrows step.
- Merge into… (the user, after trying it as three moves): a node's edges move to another node (the end at it moves),
  and the node goes. The user expected moving a node's edges to swing their far ends (a redirect: "Start" now leads to
  "In stock?"), and read every label for the near-end move backwards, so it is named for what it is for: merging a
  duplicate, replacing a node. Not "Swap" (two nodes trading edges) nor "Merge with" (which one stays?). An edge
  between the two goes, as it would mean nothing after; a self-loop comes along as one of the other node; an edge
  that comes out the same as one the other node already has (same ends, arrow type and label) goes, unless it has an
  edge id or a `linkStyle` of its own. Nodes only: a subgraph cannot take a node's place. Escape, or a
  click away, is the one way out of every pick; C while connecting does nothing. A find opened inside a pick (Connect
  to…, a move) is a step of it (the user): Enter in the find only moves the candidate, Escape closes the find
  first and the pick after, so the candidate stays the one thing Enter picks.
- Shift with an item's letter does its counterpart: the other way round, or the same thing further (the user; the
  reviewer's wording). Shift+C is Connect from…, C's edge the other way; Shift+R flips the diagram as R rotates it;
  Shift+F fits the selection, which F only centers; Shift+D deletes a subgraph with its contents, which D takes alone
  (on a node or an edge, which hold nothing more, Shift+D does what D does, with no item of its own). A Shift key
  exists only beside its plain letter in the same menu, shown as ⇧ and the letter, as the shape picker shows Shift with a digit, and is read from the Shift key held,
  never from the letter's case, so Caps Lock does not count. Ctrl+Shift+L (Show link, the user's pick) sits beside L,
  its letter, as Ctrl+Shift+V does beside Ctrl+V; on a Mac ⌘⇧L works too, since the menus show Ctrl as ⌘ there.
- In a pick, solid is where the keys are and marked is what will change (the user). The candidate, which the arrows
  move, Enter picks and which is selected after, is drawn as the selection is. What the pick will change is marked
  instead: the node or subgraph it starts from outlined dashed, and each edge that will move or go glows, a wide pale
  line under it (not dashed: a dashed edge reads as Mermaid's dotted arrow, and vanishes on one).
- The diagram comes first in Tab order, whatever the dock (the user): the diagram, the code panel's handle, the panel,
  its bar, the code, then the footer, and round to the diagram. The diagram has no focus ring (Accessibility), so the
  one stop without a ring is where focus starts and rests, and the cycle never seems to stall on it.
- No hidden affordances. A shortcut is shown where its item is: a menu item's key at its right, as most apps show
  them (the user: one system, no underlined letters), and a digit in a picker. A key is a letter of its label where
  one fits, for the memory, but need not be (Center in window, F: F is the view key everywhere; Find…, /). Names
  show as text: a picker's line names the entry under the pointer, else the one with keyboard focus, else the current
  one. On touch, which
  has no hover, that is the current one only (a known trade: the picker stays open after a pick, so a tap shows it).
- Not every key needs a hint on the page (the user). A hint goes on the page only where it fits and is worth its
  space; the guide holds the rest. A little friction while learning is fine when what the page shows leads the way:
  the shape picker's digits say there is a way in, and Down from the label box is it.
- Nothing moves under the pointer: a menu or picker never changes its items while it is open, and a notice lies over
  the top of the diagram instead of pushing it down (a fitted diagram leaves room for one line of it), since a diagram
  that moved as Connect to… asked for a click would put another node under the click aimed at.
  For the same reason an edit keeps the view (the user): the diagram is fitted when the page opens, and again only on
  Fit to window or, until the view is zoomed or moved, a change in the window's size. A diagram that grows can run
  past the edge; that is the price of nodes staying put. An add is the one exception, since its label box must be
  in view to be used (the user): the view moves the least that shows the new item, its label box and the shape picker
  centered under it, zoomed out only if they cannot fit, and not again while the box grows; Escape, which takes the
  add back, puts the view back as it was, unless you moved it since. An open menu keeps its place across renders too, so after
  someone else's edit it can sit apart from its node until it is reopened: following the node would move it under the
  pointer whenever a pick resizes the node. On a pan or zoom an open menu moves with the diagram: an item's menu with
  its item, the empty-space menu with the point it was opened at, the label box and its shape picker with their item. It keeps the side it opened on (the user: it jumped
  across its item as it neared the edge), so at the window's edge it stops there, over its item if need be, and stays
  on that side even when the other has room again. Its submenu and the shape picker do the same.
- Menus open on click (right-click, long-press, or their key) and stay open until clicked away or Escape. Submenus open
  on click too, never on hover.
- A drag is never a cancel (the user: it had bitten more than once). In the diagram, where a press can become a pan
  or a pinch, a press-and-drag, a pinch or the wheel closes nothing and cancels nothing: not a menu, Help, the label
  box, find or Connect to…; only a click (a release without a drag, as the viewer's slop decides) does. Outside the
  diagram there is nothing to drag, so a press there is a click in practice, and its focus move saves the label box.
  While a menu, the label box or find is open, a press in the diagram moves no focus, so a drag leaves the keys with
  what is open; the click decides.
- A click away is a click anywhere else on the page, header and footer included. Whatever waits for a click (a menu,
  Connect to…, Help, find) ends on one, as on Escape. The label box is the exception (the user): a click or tap away, or Tab,
  keeps what you typed (it saves, as Enter does); only Escape discards it. In the box an add opened, Escape takes the
  add back too (the user): it cancels what was started, and what was started is the add. Undo takes a save back, which
  is what makes saving on a click away safe, and a touch screen has no other sure way to save. A press on Undo or Redo
  that started that save, as its click away, does not wait for it: it says the save is still going and to press again,
  rather than doing nothing silently or two things at once. An emptied node label or title (which cannot be saved) is
  kept as it was, with a notice (the user), and the click goes on as after any save (the reviewer): a click away is not the
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
  Left does not close a picker in a submenu (Escape does). The shape picker's one exception: Up from its top row goes back to
  the label box above it.
- In the shape picker, selected and focused are apart (the user): the fill is the selected shape, moved only by a click, a
  digit or Enter; the outline is keyboard focus, moved by the arrows. While focus is not in the grid, the outline
  stays where the arrows go on from (the user): Up or Escape back to the label leaves it on the shape last focused, and
  Down returns there; a pick moves it to the picked shape. A picker in a menu keeps it on the current entry instead,
  since there the item under the pointer is the focused one. Enter in the grid selects and goes back to the
  label; only Enter in the label saves, so each Enter has one meaning. Escape in the grid keeps what was selected
  there. A picker in a menu saves on each pick, so there the item under the pointer takes focus, as in any menu.
- Outside a field, a menu and a dialog, the arrows are the diagram's, even with a footer button focused: the page has
  nothing else for them. The code panel is the exception: there they scroll the code (below). While Help is open, every key is its own (arrows scroll it, Escape closes it), and the page
  answers none.
- An item reached by keys that is off screen is brought into view, the least move that shows it with a margin; one in
  view moves nothing (the user), for the same reason an edit keeps the view. One too big for the window at this zoom
  (a long edge, a large subgraph) is shown whole, zoomed out just enough and centered, as find frames its matches
  (the user: part of a line is neither the line nor the end that matters). An edge is shown with its label. A view moved that way counts as yours, as
  after a drag: a change in the window's size no longer refits it.
- The view is yours: merma moves it on its own only to bring something into view, and once you move it yourself,
  nothing merma does afterwards puts it back. Find (/) is the case in point. It matches the whole diagram, on screen
  or not, and typing never moves the view: the current match is the best one wholly on screen, else the best, and the
  count says how many are not ("2 of 5, 3 off screen"). Tab and Shift+Tab step; the first of them with any match off
  screen also moves the view once to show them all, as a fit puts the diagram: centered at the zoom it has, or zoomed
  out just enough, never in (the user: a find that jumped on some Tabs and not others was confusing; one move, then
  none). Enter on a match off screen centers it (the user). Moving by keys keeps the least move, since there each step
  is one item. Escape puts back the selection and
  the view from before the find, unless you moved the view
  since (a drag, the wheel, a pinch, a zoom key); a click away keeps the view where it is (the user: Tab to a match
  off screen, then click it, and the view stays put). Enter selects the current match; with no match, or nothing
  typed, it does nothing, and the box stays. / again shows the last query, selected.
- Find's current match blinks when it becomes current (typing, Tab, reopening; not a drag or a redraw that keeps it),
  a third of a second on and off, the user's rate, seven times, then stays on (Accessibility says why it stops): a
  blink as the current match changes is when it helps. Off is the plain match mark, so the current never leaves the
  set of matches. An edge blinks by its line's color (near-black amber), not its width, which would jitter, and not its
  label (the user: a blinking label distracts).
  Its colors stay amber, never the selection's blue: a blue phase would read as the match being selected, and a
  selected match would not blink at all.
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
    from its place there, so every edge sharing a node with it is reachable sideways. An edge clicked (or right-clicked,
    or long-pressed: its menu then acts where you pointed) on its line counts as reached from the end on the click's side, split at its label where it has one, else at its middle, along the line
    (the user: every click decides, the same each time); clicked on its label, or found, from its source (the node
    the file writes first: every edge has one). The counted end is marked with the
    tick, so the fan the cross arrows step shows before you press: a short bar across the way the edge leaves that
    end's node, flat or upright, never tilted (the user: noticeable, not in the way; a dot read as Mermaid's circle
    end). It is sized in the diagram's units, as the line and its arrowhead are, so it grows and shrinks with them (the
    user: a fixed size hid under the line zoomed in), with a floor on screen; it sits just past the arrowhead (the user:
    a gap made it hard to see, and an end whose last stretch hides under the arrowhead pushed it past the bend, lying
    along the line), and slides along the line to where it runs that way, off any bend and clear of any text. Where no
    stretch runs that way before the middle, it sits at the arrowhead's base. It always lies across the arrow at its
    end, whatever the line does before it and at any zoom (the user: no exceptions; an upright tick beside a bend was
    built and taken out). Space switches an edge to its other end (the user), so the cross arrows step that end's fan.
    It is not a move: the arrival into the edge leaves the trail, as after a step across. The cross arrows stop at the
    last edge rather than wrap: Right always means right. An earlier version went on to the end node past the last edge;
    the user tried it and chose stepping across.
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
    make sense there"). The opposite cross arrow steps back, though: it retraces steps across as the opposite arrow
    retraces moves (the user: Right then Left puts you back exactly where you were), counting from the fan you were in
    then, which only this memory can tell where two fans share the edge. Any other move, Space, a click or a find
    forgets it.
  - Ctrl+Arrows skip the edge, like Ctrl+Arrow jumping a word (the user); with no edge that way they go straight that
    way by place. A far end inside subgraphs you are not in lands on the outermost of their boxes (the user: from
    Shipping, Ctrl+Up should be Payment, as from In stock, Ctrl+Down is), so Ctrl goes in a level a press; I and O go in
    and out.
  - I goes back to the item you last left a subgraph by, while keys select; a click, a find or an edit forgets it (the
    user: keeping it across a click was backwards). It is not the trail: one item per subgraph, not a list of steps.
    O from a top-level item, the title included, selects nothing (the user: O is out a level, and above the top level
    is the diagram), and says so; it lets go as Escape does, so Enter or I brings it back. In a pick, the candidate
    stays.
  - Escape clears the selection, and Enter (or I) brings it back as it was, an edge with its counted end and the trail
    with it (the user: the tick moved); a click on empty space forgets it (the user: you lose your place
    otherwise). With nothing to bring back, Enter selects the middle node.
  - After a delete, the keyboard keeps its place: the item you came from by the arrows, the first still drawn; an edge's
    source for an edge clicked; nothing for a node clicked. Undo selects what was selected before the edit, an edge with
    its tick where it was, so you see what came back; redo selects what the edit selected only if you have not moved
    since (the user: it should not pull you away).
  - F fits the diagram; with an item selected it centers it at the zoom it has (the user), the title excepted, as
    Center in window does in its menu. A fit is a true reset (the user): F with nothing selected, Fit to window and a double-click
    on empty space always fit the whole diagram, whatever the view was, and leave a part. Shift+F fits the selection
    instead (the user): a subgraph as the part, a node or an edge zoomed to it, up to twice actual size, the address
    unchanged and the view kept as the user's, so a window resize does not undo it. 0 zooms to actual size, as a browser's Ctrl+0 does; not =, which is the unshifted + on
    a US keyboard.
  - Connect to… moves its outline by these same rules, through edges, which Enter refuses (the user); it starts on the
    item itself, so Enter at once makes a self-loop.
- Movement that finds nothing does nothing, like the end of a list: no notice, I and O at their limit included (the
  user: a notice there is clutter).
- Keys never depend on the keyboard layout or fight the browser: Ctrl/Alt + digit are taken by browsers for tabs, so
  pickers use plain digits. A digit is read by its key's place on the number row, so it is the same key on every
  layout; Shift+digit (the second ten shapes) is that key with Shift held, whatever it types. On AZERTY, where the
  number row types digits only with Shift, the key marked 1 picks shape 1 unshifted and shape 11 with Shift. `
  (the code panel) is likewise the key left of 1, or whichever key types it, and Shift+` likewise by `~` (that place reports another key on ISO
  keyboards on a Mac); where it is a dead key, it waits for no accent. Option stands in for Ctrl on a Mac only, where
  macOS keeps Ctrl+Arrows; on Windows and Linux Alt is left to the browser, so Alt+Left and Alt+Right go back and
  forward, through links between diagrams too (the user). Which system is Help's choice, the one its key labels show.
- The selection is kept per file for the tab (sessionStorage, as the view is), so Back, Forward, a link and a reload
  select again what was selected there, if it is still drawn, and say nothing: it is not the user's act. An edge is
  kept by Mermaid's id for it, so after the file changes it may be gone, and then nothing is selected.
- A part (Fit to subgraph, Shift+F) is a place, not a mode: the address holds it, so a link, a reload and an embed
  agree, and entering or leaving one is a history entry, so Back leaves it. F with nothing selected leaves it: one
  plain way back to the whole (the user), with no key of its own. Nothing is hidden or redrawn for it (the user picked
  zooming over collapsing the rest or drawing the part alone): it changes only what a fit fits, so every edit and key
  works as in the whole. No Escape step. It may zoom in up to twice actual size, the whole diagram never past actual
  size, so a small subgraph fills the window.
- Links between diagrams (the user: a dev tool, usefulness over security, "nothing ridiculous"). Open link reads a
  node's link from Mermaid's own reading of the file, so merma keeps Mermaid's strict security level (loose would
  allow HTML labels), and it opens only http, https and vscode addresses and paths to `.mmd` files. A click never
  follows a link, since a click selects. A `.mmd` link opens in place as a history entry, so the browser's Back and
  Forward are the jump list (the user, over merma keys such as Ctrl+I and Ctrl+O). The page switches only once the
  server has given the new file's text, so the address never names a file that is not shown. A link is refused,
  rather than waiting, while an edit is under way, since a jump minutes after the press reads as broken. Back and
  Forward cannot be refused, since the address has already changed, so they wait, with a notice when a code draft
  holds them. Shift+L opens a new tab without asking the server first: the browser allows a new tab only straight
  from the key or the click, and the new tab says itself if the file cannot be served. An app's link (`vscode://`)
  goes to the system, not to a new tab, which would be left blank.
- Show link puts the address in the info notice, as the file writes it (the user: a notice's text can be selected
  and copied, a hover tip's cannot), and selecting a linked node says it aloud ("…selected, links to …"), so the
  keyboard and a screen reader learn what the mouse sees. No hover tip on the node: the user preferred the notice.
- A linked node looks like a link (the user: "we should have something"), by a stylesheet rule only, nothing drawn:
  its label underlined, since WCAG asks a link to differ by more than color, and blue where the diagram gives the
  label no color of its own, so the diagram's styling always wins. The blue is chosen by the node's own fill, light
  or dark, each keeping 4.5:1. A callback (Mermaid's `clickable` too) gets no look: merma never runs it. A label the
  diagram underlines itself looks the same (accepted with the user: rare, and L says which). A mark beside the label
  (↗) was tried: after the text it was clipped on snug labels, and nothing can be added to SVG text labels.
- Copy and paste are the system's own keys, Ctrl+C and Ctrl+V (⌘ on a Mac, as undo is; Option does not stand in,
  as it does for the arrows, since Option+C and Option+V are no copy or paste). The page takes them only when it acts, on the diagram
  with no text selected: Ctrl+C with a node or a subgraph selected, Ctrl+V with something copied or cut. Otherwise the browser's own copy and
  paste go on. Moving a node or a subgraph into or out of a subgraph is cut and paste, with no move items of its own
  (the user: V for a move reads as paste). Cut (Ctrl+X) is a pick spread over time: the node or subgraph is marked
  dashed while you select where it goes, a cut node's edges glowing as a pick's moving edges do (the user), pale red
  wherever the paste would delete them, so Ctrl+Shift+V's cost shows before it is pressed; a click away keeps it (clicking around is how you get there), and Escape
  drops it first, before the selection. Undoing the move cuts it again and redoing it drops the cut (the user), so a
  move put in the wrong place is undone and pasted again. A move that would change nothing is grayed with its
  reason, never silent. The page's clipboard is its own, per tab: Copy also writes the item's Mermaid text to the
  system clipboard, but the page never reads it (no permission prompt, and no foreign text to make sense of).

## The code panel

- It follows the file as the diagram does, whoever saved it, a version that does not parse included, so you can read
  what broke. A new version keeps its scroll; a selection in it is lost, since the whole code is replaced.
- It docks beside the diagram, never over it, so opening, closing or resizing it changes the diagram's size and the
  resize rule holds: a view you have not touched refits, yours stays. The notice and the find bar stay over the
  diagram.
- Default docks it left on a window wider than tall, else below (the user: "wide", "tall"), and follows the window, so
  a window resized across square moves it. Left, Top or Bottom, once picked, holds.
- The diagram always keeps 40% of the room, and the panel at least 160 px where that leaves room (the diagram wins).
  A window too small for the size you set draws the panel smaller, and your size comes back when the window grows.
- Its dock and size are the person's, kept in the browser for every file (localStorage); whether it is open is the
  tab's, per file (sessionStorage), so the page's reload for a new build keeps it open.
- It is a view, not a mode: opening it by the footer's Code leaves focus on the button. By keyboard it has two levels,
  the code and the panel around it (the user, after trying one level): ` flips focus between the panel and the
  diagram, the panel staying open, so you can move about the diagram and hop back, a draft and all; Escape steps out a
  level, from the code or a control in the panel's bar to the panel (the panel is a Tab stop too, before the bar), from the panel with a draft open to the read-only code (Cancel, asking if it changed; the user: a
  keyboard way to cancel without closing), from the panel to the diagram, the panel staying open, and from the
  diagram to closed, as its outermost level (the user): after Connect to…, the selection and a notice, Escape closes
  the panel. With a changed draft it asks first, "Save the code and close the panel? Cancel keeps editing.": the one
  Escape in the page that saves (the user), worded so OK cannot read as discard; Cancel, or a reflexive Escape in the
  question, keeps the draft, with focus back in the code where the cursor was (the user). The mouse reaches the same by Save, then Close;
  Enter goes in, editing or back into the draft. Save and Cancel land on the panel, as Escape does. On the panel (its
  buttons too) the arrows, Page Up, Page Down, Home and End scroll the code (the user: the panel is where you read it,
  and ` is one key to the diagram); with a modifier they do nothing, so nothing on the panel pans. Every other key
  there is the diagram's. In a draft, ` types a backtick (Mermaid's markdown strings use them), so Escape comes
  first. ` into the panel is a click into it, and opening it the footer's Code pressed: each ends find and Connect
  to… as the mouse's click does. Close puts focus back on the footer's Code.
- Shift+` closes the panel from anywhere but a field you type in (the user: Escape on the diagram takes a pick and the
  selection before the panel, and that order stays): focus goes to the diagram, the selection and a pick stay. With a
  changed draft it asks Escape's question first. In a field, the label box, find or a draft, it types. With the panel
  closed it does nothing; ` opens it.
- It opens and closes at once, with no animation: the diagram refits as the panel appears, and would refit every frame.
- Follow selection (the user: a box, checked by default, the browser's for every file): checked, it always follows,
  reading or editing, so there is one rule to keep in mind; unchecked, never. Each new selection (click, tap, keys,
  find's Enter, undo's) bands the item's lines in the selection's pale blue behind the text, puts the caret at their
  start and scrolls them to the middle of the view, smoothly (Accessibility: reduced motion), unless they are in view
  already, so walking neighbors does not shake the code. A new version of the file moves the band to the item's new
  lines but never scrolls: someone else's save does not move what you read. The band goes when the code gets focus,
  whose own caret then marks the place, and nothing moves while it has focus. Find's matches are not a selection: Tab
  leaves the code alone, Enter on a match follows. The lines: a node's first statement giving it a shape or label, an
  edge's statement, a subgraph's `subgraph` line, the title's `title:` line. Edit starts on them; with nothing to
  follow, on the first line in view.
- Editing the code is a lock (the user: simple, built as a whole rather than gaps plugged): while a draft is open the
  diagram can be looked through, not edited (the user: "just because I am editing doesn't mean I don't want to
  navigate it"). Selecting, the keys that move about, and find work; every edit, Undo and Redo included, is refused
  with a warning saying why, and a menu opens with its edits grayed for the same reason (Center in window, the fits
  and Find… work). The diagram's background turns muted gray (the user), as the read-only code's is: whichever side is
  read-only is gray, a second cue to the notice. The selection stays blue (the user chose the background alone over
  a gray selection). Each edit mode is its own lock, so Edit waits for a label box, Connect to… or a save to finish. The lock is this page's only:
  an agent, an editor or another tab can still write the file. That is what saving over the version Edit started from
  is for: a change since is refused, never overwritten, and the draft kept; the header says so before you try.
- While editing, a new version of the file does not replace the draft, and the page does not reload itself for a new
  build of merma. Save and Cancel only: Ctrl+Z in the field takes back typing, and Cancel shows the file as it is now,
  so there is nothing for a Revert or a Reload to do. Cancel asks first only when the draft differs. Save and Cancel
  keep the selection while its item is still drawn, and Undo of a saved draft selects nothing.

## Grayed out or left out

- A menu shows the items for that kind of thing (node, edge, subgraph, empty space). An item of that kind that does
  not apply right now is grayed out, its key with it, not hidden, so items keep their place and their keys. It says
  why on hover, and in the notice when its key is pressed or it is tapped.
- An item for another kind of thing is left out.
- Items run make, change, rearrange, delete: Add and Connect, then Edit and Remove, then Reverse and Move, then Delete,
  last and set apart. A view action (Fit to window), which changes nothing in the file, goes last and set apart in the
  same way. Within a group, the most used first.
- This is a balance, not a fixed rule: hide what would only be noise.

## After an edit

- An edit leaves what it acted on selected, its menu closed, so the next action can follow at once: the node or
  subgraph whose label or title changed, the edge whose label, arrow type or direction changed, the node or subgraph
  just added and named (N again adds the next one from it), the edge Connect to… made. Enter on an unchanged label
  does the same: it looks no different. What a delete selects is under Moving by keyboard.
- A pick in the arrow type picker is the one edit that keeps its menu open, on the new current entry, so
  the next pick can follow; a click away or Escape closes it. Picking the current entry writes nothing.
- What undo and redo select is under Moving by keyboard.

## Messages

- An edit that worked shows no message: the redrawn diagram shows what it did (screen readers hear a line for it:
  Accessibility).
- A toast is only for a result you cannot see on screen ("Copied!", "SVG downloaded"), and fades; it never says what
  to do. A notice says what to do next, or why something was not done, and stays. An error is never a toast.
- A message names a node by its label as drawn, in quotes, never by its id in the file, which the page does not show.
- A message is not a tutorial (the user: "less is more"): it says what is happening, and at most how to leave it. How
  to do things is Help's and the guide's.
- A message is written the way a person would write it (the user): plain words, and what to do in the imperative mood,
  addressed to the reader.
- A message is made of full sentences, as a person would say them (the user): it names what it is about and says
  what happened, rather than a clipped label or a verb with nothing in front of it.
- One thought, one sentence. Two clauses become two sentences, never joined by a colon, semicolon or dash (the user). Text
  merma did not write, such as Mermaid's parse error, goes on a line of its own under the message, as it came.
- Everyday words, the ones a person would say aloud. The passive voice is fine where it reads more naturally (the
  user).
- merma refuses only what it cannot write correctly, or what would break the file (a subgraph with no id that the file
  already names by Mermaid's name for it, `style subGraph1 …`, which an edge would have to name); a legal edit that Mermaid draws badly is yours to make, with Undo as the net (the
  user: "is it really our place to refuse legitimate actions?"). A subgraph connected to itself is allowed, though
  Mermaid draws it as a frame round the box and may rearrange what is inside.
- A mode's notice (a pick's, the code panel's while the code is being edited) stays while the mode lasts (the user);
  what is refused in it shows in a row under it, one at most, a second replacing the first, and goes with the next key
  the page answers or click on the diagram (another key, a drag or the wheel leaves it); Escape in a pick ends the pick, both rows going. That row says only what was
  refused, since the notice above says what to do ("An edge cannot be connected to."). Find's bar lies where the
  notice does, so the notice yields while find is open and comes back as it closes. A screen reader hears each
  refusal, a repeat too, and not the mode's notice again when the row goes.
- A notice is one of three kinds, by what it means for you; each fits one case only:
  - **info** (blue): nothing you asked for was refused: what to do next ("Pick the node or subgraph to connect to."),
    or nothing to do ("There is nothing to undo.").
  - **warning** (amber): you asked, and it was refused, or kept back, with nothing lost (the user: trying something
    not allowed is not just information): a grayed item's key or click, Enter on an edge in Connect to…, "Deleting a
    subgraph isn't supported yet.", an emptied label kept on a click away, a node kept because the file changed;
    merma unable to match the edges, so an edit could hit the wrong one (the file at risk).
  - **error** (red): something you tried did not happen: "Your change was not saved. …", an undo refused because the file changed, an
    empty label on Enter, a press while another edit saves.
- The colors come in pairs, a background and a text color that reads on it (Accessibility: contrast), one pair per
  kind; `success` (green) is the toasts'. GLOSSARY names them.

## Accessibility

- The target is WCAG 2.2 AA throughout the page. The diagram's own markup is Mermaid's: its findings are recorded as
  Mermaid's, never fixed here (`checks/README.md`, "Accessibility", says how the page is checked).
- Mouse and keyboard are equals (the user): every action can be done by keyboard alone and by pointer alone, and by
  touch where the gesture exists. As a general rule both are first-class; where an action's nature makes one way less
  flexible than the other, each still reaches the result.
- The diagram shows no focus ring (the user): it is where focus rests (Escape and a click put it there), and every
  other place focus can be (the code panel, its buttons, the footer, menus) shows its own ring, so focus is known to be
  on the diagram when no ring shows. The selection shows where the keys act. WCAG 2.4.7 (Focus Visible) is met by that
  inference rather than a ring; the user chose it over a ring shown only with nothing selected, so an accessibility
  sweep should not reopen it without them (asked again, they kept it: a ring shown on Tab only, and not on a click,
  confused more than it helped).
- Help takes focus as it opens, as a dialog does, so its arrows scroll it, and the open panel itself shows where focus
  is.
- Text reads on its background: each notice kind and the toasts have a background and a text color chosen as a pair
  (Messages), at AA contrast.
- Nothing blinks for long: find's current match blinks seven times and stays on, since WCAG 2.2.2 asks blinking with no
  control to stop it to end within 5 s.
- Reduced motion: under the system's reduced-motion setting nothing moves on its own: find's match does not blink, and
  Follow selection scrolls the code at once rather than smoothly.
- Screen readers hear the changes that keys, clicks and edits make:
  - each item reached by the keys, or as a pick's candidate, is read out with what it is ('the edge "no" from "In
    stock?" to "Wait for stock"'), and so is each item selected by a click or tap, with "Nothing selected" for a click
    away or Escape that lets go of one;
  - each edit that worked is read out as a line, since the redraw cannot be heard ('Connected "Take order" to "Order
    log"');
  - an error is heard at once, interrupting (an `alert`), and the other messages when the reader is free (a `status`),
    so pressing a grayed item's key over and over does not keep cutting in. This follows "something tried that
    failed", not the color, so re-sorting info and warning moves nothing here.

## One way to do each thing

- One look, one meaning: a style used for one role (the small note after a Help heading says what the section is
  limited to, "Editing flowcharts") is not reused for another (a usage note gets a look of its own). Two roles in one
  look tell the reader they are the same kind of thing.

- Like things share one component: one menu, one picker for arrow types and shapes. A new kind of choice uses them
  rather than a look of its own.
