// Undo for the page's own edits, as a stack of { before, after } file texts. Undoing puts `before` back, but only
// while the file is still exactly `after`: if anyone has changed it since, putting the old text back would throw their
// change away.

export function createHistory() {
  /** @type {{ before: string, after: string }[]} */
  const entries = [];

  return {
    get size() { return entries.length; },

    /**
     * Record a saved edit. With `into` (the newest entry), the edit completes that one instead, so a single undo takes
     * back both: naming a node is part of adding it.
     */
    record(before, after, into = null) {
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
    peek(current) {
      const entry = entries.at(-1);
      if (!entry) return { ok: false, reason: 'empty' };
      if (entry.after !== current) {
        entries.length = 0;
        return { ok: false, reason: 'changed' };
      }
      return { ok: true, text: entry.before };
    },

    /** Drop the newest entry, once its undo is saved. */
    pop() { entries.pop(); },
  };
}
