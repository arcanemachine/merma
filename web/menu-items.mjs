// What each menu holds, as data: the editor maps each action to what it does, and menu.mjs draws them. The rules the
// items follow (docs/ux.md) are tested against this file: labels start with a verb from VERBS, each key is unique in
// its menu and is shown at the item's right, a key the page also uses outside menus runs the same action here, and only
// an item that waits for a further click or typing (mode) ends in "…".

/** The verbs menu labels start with: Add makes a thing, Edit changes one of its properties, Remove clears one, Delete
 * removes the thing. */
export const VERBS = ['Add', 'Insert', 'Edit', 'Remove', 'Delete', 'Connect', 'Reverse', 'Reassign', 'Move', 'Merge', 'Find', 'Fit', 'Center', 'Copy',
  'Cut', 'Paste',
  'Download', 'Collapse', 'Expand', 'Rotate', 'Flip'];

/**
 * Keys the page answers outside menus, and the menu actions each one runs. A key is named by KeyboardEvent.key,
 * lower-cased, after its modifiers: `ctrl+` (Ctrl or Alt), then `shift+`.
 */
export const GLOBAL_KEYS = {
  n: ['add-node', 'add-connected-node', 'insert-node'],
  c: ['connect', 'reassign-end'],
  'shift+c': ['connect-from', 'reassign-start'],
  r: ['reverse-edge', 'rotate'],
  'shift+r': ['flip'],
  m: ['merge-into'],
  s: ['add-subgraph'],
  enter: ['edit-node', 'edit-label', 'edit-title'],
  f2: ['edit-node', 'edit-label', 'edit-title'],
  delete: ['delete-node', 'delete-edge'],
  backspace: ['delete-node', 'delete-edge'],
  f: ['fit-view', 'center-view'],
  'shift+f': ['fit-node', 'fit-edge', 'fit-subgraph'],
  0: [],
  arrowup: [],
  arrowdown: [],
  arrowleft: [],
  arrowright: [],
  'shift+arrowup': [],
  'shift+arrowdown': [],
  'shift+arrowleft': [],
  'shift+arrowright': [],
  'ctrl+arrowup': [],
  'ctrl+arrowdown': [],
  'ctrl+arrowleft': [],
  'ctrl+arrowright': [],
  o: [],
  i: [],
  '/': ['find'],
  h: ['collapse-subgraph', 'expand-subgraph'],
  ' ': [],
  '+': [],
  '=': [],
  '-': [],
  '.': [],
  escape: [],
};

export const NO_EDGE_MATCH = "The drawn edges don't match the file's text (no edge match), so deleting could change the wrong "
  + 'edge. Delete it in the file.';

/** Why a subgraph cannot be collapsed or expanded: Mermaid's subgraphs are not the ones merma reads in the text. */
export const NO_SUBGRAPH_MATCH = "merma can't match this diagram's subgraphs to its text, so they can't be collapsed or "
  + 'expanded here.';

/** Why an edit does nothing while the code panel's draft holds the lock: the warning, and a grayed item's reason. */
export const LOCKED = 'The code is being edited. Save or cancel it to edit the diagram.';

/**
 * What a menu needs to know to gray its items.
 * @typedef {object} MenuState
 * @property {boolean} [locked] the code is being edited, so only `view` items apply
 * @property {boolean} edgesOk the drawn edges match the file's (an edge match)
 * @property {boolean} selfLoop the selected edge goes from a node back to itself
 * @property {string | null} [insertWhy] why a node cannot be inserted into the selected edge
 * @property {string | null} nameWhy why the selected subgraph cannot be given an id, or null
 * @property {string | null} [collapseWhy] why the selected subgraph cannot be collapsed or expanded, or null
 * @property {{ rotate: boolean, flip: boolean }} [turn] how the page turns the diagram, or the selected subgraph
 * @property {string | null} [turnWhy] why the selected subgraph cannot be turned on its own, or null
 * @property {'node' | 'subgraph' | null} [copied] what has been copied, if anything: the paste items paste it
 * @property {'node' | 'subgraph' | null} [cut] what has been cut, if anything: the paste items move it
 * @property {string | null} [cutWhy] why the cut node or subgraph cannot be moved to the selection, or null
 * @property {string | null} [partWhy] why the selected subgraph cannot be fitted as the part, or null
 */

