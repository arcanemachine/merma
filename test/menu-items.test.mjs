import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOBAL_KEYS, keyIndex, labelOf, MENUS, VERBS } from '../web/menu-items.mjs';
import { ARROW_TYPES } from '../web/arrow-types.mjs';
import { ARROWS, arrowType } from '../web/patch/flowchart.mjs';

const STATES = [{ edgesOk: true, hasLabel: true, title: '' }, { edgesOk: false, hasLabel: false, title: 'Payment' }];
const items = Object.entries(MENUS).flatMap(([menu, list]) => list.map((item) => ({ menu, item })));

test('every menu label starts with one of the verbs, in sentence case', () => {
  for (const { item } of items) {
    for (const state of STATES) {
      const label = labelOf(item, state);
      assert.ok(VERBS.includes(label.split(' ')[0]), `${label}: not a listed verb`);
      const words = label.split(' ').slice(1).filter((w) => w !== state.title);
      assert.ok(words.every((w) => w === w.toLowerCase()), `${label}: not sentence case`);
    }
  }
});

test('keys are unique within a menu and are a letter of their label', () => {
  for (const [menu, list] of Object.entries(MENUS)) {
    const keys = list.map((i) => i.key);
    assert.equal(new Set(keys).size, keys.length, `${menu}: a key is used twice`);
    for (const item of list) {
      assert.match(item.key, /^[a-z]$/);
      for (const state of STATES) assert.ok(keyIndex(labelOf(item, state), item.key) >= 0, `${item.action}: ${item.key}`);
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
    for (const state of STATES) assert.equal(labelOf(item, state).endsWith('…'), Boolean(item.mode), item.action);
  }
});

test('an item that can be greyed says why', () => {
  for (const { item } of items) {
    if (!item.applies) continue;
    assert.equal(typeof item.why, 'function', item.action);
    for (const state of STATES) assert.ok(item.why(state).length > 0);
  }
});

test('the key is shown at the start of a word when it starts one', () => {
  assert.equal(keyIndex('Edit arrow type', 't'), 11);
  assert.equal(keyIndex('Add connected node', 'n'), 14);
  assert.equal(keyIndex('Reverse edge', 'v'), 2);
  assert.equal(keyIndex('Edit label', 'z'), -1);
});

test('the empty-space menu names the subgraph it adds into', () => {
  const add = MENUS.space.find((i) => i.action === 'add-node');
  assert.equal(labelOf(add, { title: '' }), 'Add node');
  assert.equal(labelOf(add, { title: 'Payment' }), 'Add node in Payment');
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
