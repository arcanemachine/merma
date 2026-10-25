// The page: wires the file (source.mjs), the view (viewer.mjs) and editing (editor.mjs) together, and runs the header
// and footer. The three never reach into each other; everything they share passes through here.

import { createEditor } from './editor.mjs';
import { createMenu } from './menu.mjs';
import { EXPORT_MENU } from './menu-items.mjs';
import { createSource } from './source.mjs';
import { createViewer, parse } from './viewer.mjs';

// Every id the page asks for is in index.html.
const el = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

// With no ?f=, show the scratch diagram (the server creates it if missing).
const file = new URLSearchParams(location.search).get('f') || '/tmp/mermaid-diagrams/scratch.mmd';

// The build of merma this page was served from. When the server reports another, the page reloads to run it, once
// nothing is in progress that a reload would lose. Zoom and pan survive the reload: they are kept for this tab in
// sessionStorage, which is the browser's, never the file's.
const loadedBuild = /** @type {HTMLMetaElement} */ (document.querySelector('meta[name="merma-build"]')).content;
const viewKey = 'merma:view:' + file;
function reloadWhenIdle() {
  if (editor && !editor.idle()) { setTimeout(reloadWhenIdle, 500); return; }
  location.reload();
}
let reloading = false;
function noteBuild(/** @type {string} */ id) {
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
    const saved = JSON.parse(sessionStorage.getItem(viewKey) ?? 'null');
    if (saved) viewer.setView(saved);
  } catch { /* nothing kept, or unreadable */ }
}

// A short status message that fades out. Short messages ("Copied!") start fading after 1 s; longer ones stay up
// ~70 ms a character, capped at 8 s. Then a 0.6 s fade.
/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;
function toast(/** @type {string} */ message) {
  el('toast').textContent = message;
  el('toast').classList.add('show');
  clearTimeout(toastTimer);
  const ms = Math.min(8000, Math.max(1000, 70 * message.length));
  toastTimer = setTimeout(() => el('toast').classList.remove('show'), ms);
}

/**
 * Put `text` on the clipboard. The clipboard API exists only in a secure context: localhost is one, but a page opened
 * by the machine's address from another device (a phone) is not, and there the old copy command still works.
 */
async function copyText(/** @type {string} */ text) {
  if (navigator.clipboard) { await navigator.clipboard.writeText(text); return; }
  const box = Object.assign(document.createElement('textarea'), { value: text });
  box.setAttribute('readonly', '');
  Object.assign(box.style, { position: 'fixed', top: '0', opacity: '0' });
  const focused = /** @type {HTMLElement | null} */ (document.activeElement);
  document.body.append(box);
  box.select();
  const ok = document.execCommand('copy');
  box.remove();
  focused?.focus();
  if (!ok) throw new Error('The browser refused to copy');
}

function showError(/** @type {string} */ message) {
  el('error').textContent = message;
  el('error').style.display = message ? 'block' : 'none';
}

