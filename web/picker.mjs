// A grid of choices (arrow types, shapes), each drawn as a small icon with its digit in the corner. The line under it
// names the entry under the pointer, else the one with keyboard focus, else the current one. It reports a pick; what a
// pick does is up to whoever shows it (a menu makes the edit at once, the label box keeps it until Enter). Keys while
// focus is in it: a digit picks, the arrow keys move, wrapping within their row or column (grid.mjs), Enter picks the
// focused one. Keys it does not use (Escape; hosted under a text field, Up from the top row) go on to whoever holds it.
//
// Hosted under a text field, its buttons take focus only when its host gives it (`focus`), not under the pointer;
// the host keeps a click from moving focus. It remembers where the arrows were when focus went back to its field, and
// `focus` returns there; a pick moves that place to the picked entry. A picker in a menu always starts at the current one.

import { move } from './grid.mjs';

// While Shift is held, the digits Shift picks show dark and the plain ones gray, and the other way round when it is not:
// the page marks the root, which every picker's digits read (style.css).
// Listened for from the first picker made, not on import, so a test can import this module without a page.
let watchingShift = false;
function watchShift() {
  if (watchingShift) return;
  watchingShift = true;
  const shiftHeld = (/** @type {boolean} */ on) => document.documentElement.toggleAttribute('data-shift', on);
  document.addEventListener('keydown', (e) => { if (e.key === 'Shift') shiftHeld(true); });
  document.addEventListener('keyup', (e) => { if (e.key === 'Shift') shiftHeld(false); });
  window.addEventListener('blur', () => shiftHeld(false));
}

/**
 * One choice. Lists of them (arrow-types.mjs, shapes.mjs) keep a fixed order, so a digit always picks the same one.
 * @typedef {object} PickerEntry
 * @property {string} key what a pick reports
 * @property {string} [digit] the key that picks it; entries past the twentieth have none
 * @property {boolean} [shift] the digit picks it with Shift held (the second ten)
 * @property {string} name
 * @property {string} [meaning] what it stands for, shown after its name: "Diamond (Decision)"
 * @property {() => string} icon an SVG drawing (icons.mjs)
 */

/** How an entry is named: in its accessible name, and below the grid. */
const label = (/** @type {PickerEntry} */ entry) => entry.name
  + (entry.meaning && entry.meaning !== entry.name ? ` (${entry.meaning})` : '');

/**
 * @param {object} options
 * @param {string} options.title the noun for what is picked ("Arrow type")
 * @param {PickerEntry[]} options.entries
 * @param {(key: string) => void} options.onPick
 * @param {number} [options.columns]
 * @param {boolean} [options.hosted] under a text field: its buttons never take focus
 */
export function createPicker({ title, entries, onPick, columns = 5, hosted = false }) {
  watchShift();
  const el = document.createElement('div');
  el.className = 'picker';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', title);
  const heading = document.createElement('div');
  heading.className = 'picker-title';
  heading.textContent = title;
  const grid = document.createElement('div');
  grid.className = 'picker-grid';
  grid.style.setProperty('--columns', String(columns));
  const name = document.createElement('div');
  name.className = 'picker-name';
  el.append(heading, grid, name);

  const buttons = entries.map((entry) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.key = entry.key;
    // The digit shown is part of the name, so a voice user can say what they see (WCAG 2.5.3).
    b.setAttribute('aria-label', (entry.digit ? `${entry.shift ? 'Shift ' : ''}${entry.digit} ` : '') + label(entry));
    b.innerHTML = entry.icon() + (entry.digit ? `<span class="digit${entry.shift ? ' shift' : ''}">${entry.shift ? '⇧' : ''}${entry.digit}</span>` : '');
    b.addEventListener('click', () => {
      // A click moves keyboard focus only when it is in the grid already (a hosted picker's field keeps it).
      if (!hosted || grid.contains(document.activeElement)) b.focus();
      onPick(entry.key);
    });
    b.addEventListener('pointerenter', (e) => {
      // Touch has no hover: a tap names the current one (docs/ux.md).
      if (e.pointerType !== 'touch') hovered = entry;
      if (!hosted) b.focus();
      showName();
    });
    b.addEventListener('focus', () => { if (hosted) markStart(b); showName(); });
    if (hosted) b.tabIndex = -1;
    grid.append(b);
    return b;
  });

  /** @type {string | null} */
  let current = null;
  let other = '';
  /** @type {PickerEntry | null} the entry under the pointer */
  let hovered = null;
  grid.addEventListener('pointerleave', () => { hovered = null; showName(); });
  grid.addEventListener('focusout', (e) => showName(/** @type {Element | null} */ (e.relatedTarget)));

  /** Mark `start` as where the arrows start from (`focus`), outlined while focus is elsewhere; null marks none. */
  function markStart(/** @type {HTMLButtonElement | null | undefined} */ start) {
    for (const b of buttons) b.toggleAttribute('data-start', b === start);
  }

  /** Name the entry under the pointer, else the focused one (`focused`, while focus moves), else the current one. */
  function showName(focused = document.activeElement) {
    const at = buttons.findIndex((b) => b === focused);
    const entry = entries.find((e) => e.key === current);
    // A picker hidden under the pointer gets no pointerleave: what it last had under it is stale when it shows again.
    const under = hovered && grid.matches(':hover') ? hovered : null;
    name.textContent = under ? label(under) : at >= 0 ? label(entries[at])
      : entry ? `Current: ${label(entry)}` : other ? `Current: ${other}` : '';
  }

  /**
   * Mark `key` as current; for one not in the list, `otherName` names it instead ("o--o").
   * @param {string | null} key
   * @param {string} [otherName]
   */
  function setCurrent(key, otherName = '') {
    current = entries.find((e) => e.key === key) ? key : null;
    other = otherName;
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.key === current));
    markStart(buttons.find((b) => b.dataset.key === current));
    showName();
  }

  el.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const at = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    // The columns as drawn: CSS may lay the grid out with fewer than it was made with (the shape picker on a narrow screen).
    const across = buttons.filter((b) => b.offsetTop === buttons[0].offsetTop).length;
    // By the key's place, not its character: on AZERTY the digit row types &é"' without Shift.
    // Shift picks from the second ten; the numpad gives a digit only with Num Lock on (else it is an arrow).
    const digit = entries.findIndex((entry) => entry.digit && Boolean(entry.shift) === e.shiftKey
      && (e.code === `Digit${entry.digit}` || (e.code === `Numpad${entry.digit}` && e.key === entry.digit)));
    if (digit >= 0) { e.preventDefault(); e.stopPropagation(); buttons[digit].focus(); onPick(entries[digit].key); return; }
    // Hosted, Up from the top row is the way back to its field.
    if (at < 0 || (hosted && e.key === 'ArrowUp' && at < across)) return;
    const to = move(at, e.key, buttons.length, across);
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    buttons[to].focus();
  });

  return {
    el,
    current: setCurrent,
    /** Focus where the arrows start from, or the first entry. */
    focus: () => (buttons.find((b) => b.hasAttribute('data-start')) ?? buttons[0]).focus(),
    /** The current entry's key, or null. */
    value: () => current,
  };
}
