// The page: wires the file (source.mjs), the view (viewer.mjs) and editing (editor.mjs) together, and runs the header
// and footer. The three never reach into each other; everything they share passes through here.

import { createEditor } from './editor.mjs';
import { createSource } from './source.mjs';
import { createViewer, parse } from './viewer.mjs';

const el = (id) => document.getElementById(id);

// With no ?f=, show the scratch diagram (the server creates it if missing).
const file = new URLSearchParams(location.search).get('f') || '/tmp/mermaid-diagrams/scratch.mmd';

// The build of merma this page was served from. When the server reports another, the page reloads to run it, once
// nothing is in progress that a reload would lose. Zoom and pan survive the reload: they are kept for this tab in
// sessionStorage, which is the browser's, never the file's.
const loadedBuild = document.querySelector('meta[name="merma-build"]').content;
const viewKey = 'merma:view:' + file;
function reloadWhenIdle() {
  if (editor && !editor.idle()) { setTimeout(reloadWhenIdle, 500); return; }
  location.reload();
}
let reloading = false;
function noteBuild(id) {
  if (id === loadedBuild || reloading) return;
  reloading = true;
  reloadWhenIdle();
}
function keepView() {
  const v = viewer.getView();
  try {
    if (v.touched) sessionStorage.setItem(viewKey, JSON.stringify({ x: v.x, y: v.y, k: v.k }));
    else sessionStorage.removeItem(viewKey);
  } catch { /* storage unavailable: the view just is not kept */ }
}
function restoreView() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(viewKey));
    if (saved) viewer.setView(saved);
  } catch { /* nothing kept, or unreadable */ }
}

// A short status message that fades out. Short messages ("Copied!") start fading after 1 s; longer ones stay up
// ~70 ms a character, capped at 8 s. Then a 0.6 s fade.
let toastTimer;
function toast(message) {
  el('toast').textContent = message;
  el('toast').classList.add('show');
  clearTimeout(toastTimer);
  const ms = Math.min(8000, Math.max(1000, 70 * message.length));
  toastTimer = setTimeout(() => el('toast').classList.remove('show'), ms);
}

function showError(message) {
  el('error').textContent = message;
  el('error').style.display = message ? 'block' : 'none';
}

const ui = {
  toast,
  notice(message, bad = false) {
    el('notice').textContent = message;
    el('notice').classList.add('show');
    el('notice').classList.toggle('bad', bad);
  },
  hideNotice: () => el('notice').classList.remove('show'),
};

/** @type {ReturnType<typeof createEditor> | null} set once the source and viewer it needs exist */
let editor = null;
let shownOnce = false;   // a diagram has been rendered; until then the view is the initial fit, not worth keeping

const viewer = createViewer({ diagram: el('diagram'), stage: el('stage') }, {
  onClick: (target) => editor?.clicked(target),
  onDoubleClick: (target) => editor?.doubleClicked(target) ?? false,
  onContextMenu: (target, x, y) => editor?.contextMenu(target, x, y) ?? false,
  onViewChange: () => { editor?.viewChanged(); if (shownOnce) keepView(); },
});

// Show a version of the file: a new one polled from the server, or one the editor just saved.
async function display(text) {
  const shown = await viewer.show(text);
  if (!shown.ok) {
    showError('Syntax error; showing the last good render.\n' + shown.error);
    editor?.failed();
    return;
  }
  for (const b of ['copy-svg', 'download-svg', 'reset-view']) el(b).disabled = false;
  showError('');
  if (!shownOnce) { shownOnce = true; restoreView(); }
  el('status').textContent = 'updated ' + new Date().toLocaleTimeString();
  editor?.rendered(text);
}

const source = createSource(file, { onText: display, onError: showError, onBuild: noteBuild });

editor = createEditor({
  source, viewer, parse, display, ui,
  els: {
    stage: el('stage'), diagram: el('diagram'), menu: el('menu'), menuAdd: el('menu-add'),
    menuConnect: el('menu-connect'), menuRename: el('menu-rename'), spaceMenu: el('space-menu'), spaceAdd: el('space-add'), rename: el('rename'),
  },
});

// The header: the file's path, and its host path when the server knows it. Click either to copy it; localhost is a
// secure context, so the clipboard API is available.
el('path').textContent = file;
el('path').dataset.copy = file;
document.title = file.split('/').pop() + ' · merma';
source.hostPath().then((host) => {
  if (!host) return;
  el('host').textContent = 'host: ' + host;
  el('host').dataset.copy = host;
});
for (const id of ['path', 'host']) {
  el(id).title = 'Click to copy path to clipboard';
  el(id).addEventListener('click', async () => {
    const text = el(id).dataset.copy;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast('Copied!');
  });
}

// The footer. The SVG is exported as this browser drew it, with its fonts, so it can differ slightly from a
// mermaid-cli PNG.
el('reset-view').addEventListener('click', viewer.fit);
el('copy-svg').addEventListener('click', async () => {
  const markup = viewer.svgMarkup();
  if (!markup) return;
  await navigator.clipboard.writeText(markup);
  toast('SVG copied!');
});
el('download-svg').addEventListener('click', () => {
  const markup = viewer.svgMarkup();
  if (!markup) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  link.download = file.split('/').pop().replace(/\.mmd$/, '') + '.svg';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast('SVG downloaded');
});

// For tests: hold polling to set up a stale save, or save text directly to exercise the parse check.
window.merma = { start: source.start, stop: source.stop, save: editor.save, state: () => ({ ...editor.state(), version: source.version }) };

source.start();
