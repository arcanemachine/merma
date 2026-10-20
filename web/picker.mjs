// A grid of choices (arrow types, shapes), each drawn as a small icon with its digit in the corner. It shows which one
// is current and reports a pick; what a pick does is up to whoever shows it (a menu makes the edit at once, the label
// box keeps it until Enter). Keys while focus is in it: a digit picks, the arrow keys move, Enter picks the focused one.
// Keys it does not use (Escape, Left at the start of a row) go on to whoever holds it.

const COLUMNS = 5;

/**
 * @param {object} options
 * @param {string} options.title the noun for what is picked ("Arrow type")
 * @param {{ key: string, digit: string, name: string, icon: () => string }[]} options.entries
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
    b.title = `${entry.name} (${entry.key})`;
    b.setAttribute('aria-label', entry.name);
    b.innerHTML = entry.icon() + `<span class="digit">${entry.digit}</span>`;
    b.addEventListener('click', () => onPick(entry.key));
    grid.append(b);
    return b;
  });

  let current = null;

  /** Mark `key` as current; for one not in the list, `other` names it instead ("o--o"). */
  function setCurrent(key, other = '') {
    current = entries.find((e) => e.key === key) ? key : null;
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.key === current));
    name.textContent = current ? entries.find((e) => e.key === current).name : other ? `Other: ${other}` : '';
  }

  el.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const at = buttons.indexOf(document.activeElement);
    const digit = entries.findIndex((entry) => entry.digit === e.key);
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
