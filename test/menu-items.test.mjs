import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { applies, EXPORT_MENU, GLOBAL_KEYS, keyAria, keyLabel, LOCKED, MENUS, NOTHING_COPIED, PART_UNNAMED, SUBGRAPH_BARE, SUBGRAPH_ON_EDGE, VERBS, whyNot } from '../web/menu-items.mjs';
import { ARROW_TYPES } from '../web/arrow-types.mjs';
import { ARROWS, arrowType, BRACKETS } from '../web/patch/flowchart.mjs';
import { NODE_SHAPES } from '../web/shapes.mjs';

const STATES = [
  { edgesOk: true, selfLoop: true, nameWhy: null },
  { edgesOk: false, selfLoop: false, nameWhy: 'This subgraph has no id in the file…', collapseWhy: 'No subgraph match' },
];
const ALL_MENUS = { ...MENUS, export: EXPORT_MENU };
const items = Object.entries(ALL_MENUS).flatMap(([menu, list]) => list.map((item) => ({ menu, item })));

test('every menu label starts with one of the verbs, in sentence case', () => {
  for (const { item: { label } } of items) {
    assert.ok(VERBS.includes(label.split(' ')[0].replace(/…$/, '')), `${label}: not a listed verb`);
    // An acronym (SVG) and a name (Mermaid) keep their capitals.
    assert.ok(label.split(' ').slice(1).every((w) => w === w.toLowerCase() || /^[A-Z]{2,}$/.test(w) || w === 'Mermaid'),
      `${label}: not sentence case`);
  }
});

test('keys are unique within a menu, each one key, Shift only with a letter the menu has (that item the other way round)', () => {
  for (const [menu, list] of Object.entries(ALL_MENUS)) {
    const keys = list.map((i) => i.key).filter((k) => k !== undefined);
    assert.equal(new Set(keys).size, keys.length, `${menu}: a key is used twice`);
    for (const k of keys) {
      assert.match(k, /^(ctrl\+)?(shift\+)?[a-z/]$/);
      if (k.includes('shift+')) assert.ok(keys.includes(k.replace('shift+', '')), `${menu}: ${k} with no ${k.replace('shift+', '')}`);
    }
  }
});

test('a menu shows Ctrl as Help does for the system, and Shift as ⇧', () => {
  assert.deepEqual(['c', 'shift+c', 'ctrl+c', 'ctrl+shift+v'].map((k) => keyLabel(k, 'pc')), ['C', '⇧C', 'Ctrl+C', 'Ctrl+⇧V']);
  assert.deepEqual(['ctrl+c', 'ctrl+shift+v'].map((k) => keyLabel(k, 'mac')), ['⌘C', '⌘⇧V']);
  assert.deepEqual(['c', 'shift+c', 'ctrl+shift+v'].map((k) => keyAria(k, 'pc')), ['C', 'Shift+C', 'Control+Shift+V']);
  assert.equal(keyAria('ctrl+v', 'mac'), 'Meta+V');
});

test('Paste node is grayed until a node is copied, then where the menu would add nothing that shows', () => {
  const paste = (menu) => MENUS[menu].find((i) => i.action === 'paste-node');
  for (const menu of ['node', 'edge', 'subgraph', 'box', 'space']) {
    assert.equal(applies(paste(menu), { edgesOk: true, selfLoop: false, nameWhy: null }), false, menu);
    assert.equal(whyNot(paste(menu), { edgesOk: true, selfLoop: false, nameWhy: null }), NOTHING_COPIED, menu);
  }
  const copied = { edgesOk: true, selfLoop: false, nameWhy: null, copied: 'node' };
  for (const menu of ['node', 'edge', 'subgraph', 'space']) assert.equal(applies(paste(menu), copied), true, menu);
  assert.equal(applies(paste('box'), copied), false);
  assert.equal(applies(paste('edge'), { ...copied, insertWhy: 'collapsed' }), false);
  assert.equal(whyNot(paste('edge'), { ...copied, insertWhy: 'collapsed' }), 'collapsed');
});

test('an item with no key is one that Enter runs outside menus, so a quicker key does its job', () => {
  for (const { item } of items) if (item.key === undefined) assert.ok(GLOBAL_KEYS.enter.includes(item.action), item.action);
});

// The letter rule is about the selected item's menu; Export's menu, opened from the footer, is not one.
const itemMenus = items.filter(({ menu }) => menu !== 'export');

