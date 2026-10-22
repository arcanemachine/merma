import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { GLOBAL_KEYS, keyIndex, MENUS, VERBS } from '../web/menu-items.mjs';
import { ARROW_TYPES } from '../web/arrow-types.mjs';
import { ARROWS, arrowType, BRACKETS } from '../web/patch/flowchart.mjs';
import { NODE_SHAPES } from '../web/shapes.mjs';

const STATES = [
  { edgesOk: true, hasLabel: true, nameWhy: null },
  { edgesOk: false, hasLabel: false, nameWhy: 'This subgraph has no id in the file…' },
];
const items = Object.entries(MENUS).flatMap(([menu, list]) => list.map((item) => ({ menu, item })));

test('every menu label starts with one of the verbs, in sentence case', () => {
  for (const { item: { label } } of items) {
    assert.ok(VERBS.includes(label.split(' ')[0]), `${label}: not a listed verb`);
    assert.ok(label.split(' ').slice(1).every((w) => w === w.toLowerCase()), `${label}: not sentence case`);
  }
});

test('a split item has a submenu, and its ▸ is named like a menu label: a listed verb, sentence case', () => {
  for (const { item } of items.filter(({ item }) => item.split)) {
    assert.ok(item.submenu, `${item.action}: split with no submenu`);
    assert.ok(VERBS.includes(item.split.split(' ')[0]), `${item.split}: not a listed verb`);
    assert.ok(item.split.split(' ').slice(1).every((w) => w === w.toLowerCase()), `${item.split}: not sentence case`);
  }
});

test('keys are unique within a menu and are a letter of their label', () => {
  for (const [menu, list] of Object.entries(MENUS)) {
    const keys = list.map((i) => i.key);
    assert.equal(new Set(keys).size, keys.length, `${menu}: a key is used twice`);
    for (const item of list) {
      assert.match(item.key, /^[a-z]$/);
      assert.ok(keyIndex(item.label, item.key) >= 0, `${item.action}: ${item.key}`);
    }
  }
});

test('a menu key that the page also answers outside menus runs the same action there', () => {
  for (const { item } of items) {
    const global = GLOBAL_KEYS[item.key];
    if (global) assert.ok(global.includes(item.action), `${item.action} uses ${item.key}, which outside menus is ${global}`);
  }
});

test('an action that a letter key runs outside menus has that letter in menus too', () => {
  for (const { item } of items) {
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

test('an item that can be greyed says why', () => {
  for (const { item } of items) {
    if (!item.applies) continue;
    assert.equal(typeof item.why, 'function', item.action);
    for (const state of STATES) if (!item.applies(state)) assert.ok(item.why(state).length > 0);
  }
});

test('the key is shown at the start of a word when it starts one', () => {
  assert.equal(keyIndex('Edit arrow type', 't'), 11);
  assert.equal(keyIndex('Add connected node', 'n'), 14);
  assert.equal(keyIndex('Reverse edge', 'v'), 2);
  assert.equal(keyIndex('Edit label', 'z'), -1);
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

test('the guide lists every arrow type with its digit and syntax', () => {
  const guide = readFileSync(join(import.meta.dirname, '..', 'docs', 'guide.md'), 'utf8');
  for (const a of ARROW_TYPES) assert.ok(guide.includes(`| ${a.digit} | ${a.name} | \`${a.key}\` |`), `${a.name} ${a.key}`);
});

test('shapes: the first ten have the digits 1–9, 0 and the rest none; keys and names unique; every bracket shape listed', () => {
  assert.deepEqual(NODE_SHAPES.slice(0, 10).map((s) => s.digit), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
  assert.ok(NODE_SHAPES.slice(10).every((s) => s.digit === undefined));
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
