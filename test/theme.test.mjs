import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { darkThemes, fileTheme, shownTheme, themeChoice, THEME_KEY } from '../web/theme.mjs';

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

test('a file sets its own theme in its frontmatter config or an init directive, and nowhere else', () => {
  assert.equal(fileTheme('---\nconfig:\n  theme: forest\n---\nflowchart TD\n  A --> B\n'), true);
  assert.equal(fileTheme('%%{init: {"theme": "neutral"}}%%\nflowchart TD\n  A --> B\n'), true);
  assert.equal(fileTheme('---\ntitle: Theme\n---\nflowchart TD\n  A[theme: x] --> B\n'), false);
  assert.equal(fileTheme('flowchart TD\n  A --> B\n  %% theme: dark\n'), false);
});

test('dark draws each diagram type in the dark counterpart of its own default theme, else in dark', () => {
  // As Mermaid 12.2.0's defaults hold them: a flowchart has a theme of its own, a pie none, the top level its own.
  const defaults = { theme: 'default', flowchart: { theme: 'redux-color', look: 'neo' }, sequence: { theme: 'redux-color' },
    pie: { useMaxWidth: true }, maxEdges: 500, gantt: { theme: 'forest' } };
  assert.deepEqual(darkThemes(defaults), {
    theme: 'dark', flowchart: { theme: 'redux-dark-color' }, sequence: { theme: 'redux-dark-color' },
  });
});
