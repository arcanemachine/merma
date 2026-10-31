import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { applies, EXPORT_MENU, GLOBAL_KEYS, LOCKED, MENUS, VERBS, whyNot } from '../web/menu-items.mjs';
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
      assert.match(k, /^(shift\+)?[a-z/]$/);
      if (k.startsWith('shift+')) assert.ok(keys.includes(k.slice(6)), `${menu}: ${k} with no ${k.slice(6)}`);
    }
  }
});

// Keys are unique within a menu (above), so a menu has one trial on Q at most: a second would need Q to open a list of
// them, which is not built.
test('a trial item is on Q, or Shift+Q, and only a trial item is', () => {
  for (const [menu, list] of Object.entries(ALL_MENUS)) {
    for (const item of list) assert.equal(/^(shift\+)?q$/.test(item.key ?? ''), Boolean(item.trial), `${menu}: ${item.action}`);
  }
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
  assert.deepEqual([...new Set(live)].sort(), ['center-view', 'collapse-subgraph', 'expand-subgraph', 'find', 'fit-view', 'flip', 'rotate']);
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
  '?': 'main.mjs answers it',
  'ctrl+z': 'undo, handled before the key map',
  'ctrl+shift+z': 'redo, handled before the key map',
  'ctrl+y': 'redo, handled before the key map',
  'shift+f10': "the browser's contextmenu event",
};
// '=' is + unshifted on a US keyboard (docs/ux.md): the guide lists it, Help shows +.
const NOT_IN_HELP = ['='];
// Rows under a Keys section that name no key of their own.
const KEYLESS_ROWS = ['The opposite arrow'];
const ARROW_KEYS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
const NAMES = { esc: 'escape', space: ' ', up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright' };

/** Each row under one of Help's Keys sections: its text, and the keys it names. */
const helpKeyRows = () => {
  const html = readFileSync(join(import.meta.dirname, '..', 'web', 'index.html'), 'utf8');
  const help = html.slice(html.indexOf('<div id="help"'), html.indexOf('</table>'));
  const rows = [];
  let inKeys = false;
  for (const [, tr] of help.matchAll(/<tr>(.*?)<\/tr>/g)) {
    const section = tr.match(/class="section">([^<]*)/);
    if (section) { inKeys = section[1].startsWith('Keys'); continue; }
    const th = tr.match(/<th scope="row"[^>]*>(.*)<\/th><td>/);
    if (!inKeys || !th) continue;
    const pc = th[1].replace(/<span data-os="mac"[^>]*>.*?<\/span>/g, '').replace(/<\/?span[^>]*>/g, '');
    const text = pc.replace(/<[^>]+>/g, '');
    const keys = [];
    if (text === 'Arrows, with Ctrl or Shift') keys.push(...ARROW_KEYS, ...ARROW_KEYS.map((a) => 'ctrl+' + a), ...ARROW_KEYS.map((a) => 'shift+' + a));
    else if (text.startsWith('Ctrl+Arrows')) keys.push(...ARROW_KEYS.map((a) => 'ctrl+' + a));
    else {
      if (/\bArrows\b/.test(text)) keys.push(...ARROW_KEYS);
      for (const [run] of pc.matchAll(/<kbd>[^<]*<\/kbd>(?:\+<kbd>[^<]*<\/kbd>)*/g)) {
        keys.push([...run.matchAll(/<kbd>([^<]*)<\/kbd>/g)].map(([, k]) => NAMES[k.toLowerCase()] ?? k.toLowerCase()).join('+'));
      }
    }
    rows.push({ text, keys });
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

test('every key the page answers outside menus is in Help', () => {
  const inHelp = new Set(helpKeyRows().flatMap((r) => r.keys));
  for (const k of Object.keys(GLOBAL_KEYS)) {
    if (!NOT_IN_HELP.includes(k)) assert.ok(inHelp.has(k), `${JSON.stringify(k)} is not in Help`);
  }
});
