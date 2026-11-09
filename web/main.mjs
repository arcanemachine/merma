// The page: wires the file (source.mjs), the view (viewer.mjs) and editing (editor.mjs) together, and runs the header
// and footer. The three never reach into each other; everything they share passes through here.

import { createEditor } from './editor.mjs';
import { createMenu } from './menu.mjs';
import { EXPORT_MENU, NO_SUBGRAPH_MATCH } from './menu-items.mjs';
import { createSource } from './source.mjs';
import { createCodePanel } from './code-panel.mjs';
import { drawnAs, prune, setView, viewText } from './collapse.mjs';
import { baseDir, subgraphDir, turnText } from './turn.mjs';
import { itemLines, subgraphs as scannedSubgraphs } from './patch/flowchart.mjs';
import { createViewer, parse } from './viewer.mjs';
import { limitSentence, readLimits } from './limits.mjs';
import { hide as hideTop, mode as modeNotice, NONE, show as showNotice } from './notices.mjs';

// Every id the page asks for is in index.html.
const el = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

// The file shown: the address's ?f=, or with none the scratch diagram (the server creates it if missing). Another
// file can be opened in place (openFile, below), so everything kept per file is read again then.
const fileIn = (/** @type {string} */ search) => new URLSearchParams(search).get('f') || '/tmp/mermaid-diagrams/scratch.mmd';
let file = fileIn(location.search);

// The build of merma this page was served from. When the server reports another, the page reloads to run it, once
// nothing is in progress that a reload would lose. Zoom and pan survive the reload: they are kept for this tab in
// sessionStorage, which is the browser's, never the file's.
const loadedBuild = /** @type {HTMLMetaElement} */ (document.querySelector('meta[name="merma-build"]')).content;
const viewKey = () => 'merma:view:' + file;
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
    if (v.touched) sessionStorage.setItem(viewKey(), JSON.stringify({ x: v.x, y: v.y, k: v.k }));
    else sessionStorage.removeItem(viewKey());
  } catch { /* storage unavailable: the view just is not kept */ }
}
function restoreView() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(viewKey()) ?? 'null');
    if (saved) viewer.setView(saved);
  } catch { /* nothing kept, or unreadable */ }
}

// Collapsed subgraphs (collapse.mjs): the page's own views, never the file's, kept for this tab per file in
// sessionStorage, so the page's reload for a new build keeps them.
const collapseKey = () => 'merma:collapse:' + file;
/** @type {import('./collapse.mjs').Overrides} */
let overrides = new Map();
/** @type {{ kind: string, id: string } | null} the item the code panel follows */
let followed = null;
/** @type {import('./collapse.mjs').SubgraphInfo[]} the subgraphs of the text last drawn, when merma reads them too */
let shownSubs = [];
/** @type {import('./collapse.mjs').SubgraphInfo[]} the same, for the text being drawn, from before Mermaid draws it */
let drawingSubs = [];

// A part view (docs/guide.md, Fit to subgraph): `&part=<subgraph id>` in the address, its only state, makes every fit
// fit that subgraph, or the collapsed box that hides it. Entering and leaving one is a history entry, so Back leaves it.
/** @type {string | null} */
let part = new URLSearchParams(location.search).get('part');
let partGone = false;   // the part is not in the file: said once, until it is back
/** Where the part is drawn now, or null: no part, or not drawn. */
function partRect() {
  if (!part || viewer.renderId === null) return null;
  return document.getElementById(`${viewer.renderId}-${drawnAs(part, drawingSubs, overrides)}`)?.getBoundingClientRect() ?? null;
}
/** After a render: say once that the part is gone, and fit to it again once it is back. */
function checkPart() {
  const gone = Boolean(part) && !partRect();
  if (gone && !partGone) { ui.notice(`The subgraph ${part} is not in this file, so the whole diagram is shown.`, 'warning'); viewer.fit(); }
  if (!gone && partGone) { ui.hideNotice(); viewer.fit(); }
  partGone = gone;
}
/** Show subgraph `id` as the part, or the whole diagram (null): a new history entry, then a fit. */
function setPart(/** @type {string | null} */ id) {
  const url = new URL(location.href);
  if (id === null) url.searchParams.delete('part'); else url.searchParams.set('part', id);
  if (url.href !== location.href) history.pushState(null, '', url);
  part = id;
  partGone = false;
  viewer.fit();
  checkPart();
}
window.addEventListener('popstate', followAddress);
function keepOverrides() {
  try {
    if (overrides.size) sessionStorage.setItem(collapseKey(), JSON.stringify([...overrides]));
    else sessionStorage.removeItem(collapseKey());
  } catch { /* storage unavailable: the views just are not kept */ }
}