/** Whether `item` can be chosen in `state`. */
export const applies = (/** @type {MenuItem} */ item, /** @type {MenuState} */ state) =>
  (!state.locked || Boolean(item.view)) && (!item.applies || item.applies(state));

/** What a grayed `item` says in `state`. */
export const whyNot = (/** @type {MenuItem} */ item, /** @type {MenuState} */ state) =>
  (state.locked && !item.view ? LOCKED : item.why?.(state) ?? '');

/**
 * A menu item.
 * @typedef {object} MenuItem
 * @property {string} action what the editor runs
 * @property {string} label
 * @property {string} [key] its shortcut letter, or `shift+` and a letter (that letter's item the other way round); none
 *   for an item a quicker key outside menus already runs (Enter edits). `ctrl+` first: Ctrl, or ⌘ on a Mac, which the
 *   page answers before the menu does (copy and paste)
 * @property {(state: MenuState) => boolean} [applies] when it does not apply, the item is grayed
 * @property {(state: MenuState) => string | null} [why] what a grayed item says
 * @property {string} [submenu] the name of what opens beside it: the item's only action
 * @property {boolean} [mode] it waits for a further click or typing
 * @property {boolean} [view] it changes only the view (or nothing: Copy node), so it works while the code is being edited
 * @property {boolean} [separated] set apart from the items above it
 * @property {(state: MenuState) => boolean} [back] when true, the item reads `labelBack`: a toggle already on
 * @property {string | ((state: MenuState) => string)} [labelBack]
 */

/** Why an item that adds to a subgraph does nothing while it is collapsed: what it adds would be hidden. */
/** Why a node cannot be inserted into an edge whose line is in a collapsed subgraph: the node would be hidden. */
export const INSERT_COLLAPSED = 'This edge is inside a collapsed subgraph. Expand it first (H) to insert a node.';
const EXPAND_FIRST = 'This subgraph is collapsed. Expand it first (H) to add to it.';
/** Why a subgraph with no id in the file cannot be fitted as the part: the address names it by its id. */
export const PART_UNNAMED = "This subgraph has no id in the file, so a link can't name it. Give it an id in the file first.";
/** Fit to subgraph, in a subgraph's menu and a box's. */
const fitPart = { action: 'fit-subgraph', label: 'Fit to subgraph', view: true, key: 'shift+f',
  applies: (/** @type {MenuState} */ s) => !s.partWhy, why: (/** @type {MenuState} */ s) => s.partWhy ?? null };
export const NOTHING_COPIED = 'Nothing has been copied. Copy a node or a subgraph first (Ctrl+C).';
/** Why a copied subgraph is not pasted onto an edge. */
export const SUBGRAPH_ON_EDGE = "A subgraph can't be pasted into an edge.";

/** Why a cut subgraph is not moved without its edges: its edges never change in a move. */
export const SUBGRAPH_BARE = 'A subgraph is moved with its edges.';

/**
 * Paste node and Paste node without edges (with a subgraph copied, Paste subgraph and Paste subgraph without outside
 * edges, since its inner edges always come), or with a node or a subgraph cut Move node here (Move subgraph here) and
 * the same without edges: grayed until something is copied or cut, and where `why` (a copy's) or `cutWhy` (a cut's)
 * says.
 */
const pasteItems = (/** @type {(s: MenuState) => string | null} */ why = () => null,
  /** @type {(s: MenuState) => string | null} */ cutWhy = (s) => s.cutWhy ?? null) => {
  const reason = (/** @type {MenuState} */ s) => (s.cut ? cutWhy(s) : s.copied ? why(s) : NOTHING_COPIED);
  const item = (/** @type {string} */ action, /** @type {string} */ label, /** @type {string} */ back,
    /** @type {string} */ pasted, /** @type {string} */ key, /** @type {(s: MenuState) => string | null} */ refuse = reason) => ({
    action, label, key,
    labelBack: (/** @type {MenuState} */ s) => (s.cut ? `Move ${s.cut} here${back}` : `Paste subgraph${pasted}`),
    back: (/** @type {MenuState} */ s) => Boolean(s.cut) || s.copied === 'subgraph',
    applies: (/** @type {MenuState} */ s) => !refuse(s), why: refuse,
  });
  return [
    item('paste-node', 'Paste node', '', '', 'ctrl+v'),
    item('paste-node-bare', 'Paste node without edges', ' without edges', ' without outside edges', 'ctrl+shift+v',
      (s) => (s.cut === 'subgraph' ? SUBGRAPH_BARE : reason(s))),
  ];
};

