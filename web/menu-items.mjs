// What each menu holds, as data: the editor maps each action to what it does, and menu.mjs draws them. The rules the
// items follow (docs/ux.md) are tested against this file: labels start with a verb from VERBS, each key is unique in
// its menu and is shown at the item's right, a key the page also uses outside menus runs the same action here, and only
// an item that waits for a further click or typing (mode) ends in "…".

/** The verbs menu labels start with: Add makes a thing, Edit changes one of its properties, Remove clears one, Delete
 * removes the thing. */
export const VERBS = ['Add', 'Edit', 'Remove', 'Delete', 'Connect', 'Reverse', 'Move', 'Find', 'Fit', 'Center', 'Copy', 'Download',
  'Collapse', 'Expand'];

/**
 * Keys the page answers outside menus, and the menu actions each one runs. A key is named by KeyboardEvent.key,
 * lower-cased, after its modifiers: `ctrl+` (Ctrl or Alt), then `shift+`.
 */
export const GLOBAL_KEYS = {
  n: ['add-node', 'add-connected-node'],
  c: ['connect'],
  r: ['reverse-edge'],
  enter: ['edit-node', 'edit-label', 'edit-title'],
  f2: ['edit-node', 'edit-label', 'edit-title'],
  delete: ['delete-node', 'delete-edge'],
  backspace: ['delete-node', 'delete-edge'],
  f: ['fit-view', 'center-view'],
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
  m: [],
  escape: [],
};

export const NO_EDGE_MATCH = "The drawn edges don't match the file's text (no edge match), so deleting could change the wrong "
  + 'edge. Delete it in the file.';

/** Why a subgraph cannot be collapsed or expanded: Mermaid's subgraphs are not the ones merma reads in the text. */
export const NO_SUBGRAPH_MATCH = "merma can't match this diagram's subgraphs to its text, so they can't be collapsed or "
  + 'expanded here.';

/** Why an edit does nothing while the code panel's draft holds the lock: the warning, and a grayed item's reason. */
export const LOCKED = 'The code is being edited: save or cancel it to edit the diagram.';

/**
 * What a menu needs to know to gray its items.
 * @typedef {object} MenuState
 * @property {boolean} [locked] the code is being edited, so only `view` items apply
 * @property {boolean} edgesOk the drawn edges match the file's (an edge match)
 * @property {boolean} selfLoop the selected edge goes from a node back to itself
 * @property {string | null} nameWhy why the selected subgraph cannot be given an id, or null
 * @property {string | null} [collapseWhy] why the selected subgraph cannot be collapsed or expanded, or null
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
 * @property {string} [key] its shortcut letter; none for an item a quicker key outside menus already runs (Enter edits)
 * @property {(state: MenuState) => boolean} [applies] when it does not apply, the item is grayed
 * @property {(state: MenuState) => string | null} [why] what a grayed item says
 * @property {string} [submenu] the name of what opens beside it: the item's only action
 * @property {boolean} [mode] it waits for a further click or typing
 * @property {boolean} [view] it changes only the view, so it works while the code is being edited
 * @property {boolean} [separated] set apart from the items above it
 */

/** Why an item that adds to a subgraph does nothing while it is collapsed: what it adds would be hidden. */
const EXPAND_FIRST = 'This subgraph is collapsed: expand it first (H) to add to it.';

/**
 * Each kind's menu. `box` is a subgraph drawn collapsed: the subgraph's menu, with Expand in place of Collapse.
 * @type {Record<'node' | 'edge' | 'subgraph' | 'box' | 'title' | 'space', MenuItem[]>}
 */
export const MENUS = {
  node: [
    { action: 'add-connected-node', label: 'Add connected node', key: 'n' },
    { action: 'connect', label: 'Connect to…', key: 'c', mode: true },
    { action: 'edit-node', label: 'Edit node' },
    { action: 'delete-node', label: 'Delete node', key: 'd', separated: true, applies: (s) => s.edgesOk, why: () => NO_EDGE_MATCH },
    { action: 'center-view', label: 'Center in window', key: 'f', separated: true, view: true },
  ],
  edge: [
    { action: 'edit-label', label: 'Edit label' },
    { action: 'edit-arrow-type', label: 'Edit arrow type', key: 't', submenu: 'arrow-types' },
    { action: 'reverse-edge', label: 'Reverse edge', key: 'r', applies: (s) => !s.selfLoop, why: () => 'A self-loop has no direction to reverse.' },
    { action: 'move-start', label: 'Move start to…', key: 's', mode: true },
    { action: 'move-end', label: 'Move end to…', key: 'e', mode: true },
    { action: 'delete-edge', label: 'Delete edge', key: 'd', separated: true },
    { action: 'center-view', label: 'Center in window', key: 'f', separated: true, view: true },
  ],
  subgraph: [
    { action: 'add-node', label: 'Add node', key: 'n' },
    { action: 'add-subgraph', label: 'Add subgraph', key: 's' },
    { action: 'connect', label: 'Connect to…', key: 'c', mode: true, applies: (s) => !s.nameWhy, why: (s) => s.nameWhy },
    { action: 'edit-title', label: 'Edit title', applies: (s) => !s.nameWhy, why: (s) => s.nameWhy },
    { action: 'collapse-subgraph', label: 'Collapse subgraph', key: 'h', separated: true, view: true,
      applies: (s) => !s.collapseWhy, why: (s) => s.collapseWhy ?? null },
    { action: 'center-view', label: 'Center in window', key: 'f', view: true },
  ],
  box: [
    { action: 'add-node', label: 'Add node', key: 'n', applies: () => false, why: () => EXPAND_FIRST },
    { action: 'add-subgraph', label: 'Add subgraph', key: 's', applies: () => false, why: () => EXPAND_FIRST },
    { action: 'connect', label: 'Connect to…', key: 'c', mode: true, applies: (s) => !s.nameWhy, why: (s) => s.nameWhy },
    { action: 'edit-title', label: 'Edit title', applies: (s) => !s.nameWhy, why: (s) => s.nameWhy },
    { action: 'expand-subgraph', label: 'Expand subgraph', key: 'h', separated: true, view: true,
      applies: (s) => !s.collapseWhy, why: (s) => s.collapseWhy ?? null },
    { action: 'center-view', label: 'Center in window', key: 'f', view: true },
  ],
  title: [
    { action: 'edit-title', label: 'Edit title' },
  ],
  space: [
    { action: 'add-node', label: 'Add node', key: 'n' },
    { action: 'add-subgraph', label: 'Add subgraph', key: 's' },
    { action: 'find', label: 'Find…', key: '/', mode: true, separated: true, view: true },
    { action: 'fit-view', label: 'Fit to window', key: 'f', view: true },
  ],
};

/** The footer's Export menu. Its items act on the page, not the diagram, so it is not one of MENUS. */
export const EXPORT_MENU = [
  { action: 'copy-svg', label: 'Copy SVG', key: 'c' },
  { action: 'download-svg', label: 'Download SVG', key: 'd' },
  { action: 'download-mermaid', label: 'Download Mermaid', key: 'm' },
];