test('a menu key that the page also answers outside menus runs the same action there', () => {
  for (const { item } of itemMenus) {
    const global = item.key === undefined ? undefined : GLOBAL_KEYS[item.key];
    if (global) assert.ok(global.includes(item.action), `${item.action} uses ${item.key}, which outside menus is ${global}`);
  }
});

test('an action that a letter key runs outside menus has that letter in menus too', () => {
  for (const { item } of itemMenus) {
    const letters = Object.entries(GLOBAL_KEYS).filter(([k, acts]) => /^[a-z]$/.test(k) && acts.includes(item.action));
    for (const [k] of letters) assert.equal(item.key, k, `${item.action}: ${k} outside menus, ${item.key} in them`);
  }
});

test('one action has one key and one label in every menu', () => {
  const seen = new Map();
  for (const { item } of items) {
    const was = seen.get(item.action);
    if (was) assert.deepEqual([item.key, item.label], was, item.action);
    seen.set(item.action, [item.key, item.label]);
  }
});

test('only an item that waits for a further click ends in an ellipsis', () => {
  for (const { item } of items) {
    assert.equal(item.label.endsWith('…'), Boolean(item.mode), item.action);
  }
});

test('an item that can be grayed says why', () => {
  for (const { item } of items) {
    if (!item.applies) continue;
    assert.equal(typeof item.why, 'function', item.action);
    for (const state of STATES) if (!item.applies(state)) assert.ok(item.why(state).length > 0);
  }
});

