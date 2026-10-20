// What each menu holds, as data: the editor maps each action to what it does, and menu.mjs draws them. The rules the
// items follow (docs/ux.md) are tested against this file: labels start with a verb from VERBS, each key is unique in
// its menu and is a letter of its label, a key the page also uses outside menus runs the same action here, and only
// an item that waits for a further click (mode) ends in "…".

/** The verbs menu labels start with: Add makes a thing, Edit changes one of its properties, Remove clears one, Delete
 * removes the thing. */
export const VERBS = ['Add', 'Edit', 'Remove', 'Delete', 'Connect', 'Reverse', 'Move'];

/** Keys the page answers outside menus (KeyboardEvent.key, lower-cased), and the actions each one runs. */
export const GLOBAL_KEYS = {
  n: ['add-node', 'add-connected-node'],
  enter: ['edit-label'],
  f2: ['edit-label'],
  delete: ['delete-node', 'delete-edge'],
  backspace: ['delete-node', 'delete-edge'],
  escape: [],
};

const noEdgeMatch = "The drawn edges don't match the file's text (no edge match), so deleting could change the wrong "
  + 'edge. Delete it in the file.';

/**
 * Each item: `action` (what the editor runs), `label` (a string, or a function of the menu's state), `key` (its
 * shortcut letter), and optionally `applies(state)` with `why(state)` (when it does not apply, the item is greyed and
 * says why), `submenu` (the name of what opens beside it), `mode` (it waits for a further click), `separated`.
 * The state: { edgesOk, hasLabel, title }.
 */
export const MENUS = {
  node: [
    { action: 'add-connected-node', label: 'Add connected node', key: 'n' },
    { action: 'connect', label: 'Connect to…', key: 'c', mode: true },
    { action: 'edit-label', label: 'Edit label', key: 'l' },
    { action: 'delete-node', label: 'Delete node', key: 'd', separated: true, applies: (s) => s.edgesOk, why: () => noEdgeMatch },
  ],
  edge: [
    { action: 'edit-label', label: 'Edit label', key: 'l' },
    { action: 'remove-label', label: 'Remove label', key: 'r', applies: (s) => s.hasLabel, why: () => 'This edge has no label to remove.' },
    { action: 'reverse-edge', label: 'Reverse edge', key: 'v' },
    { action: 'edit-arrow-type', label: 'Edit arrow type', key: 't', submenu: 'arrow-types' },
    { action: 'delete-edge', label: 'Delete edge', key: 'd', separated: true },
  ],
  space: [
    { action: 'add-node', label: (s) => (s.title ? `Add node in ${s.title}` : 'Add node'), key: 'n' },
  ],
};

/** An item's label for a state. */
export const labelOf = (item, state) => (typeof item.label === 'function' ? item.label(state) : item.label);

/** Where an item's key is shown in its label: its first letter that starts a word, else its first letter at all. */
export function keyIndex(label, key) {
  const lower = label.toLowerCase();
  const word = [...lower].findIndex((c, i) => c === key && (i === 0 || /\W/.test(lower[i - 1])));
  return word >= 0 ? word : lower.indexOf(key);
}
