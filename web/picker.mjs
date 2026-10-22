// A grid of choices (arrow types, shapes), each drawn as a small icon with its digit in the corner. It shows which one
// is current and reports a pick; what a pick does is up to whoever shows it (a menu makes the edit at once, the label
// box keeps it until Enter). Keys while focus is in it: a digit picks, the arrow keys move, Enter picks the focused one.
// Keys it does not use (Escape, Left at the start of a row) go on to whoever holds it.

const COLUMNS = 5;

/**
 * One choice. Lists of them (arrow-types.mjs, shapes.mjs) keep a fixed order, so a digit always picks the same one.
 * @typedef {object} PickerEntry
 * @property {string} key what a pick reports
 * @property {string} [digit] the key that picks it; entries past the tenth have none
 * @property {string} name
 * @property {string} [meaning] what it stands for, shown after its name: "Diamond — Decision"
 * @property {() => string} icon an SVG drawing (icons.mjs)
 */

/** How an entry is named: in its accessible name, below the grid, and in its title with its key. */
const label = (/** @type {PickerEntry} */ entry) => entry.name
  + (entry.meaning && entry.meaning !== entry.name ? ` — ${entry.meaning}` : '');

/**
 * @param {object} options
 * @param {string} options.title the noun for what is picked ("Arrow type")
 * @param {PickerEntry[]} options.entries
 * @param {(key: string) => void} options.onPick
 */
export function createPicker({ title, entries, onPick }) {
  const el = document.createElement('div');
  el.className = 'picker';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', title);
  const heading = document.createElement('div');
  heading.className = 'picker-title';
  heading.textContent = title;
  const grid = document.createElement('div');
  grid.className = 'picker-grid';
  const name = document.createElement('div');
  name.className = 'picker-name';
  el.append(heading, grid, name);

  const buttons = entries.map((entry) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.key = entry.key;
    b.title = `${label(entry)} (${entry.key})`;
    // The digit shown is part of the name, so a voice user can say what they see (WCAG 2.5.3).
    b.setAttribute('aria-label', (entry.digit ? `${entry.digit} ` : '') + label(entry));
    b.innerHTML = entry.icon() + (entry.digit ? `<span class="digit">${entry.digit}</span>` : '');
    b.addEventListener('click', () => onPick(entry.key));
    b.addEventListener('pointerenter', () => b.focus());
    grid.append(b);
    return b;
  });

  /** @type {string | null} */
  let current = null;

  /**
   * Mark `key` as current; for one not in the list, `other` names it instead ("o--o").
   * @param {string | null} key
   * @param {string} [other]
   */
  function setCurrent(key, other = '') {
    current = entries.find((e) => e.key === key) ? key : null;
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.key === current));
    const entry = entries.find((e) => e.key === current);
    name.textContent = entry ? label(entry) : other ? `Other: ${other}` : '';
  }

  el.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const at = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    // By the key's place, not its character: on AZERTY the digit row types &é"' without Shift.
    const digit = entries.findIndex((entry) => entry.digit && (e.code === `Digit${entry.digit}` || e.code === `Numpad${entry.digit}`));
    /** @type {number | null} */
    let to = null;
    if (digit >= 0) { e.preventDefault(); e.stopPropagation(); onPick(entries[digit].key); return; }
    if (e.key === 'ArrowRight') to = at + 1;
    else if (e.key === 'ArrowLeft' && at % COLUMNS > 0) to = at - 1;
    else if (e.key === 'ArrowDown') to = at + COLUMNS;
    else if (e.key === 'ArrowUp' && at >= COLUMNS) to = at - COLUMNS;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    buttons[Math.max(0, Math.min(to, buttons.length - 1))].focus();
  });

  return {
    el,
    current: setCurrent,
    /** Focus the current entry, or the first. */
    focus: () => (buttons.find((b) => b.dataset.key === current) ?? buttons[0]).focus(),
  };
}