// Rotate and flip (turn.mjs): the page's own, as collapses are, kept for this tab per file: the whole diagram's turn
// and each subgraph's own. `base` is the direction the file had when turned: a file whose own direction changes since
// (an agent turned it) is not turned again. A subgraph with no id keeps its title, as a collapse does (collapse.mjs).
const turnKey = () => 'merma:turn:' + file;
/** @typedef {{ rotate: boolean, flip: boolean, base: string | null }} Turned */
/** @typedef {Turned & { title: string | null }} SubTurned */
/** @type {Turned & { subs: [string, SubTurned][] }} */
let turn = { rotate: false, flip: false, base: null, subs: [] };
/** Read this tab's collapses and turns for the file shown. */
function readKept() {
  overrides = new Map();
  turn = { rotate: false, flip: false, base: null, subs: [] };
  try { overrides = new Map(JSON.parse(sessionStorage.getItem(collapseKey()) ?? '[]')); } catch { /* nothing kept */ }
  try { turn = { ...turn, ...JSON.parse(sessionStorage.getItem(turnKey()) ?? '{}') }; } catch { /* nothing kept */ }
}
readKept();
const isOn = (/** @type {{ rotate: boolean, flip: boolean }} */ t) => t.rotate || t.flip;
function keepTurn() {
  turn.subs = turn.subs.filter(([, t]) => isOn(t));
  try {
    if (isOn(turn) || turn.subs.length) sessionStorage.setItem(turnKey(), JSON.stringify(turn));
    else sessionStorage.removeItem(turnKey());
  } catch { /* storage unavailable: the turn just is not kept */ }
}
/**
 * The turns that still hold for `text`: each dropped when the direction it was made from has changed. Subgraphs' only
 * when merma and Mermaid agree on them (`subs`, else null), as collapses are.
 */
