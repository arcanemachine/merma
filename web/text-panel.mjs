// The text panel: the file's text beside the diagram, read-only, following the file as the diagram does. It docks
// left, top or bottom of the diagram in main's grid, with a handle to resize it. Where it docks and how big it is
// are the person's, kept in localStorage for every file; whether it is open is the tab's, per file, in
// sessionStorage, so the page's own reload on a new build keeps it open.

import { DOCKS, axis, panelSize, resolveDock } from './dock.mjs';

/** @typedef {import('./dock.mjs').Dock} Dock */
/** @typedef {import('./dock.mjs').DockChoice} DockChoice */

const HANDLE = 6;   // the handle's thickness, px: the grid's track for it in style.css
const STEP = 16;    // an arrow key on the handle, px

/** Storage that may be unavailable (a private window, blocked site data): reads give null, writes do nothing. */
function store(/** @type {() => Storage} */ get) {
  return {
    get(/** @type {string} */ key) { try { return get().getItem(key); } catch { return null; } },
    set(/** @type {string} */ key, /** @type {string | null} */ value) {
      try { if (value === null) get().removeItem(key); else get().setItem(key, value); } catch { /* not kept */ }
    },
  };
}

/**
 * @param {object} els
 * @param {HTMLElement} els.main the grid the panel docks in
 * @param {HTMLElement} els.panel
 * @param {HTMLTextAreaElement} els.text
 * @param {HTMLSelectElement} els.dock
 * @param {HTMLElement} els.handle
 * @param {HTMLElement} els.close
 * @param {HTMLElement} els.toggle the footer button
 * @param {HTMLElement} els.diagram where Escape in the text sends focus
 * @param {string} file
 */
export function createTextPanel(els, file) {
  const { main, panel, text, dock: dockSelect, handle, close, toggle, diagram } = els;
  const local = store(() => localStorage);
  const session = store(() => sessionStorage);
  const openKey = 'merma:text:' + file;
  const dockKey = 'merma:text-dock';
  const sizeKey = (/** @type {'x' | 'y'} */ a) => 'merma:text-size-' + a;

  let open = session.get(openKey) === '1';
  const stored = local.get(dockKey);
  /** @type {DockChoice} */
  let choice = DOCKS.includes(/** @type {Dock} */ (stored)) ? /** @type {Dock} */ (stored) : 'default';
  /** @type {Dock} */
  let dock = 'left';
  let total = 0;      // main's room along the dock's axis, less the handle
  let size = 0;       // the panel's size as drawn
  // Read back from the element only while it is shown: a hidden textarea can report 0.
  let scroll = { top: 0, left: 0 };

  const storedSize = (/** @type {'x' | 'y'} */ a) => {
    const n = Number(local.get(sizeKey(a)));
    return n > 0 ? n : null;
  };

  /** Draw the panel at `next` px (clamped), and say so on the handle. */
  function setSize(/** @type {number | null} */ next) {
    size = panelSize(next, total);
    main.style.setProperty('--text-size', size + 'px');
    handle.setAttribute('aria-valuenow', String(size));
    handle.setAttribute('aria-valuemin', String(panelSize(0, total)));
    handle.setAttribute('aria-valuemax', String(panelSize(Infinity, total)));
  }

  /** Lay main out for the panel's state and main's size. A clamped size is drawn, never stored (only the handle stores). */
  function layout() {
    const r = main.getBoundingClientRect();
    /** @type {HTMLOptionElement} */ (dockSelect.options[0]).textContent = `Default (${resolveDock('default', r.width, r.height)})`;
    if (!open) { main.removeAttribute('data-dock'); return; }
    dock = resolveDock(choice, r.width, r.height);
    main.dataset.dock = dock;
    total = (axis(dock) === 'x' ? r.width : r.height) - HANDLE;
    handle.setAttribute('aria-orientation', axis(dock) === 'x' ? 'vertical' : 'horizontal');
    setSize(storedSize(axis(dock)));
  }

  function setOpen(/** @type {boolean} */ on) {
    open = on;
    session.set(openKey, on ? '1' : null);
    panel.hidden = !on;
    handle.hidden = !on;
    toggle.setAttribute('aria-expanded', String(on));
    layout();
    if (on) { text.scrollTop = scroll.top; text.scrollLeft = scroll.left; }
  }

  dockSelect.value = choice;
  setOpen(open);
  new ResizeObserver(layout).observe(main);

  toggle.addEventListener('click', () => setOpen(!open));
  close.addEventListener('click', () => { setOpen(false); toggle.focus(); });
  dockSelect.addEventListener('change', () => {
    choice = /** @type {DockChoice} */ (dockSelect.value);
    local.set(dockKey, choice === 'default' ? null : choice);
    layout();
  });
  text.addEventListener('scroll', () => { scroll = { top: text.scrollTop, left: text.scrollLeft }; });
  // A field turns the page's keys off, so Escape is the way back to them.
  text.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    diagram.focus();
  });

  // The handle: a drag, or the arrows by STEP. Right or Down moves it right or down, whichever side the panel is on.
  // A bottom dock grows as the handle moves up.
  const grows = () => (dock === 'bottom' ? -1 : 1);
  function resizeTo(/** @type {number} */ next) {
    setSize(next);
    local.set(sizeKey(axis(dock)), String(size));
  }
  /** @type {{ at: number, from: number } | null} */
  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // A press outside the diagram is a click away, which saves an open label box as focus leaves it; a finger's drag
    // moves no focus of its own.
    handle.focus({ preventScroll: true, focusVisible: false });
    handle.setPointerCapture(e.pointerId);
    drag = { at: axis(dock) === 'x' ? e.clientX : e.clientY, from: size };
    // The pointer crossing the text on its way would select it.
    document.body.classList.add('resizing');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    setSize(drag.from + grows() * ((axis(dock) === 'x' ? e.clientX : e.clientY) - drag.at));
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    document.body.classList.remove('resizing');
    resizeTo(size);
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('keydown', (e) => {
    const by = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!by) return;
    // The page's own arrows would move the diagram as well; the two across the handle do nothing.
    e.preventDefault();
    e.stopPropagation();
    if ((axis(dock) === 'x') === (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) resizeTo(size + grows() * by * STEP);
  });

  let shown = '';
  return {
    /** Show a version of the file. The scroll stays where it was; a selection in the text is lost. */
    show(/** @type {string} */ next) {
      if (next === shown) return;
      shown = next;
      text.value = next;
      if (open) { text.scrollTop = scroll.top; text.scrollLeft = scroll.left; }
    },
  };
}