// The notice is drawn in #notice and read out from a hidden live region: an error at once (role="alert"), anything
// else when the screen reader is free (role="status"). Setting the role on #notice itself just before its text is not
// announced reliably.
const NOTICE_KINDS = ['info', 'warning', 'error'];
let speakFrame = 0;   // no frame: requestAnimationFrame's ids start at 1
/** Read `message` out from the live region `id`, and empty the other one. */
function speak(/** @type {string} */ id, /** @type {string} */ message) {
  cancelAnimationFrame(speakFrame);
  for (const region of ['notice-status', 'notice-alert']) el(region).textContent = '';
  // Set on the next frame, after the clearing, so the same message twice in a row is announced again.
  speakFrame = requestAnimationFrame(() => { el(id).textContent = message; });
}
const ui = {
  notice(/** @type {string} */ message, /** @type {'info' | 'warning' | 'error'} */ kind) {
    if (!NOTICE_KINDS.includes(kind)) throw new Error(`Unknown notice kind ${kind}`);
    el('notice').textContent = message;
    el('notice').classList.remove(...NOTICE_KINDS);
    el('notice').classList.add('show', kind);
    speak(kind === 'error' ? 'notice-alert' : 'notice-status', message);
  },
  /** What an edit did, for screen readers only: on screen, the redrawn diagram shows it. */
  announce: (/** @type {string} */ message) => speak('notice-status', message),
  hideNotice() {
    cancelAnimationFrame(speakFrame);
    el('notice').classList.remove('show');
    for (const id of ['notice-status', 'notice-alert']) el(id).textContent = '';
  },
  history(/** @type {{ undo: boolean, redo: boolean }} */ can) {
    for (const [id, on] of /** @type {const} */ ([['undo', can.undo], ['redo', can.redo]])) {
      const b = /** @type {HTMLButtonElement} */ (el(id));
      // A focused button that turns itself off would drop focus to the body: it goes to the diagram, as after a save.
      if (!on && b === document.activeElement) el('diagram').focus();
      b.disabled = !on;
    }
  },
};

/** @type {ReturnType<typeof createEditor> | null} set once the source and viewer it needs exist */
let editor = null;
let shownOnce = false;   // a diagram has been rendered; until then the view is the initial fit, not worth keeping

const viewer = createViewer({ diagram: el('diagram'), stage: el('stage') }, {
  onClick: (target) => { clickedAway(target); editor?.clicked(target); },
  onDoubleClick: (target) => editor?.doubleClicked(target) ?? false,
  onContextMenu: (target, x, y, byKey) => editor?.contextMenu(target, x, y, byKey) ?? false,
  onViewChange: () => { editor?.viewChanged(); if (shownOnce) keepView(); },
});

// Show a version of the file: a new one polled from the server, or one the editor just saved.
async function display(/** @type {string} */ text) {
  const shown = await viewer.show(text);
  if (!shown.ok) {
    showError('Syntax error; showing the last good render.\n' + shown.error);
    editor?.failed();
    return;
  }
  /** @type {HTMLButtonElement} */ (el('export')).disabled = false;
  showError('');
  if (!shownOnce) { shownOnce = true; restoreView(); }
  el('status').textContent = 'updated ' + new Date().toLocaleTimeString();
  editor?.rendered(text);
}

const source = createSource(file, { onText: display, onError: showError, onBuild: noteBuild });

editor = createEditor({
  source, viewer, parse, display, ui,
  els: { stage: el('stage'), diagram: el('diagram'), labelBox: el('label-box'), find: el('find'), findBox: el('find-box'),
    findCount: el('find-count') },
});

// The header: the file's path, and its host path when the server knows it, each on one line cut at the start, so the
// file name stays in view; the title has all of it. Click either to copy it.
function showPath(/** @type {string} */ id, /** @type {string} */ text, /** @type {string} */ path) {
  el(id).replaceChildren(Object.assign(document.createElement('bdi'), { textContent: text }));
  el(id).dataset.copy = path;
  el(id).title = `${path}\nClick to copy`;
}
showPath('path', file, file);
document.title = file.split('/').pop() + ' · merma';
source.hostPath().then((host) => { if (host) showPath('host', 'host: ' + host, host); });
for (const id of ['path', 'host']) {
  el(id).addEventListener('click', async () => {
    const text = el(id).dataset.copy;
    if (!text) return;
    try { await copyText(text); } catch { ui.notice('Not copied: the browser refused.', 'error'); return; }
    toast('Copied!');
  });
}