function pruneTurn(/** @type {string} */ text, /** @type {import('./collapse.mjs').SubgraphInfo[] | null} */ subs) {
  if (isOn(turn) && turn.base !== baseDir(text)) turn = { ...turn, rotate: false, flip: false, base: null };
  if (subs) turn.subs = turn.subs.filter(([id, t]) => {
    const s = subs.find((x) => x.id === id);
    return s && (t.title === null || t.title === s.title) && t.base === subgraphDir(text, id);
  });
  keepTurn();
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
let notices = NONE;
/** Draw the notice's rows from `notices`, and speak what the step says. */
function drawNotices(/** @type {import('./notices.mjs').Speak} */ said) {
  for (const [id, row] of /** @type {const} */ ([['notice-base', notices.base], ['notice-top', notices.top]])) {
    el(id).textContent = row?.text ?? '';
    el(id).className = row ? `show ${row.kind}` : '';
  }
  if (said) speak(said.region === 'alert' ? 'notice-alert' : 'notice-status', said.text);
}
const ui = {
  notice(/** @type {string} */ message, /** @type {'info' | 'warning' | 'error'} */ kind) {
    if (!NOTICE_KINDS.includes(kind)) throw new Error(`Unknown notice kind ${kind}`);
    const step = showNotice(notices, message, kind);
    notices = step.state;
    drawNotices(step.speak);
  },
  /** A mode's notice, held until the mode ends (null), what is refused in it shown under it. */
  mode(/** @type {string | null} */ message) {
    cancelAnimationFrame(speakFrame);
    for (const id of ['notice-status', 'notice-alert']) el(id).textContent = '';
    const step = modeNotice(message);
    notices = step.state;
    drawNotices(step.speak);
  },
  /** What an edit did, for screen readers only: on screen, the redrawn diagram shows it. */
  announce: (/** @type {string} */ message) => speak('notice-status', message),
  /** Hide the notice, or in a mode what shows over its notice; whether one was showing. */
  hideNotice() {
    cancelAnimationFrame(speakFrame);
    const step = hideTop(notices);
    notices = step.state;
    drawNotices(null);
    for (const id of ['notice-status', 'notice-alert']) el(id).textContent = '';
    return step.shown;
  },
  /** Show subgraph `id` collapsed or expanded, in this page only, and draw the file again. */
  async setView(/** @type {string} */ id, /** @type {'collapsed' | 'expanded'} */ view) {
    overrides = setView(overrides, shownSubs, id, view);
    keepOverrides();
    const { text } = source.snapshot();
    if (text !== null) await display(text);
  },
  /**
   * Rotate or flip the diagram, or subgraph `id` on its own, in this page only, and draw the file again. Whether it is
   * turned so now.
   */
  async turn(/** @type {'rotate' | 'flip'} */ which, /** @type {string | null} */ id = null) {
    const { text } = source.snapshot();
    if (text === null) return false;
    if (id === null) {
      turn = { ...turn, [which]: !turn[which], base: baseDir(text) };
    } else {
      const was = turn.subs.find(([k]) => k === id)?.[1] ?? { rotate: false, flip: false };
      const title = /^subGraph\d+$/.test(id) ? shownSubs.find((s) => s.id === id)?.title ?? null : null;
      const now = { ...was, [which]: !was[which], base: subgraphDir(text, id), title };
      turn.subs = [...turn.subs.filter(([k]) => k !== id), [id, now]];
    }
    keepTurn();
    await display(text);
    return id === null ? turn[which] : Boolean(turn.subs.find(([k]) => k === id)?.[1][which]);
  },
  /** How the page turns the diagram, or subgraph `id` on its own, for the menus. */
  turned(/** @type {string | null} */ id = null) {
    const t = id === null ? turn : turn.subs.find(([k]) => k === id)?.[1];
    return { rotate: Boolean(t?.rotate), flip: Boolean(t?.flip) };
  },
  /** The selection changed (or was drawn again): the code panel follows it, when its box is checked. */
  selected(/** @type {{ kind: 'node' | 'edge' | 'subgraph' | 'title', id: string } | null} */ item) {
    if (item?.kind === followed?.kind && item?.id === followed?.id) return;
    followed = item;
    codePanel.follow(item && ((text) => itemLines(text, item)));
  },
  /**
   * A node was copied: its Mermaid text goes on the system clipboard too, where the browser lets it (the page's own
   * copy does not depend on it), and the toast says so.
   */
  copied(/** @type {string} */ text) {
    copyText(text).catch(() => {});
    toast('Copied!');
  },
  /** Fit to subgraph `id`, or to the whole diagram (null), as the address's part. */
  showPart: (/** @type {string | null} */ id) => setPart(id),
  /**
   * Follow a node's link (links.mjs): a diagram in this page, or with `tab` in a new tab of this server, which says
   * itself if it cannot serve the file; a web address in a new tab. Synchronous, from the key or click, or the
   * browser blocks the new tab. An app's address goes to the system, which hands it to the app, with no tab left
   * behind.
   */
  openLink(/** @type {{ path: string, part: string | null } | { url: string, app: boolean }} */ to, /** @type {boolean} */ tab) {
    if ('url' in to) {
      if (to.app) location.href = to.url; else window.open(to.url, '_blank', 'noopener');
    } else if (tab) {
      const url = new URL(location.pathname, location.href);
      url.searchParams.set('f', to.path);
      if (to.part !== null) url.searchParams.set('part', to.part);
      window.open(url, '_blank', 'noopener');
    } else {
      openFile(to.path, to.part);
    }
  },
  /** Escape on the diagram with nothing of its own to let go: close the code panel. Whether it did. */
  escape: () => codePanel.escape(),
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

// Mermaid's size limits, as merma was started with them (MERMA_MAX_EDGES, MERMA_MAX_TEXT); empty: Mermaid's own.
const meta = (/** @type {string} */ name) => /** @type {HTMLMetaElement} */ (document.querySelector(`meta[name="${name}"]`)).content;
const limits = readLimits(meta('merma-max-edges'), meta('merma-max-text'));
const viewer = createViewer({ diagram: el('diagram'), stage: el('stage'), limits }, {
  onClick: (target, x, y) => { clickedAway(target); editor?.clicked(target, x, y); },
  // On empty space it fits the whole diagram, leaving a part, as F does.
  onDoubleClick: (target) => editor?.doubleClicked(target) || (setPart(null), true),
  onContextMenu: (target, x, y, byKey) => editor?.contextMenu(target, x, y, byKey) ?? false,
  onViewChange: ({ byUser }) => { editor?.viewChanged(byUser); if (shownOnce) keepView(); },
  fitTo: partRect,
});

// The code panel, laid out before the first render: docked afterwards, it would shrink the diagram under its first fit,
// which then refits.
const codePanel = createCodePanel({
  main: el('main'), panel: el('code-panel'), code: /** @type {HTMLTextAreaElement} */ (el('code')),
  dock: /** @type {HTMLSelectElement} */ (el('code-dock')), handle: el('code-handle'), close: el('code-close'),
  toggle: el('code-toggle'), diagram: el('diagram'), edit: el('code-edit'), save: el('code-save'),
  cancel: el('code-cancel'), status: el('code-status'), follow: /** @type {HTMLInputElement} */ (el('code-follow')),
  band: el('code-band'),
}, file, {
  snapshot: () => source.snapshot(),
  lock: () => editor?.lockForCode() ?? false,
  unlock: () => editor?.unlock(),
  save: async (text, base) => (await editor?.saveCode(text, base)) ?? false,
});

// Show a version of the file: a new one polled from the server, or one the editor just saved. The code panel shows
// it whether or not it parses, so a broken file can be read there. One at a time, in the order asked, so an older
// version never lands over a newer one.
let drawing = Promise.resolve();
function display(/** @type {string} */ text) {
  // A version still waiting its turn when another file is opened is not drawn over it.
  const of = file;
  const done = drawing.then(() => (of === file ? draw(text) : undefined));
  drawing = done.catch(() => {});
  return done;
}
async function draw(/** @type {string} */ text) {
  // Another file opened while this was drawing: this file's drawing must not land on its stage, or fit it.
  const of = file;
  codePanel.show(text);
  // The page's collapses are drawn only when Mermaid's subgraphs are the ones merma reads in the text: an id they
  // disagree on would collapse, or tag, the wrong one.
  let { subs, links } = await viewer.read(text);
  if (of !== file) return;   // before anything below writes this file's collapses or turns under the new file's keys
  const scanned = new Set(scannedSubgraphs(text).map((s) => s.id));
  const agree = subs.length === scanned.size && subs.every((s) => scanned.has(s.id));
  let warning = '';
  if (!agree) {
    if (overrides.size || subs.some((s) => s.view === 'collapsed')) {
      warning = NO_SUBGRAPH_MATCH;
    }
    subs = [];
  } else {
    overrides = prune(overrides, subs);
    keepOverrides();
  }
  pruneTurn(text, agree ? subs : null);
  const turned = turnText(text, turn, agree ? new Map(turn.subs) : new Map());
  const drawn = agree ? viewText(turned, overrides, subs) : turned;
  drawingSubs = subs;
  let shown = await viewer.show(drawn);
  // Drawn as the other file opened: clear it again, so that file's first drawing, queued after this one, is fitted.
  if (of !== file) { viewer.clear(); return; }
  if (!shown.ok && drawn !== text) {
    shown = await viewer.show(text);
    if (of !== file) { viewer.clear(); return; }
    if (shown.ok) {
      overrides = new Map();
      keepOverrides();
      turn = { rotate: false, flip: false, base: null, subs: [] };
      keepTurn();
      warning = "Couldn't collapse or turn the diagram: showing the file as written.";
    }
  }
  if (!shown.ok) {
    showError(shown.limit ? limitSentence(shown.limit, limits, false)
      : 'The file has a syntax error, so the last good render is shown.\n' + shown.error);
    editor?.failed();
    return;
  }
  /** @type {HTMLButtonElement} */ (el('export')).disabled = false;
  showError('');
  if (!shownOnce) { shownOnce = true; restoreView(); }
  el('status').textContent = 'updated ' + new Date().toLocaleTimeString();
  shownSubs = subs;
  editor?.rendered(text, { subs, overrides: agree ? overrides : new Map() }, links);
  if (warning) ui.notice(warning, 'warning');
  checkPart();
}

/**
 * A source for file `f`. While it is the file being opened (`opening`), its first text opens it and its first error
 * refuses it; once it is the page's source, it draws and reports as any source does. A source left behind does
 * nothing: stopped, it calls no hook (source.mjs).
 */
function sourceFor(/** @type {string} */ f) {
  const s = createSource(f, {
    onText: (text) => (s === source ? display(text) : opened(s, text)),
    onError: (message) => {
      if (s === source) showError(message);
      else if (s === opening?.source) { s.stop(); opening = null; ui.notice(message, 'error'); }
    },
    onBuild: noteBuild,
  });
  return s;
}
let source = sourceFor(file);
/** @type {{ source: ReturnType<typeof createSource>, file: string, part: string | null } | null} a file asked for */
let opening = null;

/**
 * Open `next` in this page, fitted to subgraph `nextPart` if given: a new history entry, so Back comes back here. Only
 * once the server has given its text: a file it refuses (missing, outside MERMA_ROOTS) changes nothing but a notice.
 */
function openFile(/** @type {string} */ next, /** @type {string | null} */ nextPart = null) {
  const refused = editor?.switchRefused();
  if (refused) { ui.notice(refused, 'warning'); return; }
  if (next === file) { setPart(nextPart); return; }
  opening?.source.stop();
  const s = sourceFor(next);
  opening = { source: s, file: next, part: nextPart };
  s.start();
}
/** The file being opened has been read: show it, unless something was started here meanwhile. */
function opened(/** @type {ReturnType<typeof createSource>} */ s, /** @type {string} */ text) {
  if (s !== opening?.source) return undefined;
  const { file: next, part: nextPart } = opening;
  opening = null;
  const refused = editor?.switchRefused();
  if (refused) { s.stop(); ui.notice(refused, 'warning'); return undefined; }
  const url = new URL(location.href);
  url.searchParams.set('f', next);
  if (nextPart === null) url.searchParams.delete('part'); else url.searchParams.set('part', nextPart);
  history.pushState(null, '', url);
  showFile(s, next, nextPart);
  return display(text);
}
/**
 * Back or Forward: the address names the file to show, already. Another file is shown at once, as a load shows it (one
 * that cannot be read shows the error over an empty stage), once nothing is under way that the switch would lose; the
 * same file only changes its part.
 */
/** @type {ReturnType<typeof setTimeout> | undefined} */
let followTimer;
let followWaiting = false;
function followAddress() {
  clearTimeout(followTimer);
  const f = fileIn(location.search);
  const nextPart = new URLSearchParams(location.search).get('part');
  if (f === file) {
    followWaiting = false;
    part = nextPart;
    partGone = false;
    viewer.fit();
    checkPart();
    return;
  }
  if (editor && !editor.idle()) {
    // A save is over in a moment; a code draft can take minutes, so the page says why it has not followed yet.
    if (!followWaiting && editor.codeLocked()) ui.notice('The code is being edited. The diagram changes when it is saved or canceled.', 'info');
    followWaiting = true;
    followTimer = setTimeout(followAddress, 500);
    return;
  }
  followWaiting = false;
  opening?.source.stop();
  opening = null;
  const s = sourceFor(f);
  showFile(s, f, nextPart);
  s.start();
}
/** Show file `f`, read by `s`, in place of the one shown: everything kept per file is that file's from here on. */
function showFile(/** @type {ReturnType<typeof createSource>} */ s, /** @type {string} */ f, /** @type {string | null} */ nextPart) {
  source.stop();
  source = s;
  file = f;
  readKept();
  part = nextPart;
  partGone = false;
  shownSubs = [];
  drawingSubs = [];
  shownOnce = false;
  ui.hideNotice();
  showError('');
  clearTimeout(toastTimer);
  el('toast').classList.remove('show');
  /** @type {HTMLButtonElement} */ (el('export')).disabled = true;
  // Before the stage is cleared: the editor lets go of what is selected while it is still drawn.
  editor?.switchFile(s, f);
  viewer.clear();
  codePanel.setFile(f);
  showHeader();
}

editor = createEditor({
  source, file, viewer, parse, limits, display, ui,
  els: { stage: el('stage'), diagram: el('diagram'), labelBox: el('label-box'), find: el('find'), findBox: el('find-box'),
    findCount: el('find-count'), findPrev: el('find-prev'), findNext: el('find-next'), findCancel: el('find-cancel'),
    findToggle: el('find-toggle') },
});

// The header: the file's path, and its host path when the server knows it, each on one line cut at the start, so the
// file name stays in view; the title has all of it. Click either to copy it.
function showPath(/** @type {string} */ id, /** @type {string} */ text, /** @type {string} */ path) {
  el(id).replaceChildren(Object.assign(document.createElement('bdi'), { textContent: text }));
  el(id).dataset.copy = path;
  el(id).title = `${path}\nClick to copy`;
}
/** The header and the titles for the file shown. Its host path comes later, if the server knows one. */
function showHeader() {
  const f = file;
  const name = /** @type {string} */ (f.split('/').pop());
  el('code-file').textContent = name;
  showPath('path', f, f);
  el('host').replaceChildren();
  delete el('host').dataset.copy;
  el('host').removeAttribute('title');
  document.title = name + ' · merma';
  source.hostPath().then((host) => { if (host && f === file) showPath('host', 'host: ' + host, host); });
}
showHeader();
for (const id of ['path', 'host']) {
  el(id).addEventListener('click', async () => {
    const text = el(id).dataset.copy;
    if (!text) return;
    try { await copyText(text); } catch { ui.notice('The browser refused to copy the code.', 'error'); return; }
    toast('Copied!');
  });
}

// Help shows the keys of one system, Windows and Linux or macOS: the browser's own at first, then the one last chosen
// in this browser (localStorage: the browser's, never the file's).
const osKey = 'merma:help-os';
const osPicks = /** @type {NodeListOf<HTMLButtonElement>} */ (el('help').querySelectorAll('[data-os-pick]'));
function showOs(/** @type {string} */ os) {
  el('help').dataset.os = os;
  document.documentElement.dataset.os = os;   // the menus show Ctrl or ⌘ by it
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
    try { await copyText(markup); } catch { ui.notice('The browser refused to copy the SVG. Use Download SVG instead.', 'error'); return; }
    toast('SVG copied!');
  },
  'download-svg': () => {
    const markup = viewer.svgMarkup();
    if (markup) download(markup, 'image/svg+xml', '.svg', 'SVG downloaded');
  },
  'download-mermaid': () => {
    const text = source.snapshot().text;
    if (text !== null) download(text, 'text/plain', '.mmd', 'Mermaid downloaded');
  },
};
/** Save `content` as the file's name with `ext` in place of `.mmd`. */
function download(/** @type {string} */ content, /** @type {string} */ type, /** @type {string} */ ext, /** @type {string} */ done) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = /** @type {string} */ (file.split('/').pop()).replace(/\.mmd$/, '') + ext;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast(done);
}
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

