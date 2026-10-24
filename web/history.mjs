// Undo and redo for the page's own edits, as stacks of { before, after } file texts. Undoing puts `before` back, but
// only while the file is still exactly `after`; redoing puts `after` back, only while the file is exactly `before`. If
// anyone has changed the file since, either would throw their change away.

/** @typedef {{ before: string, after: string }} Entry an edit: the file's text before and after it */

export function createHistory() {
  /** @type {Entry[]} */
  const entries = [];
  /** @type {Entry[]} undone entries, the latest last */
  const undone = [];

  return {
    get size() { return entries.length; },

    /**
     * Record a saved edit. With `into` (the newest entry), the edit completes that one instead, so a single undo takes
     * back both: naming a node is part of adding it.
     */
    record(/** @type {string} */ before, /** @type {string} */ after, /** @type {Entry | null} */ into = null) {
      undone.length = 0;
      if (into && entries.at(-1) === into) {
        into.after = after;
        return into;
      }
      const entry = { before, after };
      entries.push(entry);
      return entry;
    },

    /**
     * What undoing the newest edit would put back, given the file's text now. When the file has changed since that
     * edit, nothing older can be undone safely either, so the history is cleared.
     * @returns {{ ok: true, text: string } | { ok: false, reason: 'empty' | 'changed' }}
     */
    peek(/** @type {string} */ current) {
      const entry = entries.at(-1);
      if (!entry) return { ok: false, reason: 'empty' };
      if (entry.after !== current) {
        entries.length = 0;
        return { ok: false, reason: 'changed' };
      }
      return { ok: true, text: entry.before };
    },

    /**
     * Drop `entry`, once what it took back is saved: a cancelled add, which redo does not bring back. Only the newest
     * entry can go; returns whether it did.
     */
    discard(/** @type {Entry} */ entry) {
      if (entries.at(-1) !== entry) return false;
      entries.pop();
      return true;
    },

    /** Move the newest entry to the redo stack, once its undo is saved. */
    pop() { undone.push(/** @type {Entry} */ (entries.pop())); },

    get redoSize() { return undone.length; },

    /** The entry undo would take back next, and the one redo would put back next: the editor keys what it selected by them. */
    get newest() { return entries.at(-1) ?? null; },
    get nextRedo() { return undone.at(-1) ?? null; },

    /**
     * What redoing the last undone edit would put back, given the file's text now. When the file has changed since
     * that undo, nothing can be redone safely, so the redo stack is cleared.
     * @returns {{ ok: true, text: string } | { ok: false, reason: 'empty' | 'changed' }}
     */
    peekRedo(/** @type {string} */ current) {
      const entry = undone.at(-1);
      if (!entry) return { ok: false, reason: 'empty' };
      if (entry.before !== current) {
        undone.length = 0;
        return { ok: false, reason: 'changed' };
      }
      return { ok: true, text: entry.after };
    },

    /** Move the last undone entry back onto the undo stack, once its redo is saved. */
    redone() { entries.push(/** @type {Entry} */ (undone.pop())); },
  };
}
