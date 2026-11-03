// The notice's layers (docs/ux.md, Messages): a mode's notice (a pick's, the code panel's lock) is the base, and holds
// while the mode is on; a notice shown over it is the overlay, one at most. With no base, a notice is shown alone.
// Pure state: the page draws the rows and speaks what each step says.

/** @typedef {'info' | 'warning' | 'error'} Kind */
/** @typedef {{ text: string, kind: Kind }} Row */
/** @typedef {{ base: Row | null, top: Row | null }} Notices the mode's row, and the row over it (or alone) */
/** @typedef {{ region: 'status' | 'alert', text: string } | null} Speak what a screen reader hears, if anything */

/** @type {Notices} */
export const NONE = { base: null, top: null };

/** Show `text` over the base, or alone with none, replacing any shown there: heard again even when the same. */
export function show(/** @type {Notices} */ state, /** @type {string} */ text, /** @type {Kind} */ kind) {
  return { state: { ...state, top: { text, kind } }, speak: /** @type {Speak} */ ({ region: kind === 'error' ? 'alert' : 'status', text }) };
}

/** Hide the top row; the base stays. `shown`: whether there was one. Nothing is heard, the base not read again. */
export function hide(/** @type {Notices} */ state) {
  return { state: { ...state, top: null }, shown: Boolean(state.top) };
}

/** Start a mode with its notice, over whatever showed; or, with null, end it, its overlay going with it. */
export function mode(/** @type {string | null} */ text) {
  if (text === null) return { state: NONE, speak: /** @type {Speak} */ (null) };
  return { state: { base: { text, kind: /** @type {Kind} */ ('info') }, top: null }, speak: /** @type {Speak} */ ({ region: 'status', text }) };
}
