// Where an arrow key moves focus in a picker's grid. Moves wrap within their row or column, never into the next one:
// Right at a row's end goes to its start, Down at the bottom to the top of the same column. A short last row is
// allowed for: a column it lacks ends one row higher.

/**
 * @param {number} index the focused entry
 * @param {string} key KeyboardEvent.key
 * @param {number} count how many entries
 * @param {number} columns as drawn
 * @returns {number | null} the entry to focus, or null for a key that is not an arrow
 */
export function move(index, key, count, columns) {
  const rows = Math.ceil(count / columns);
  const row = Math.floor(index / columns), col = index % columns;
  const rowLength = (/** @type {number} */ r) => Math.min(columns, count - r * columns);
  // The lowest row that has this column.
  const bottom = col < rowLength(rows - 1) ? rows - 1 : rows - 2;
  if (key === 'ArrowRight') return col + 1 < rowLength(row) ? index + 1 : row * columns;
  if (key === 'ArrowLeft') return col > 0 ? index - 1 : row * columns + rowLength(row) - 1;
  if (key === 'ArrowDown') return row < bottom ? index + columns : col;
  if (key === 'ArrowUp') return row > 0 ? index - columns : bottom * columns + col;
  return null;
}
