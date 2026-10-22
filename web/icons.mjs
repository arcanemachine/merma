// The frame every icon shares: an inline SVG of a given size, drawn in the current text colour and hidden from screen
// readers (the button or row it is in carries the name). Each list (arrow types, shapes) draws only what goes inside.

/**
 * An icon of `width` × `height`, made from `inner` (SVG elements in that viewBox).
 * @param {number} width
 * @param {number} height
 * @param {string} inner
 * @returns {() => string}
 */
export function icon(width, height, inner) {
  return () => `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" fill="none" `
    + `stroke="currentColor" aria-hidden="true">${inner}</svg>`;
}