/** How a menu shows `key`, on a Mac (`mac`) or another system: `⇧C`, `Ctrl+⇧V`, `⌘⇧V`. */
export function keyLabel(/** @type {string} */ key, /** @type {string} */ os) {
  const ctrl = key.startsWith('ctrl+') ? (os === 'mac' ? '⌘' : 'Ctrl+') : '';
  return ctrl + key.replace(/^ctrl\+/, '').replace(/^shift\+/, '⇧').toUpperCase();
}

/** `key` as aria-keyshortcuts writes it: `Shift+C`, `Control+Shift+V`, `Meta+V`. */
export function keyAria(/** @type {string} */ key, /** @type {string} */ os) {
  const parts = key.split('+');
  const last = /** @type {string} */ (parts.pop()).toUpperCase();
  return [...parts.map((p) => (p === 'ctrl' ? (os === 'mac' ? 'Meta' : 'Control') : 'Shift')), last].join('+');
}

/**
 * Rotate and Flip, page-only: the whole diagram from the empty-space menu, a subgraph on its own from its menu, where
 * Mermaid draws it in a direction of its own (MenuState `turnWhy`).
 * @returns {MenuItem[]}
 */
const turnItems = () => [
  { action: 'rotate', label: 'Rotate', labelBack: 'Rotate back', back: (s) => Boolean(s.turn?.rotate), key: 'r',
    view: true, separated: true, applies: (s) => !s.turnWhy, why: (s) => s.turnWhy ?? null },
  { action: 'flip', label: 'Flip', labelBack: 'Flip back', back: (s) => Boolean(s.turn?.flip), key: 'shift+r', view: true,
    applies: (s) => !s.turnWhy, why: (s) => s.turnWhy ?? null },
];

/**
 * Each kind's menu. `box` is a subgraph drawn collapsed: the subgraph's menu, with Expand in place of Collapse.
 * @type {Record<'node' | 'edge' | 'subgraph' | 'box' | 'title' | 'space', MenuItem[]>}
 */
