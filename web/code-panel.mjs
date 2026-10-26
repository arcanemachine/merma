// The code panel: the file's Mermaid code beside the diagram, read-only, following the file as the diagram does. It
// docks left, top or bottom of the diagram in main's grid, with a handle to resize it. Where it docks and how big it
// is are the person's, kept in localStorage for every file; whether it is open is the tab's, per file, in
// sessionStorage, so the page's own reload on a new build keeps it open.
//
// Edit makes the code editable, a draft, and locks the diagram (`hooks.lock`) until Save or Cancel, so the draft and
// a pointing edit never race in this page. Someone else (an agent, an editor) can still change the file: the draft
// stays, the header says so, and Save, made over the version Edit started from, is refused.

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
 * @param {HTMLTextAreaElement} els.code
 * @param {HTMLSelectElement} els.dock
 * @param {HTMLElement} els.handle
 * @param {HTMLElement} els.close
 * @param {HTMLElement} els.edit
 * @param {HTMLElement} els.save
 * @param {HTMLElement} els.cancel
 * @param {HTMLElement} els.status what the code shows: being edited, and whether the file changed since
 * @param {HTMLElement} els.toggle the footer button
 * @param {HTMLElement} els.diagram where Escape in the code sends focus
 * @param {string} file
 * @param {object} hooks
 * @param {() => { text: string | null, version: string | null }} hooks.snapshot the file as the page has it
 * @param {() => boolean} hooks.lock stop every other edit in the page; false when one is under way
 * @param {() => void} hooks.unlock
 * @param {(text: string, base: { text: string, version: string }) => Promise<boolean>} hooks.save save over `base`;
 *   whether it saved (the lock ends then)
 */
export function createCodePanel(els, file, hooks) {
  const { main, panel, code, dock: dockSelect, handle, close, toggle, diagram, edit, save, cancel, status } = els;
  const local = store(() => localStorage);
  const session = store(() => sessionStorage);
  const openKey = 'merma:code:' + file;
  const dockKey = 'merma:code-dock';
  const sizeKey = (/** @type {'x' | 'y'} */ a) => 'merma:code-size-' + a;

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
    main.style.setProperty('--code-size', size + 'px');
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
    if (on) { code.scrollTop = scroll.top; code.scrollLeft = scroll.left; }
  }

  dockSelect.value = choice;
  setOpen(open);
  new ResizeObserver(layout).observe(main);

  // Closing while editing cancels the draft first, as Cancel does; kept, the panel stays open.
  toggle.addEventListener('click', () => { if (!open || cancelEdit()) setOpen(!open); });
  close.addEventListener('click', () => {
    if (!cancelEdit()) return;
    setOpen(false);
    toggle.focus();
  });
  dockSelect.addEventListener('change', () => {
    choice = /** @type {DockChoice} */ (dockSelect.value);
    local.set(dockKey, choice === 'default' ? null : choice);
    layout();
  });
  code.addEventListener('scroll', () => { scroll = { top: code.scrollTop, left: code.scrollLeft }; });
  // A field turns the page's keys off, so Escape is the way back to them.
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      diagram.focus();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && editing) {
      e.preventDefault();
      saveEdit();
    }
  });

  // --- editing ---

  /** @type {{ base: { text: string, version: string } } | null} */
  let editing = null;
  let shown = '';     // the file's latest text; while editing, the draft stands in its place in the field
  const READ_TITLE = 'Escape goes back to the diagram';
  code.title = READ_TITLE;

  /** Show the header's buttons and status for editing or not. */
  function setEditing(/** @type {{ base: { text: string, version: string } } | null} */ next) {
    editing = next;
    code.readOnly = !next;
    edit.hidden = Boolean(next);
    save.hidden = !next;
    cancel.hidden = !next;
    code.title = next ? 'Ctrl+Enter (⌘+Enter on a Mac) saves; Escape goes back to the diagram' : READ_TITLE;
    markChanged();
  }
  function markChanged() {
    const changed = Boolean(editing) && shown !== editing?.base.text && shown !== code.value;
    status.textContent = !editing ? '' : changed ? 'Editing: file changed since' : 'Editing';
    status.classList.toggle('changed', changed);
  }
  /** Back to following the file, focus on Edit. */
  function endEdit() {
    setEditing(null);
    code.value = shown;
    code.scrollTop = scroll.top;
    code.scrollLeft = scroll.left;
    edit.focus();
  }

  edit.addEventListener('click', () => {
    const base = hooks.snapshot();
    if (base.text === null || !base.version || !hooks.lock()) return;
    setEditing({ base: { text: base.text, version: base.version } });
    code.value = base.text;
    code.focus({ preventScroll: true });
  });
  async function saveEdit() {
    if (!editing) return;
    if (await hooks.save(code.value, editing.base)) endEdit();
    else code.focus({ preventScroll: true });
  }
  save.addEventListener('click', saveEdit);
  /** Drop the draft, asking first if it differs from where it started. Whether it was dropped (or there was none). */
  function cancelEdit() {
    if (!editing) return true;
    if (code.value !== editing.base.text && !confirm('Discard your changes to the code?')) return false;
    hooks.unlock();
    endEdit();
    return true;
  }
  cancel.addEventListener('click', cancelEdit);

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
    // The pointer crossing the code on its way would select it.
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

  return {
    /**
     * Show a version of the file. The scroll stays where it was; a selection in the code is lost. While editing, the
     * draft stays, and the header says when the file has changed since.
     */
    show(/** @type {string} */ next) {
      if (next === shown) return;
      shown = next;
      if (editing) { markChanged(); return; }
      code.value = next;
      if (open) { code.scrollTop = scroll.top; code.scrollLeft = scroll.left; }
    },
  };
}
