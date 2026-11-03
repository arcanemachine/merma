// Mermaid's size limits: how a render or a save that went over one is told apart, and the sentence that says so.
// merma raises them only when started with MERMA_MAX_EDGES or MERMA_MAX_TEXT (README.md), so the sentence names
// those, not Mermaid's own advice to call mermaid.initialize, which the reader cannot do. Pure: no DOM.

/** @typedef {{ maxEdges?: number, maxTextSize?: number }} Limits the ones merma was started with; unset: Mermaid's */
/** @typedef {'edges' | 'text'} Limit */

// Mermaid 12.2.0's defaults, the limits in force when merma sets none.
export const MERMAID_MAX_EDGES = 500;
export const MERMAID_MAX_TEXT = 50000;

// Over maxTextSize, Mermaid does not throw: it draws this one node in place of the diagram.
export const TEXT_LIMIT_LABEL = 'Maximum text size in diagram exceeded';

/** Which limit Mermaid's error message is about: over maxEdges, parsing throws with this prefix. */
export function limitOf(/** @type {string} */ message) {
  return message.startsWith('Edge limit exceeded') ? 'edges' : message === TEXT_LIMIT_LABEL ? 'text' : null;
}

/**
 * A drawing that is Mermaid's stand-in for a diagram over maxTextSize: one node, with its label.
 * @param {string[]} labels the drawn nodes' labels
 */
export function overTextLimit(labels) {
  return labels.length === 1 && labels[0].trim() === TEXT_LIMIT_LABEL;
}

/**
 * What the page says when `limit` was gone over: in a render (the last good one is kept), or in a save (edges only).
 * @param {Limit} limit
 * @param {Limits} limits
 * @param {boolean} saving
 */
export function limitSentence(limit, limits, saving) {
  const n = (/** @type {number} */ x) => x.toLocaleString('en-US');
  if (limit === 'edges') {
    const max = n(limits.maxEdges ?? MERMAID_MAX_EDGES);
    return (saving
      ? `Your change was not saved, because the diagram would have more edges than merma's limit of ${max}.`
      : `The diagram has more edges than merma's limit of ${max}, so the last good render is shown.`)
      + ' Start merma with MERMA_MAX_EDGES set higher.';
  }
  // A save never meets this one: Mermaid checks maxTextSize only when it draws, so the save goes through.
  return `The diagram's code is longer than merma's limit of ${n(limits.maxTextSize ?? MERMAID_MAX_TEXT)} characters,`
    + ' so the last good render is shown. Start merma with MERMA_MAX_TEXT set higher.';
}

/** The limits a page was served with: its two meta tags' contents, empty when unset. */
export function readLimits(/** @type {string} */ maxEdges, /** @type {string} */ maxText) {
  /** @type {Limits} */
  const limits = {};
  if (maxEdges) limits.maxEdges = Number(maxEdges);
  if (maxText) limits.maxTextSize = Number(maxText);
  return limits;
}