export const MENUS = {
  node: [
    { action: 'add-connected-node', label: 'Add connected node', key: 'n' },
    { action: 'connect', label: 'Connect to…', key: 'c', mode: true },
    { action: 'connect-from', label: 'Connect from…', key: 'shift+c', mode: true },
    { action: 'merge-into', label: 'Merge into…', key: 'm', mode: true, applies: (s) => s.edgesOk, why: () => NO_EDGE_MATCH },
    { action: 'edit-node', label: 'Edit node' },
    { action: 'copy-node', label: 'Copy node', key: 'ctrl+c', separated: true, view: true },
    { action: 'cut-node', label: 'Cut node', key: 'ctrl+x', view: true },
    ...pasteItems(),
    { action: 'delete-node', label: 'Delete node', key: 'd', separated: true, applies: (s) => s.edgesOk, why: () => NO_EDGE_MATCH },
    { action: 'center-view', label: 'Center in window', key: 'f', separated: true, view: true },
    { action: 'fit-node', label: 'Fit to node', key: 'shift+f', view: true },
  ],
  edge: [
    { action: 'insert-node', label: 'Insert node', key: 'n', applies: (s) => !s.insertWhy, why: (s) => s.insertWhy ?? null },
    { action: 'edit-label', label: 'Edit label' },
    { action: 'edit-arrow-type', label: 'Edit arrow type', key: 't', submenu: 'arrow-types' },
    { action: 'reverse-edge', label: 'Reverse edge', key: 'r', applies: (s) => !s.selfLoop, why: () => 'A self-loop has no direction to reverse.' },
    { action: 'reassign-end', label: 'Reassign end…', key: 'c', mode: true },
    { action: 'reassign-start', label: 'Reassign start…', key: 'shift+c', mode: true },
    // A cut node moved into an edge leaves its own edges behind, deleted, so the item says so.
    { ...pasteItems((s) => (s.copied === 'subgraph' ? SUBGRAPH_ON_EDGE : s.insertWhy ?? null), (s) => s.cutWhy ?? s.insertWhy ?? null)[0],
      labelBack: (/** @type {MenuState} */ s) => (s.cut === 'subgraph' ? 'Move subgraph here' : s.cut ? 'Move node here without edges'
        : 'Paste subgraph') },
    { action: 'delete-edge', label: 'Delete edge', key: 'd', separated: true },
    { action: 'center-view', label: 'Center in window', key: 'f', separated: true, view: true },
    { action: 'fit-edge', label: 'Fit to edge', key: 'shift+f', view: true },
  ],
  subgraph: [
    { action: 'add-node', label: 'Add node', key: 'n' },
    { action: 'add-subgraph', label: 'Add subgraph', key: 's' },
    { action: 'connect', label: 'Connect to…', key: 'c', mode: true, applies: (s) => !s.nameWhy, why: (s) => s.nameWhy },
    { action: 'connect-from', label: 'Connect from…', key: 'shift+c', mode: true, applies: (s) => !s.nameWhy, why: (s) => s.nameWhy },
    { action: 'edit-title', label: 'Edit title', applies: (s) => !s.nameWhy, why: (s) => s.nameWhy },
    { action: 'copy-subgraph', label: 'Copy subgraph', key: 'ctrl+c', separated: true, view: true },
    { action: 'cut-subgraph', label: 'Cut subgraph', key: 'ctrl+x', view: true },
    ...pasteItems(),
    { action: 'collapse-subgraph', label: 'Collapse subgraph', key: 'h', view: true, separated: true,
      applies: (s) => !s.collapseWhy, why: (s) => s.collapseWhy ?? null },
    ...turnItems().map((i) => ({ ...i, separated: false })),
    { action: 'center-view', label: 'Center in window', key: 'f', view: true },
    fitPart,
  ],
  box: [
    { action: 'add-node', label: 'Add node', key: 'n', applies: () => false, why: () => EXPAND_FIRST },
    { action: 'add-subgraph', label: 'Add subgraph', key: 's', applies: () => false, why: () => EXPAND_FIRST },
    { action: 'connect', label: 'Connect to…', key: 'c', mode: true, applies: (s) => !s.nameWhy, why: (s) => s.nameWhy },
    { action: 'connect-from', label: 'Connect from…', key: 'shift+c', mode: true, applies: (s) => !s.nameWhy, why: (s) => s.nameWhy },
    { action: 'edit-title', label: 'Edit title', applies: (s) => !s.nameWhy, why: (s) => s.nameWhy },
    { action: 'copy-subgraph', label: 'Copy subgraph', key: 'ctrl+c', separated: true, view: true },
    { action: 'cut-subgraph', label: 'Cut subgraph', key: 'ctrl+x', view: true },
    ...pasteItems(() => EXPAND_FIRST),
    { action: 'expand-subgraph', label: 'Expand subgraph', key: 'h', view: true, separated: true,
      applies: (s) => !s.collapseWhy, why: (s) => s.collapseWhy ?? null },
    ...turnItems().map((i) => ({ ...i, separated: false })),
    { action: 'center-view', label: 'Center in window', key: 'f', view: true },
    fitPart,
  ],
  title: [
    { action: 'edit-title', label: 'Edit title' },
  ],
  space: [
    { action: 'add-node', label: 'Add node', key: 'n' },
    { action: 'add-subgraph', label: 'Add subgraph', key: 's' },
    ...pasteItems(),
    { action: 'find', label: 'Find…', key: '/', mode: true, separated: true, view: true },
    { action: 'fit-view', label: 'Fit to window', key: 'f', view: true },
    ...turnItems(),
  ],
};

/** The footer's Export menu. Its items act on the page, not the diagram, so it is not one of MENUS. */
export const EXPORT_MENU = [
  { action: 'copy-svg', label: 'Copy SVG', key: 'c' },
  { action: 'download-svg', label: 'Download SVG', key: 'd' },
  { action: 'download-mermaid', label: 'Download Mermaid', key: 'm' },
];
