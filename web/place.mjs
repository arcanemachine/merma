// Where to put a box (a menu, a submenu, a strip) beside an anchor so that it stays inside some bounds: on the side
// asked for, on the opposite side when there is no room there, and pushed back inside when it still sticks out.
// Rectangles are { left, top, right, bottom } in one coordinate space (the viewport's, from getBoundingClientRect).

/**
 * @param {{ left: number, top: number, right: number, bottom: number }} anchor a point is a rectangle of no size
 * @param {{ width: number, height: number }} size the box's
 * @param {{ left: number, top: number, right: number, bottom: number }} bounds
 * @param {{ side?: 'right' | 'below' | 'above', gap?: number }} [options]
 * @returns {{ left: number, top: number, flipped: boolean }}
 */
export function place(anchor, size, bounds, { side = 'right', gap = 8 } = {}) {
  let left, top, flipped = false;
  if (side === 'right') {
    left = anchor.right + gap;
    top = anchor.top;
    const other = anchor.left - gap - size.width;
    if (left + size.width > bounds.right && other >= bounds.left) { left = other; flipped = true; }
  } else {
    const below = anchor.bottom + gap, above = anchor.top - gap - size.height;
    left = anchor.left;
    top = side === 'below' ? below : above;
    if (side === 'below' && below + size.height > bounds.bottom && above >= bounds.top) { top = above; flipped = true; }
    if (side === 'above' && above < bounds.top && below + size.height <= bounds.bottom) { top = below; flipped = true; }
  }
  return { left: clamp(left, bounds.left, bounds.right - size.width), top: clamp(top, bounds.top, bounds.bottom - size.height), flipped };
}

// A box bigger than the bounds keeps its start edge inside them.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