// Help is a manual popover, so a drag (a pan of the diagram behind it) leaves it open: it closes on its button, on ?,
// on Escape and on a click away. It takes focus as it opens, so its arrows scroll it, and ? and Escape give focus back
// to what had it (the diagram, or the button), as a dialog does.
const help = el('help');
const helpButton = /** @type {HTMLElement} */ (document.querySelector('[popovertarget="help"]'));
let helpOpener = helpButton;
help.addEventListener('toggle', (e) => {
  if (/** @type {ToggleEvent} */ (e).newState !== 'open') return;
  const was = document.activeElement;
  // A button a click does not focus (Safari) leaves the body active.
  helpOpener = was instanceof HTMLElement && was !== document.body ? was : helpButton;
  help.scrollTop = 0;
  help.focus({ preventScroll: true });
});
function closeHelp() {
  help.hidePopover();
  helpOpener.focus({ preventScroll: true });
}
/** @type {HTMLElement} */ (help.querySelector('.help-close')).addEventListener('click', closeHelp);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !help.matches(':popover-open')) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  closeHelp();
}, true);
// ? opens and closes Help, read by what it types, as / is; not in a field, where it types, nor over a menu or picker.
document.addEventListener('keydown', (e) => {
  if (e.key !== '?' || e.ctrlKey || e.altKey || e.metaKey) return;
  if (/** @type {Element} */ (e.target).closest?.('input, textarea, select, [contenteditable]')) return;
  if (document.querySelector('[data-overlay]:popover-open')) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (help.matches(':popover-open')) closeHelp();
  else help.showPopover();
}, true);


// For tests: hold polling to set up a stale save, save text directly to exercise the parse check, or open another
// file in place, as a link will. Each acts on the file shown when it is called.
const edits = editor;
window.merma = {
  start: () => source.start(),
  stop: () => source.stop(),
  save: (/** @type {string} */ text) => edits.save(text),
  state: () => ({ ...edits.state(), version: source.version }),
  open: openFile,
};

source.start();
