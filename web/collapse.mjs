// Collapsed subgraphs, page-side: the page draws the file with `id@{ view: … }` lines appended after its last byte, so
// no offset in the file moves and nothing is written (docs/ux.md, "The file comes first"). Mermaid draws a collapsed
// subgraph as one box; whatever it holds is hidden, and an edge with a hidden end is drawn to the box that hides it.
// Pure: what each subgraph holds and its default view come from Mermaid's own reading of the file (viewer.mjs).

/** @typedef {'collapsed' | 'expanded'} View */
/** @typedef {{ id: string, title: string, members: string[], view: View }} SubgraphInfo members: node and subgraph ids */
/**
 * The page's views that differ from the file's. `title` is kept for an id-less subgraph only: Mermaid calls it
 * `subGraph<k>` by its place, so a subgraph added before it would take its view; a different title drops it.
 * @typedef {Map<string, { view: View, title: string | null }>} Overrides
 */

const GENERATED = /^subGraph\d+$/;

/** The subgraph `id` is shown collapsed: the page's view, else the file's. */
export function isCollapsed(/** @type {string} */ id, /** @type {SubgraphInfo[]} */ subs, /** @type {Overrides} */ overrides) {
  return (overrides.get(id)?.view ?? subs.find((s) => s.id === id)?.view) === 'collapsed';
}

/** The overrides that still hold: their subgraph is there (with the same title, if id-less) and differs from the file. */
export function prune(/** @type {Overrides} */ overrides, /** @type {SubgraphInfo[]} */ subs) {
  /** @type {Overrides} */
  const out = new Map();
  for (const [id, o] of overrides) {
    const s = subs.find((x) => x.id === id);
    if (!s || (o.title !== null && o.title !== s.title) || o.view === s.view) continue;
    out.set(id, o);
  }
  return out;
}

/** The overrides with `id` shown as `view`; an override the file already agrees with is dropped. */
export function setView(/** @type {Overrides} */ overrides, /** @type {SubgraphInfo[]} */ subs, /** @type {string} */ id, /** @type {View} */ view) {
  const s = subs.find((x) => x.id === id);
  const out = new Map(overrides);
  out.delete(id);
  if (s && s.view !== view) out.set(id, { view, title: GENERATED.test(id) ? s.title : null });
  return out;
}

/** The text the page draws: the file's, then a line per override after a newline (a last `%%` line would swallow it). */
export function viewText(/** @type {string} */ text, /** @type {Overrides} */ overrides, /** @type {SubgraphInfo[]} */ subs) {
  const lines = [...prune(overrides, subs)].map(([id, o]) => `${id}@{ view: ${o.view} }`);
  return lines.length ? `${text}\n${lines.join('\n')}\n` : text;
}

/** What `id` (a node or a subgraph) is drawn as: itself, or the outermost collapsed subgraph holding it. */
export function drawnAs(/** @type {string} */ id, /** @type {SubgraphInfo[]} */ subs, /** @type {Overrides} */ overrides) {
  /** @type {Map<string, string>} */
  const parent = new Map();
  for (const s of subs) for (const m of s.members) parent.set(m, s.id);
  let as = id;
  const seen = new Set();
  for (let p = parent.get(id); p !== undefined && !seen.has(p); p = parent.get(p)) {
    seen.add(p);
    if (isCollapsed(p, subs, overrides)) as = p;
  }
  return as;
}

/**
 * The edges Mermaid draws, in order: all but those with a hidden end whose two ends are drawn as the same box (an edge
 * inside it, or from its contents to itself). A subgraph's own self-loop is still drawn, on its box.
 * @template {{ from: string, to: string }} E
 * @param {E[]} edges
 * @param {SubgraphInfo[]} subs
 * @param {Overrides} overrides
 * @returns {E[]}
 */
export function drawnEdges(edges, subs, overrides) {
  return edges.filter((e) => {
    const a = drawnAs(e.from, subs, overrides), b = drawnAs(e.to, subs, overrides);
    return a !== b || (a === e.from && b === e.to);
  });
}
