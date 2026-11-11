import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shownTheme, themeChoice, THEME_KEY } from '../web/theme.mjs';

test('the theme shown is the one chosen, else the system\'s; anything else kept counts as none', () => {
  assert.equal(shownTheme(null, true), 'dark');
  assert.equal(shownTheme(null, false), 'light');
  assert.equal(shownTheme('light', true), 'light');
  assert.equal(shownTheme('dark', false), 'dark');
  assert.equal(shownTheme('blue', true), 'dark');
});

test('a kept value stands for its choice, and none or anything else for System', () => {
  assert.deepEqual([null, 'light', 'dark', 'blue'].map(themeChoice), ['system', 'light', 'dark', 'system']);
});

test('the page reads the theme from the same key before it paints, as theme.mjs keeps it', () => {
  const html = readFileSync(join(import.meta.dirname, '..', 'web', 'index.html'), 'utf8');
  assert.ok(html.includes(`localStorage.getItem('${THEME_KEY}')`));
});
