// What each menu holds, as data: the editor maps each action to what it does, and menu.mjs draws them. The rules the
// items follow (docs/ux.md) are tested against this file: labels start with a verb from VERBS, each key is unique in
// its menu and is a letter of its label, a key the page also uses outside menus runs the same action here, and only
// an item that waits for a further click (mode) ends in "…".

/** The verbs menu labels start with: Add makes a thing, Edit changes one of its properties, Remove clears one, Delete
 * removes the thing. */
export const VERBS = ['Add', 'Edit', 'Remove', 'Delete', 'Connect', 'Reverse', 'Move', 'Fit', 'Copy', 'Download'];

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
  f: ['fit-view'],
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
  '/': [],
  '+': [],
  '=': [],
  '-': [],
  m: [],
  escape: [],
};

export const NO_EDGE_MATCH = "The drawn edges don't match the file's text (no edge match), so deleting could change the wrong "
  + 'edge. Delete it in the file.';

/**
 * What a menu needs to know to grey its items.
 * @typedef {object} MenuState
 * @property {boolean} edgesOk the drawn edges match the file's (an edge match)
 * @property {boolean} selfLoop the selected edge goes from a node back to itself
 * @property {string | null} nameWhy why the selected subgraph cannot be given an id, or null
 */

/**
 * A menu item.
 * @typedef {object} MenuItem
 * @property {string} action what the editor runs
 * @property {string} label
 * @property {string} key its shortcut letter
 * @property {(state: MenuState) => boolean} [applies] when it does not apply, the item is greyed
 * @property {(state: MenuState) => string | null} [why] what a greyed item says
 * @property {string} [submenu] the name of what opens beside it: the item's only action
 * @property {boolean} [mode] it waits for a further click
 * @property {boolean} [separated] set apart from the items above it
 */

/** @type {Record<'node' | 'edge' | 'subgraph' | 'title' | 'space', MenuItem[]>} */
export const MENUS = {
  node: [
    { action: 'add-connected-node', label: 'Add connected node', key: 'n' },
    { action: 'connect', label: 'Connect to…', key: 'c', mode: true },
    { action: 'edit-node', label: 'Edit node', key: 'e' },
    { action: 'delete-node', label: 'Delete node', key: 'd', separated: true, applies: (s) => s.edgesOk, why: () => NO_EDGE_MATCH },
  ],
  edge: [
    { action: 'edit-label', label: 'Edit label', key: 'e' },
    { action: 'edit-arrow-type', label: 'Edit arrow type', key: 't', submenu: 'arrow-types' },
    { action: 'reverse-edge', label: 'Reverse edge', key: 'r', applies: (s) => !s.selfLoop, why: () => 'A self-loop has no direction to reverse.' },
    { action: 'delete-edge', label: 'Delete edge', key: 'd', separated: true },
  ],
  subgraph: [
    { action: 'add-node', label: 'Add node', key: 'n' },
    { action: 'add-subgraph', label: 'Add subgraph', key: 's' },
    { action: 'connect', label: 'Connect to…', key: 'c', mode: true, applies: (s) => !s.nameWhy, why: (s) => s.nameWhy },
    { action: 'edit-title', label: 'Edit title', key: 't', applies: (s) => !s.nameWhy, why: (s) => s.nameWhy },
  ],
  title: [
    { action: 'edit-title', label: 'Edit title', key: 't' },
  ],
  space: [
    { action: 'add-node', label: 'Add node', key: 'n' },
    { action: 'add-subgraph', label: 'Add subgraph', key: 's' },
    { action: 'fit-view', label: 'Fit to window', key: 'f', separated: true },
  ],
};

/** The footer's Export menu. Its items act on the page, not the diagram, so it is not one of MENUS. */
export const EXPORT_MENU = [
  { action: 'copy-svg', label: 'Copy SVG', key: 'c' },
  { action: 'download-svg', label: 'Download SVG', key: 'd' },
];

/**
 * Where an item's key is shown in its label: its first letter that starts a word, else its first letter at all.
 * @param {string} label
 * @param {string} key
 */
export function keyIndex(label, key) {
  const lower = label.toLowerCase();
  const word = [...lower].findIndex((c, i) => c === key && (i === 0 || /\W/.test(lower[i - 1])));
  return word >= 0 ? word : lower.indexOf(key);
}
