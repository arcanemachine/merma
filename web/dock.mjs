// The text panel's dock: which side of the diagram it takes, and how big it may be. Sizes are in px along the dock's
// axis (width for left, height for top and bottom), out of `total`, the room main has that way.

/** @typedef {'left' | 'top' | 'bottom'} Dock */
/** @typedef {Dock | 'default'} DockChoice */

export const DOCKS = /** @type {const} */ (['left', 'top', 'bottom']);
/** The panel's smallest size, unless the diagram's share leaves less. */
export const MIN_SIZE = 160;
/** What the diagram always keeps of main: main's own floor is the body grid's, so this is what bounds the diagram. */
export const DIAGRAM_SHARE = 0.4;
/** The panel's share of main before it has been resized. */
export const START_SHARE = 1 / 3;

/** The dock Default means for main at this size: left when wider than tall, else bottom (the user: "wide", "tall"). */
export function defaultDock(/** @type {number} */ width, /** @type {number} */ height) {
  return width > height ? 'left' : 'bottom';
}

/** The dock a choice means for main at this size. */
export function resolveDock(/** @type {DockChoice} */ choice, /** @type {number} */ width, /** @type {number} */ height) {
  return choice === 'default' ? defaultDock(width, height) : choice;
}

/** Which of main's sizes a dock divides: a left dock takes width, top and bottom take height. */
export const axis = (/** @type {Dock} */ dock) => (dock === 'left' ? 'x' : 'y');

/**
 * The panel's size: `size` (or START_SHARE of `total` when none was set) kept to at least MIN_SIZE and at most what
 * leaves the diagram DIAGRAM_SHARE of `total`. Where the two cannot both hold, the diagram's share wins.
 */
export function panelSize(/** @type {number | null} */ size, /** @type {number} */ total) {
  const most = total * (1 - DIAGRAM_SHARE);
  return Math.round(Math.min(most, Math.max(MIN_SIZE, size ?? total * START_SHARE)));
}
