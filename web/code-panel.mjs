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
 * @param {HTMLInputElement} els.follow the Follow selection checkbox
 * @param {HTMLElement} els.band the band behind the selected item's lines
 * @param {string} file
 * @param {object} hooks
 * @param {() => { text: string | null, version: string | null }} hooks.snapshot the file as the page has it
 * @param {() => boolean} hooks.lock stop every other edit in the page; false when one is under way
 * @param {() => void} hooks.unlock
 * @param {(text: string, base: { text: string, version: string }) => Promise<boolean>} hooks.save save over `base`;
 *   whether it saved (the lock ends then)
 */
export function createCodePanel(els, file, hooks) {
  const { main, panel, code, dock: dockSelect, handle, close, toggle, diagram, edit, save, cancel, status, follow, band } = els;
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
  /** @type {((text: string) => { from: number, to: number } | null) | null} finds the selected item's lines in a text */
  let finder = null;
  /** @type {{ from: number, to: number } | null} */
  let range = null;
  let banded = false;   // from a selection until the code gets focus

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
    refollow(on);
  }

  dockSelect.value = choice;
  setOpen(open);
  new ResizeObserver(layout).observe(main);

  // Closing while editing cancels the draft first, as Cancel does; kept, the panel stays open.
  toggle.addEventListener('click', () => { if (!open || cancelEdit()) setOpen(!open); });
  // ` from outside the panel goes to it, opening it if need be: a click into it, or the footer's Code pressed, each a
  // click away as the mouse's is (it ends find and Connect to…). Inside the panel its own keydown (below) has the key.
  // The key left of 1, by place, as the pickers' digits are; or whichever key types it, for boards where that place
  // reports another code (ISO keyboards on a Mac).
  const isTick = (/** @type {KeyboardEvent} */ e) => e.code === 'Backquote' || e.key === '`';
  const plain = (/** @type {KeyboardEvent} */ e) => !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
  document.addEventListener('keydown', (e) => {
    if (!plain(e) || !isTick(e)) return;
    const target = /** @type {Element} */ (e.target);
    if (panel.contains(target) || handle.contains(target)) return;
    // The editor's own two guards (its keydown, in editor.mjs): a field takes its keys, and so does an open dialog.
    if (target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector(':popover-open:not([data-overlay])')) return;
    // On a layout where it is a dead key, no accent waits.
    e.preventDefault();
    if (open) panel.click();
    else toggle.click();
    panel.focus({ preventScroll: true });
  });
  // The panel's keys, by keyboard a round trip with the diagram (the user): ` flips between the two, Escape steps out a
  // level (the code to the panel, a draft to the read-only code, the panel to closed), Enter goes in, and the arrows scroll the code (the user: the
  // panel is where you read it; ` is one key to the diagram), with a modifier doing nothing rather than panning. Every
  // other key goes on to the page. The Dock select keeps its own keys, and the handle its arrows.
  const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'];
  /** Scroll the code as its own keys would, a line (or a page, or to an end) at a time. */
  function scrollCode(/** @type {string} */ key) {
    const line = parseFloat(getComputedStyle(code).lineHeight) || 19;
    const page = Math.max(line, code.clientHeight - line);
    const by = { ArrowUp: [0, -line], ArrowDown: [0, line], ArrowLeft: [-line, 0], ArrowRight: [line, 0],
      PageUp: [0, -page], PageDown: [0, page], Home: [0, -code.scrollHeight], End: [0, code.scrollHeight] }[key];
    if (by) code.scrollBy(by[0], by[1]);
  }
  /** The panel's own keys, with focus on it (not in the code); true when one was taken. */
  function panelKey(/** @type {KeyboardEvent} */ e) {
    if (SCROLL_KEYS.includes(e.key)) {
      if (e.target === handle) return false;
      if (plain(e)) scrollCode(e.key);
    } else if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // One level out a press (the user): from a control in the bar to the panel; on the panel, a draft is cancelled
      // first, the panel staying open (a keyboard way to cancel without closing); then out to the diagram, the panel
      // still open, where the next Escape closes it.
      if (e.target !== panel) panel.focus({ preventScroll: true });
      else if (editing) cancelEdit();
      else diagram.focus();
    } else if (plain(e) && isTick(e)) {
      diagram.focus();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && editing) {
      saveEdit();
    } else if ((e.key === 'Enter' || e.key === 'F2') && plain(e) && e.target === panel) {
      if (editing) code.focus({ preventScroll: true });
      else edit.click();
    } else {
      return false;
    }
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  panel.addEventListener('keydown', (e) => {
    const target = /** @type {Element} */ (e.target);
    // The Dock select keeps its keys; Escape on it, its list closed (an open list takes the key), goes to the panel.
    if (target === dockSelect) {
      if (e.key === 'Escape' && plain(e) && !e.defaultPrevented) { e.preventDefault(); panel.focus({ preventScroll: true }); }
      return;
    }
    if (target !== code) { panelKey(e); return; }
    // In the code, a field: Escape goes out to the panel, Enter or F2 edits, ` leaves the read-only code for the
    // diagram (in a draft it types).
    if (e.key === 'Escape') {
      panel.focus({ preventScroll: true });
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && editing) {
      saveEdit();
    } else if ((e.key === 'Enter' || e.key === 'F2') && plain(e) && !editing) {
      // As Enter and F2 edit a selection in the diagram.
      edit.click();
    } else if (plain(e) && isTick(e) && !editing) {
      diagram.focus();
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  });
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
  code.addEventListener('scroll', () => { scroll = { top: code.scrollTop, left: code.scrollLeft }; placeBand(); });

  // Follow selection (the user: on by default, the browser's for every file): the selected item's lines, banded, the
  // caret at their start and scrolled into view when the selection changes. Never while the code has focus: the
  // caret there is the user's, and marks the place itself.
  const followKey = 'merma:code-follow';
  follow.checked = local.get(followKey) !== 'off';
  follow.addEventListener('change', () => { local.set(followKey, follow.checked ? null : 'off'); refollow(true); });
  function placeBand() {
    band.hidden = !(range && banded && open);
    if (!range || band.hidden) return;
    const { height, top } = lineBox();
    band.style.top = `${top + range.from * height - code.scrollTop}px`;
    band.style.height = `${(range.to - range.from + 1) * height}px`;
  }
  /** Find the selected item's lines again in the code as it is now; `moved`: the selection changed, so go there. */
  function refollow(/** @type {boolean} */ moved) {
    range = follow.checked && finder ? finder(code.value) : null;
    if (document.activeElement !== code && moved) {
      banded = Boolean(range);
      if (range && open) goTo(range);
    }
    placeBand();
  }
  /** The caret to the start of `lines`, which are scrolled to the middle of the view unless already in it. */
  function goTo(/** @type {{ from: number, to: number }} */ lines) {
    const { scrollTop, scrollLeft } = code;
    const at = lineStart(code.value, lines.from);
    code.setSelectionRange(at, at);
    code.scrollTop = scrollTop;   // setting the caret may scroll to it at once, ahead of the smooth scroll
    code.scrollLeft = scrollLeft;
    caretPending = true;
    const { height, top } = lineBox();
    const y = top + lines.from * height, h = (lines.to - lines.from + 1) * height;
    if (y >= code.scrollTop && y + h <= code.scrollTop + code.clientHeight) return;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    code.scrollTo({ top: y + h / 2 - code.clientHeight / 2, left: 0, behavior: smooth ? 'smooth' : 'auto' });
  }
  // Chrome puts a draft's caret back where it was as the draft loses focus, after the caret was set: so it is set
  // again as the code gets focus by key (Enter, F2, Edit), never by a press, which places the caret itself.
  let caretPending = false;
  let pressed = false;
  code.addEventListener('pointerdown', () => { pressed = true; });
  for (const ev of ['pointerup', 'pointercancel']) code.addEventListener(ev, () => { pressed = false; });
  code.addEventListener('focus', () => {
    if (caretPending && range && !pressed) {
      const { scrollTop, scrollLeft } = code;
      const at = lineStart(code.value, range.from);
      code.setSelectionRange(at, at);
      code.scrollTop = scrollTop;
      code.scrollLeft = scrollLeft;
    }
    caretPending = false;
    pressed = false;
    banded = false;
    placeBand();
  });
  // --- editing ---

  /** @type {{ base: { text: string, version: string } } | null} */
  let editing = null;
  let shown = '';     // the file's latest text; while editing, the draft stands in its place in the field
  const READ_TITLE = 'Enter or F2 edits; Escape goes to the panel; ` goes to the diagram';
  code.title = READ_TITLE;

  /** Show the header's buttons and status for editing or not. */
  function setEditing(/** @type {{ base: { text: string, version: string } } | null} */ next) {
    editing = next;
    code.readOnly = !next;
    edit.hidden = Boolean(next);
    save.hidden = !next;
    cancel.hidden = !next;
    code.title = next ? 'Ctrl+Enter (⌘+Enter on a Mac) saves; Escape goes to the panel' : READ_TITLE;
    markChanged();
  }
  function markChanged() {
    const changed = Boolean(editing) && shown !== editing?.base.text && shown !== code.value;
    status.textContent = !editing ? '' : changed ? 'Editing: file changed since' : 'Editing';
    status.classList.toggle('changed', changed);
  }
  /** Back to following the file, focus on the panel, where Escape lands too (Enter edits again, ` to the diagram). */
  function endEdit() {
    setEditing(null);
    code.value = shown;
    code.scrollTop = scroll.top;
    code.scrollLeft = scroll.left;
    refollow(false);
    panel.focus({ preventScroll: true });
  }

  edit.addEventListener('click', () => {
    const base = hooks.snapshot();
    if (base.text === null || !base.version || !hooks.lock()) return;
    setEditing({ base: { text: base.text, version: base.version } });
    // Setting the value puts the caret at the end, which scrolls there: keep the view, the caret on the followed
    // item's line, else the first line in view.
    const { scrollTop, scrollLeft } = code;
    code.value = base.text;
    const at = lineStart(code.value, range ? range.from : firstLineInView());
    code.setSelectionRange(at, at);
    code.scrollTop = scrollTop;
    code.scrollLeft = scrollLeft;
    code.focus({ preventScroll: true });
  });
  /** Where line `n` (from 0) of `text` starts; its end when it has fewer lines. */
  const lineStart = (/** @type {string} */ text, /** @type {number} */ n) => {
    let at = 0;
    for (let k = 0; k < n && at < text.length; k++) { const nl = text.indexOf('\n', at); if (nl < 0) return text.length; at = nl + 1; }
    return at;
  };
  /** The code's line height and top padding, px. */
  function lineBox() {
    const style = getComputedStyle(code);
    return { height: parseFloat(style.lineHeight) || 19, top: parseFloat(style.paddingTop) || 0 };
  }
  /** The first line (from 0) wholly or partly in view. */
  function firstLineInView() {
    const { height, top } = lineBox();
    return Math.max(0, Math.floor((code.scrollTop - top) / height));
  }
  async function saveEdit() {
    if (!editing) return;
    if (await hooks.save(code.value, editing.base)) endEdit();
    else code.focus({ preventScroll: true });
  }
  save.addEventListener('click', saveEdit);
  let closing = false;   // Escape on the diagram is saving the draft to close the panel: a second asks nothing
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
    if (panelKey(e)) return;
    const by = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!by) return;
    // The page's own arrows would move the diagram as well; the two across the handle do nothing.
    e.preventDefault();
    e.stopPropagation();
    if ((axis(dock) === 'x') === (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) resizeTo(size + grows() * by * STEP);
  });

  return {
    /**
     * Escape from the diagram: close the panel. A changed draft is saved first, if the user says so (the user: from the
     * diagram, Escape offers to save and close); one that does not save stays open. Whether Escape was taken.
     */
    escape() {
      if (!open) return false;
      if (closing) return true;
      if (editing && code.value !== editing.base.text) {
        if (confirm('Save the code and close the panel? Cancel keeps editing.')) {
          closing = true;
          saveEdit().then(() => { if (!editing) { setOpen(false); diagram.focus(); } }).finally(() => { closing = false; });
        } else {
          code.focus({ preventScroll: true });   // to go on editing, where the cursor was
        }
        return true;
      }
      cancelEdit();
      setOpen(false);
      diagram.focus();
      return true;
    },
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
      refollow(false);
    },
    /** The selection changed: `find` gives its lines in a text, or there is none (null). */
    follow(/** @type {((text: string) => { from: number, to: number } | null) | null} */ find) {
      finder = find;
      refollow(true);
    },
  };
}
