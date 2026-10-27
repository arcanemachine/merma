// The find's blink: the current match shown on and off like a turn signal, a third of a second each, seven times, then
// steady on. It blinks only when the current match changes, which is when it helps, and stops within 5 s,
// as WCAG 2.2.2 asks of blinking with no control to stop it. The phase comes from the time since it started, so a late
// timer never drifts it.

/** How long the blink is on, and then off. */
export const BLINK_HALF = 1000 / 3;
/** How many times it goes off before it stays on. */
export const BLINKS = 7;

/** @typedef {'on' | 'off' | 'steady'} Phase steady: on, and done blinking */

export function createBlink() {
  /** @type {string | null} */
  let key = null;
  let start = -Infinity;
  let reduced = false;

  /** @returns {Phase} */
  const phase = (/** @type {number} */ now) => {
    const half = Math.floor((now - start) / BLINK_HALF);
    if (key === null || reduced || half < 0 || half >= 2 * BLINKS) return 'steady';
    return half % 2 ? 'off' : 'on';
  };

  return {
    phase,

    /**
     * The current match is `k` (null for none) at `now`: a different one blinks afresh, the same one keeps its phase
     * unless `again`. With `reduce` (prefers-reduced-motion) it does not blink.
     */
    show(/** @type {string | null} */ k, /** @type {number} */ now, /** @type {boolean} */ reduce, again = false) {
      if (k === key && !again) return;
      key = k;
      start = now;
      reduced = reduce;
    },

    /** How long after `now` the phase changes next; null once steady. */
    next(/** @type {number} */ now) {
      if (phase(now) === 'steady') return null;
      return BLINK_HALF - ((now - start) % BLINK_HALF);
    },
  };
}
