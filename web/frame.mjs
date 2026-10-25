// The view that shows a set of boxes (find's matches) all at once. No DOM: the viewer passes in the boxes in stage
// coordinates and the diagram area's size, and puts the view it gets back on screen.

/** @typedef {{ left: number, top: number, right: number, bottom: number }} Box */

/**
 * The view that shows every box, centered in the area below its top padding and `pad` in from its edges, as a fit
 * puts the diagram: at zoom `k` when they fit, else zoomed out just enough; never zoomed in (the user). Null for no
 * boxes.
 * @param {Box[]} boxes in stage coordinates
 * @param {{ width: number, height: number, top: number }} area the diagram area's size, and its top padding
 * @param {number} pad
 * @param {number} k the zoom the view has
 * @returns {{ x: number, y: number, k: number } | null}
 */
export function frame(boxes, area, pad, k) {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((b) => b.left)), right = Math.max(...boxes.map((b) => b.right));
  const top = Math.min(...boxes.map((b) => b.top)), bottom = Math.max(...boxes.map((b) => b.bottom));
  const fits = (/** @type {number} */ room, /** @type {number} */ size) => (size > 0 ? room / size : Infinity);
  const to = Math.min(k, fits(area.width - 2 * pad, right - left), fits(area.height - area.top - 2 * pad, bottom - top));
  return {
    x: area.width / 2 - ((left + right) / 2) * to,
    y: area.top + (area.height - area.top) / 2 - ((top + bottom) / 2) * to,
    k: to,
  };
}
