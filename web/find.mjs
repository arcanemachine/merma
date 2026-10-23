// Search on /: which items match what was typed, best first. No DOM: the editor passes in what is drawn on screen.

/**
 * An item that can be found: a node's label, an edge's label, a subgraph's or the diagram's title, with its middle on
 * screen.
 * @typedef {{ kind: 'node' | 'edge' | 'subgraph' | 'title', id: string, text: string, x: number, y: number }} Findable
 */

/**
 * The items whose text holds `query`, ignoring case and runs of spaces, best first: the whole text, then a text that
 * starts with it, then a word that starts with it, then anywhere; within each, top to bottom, then left to right.
 * An empty query finds nothing.
 * @param {Findable[]} items
 * @param {string} query
 * @returns {Findable[]}
 */
export function find(items, query) {
  const fold = (/** @type {string} */ s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const q = fold(query);
  if (!q) return [];
  const rank = (/** @type {string} */ text) => {
    const t = fold(text);
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    if (t.includes(' ' + q)) return 2;
    return t.includes(q) ? 3 : -1;
  };
  return items.map((item) => ({ item, r: rank(item.text) }))
    .filter((m) => m.r >= 0)
    .sort((a, b) => a.r - b.r || a.item.y - b.item.y || a.item.x - b.item.x)
    .map((m) => m.item);
}