test('arrow types: digits unique, every one is an arrow type merma can write, and every one of those is listed', () => {
  const digits = ARROW_TYPES.map((a) => a.digit);
  assert.deepEqual(digits, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
  for (const a of ARROW_TYPES) {
    assert.ok(ARROWS[a.key], a.key);
    assert.equal(arrowType(a.key), a.key);
    assert.ok(a.name);
    assert.match(a.icon(), /^<svg [^>]*>.*<\/svg>$/);
  }
  assert.deepEqual(ARROW_TYPES.map((a) => a.key).sort(), Object.keys(ARROWS).sort());
  assert.equal(new Set(ARROW_TYPES.map((a) => a.name)).size, ARROW_TYPES.length);
});

test('the guide lists every shape with its digit, meaning and syntax', () => {
  const guide = readFileSync(join(import.meta.dirname, '..', 'docs', 'guide.md'), 'utf8');
  for (const s of NODE_SHAPES) {
    const b = BRACKETS[s.key];
    const syntax = b ? `A${b[0]}text${b[1]}` : `A@{ shape: ${s.key} }`;
    const key = s.digit ? `${s.shift ? 'Shift+' : ''}${s.digit}` : '';
    assert.ok(guide.includes(`| ${key} | ${s.name} | ${s.meaning} | \`${syntax}\` |`), `${s.name} ${syntax}`);
  }
});

test('the guide lists every arrow type with its digit and syntax', () => {
  const guide = readFileSync(join(import.meta.dirname, '..', 'docs', 'guide.md'), 'utf8');
  for (const a of ARROW_TYPES) assert.ok(guide.includes(`| ${a.digit} | ${a.name} | \`${a.key}\` |`), `${a.name} ${a.key}`);
});

test('shapes: the first ten have the digits 1–9, 0, the next ten the same with Shift, and the rest none; keys and names unique; every bracket shape listed', () => {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  assert.deepEqual(NODE_SHAPES.slice(0, 10).map((s) => [s.digit, Boolean(s.shift)]), digits.map((d) => [d, false]));
  assert.deepEqual(NODE_SHAPES.slice(10, 20).map((s) => [s.digit, s.shift]), digits.map((d) => [d, true]));
  assert.ok(NODE_SHAPES.slice(20).every((s) => s.digit === undefined));
  assert.equal(new Set(NODE_SHAPES.map((s) => s.key)).size, NODE_SHAPES.length);
  assert.equal(new Set(NODE_SHAPES.map((s) => s.name)).size, NODE_SHAPES.length);
  for (const at of Object.keys(BRACKETS)) assert.ok(NODE_SHAPES.some((s) => s.key === at), `${at} is not listed`);
});

test('every icon is the shared frame around at least one drawing', () => {
  for (const { name, icon } of [...ARROW_TYPES, ...NODE_SHAPES]) {
    const svg = icon();
    assert.match(svg, /^<svg viewBox="0 0 \d+ \d+" [^>]*aria-hidden="true">.*<\/svg>$/s, name);
    assert.match(svg, /<path d="[^"]+"|<circle |<rect /, `${name} draws nothing`);
  }
});

test('while the code is being edited only the view items apply, and the rest say why', () => {
  const locked = { edgesOk: true, selfLoop: false, nameWhy: null, locked: true };
  const live = Object.values(MENUS).flat().filter((item) => applies(item, locked)).map((item) => item.action);
  assert.deepEqual([...new Set(live)].sort(), ['center-view', 'collapse-subgraph', 'copy-node', 'copy-subgraph', 'cut-node', 'cut-subgraph', 'expand-subgraph', 'find', 'fit-edge', 'fit-node', 'fit-subgraph', 'fit-view', 'flip', 'rotate']);
  for (const item of Object.values(MENUS).flat()) {
    if (!applies(item, locked)) assert.equal(whyNot(item, locked), LOCKED, item.action);
  }
});

test('unlocked, an item applies and says why by its own rule', () => {
  const unlocked = { edgesOk: false, selfLoop: true, nameWhy: 'no id', locked: false };
  const del = /** @type {import('../web/menu-items.mjs').MenuItem} */ (MENUS.node.find((i) => i.action === 'delete-node'));
  const add = /** @type {import('../web/menu-items.mjs').MenuItem} */ (MENUS.node.find((i) => i.action === 'add-connected-node'));
  assert.equal(applies(add, unlocked), true);
  assert.equal(applies(del, unlocked), false);
  assert.notEqual(whyNot(del, unlocked), LOCKED);
});

// Help's key rows, read as GLOBAL_KEYS names them. A key the page answers outside the editor's key map is not in
// GLOBAL_KEYS (editor.mjs checks only that each GLOBAL_KEYS key has a handler there): when a new Help key fails here,
// look in editor.mjs's key map and in HELP_ONLY below.
const HELP_ONLY = {
  '`': 'code-panel.mjs answers it',
  'shift+`': 'code-panel.mjs answers it',
  '?': 'main.mjs answers it',
  'ctrl+c': 'copy, handled before the key map',
  'ctrl+v': 'paste, handled before the key map',
  'ctrl+shift+v': 'paste without edges, handled before the key map',
  'ctrl+x': 'cut, handled before the key map',
  'ctrl+z': 'undo, handled before the key map',
  'ctrl+shift+z': 'redo, handled before the key map',
  'ctrl+y': 'redo, handled before the key map',
  'shift+f10': "the browser's contextmenu event",
};
// '=' is + unshifted on a US keyboard (docs/ux.md): the guide lists it, Help shows +.
const NOT_IN_HELP = ['='];
// Rows under a Keys section that name no key of their own.
const KEYLESS_ROWS = ['Opposite arrow'];
const ARROW_KEYS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
const NAMES = { esc: 'escape', space: ' ', up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright' };

/** Each row under one of Help's Keys sections: its section, its text, the keys it names, and what it says they do. */
const helpKeyRows = () => {
  const html = readFileSync(join(import.meta.dirname, '..', 'web', 'index.html'), 'utf8');
  const help = html.slice(html.indexOf('<div id="help"'), html.indexOf('</table>'));
  const rows = [];
  let inKeys = false, sectionName = '';
  for (const [, tr] of help.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)) {
    const section = tr.match(/class="section">([^<]*)/);
    if (section) { inKeys = section[1].startsWith('Keys'); sectionName = section[1]; continue; }
    const th = tr.match(/<th scope="row"[^>]*>(.*)<\/th><td>(.*)<\/td>/);
    if (!inKeys || !th) continue;
    const pc = th[1].replace(/<span data-os="mac"[^>]*>.*?<\/span>/g, '').replace(/<\/?span[^>]*>/g, '');
    const text = pc.replace(/<[^>]+>/g, '');
    const keys = [];
    if (text === 'Arrows with Ctrl or Shift') keys.push(...ARROW_KEYS, ...ARROW_KEYS.map((a) => 'ctrl+' + a), ...ARROW_KEYS.map((a) => 'shift+' + a));
    else if (text.startsWith('Ctrl+Arrows')) keys.push(...ARROW_KEYS.map((a) => 'ctrl+' + a));
    else {
      if (/\bArrows\b/.test(text)) keys.push(...ARROW_KEYS);
      for (const [run] of pc.matchAll(/<kbd>[^<]*<\/kbd>(?:\+<kbd>[^<]*<\/kbd>)*/g)) {
        keys.push([...run.matchAll(/<kbd>([^<]*)<\/kbd>/g)].map(([, k]) => NAMES[k.toLowerCase()] ?? k.toLowerCase()).join('+'));
      }
    }
    rows.push({ section: sectionName, text, keys, does: th[2].replace(/<[^>]+>/g, '') });
  }
  return rows;
};

test("every row under Help's Keys sections names a key, and each is one the page answers outside menus", () => {
  const rows = helpKeyRows();
  assert.ok(rows.length > 20, 'Help read');
  for (const { text, keys } of rows) {
    if (KEYLESS_ROWS.includes(text)) continue;
    assert.ok(keys.length, `${text}: no key read`);
    for (const k of keys) assert.ok(k in GLOBAL_KEYS || k in HELP_ONLY, `${text}: ${k} is not in GLOBAL_KEYS`);
  }
});

// Within a Keys section, rows go by the key: punctuation and digits, then letters, then named keys (Arrows, Backspace,
// Delete, …), each key's forms together in the order plain, Shift, Ctrl, Ctrl+Shift.
const NAMED = ['arrows', 'backspace', 'delete', 'arrowdown', 'enter', 'escape', 'f2', 'f10', ' ', 'arrowup'];
const sortKey = (/** @type {string} */ shortcut) => {
  const [, mods, base] = /** @type {RegExpMatchArray} */ (shortcut.match(/^((?:ctrl\+)?(?:shift\+)?)(.+)$/));
  const form = ['', 'shift+', 'ctrl+', 'ctrl+shift+'].indexOf(mods);
  const group = NAMED.includes(base) ? 2 : /[a-z]/.test(base) ? 1 : 0;
  const within = group === 2 ? NAMED.indexOf(base) : base.codePointAt(0);
  return [group, within, form];
};

test("Help's Keys sections go by the key, each key's forms together; a row names one shortcut", () => {
  const rows = helpKeyRows().filter((r) => !KEYLESS_ROWS.includes(r.text));
  for (const r of rows) {
    // A row of arrows names the four as one shortcut (with Ctrl and Shift, the diagram's moves; then Enter, a pick).
    const arrows = r.keys.filter((k) => /arrow(up|down|left|right)$/.test(k)).length >= 4;
    if (!arrows) assert.equal(r.keys.length, 1, `${r.text} names ${r.keys.length} shortcuts`);
  }
  const keyOf = (/** @type {{ keys: string[] }} */ r) => (r.keys.length >= 4 ? r.keys[0].replace(/arrow\w+$/, 'arrows') : r.keys[0]);
  for (let k = 1; k < rows.length; k++) {
    if (rows[k].section !== rows[k - 1].section) continue;
    const [a, b] = [sortKey(keyOf(rows[k - 1])), sortKey(keyOf(rows[k]))];
    const order = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    assert.ok(order <= 0, `${rows[k].text} comes before ${rows[k - 1].text} in ${rows[k].section}`);
  }
});

test("each row under Help's Keys sections says what it does in at most 45 characters", () => {
  for (const { text, does } of helpKeyRows()) assert.ok(does.length <= 45, `${text}: ${does.length} characters`);
});

test('every key the page answers outside menus is in Help', () => {
  const inHelp = new Set(helpKeyRows().flatMap((r) => r.keys));
  for (const k of Object.keys(GLOBAL_KEYS)) {
    if (!NOT_IN_HELP.includes(k)) assert.ok(inHelp.has(k), `${JSON.stringify(k)} is not in Help`);
  }
});

test('Shift+F fits the selection, just after Center in window (F) in its menu; Fit to subgraph is grayed on one with no id', () => {
  const fits = { node: 'fit-node', edge: 'fit-edge', subgraph: 'fit-subgraph', box: 'fit-subgraph' };
  for (const [menu, action] of Object.entries(fits)) {
    const at = MENUS[menu].findIndex((i) => i.action === 'center-view');
    assert.equal(MENUS[menu][at + 1]?.action, action, menu);
    assert.equal(MENUS[menu][at + 1]?.key, 'shift+f', menu);
  }
  assert.deepEqual(GLOBAL_KEYS['shift+f'].sort(), ['fit-edge', 'fit-node', 'fit-subgraph']);
  for (const menu of ['subgraph', 'box']) {
    const fit = MENUS[menu].find((i) => i.action === 'fit-subgraph');
    assert.equal(applies(fit, { edgesOk: true, selfLoop: false, nameWhy: null, partWhy: null }), true, menu);
    assert.equal(whyNot(fit, { edgesOk: true, selfLoop: false, nameWhy: null, partWhy: PART_UNNAMED }), PART_UNNAMED, menu);
  }
});

test('C and Shift+C on an edge are Reassign end… and Reassign start…, as on a node they connect to and from; M is Merge into…; . opens menus', () => {
  const edge = (/** @type {string} */ k) => MENUS.edge.find((i) => i.key === k)?.action;
  assert.deepEqual([edge('c'), edge('shift+c')], ['reassign-end', 'reassign-start']);
  assert.deepEqual(GLOBAL_KEYS.c, ['connect', 'reassign-end']);
  assert.deepEqual(GLOBAL_KEYS['shift+c'], ['connect-from', 'reassign-start']);
  assert.deepEqual(GLOBAL_KEYS.m, ['merge-into']);
  assert.equal(MENUS.node.find((i) => i.action === 'merge-into')?.key, 'm');
  assert.deepEqual(GLOBAL_KEYS['.'], []);
  assert.equal('e' in GLOBAL_KEYS, false);
});

test('with a subgraph copied, the paste items read Paste subgraph and Paste subgraph without outside edges; an edge grays it', () => {
  const label = (/** @type {any} */ item, /** @type {object} */ s) => (item.back?.(s) ? item.labelBack(s) : item.label);
  const s = { edgesOk: true, selfLoop: false, nameWhy: null, copied: 'subgraph' };
  for (const menu of ['node', 'subgraph', 'space']) {
    const [paste, bare] = ['paste-node', 'paste-node-bare'].map((a) => MENUS[menu].find((i) => i.action === a));
    assert.equal(label(paste, s), 'Paste subgraph', menu);
    assert.equal(label(bare, s), 'Paste subgraph without outside edges', menu);
    assert.equal(applies(paste, s) && applies(bare, s), true, menu);
    assert.equal(label(paste, { ...s, copied: 'node' }), 'Paste node', menu);
  }
  const edge = MENUS.edge.find((i) => i.action === 'paste-node');
  assert.equal(label(edge, s), 'Paste subgraph');
  assert.equal(whyNot(edge, s), SUBGRAPH_ON_EDGE);
  assert.equal(applies(edge, { ...s, copied: 'node' }), true);
});

test('with a node or a subgraph cut, the paste items read Move … here, gray by the cut\'s own reason, and a box takes it', () => {
  const label = (/** @type {any} */ item, /** @type {object} */ s) => (typeof item.labelBack === 'function' ? item.labelBack(s) : item.labelBack);
  for (const kind of ['node', 'subgraph']) {
    const base = { edgesOk: true, selfLoop: false, nameWhy: null, cut: kind };
    for (const menu of ['node', 'edge', 'subgraph', 'box', 'space']) {
      const item = MENUS[menu].find((i) => i.action === 'paste-node');
      assert.equal(item?.back?.(base), true, menu);
      // On an edge a node's move leaves its own edges behind, deleted, and says so.
      assert.equal(label(item, base), menu === 'edge' && kind === 'node' ? 'Move node here without edges' : `Move ${kind} here`, menu);
      assert.equal(applies(item, base), true, menu);
      assert.equal(whyNot(item, { ...base, cutWhy: 'It is already in this subgraph.' }), 'It is already in this subgraph.', menu);
    }
  }
  const edge = MENUS.edge.find((i) => i.action === 'paste-node');
  assert.equal(whyNot(edge, { edgesOk: true, selfLoop: false, nameWhy: null, cut: 'node', insertWhy: 'collapsed' }), 'collapsed');
  // A subgraph's move never deletes its edges, so the bare paste is grayed, saying so, wherever it is.
  for (const menu of ['node', 'subgraph', 'box', 'space']) {
    const bare = MENUS[menu].find((i) => i.action === 'paste-node-bare');
    const s = { edgesOk: true, selfLoop: false, nameWhy: null, cut: 'subgraph' };
    assert.equal(label(bare, s), 'Move subgraph here without edges', menu);
    assert.equal(whyNot(bare, s), SUBGRAPH_BARE, menu);
    assert.equal(applies(bare, { ...s, cut: 'node' }), true, menu);
  }
});