// Help shows the keys of one system, Windows and Linux or macOS: the browser's own at first, then the one last chosen
// in this browser (localStorage: the browser's, never the file's).
const osKey = 'merma:help-os';
const osPicks = /** @type {NodeListOf<HTMLButtonElement>} */ (el('help').querySelectorAll('[data-os-pick]'));
function showOs(/** @type {string} */ os) {
  el('help').dataset.os = os;
  el('undo').title = os === 'mac' ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)';
  el('redo').title = os === 'mac' ? 'Redo (⌘⇧Z)' : 'Redo (Ctrl+Shift+Z or Ctrl+Y)';
  for (const b of osPicks) b.setAttribute('aria-pressed', String(b.dataset.osPick === os));
}
/** @type {string | null} */
let savedOs = null;
try { savedOs = localStorage.getItem(osKey); } catch { /* storage unavailable: use the browser's system */ }
const platform = navigator.userAgentData?.platform || navigator.platform || '';
showOs(savedOs === 'pc' || savedOs === 'mac' ? savedOs : (/mac|iphone|ipad/i.test(platform) ? 'mac' : 'pc'));
for (const b of osPicks) {
  b.addEventListener('click', () => {
    const os = /** @type {string} */ (b.dataset.osPick);
    showOs(os);
    try { localStorage.setItem(osKey, os); } catch { /* not remembered */ }
  });
}

// The footer: Undo and Redo, and the Export menu. The SVG is exported as this browser drew it, with its fonts, so it can
// differ slightly from a mermaid-cli PNG.
el('undo').addEventListener('click', () => editor?.undo());
el('redo').addEventListener('click', () => editor?.redo());
const exportButton = el('export');
const exports = {
  'copy-svg': async () => {
    const markup = viewer.svgMarkup();
    if (!markup) return;
    try { await copyText(markup); } catch { ui.notice('Not copied: the browser refused. Use Download SVG instead.', 'error'); return; }
    toast('SVG copied!');
  },
  'download-svg': () => {
    const markup = viewer.svgMarkup();
    if (!markup) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    link.download = /** @type {string} */ (file.split('/').pop()).replace(/\.mmd$/, '') + '.svg';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast('SVG downloaded');
  },
};
const exportMenu = createMenu(EXPORT_MENU, {
  parent: /** @type {HTMLElement} */ (document.querySelector('footer')),
  bounds: () => new DOMRect(0, 0, innerWidth, innerHeight),
  returnFocus: exportButton,
  side: 'above',
  onRun: (action) => exports[/** @type {keyof typeof exports} */ (action)](),
  onRefuse: () => {},
  onClose: () => exportButton.setAttribute('aria-expanded', 'false'),
});
exportButton.addEventListener('click', () => {
  if (exportMenu.isOpen()) { exportMenu.close(); return; }
  exportMenu.open(exportButton.getBoundingClientRect(), { edgesOk: true, selfLoop: false, nameWhy: null }, { gap: 4 });
  exportButton.setAttribute('aria-expanded', 'true');
});
// A click anywhere else closes it and Help, the diagram included, as for the diagram's own menus; a drag does not
// (the user). In the diagram only the viewer's click counts: the browser's own fires after a drag as well.
function clickedAway(/** @type {Node} */ at) {
  if (exportMenu.isOpen() && !exportMenu.contains(at) && !exportButton.contains(at)) exportMenu.close();
  if (help.matches(':popover-open') && !help.contains(at) && !helpButton.contains(at)) help.hidePopover();
}
document.addEventListener('click', (e) => {
  const at = /** @type {Node} */ (e.target);
  if (!el('diagram').contains(at)) clickedAway(at);
});

// Help is a manual popover, so a drag (a pan of the diagram behind it) leaves it open: it closes on its button, on
// Escape and on a click away, focus going back to its button as a dialog's does.
const help = el('help');
const helpButton = /** @type {HTMLElement} */ (document.querySelector('[popovertarget="help"]'));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !help.matches(':popover-open')) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  help.hidePopover();
  helpButton.focus();
}, true);


// For tests: hold polling to set up a stale save, or save text directly to exercise the parse check.
window.merma = { start: source.start, stop: source.stop, save: editor.save, state: () => ({ ...editor.state(), version: source.version }) };

source.start();
