// Where to put a box (a menu, a submenu, a strip) beside an anchor so that it stays inside some bounds: on the side
// asked for, on the opposite side when there is no room there (unless `flip` is off), and pushed back inside when it
// still sticks out. Rectangles are { left, top, right, bottom } in one coordinate space (the viewport's, from
// getBoundingClientRect).

/** @typedef {'right' | 'left' | 'below' | 'above'} Side */

/** The side across the anchor from `side`. */
export const OPPOSITE = /** @type {const} */ ({ right: 'left', left: 'right', below: 'above', above: 'below' });

/**
 * @param {{ left: number, top: number, right: number, bottom: number }} anchor a point is a rectangle of no size
 * @param {{ width: number, height: number }} size the box's
 * @param {{ left: number, top: number, right: number, bottom: number }} bounds
 * @param {{ side?: Side, gap?: number, flip?: boolean }} [options] `flip`: false keeps the box on `side`, only pushed
 *   inside (a box that follows its anchor keeps the side it opened on)
 * @returns {{ left: number, top: number, flipped: boolean }}
 */
export function place(anchor, size, bounds, { side = 'right', gap = 8, flip = true } = {}) {
  let left, top, flipped = false;
  if (side === 'right' || side === 'left') {
    const right = anchor.right + gap, before = anchor.left - gap - size.width;
    left = side === 'right' ? right : before;
    top = anchor.top;
    if (flip && side === 'right' && right + size.width > bounds.right && before >= bounds.left) { left = before; flipped = true; }
    if (flip && side === 'left' && before < bounds.left && right + size.width <= bounds.right) { left = right; flipped = true; }
  } else {
    const below = anchor.bottom + gap, above = anchor.top - gap - size.height;
    left = anchor.left;
    top = side === 'below' ? below : above;
    if (flip && side === 'below' && below + size.height > bounds.bottom && above >= bounds.top) { top = above; flipped = true; }
    if (flip && side === 'above' && above < bounds.top && below + size.height <= bounds.bottom) { top = below; flipped = true; }
  }
  return { left: clamp(left, bounds.left, bounds.right - size.width), top: clamp(top, bounds.top, bounds.bottom - size.height), flipped };
}

// A box bigger than the bounds keeps its start edge inside them.
const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.max(lo, Math.min(v, hi));
