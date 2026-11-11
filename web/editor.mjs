// Editing a flowchart by pointing: click a node, an edge or a subgraph to select it, right-click (or long-press) for
// its menu, or right-click empty space to add a node; each action is a small text edit to the file
// (patch/flowchart.mjs). Each edit is checked with Mermaid's parser before it is saved, and saved over the version it
// was based on (source.mjs), so a change saved meanwhile by an agent or an editor is never overwritten. What this adds to the drawing is marked
// `data-page-…`, which the SVG export leaves out.

import { ARROW_TYPES } from './arrow-types.mjs';
import { createBlink } from './blink.mjs';
import { drawnAs, drawnEdges } from './collapse.mjs';
import { turnable } from './turn.mjs';
import { createHistory } from './history.mjs';
import { find, firstShown, countText } from './find.mjs';
import { createMenu } from './menu.mjs';
import { applies, GLOBAL_KEYS, INSERT_COLLAPSED, LOCKED, MENUS, NO_EDGE_MATCH, NO_SUBGRAPH_MATCH, PART_UNNAMED, whyNot } from './menu-items.mjs';
import { createKeys } from './keys.mjs';
import { countedEnd, heading, nearest, nest, otherEnd } from './navigate.mjs';
import {
  addConnected, addNode, addSubgraph, arrowType, connect, contentsOf, copiedSubgraphText, copiedText, copyNode, copySubgraph, deleteEdge, deleteSubgraph, deleteSubgraphContents, hasNode, moveCut, moveIntoEdge, blockOf, deleteNode, edges, insertNode, isFlowchart, mergeNode, moveSubgraph,
  nodeIdFromSvgId, pasteNode, pasteSubgraph, relabel, retarget, reverseEdge, setEdgeArrow, setEdgeLabel, setShape, setSubgraphTitle, setTitle, shapeOf, subgraphIdFromSvgId,
  subgraphRefusal, subgraphs, hasClick, setLink, writtenLink,
} from './patch/flowchart.mjs';
import { linkEdit, linkTarget, linkTone } from './links.mjs';
import { limitOf, limitSentence } from './limits.mjs';
import { createPicker } from './picker.mjs';
import { place } from './place.mjs';
import { NODE_SHAPES } from './shapes.mjs';

// With nothing selected, an arrow key moves the diagram a tenth of the area's size (Ctrl half, Shift a fiftieth); + and
// - zoom by this factor.
const PAN_STEP = 0.1;
const PAN_BIG = 0.5;
const PAN_SMALL = 0.02;
const ZOOM_STEP = 1.25;
// The tick, in the diagram's units (the arrowhead is 14 wide): its length across the line and its stroke, each
// with a floor on screen in pixels, and its gap from the arrowhead or the node.
const END_TICK = 18;
const END_TICK_MIN = 12;
const END_STROKE = 3;
const END_STROKE_MIN = 2;
const END_GAP = 1;
// How far the line must run the tick's way on both sides of it when zoomed out too far for `straight`, in the
// diagram's units: a short straight stretch has that much, a rounded corner does not, so a tick never lies on one.
const END_RUN = 3;

/**
 * How an edit goes on once saved. `afterSave(result, entry)`: anything to do then (announce it, note what is being
 * named); `into`: the history entry the edit completes; `after(result)`: the item to select once its text is drawn,
 * with `label` to open the label box on it, or `menu` to keep its menu open, or null for nothing; `keep`: the menu the
 * edit was made from stays open meanwhile (a picker's pick).
 * @typedef {object} EditOptions
 * @property {(result: any, entry: import('./history.mjs').Entry) => void} [afterSave]
 * @property {import('./history.mjs').Entry | null} [into]
 * @property {(result: any) => ({ item: Item, label?: boolean, menu?: boolean, others?: Item[], reveal?: boolean, far?: boolean } | null)} [after]
 *   `far`: an edge selected counts from its target
 * @property {boolean} [keep]
 */

/**
 * A node, an edge, a subgraph or the diagram's title: what can be selected. `id` is Mermaid's node or subgraph id, an
 * edge's SVG id, or '' for the title.
 * @typedef {{ kind: 'node' | 'edge' | 'subgraph' | 'title', id: string }} Item
 */

/**
 * @param {object} deps
 * @param {ReturnType<typeof import('./source.mjs').createSource>} deps.source
 * @param {string} deps.file the file `source` reads, which its undo history belongs to
 * @param {ReturnType<typeof import('./viewer.mjs').createViewer>} deps.viewer
 * @param {(text: string) => Promise<unknown>} deps.parse throws when the text is not valid Mermaid
 * @param {import('./limits.mjs').Limits} deps.limits Mermaid's size limits as merma was started with them
 * @param {(text: string) => Promise<void>} deps.display show saved text as the page shows any new version
 * @param {{ notice(message: string, kind: 'info'|'warning'|'error'): void, hideNotice(): boolean, mode(message: string | null): void, escape(): boolean, setView(id: string, view: 'collapsed' | 'expanded'): Promise<void>, turn(which: 'rotate' | 'flip', id?: string | null): Promise<boolean>, turned(id?: string | null): { rotate: boolean, flip: boolean }, selected(item: Item | null): void, announce(message: string): void, history(can: { undo: boolean, redo: boolean }): void, copied(text: string): void, showPart(id: string | null): void, openLink(to: { path: string, part: string | null } | { url: string, app: boolean }, tab: boolean): void }} deps.ui
 *   `history`: whether there is anything to undo or redo, told whenever that may have changed
 * @param {Record<'stage'|'diagram'|'labelBox'|'find'|'findBox'|'findCount'|'findPrev'|'findNext'|'findCancel'|'findToggle', HTMLElement>} deps.els
 */
export function createEditor({ source, file, viewer, parse, limits, display, ui, els }) {
  // What is drawn may be selected and edited (a flowchart that rendered). While the code panel holds the lock (its code
  // being edited) it may still be selected, walked and found, but not edited (the user). Both set only by setEditable().
  let drawnEditable = false;
  let locked = false;
  let selectable = false;
  let editable = false;
  // The selection is kept for this tab per file in sessionStorage, so Back, Forward or a reload to a file selects
  // again what was selected there, if it is still drawn (rendered()).
  const selectionKey = () => 'merma:selection:' + file;
  /** The selection kept for the file shown, or null. */
  function keptSelection() {
    try {
      const s = JSON.parse(sessionStorage.getItem(selectionKey()) ?? 'null');
      return s && typeof s.kind === 'string' && typeof s.id === 'string' ? /** @type {Item} */ ({ kind: s.kind, id: s.id }) : null;
    } catch { return null; }
  }
  function keepSelection(/** @type {Item | null} */ sel) {
    try {
      if (sel) sessionStorage.setItem(selectionKey(), JSON.stringify({ kind: sel.kind, id: sel.id }));
      else sessionStorage.removeItem(selectionKey());
    } catch { /* storage unavailable: the selection just is not kept */ }
  }
  /** @type {Item | null} */
  let selected = keptSelection();
  let restoring = Boolean(selected);   // the first drawing selects the kept item, any kind, if it is drawn
  /** @type {string} the text on screen, which edge ids refer to */
  let shownText = '';
  /** @type {{ subs: import('./collapse.mjs').SubgraphInfo[], overrides: import('./collapse.mjs').Overrides }} */
  let collapse = { subs: [], overrides: new Map() };   // how the shown drawing's subgraphs are collapsed
  /** @type {Map<string, string>} each node's link in the shown drawing, as Mermaid read it (viewer.read) */
  let links = new Map();
  let edgesOk = false;        // the edges on screen match the text's, so edges can be selected and nodes deleted
  /**
   * The pick of a node or subgraph (clicked, or Enter on the candidate), and what it does:
   * Connect to… makes an edge to it, Connect from… one from it to the selection; the reassign pick moves that end of the
   * selected edge there (`start` or `end`, which Space swaps); Merge into… merges the selected node into it; Move into…
   * (`into`) moves the selected node or subgraph into it, a subgraph.
   * @type {null | 'connect' | 'connect-from' | 'start' | 'end' | 'merge'}
   */
  let picking = null;
  /** @type {Item | null} while picking by keys: the node or subgraph the arrows have reached, which Enter picks */
  let candidate = null;
  /** @type {Item | null} what Escape last cleared, for Enter to bring back; a click on empty space forgets it */
  let cleared = null;
  /** @type {import('./navigate.mjs').Cursor | null} where the keys were then, an edge's counted end with it */
  let clearedCursor = null;
  /** @type {{ x: number, y: number } | null} where the empty-space menu was opened, in stage coordinates */
  let spaceAt = null;
  /**
   * What to select once the text an edit saved is drawn, with the label box on it for a node or subgraph just added.
   * Good for that text only: an edge is found by its place in it. `clicked`: an item clicked while the edit saved,
   * whose menu opens even though the edit closed every menu. `others`: where to go instead, in order, when `item` is
   * not drawn; `reveal`: brought into view and read out, as a key's selection is, after `say` (what was done) in one
   * line.
   * @type {{ text: string, item: Item, label?: boolean, menu?: boolean, clicked?: boolean, others?: Item[], reveal?: boolean, say?: string, far?: boolean, came?: import('./navigate.mjs').Fan | null } | null}
   */
  let pending = null;
  let history = createHistory();
  /** @type {Map<string, ReturnType<typeof createHistory>>} each file's undo history, kept for the page's life */
  const histories = new Map([[file, history]]);
  /**
   * For each history entry, what was selected just before its edit, and what its edit selected after (with where to go
   * instead): undo selects the first, redo the second, each against exactly the text it puts back. An edge keeps its
   * counted end with it (`came`), so the tick comes back where it was.
   * @typedef {{ item: Item, came?: import('./navigate.mjs').Fan | null }} Kept
   * @type {WeakMap<import('./history.mjs').Entry, { before: Kept | null, after: (Kept & { others?: Item[], far?: boolean }) | null }>}
   */
  const selections = new WeakMap();
  /** @type {Item | null} what the last edit, undo or redo left selected: redo moves the selection only from there */
  let settled = null;
  let busy = false;           // an edit or undo is being checked or saved; input meanwhile is ignored
  /**
   * @type {(Item & { entry: import('./history.mjs').Entry, view: ReturnType<typeof viewer.getView>, moved: boolean }) | null}
   * while what was just added is named: its name belongs to its add. `view`: the view before the add, which Escape puts
   * back unless the user `moved` it since.
   */
  let naming = null;
  /** @type {{ text: string, view: ReturnType<typeof viewer.getView> } | null} an add taken back: its view, once drawn */
  let viewBack = null;
  /** @type {Item | null} while the label box is open over it */
  let labelling = null;
  let refused = false;        // the notice shows why a menu item does not apply
  /**
   * The node or subgraph last copied, in this tab.
   * @type {{ kind: 'node', copy: import('./patch/flowchart.mjs').Copied, name: string }
   *   | { kind: 'subgraph', copy: import('./patch/flowchart.mjs').CopiedSubgraph, name: string } | null}
   */
  let copied = null;
  /**
   * The node or subgraph cut, in this tab: the paste items move it. A subgraph with no id in the file keeps its
   * `title`, since Mermaid numbers such subgraphs by their place and an edit from outside can renumber them.
   * @typedef {{ kind: 'node' | 'subgraph', id: string, name: string, title: string | null }} Cut
   * @type {Cut | null}
   */
  let cut = null;
  /** The cut each move of a cut item used: undoing the move cuts it again, redoing it drops that cut (the user). */
  const cutsMoved = /** @type {WeakMap<import('./history.mjs').Entry, Cut>} */ (new WeakMap());
  let swallowClick = false;   // a click away from the label box that could not save it: the click does nothing
  let keptClick = false;      // a click away that kept an emptied label: its notice outlasts the click
  /** @type {{ item: Item, menu: boolean, clicked: true } | null} an item clicked while an edit saves: selected once drawn */
  let clickedMeanwhile = null;

  /** The drawing's elements that match `selector`: SVG, apart from labels' HTML. */
  const drawn = (/** @type {string} */ selector) => /** @type {SVGElement[]} */ ([...els.stage.querySelectorAll(selector)]);
  const nodeEl = (/** @type {string} */ id) => drawn('g.node[data-page-node]').find((g) => g.dataset.pageNode === id);
  const edgeEls = (/** @type {string} */ id) => drawn('[data-page-edge]').filter((e) => e.dataset.pageEdge === id);
  const clusterEl = (/** @type {string} */ id) => drawn('[data-page-subgraph]').find((g) => g.dataset.pageSubgraph === id);
  /** The diagram's title (frontmatter `title:`), as Mermaid draws it over a flowchart. */
  const titleEl = () => drawn('text.flowchartTitleText')[0];
  const TITLE = /** @type {Item} */ ({ kind: 'title', id: '' });
  /**
   * What is drawn for an item: a node's or a subgraph's group, or an edge's line, hit path and label.
   * @returns {SVGElement[]}
   */
  const elsOf = (/** @type {Item} */ sel) => {
    if (sel.kind === 'edge') return edgeEls(sel.id);
    if (sel.kind === 'title') { const el = titleEl(); return el ? [el] : []; }
    const el = sel.kind === 'node' ? nodeEl(sel.id) : clusterEl(sel.id);
    return el ? [el] : [];
  };
  const selectedEl = () => selected && elsOf(selected)[0];
  /**
   * The node, edge or subgraph a click on `target` is on, or null. Nodes and edges are drawn over subgraphs.
   * @returns {Item | null}
   */
  function itemAt(/** @type {Element} */ target) {
    const node = (/** @type {SVGElement | null} */ (target.closest('g.node[data-page-node]')))?.dataset.pageNode;
    if (node) return { kind: 'node', id: node };
    const edge = edgesOk && (/** @type {SVGElement | null} */ (target.closest('[data-page-edge]')))?.dataset.pageEdge;
    if (edge) return { kind: 'edge', id: edge };
    if (target.closest('text.flowchartTitleText')) return TITLE;
    const subgraph = (/** @type {SVGElement | null} */ (target.closest('[data-page-subgraph]')))?.dataset.pageSubgraph;
    return subgraph ? { kind: 'subgraph', id: subgraph } : null;
  }
  const same = (/** @type {Item | null} */ a, /** @type {Item | null} */ b) => a?.kind === b?.kind && a?.id === b?.id;
  const selectedNode = () => (selected?.kind === 'node' ? selected.id : null);
  const selectedSubgraph = () => (selected?.kind === 'subgraph' ? selected.id : null);
  /** The label element of a node, or the title element of a subgraph. */
  const labelEl = (/** @type {Item} */ sel) => /** @type {HTMLElement | null} */ (
    (sel.kind === 'node' ? nodeEl(sel.id) : clusterEl(sel.id))?.querySelector('.nodeLabel'));
  /**
   * An item as messages name it: a node or a subgraph by its label or title as drawn, in quotes, on one line (one
   * drawn with none by its id); an edge by its two ends; the diagram's title as "the title".
   * @returns {string}
   */
  const named = (/** @type {Item} */ sel) => {
    if (sel.kind === 'title') return `the title "${(titleEl()?.textContent ?? '').trim()}"`;
    if (sel.kind === 'edge') {
      const e = shownEdge(sel.id);
      if (!e) return 'the edge';
      const end = (/** @type {string} */ id) => /** @type {string} */ (named({ kind: nodeEl(id) ? 'node' : 'subgraph', id }));
      const label = edgeEls(sel.id).find((x) => x.matches('g.edgeLabel'))?.textContent?.trim();
      if (e.from === e.to) return `the self-loop ${label ? `"${label}" ` : ''}on ${end(e.from)}`;
      return `the edge ${label ? `"${label}" ` : ''}from ${end(e.from)} to ${end(e.to)}`;
    }
    return `"${(labelEl(sel)?.innerText ?? sel.id).trim().replace(/\s+/g, ' ') || sel.id}"`;
  };
  /**
   * Whether an edit naming subgraph `id` is good only for the text it was drawn from: one with no id in the file is
   * known by Mermaid's `subGraph<k>`, which renumbers when subgraphs come and go.
   */
  const drawnOnly = (/** @type {string} */ id) => !subgraphs(shownText).find((s) => s.id === id)?.written;
  /**
   * Refuse, with a warning, an edit that would need an id written for a subgraph the file already names otherwise: for
   * the ways in that pass no menu, which grays its items instead.
   */
  function refuseUnnamed(/** @type {string} */ id) {
    const why = subgraphRefusal(shownText, id);
    if (why) ui.notice(why, 'warning');
    return Boolean(why);
  }
  /** What a node or subgraph is drawn as: itself, or the collapsed subgraph's box hiding it. */
  const drawnEnd = (/** @type {string} */ id) => drawnAs(id, collapse.subs, collapse.overrides);
  /** A drawn edge, its ends as drawn: one hidden in a collapsed subgraph is that subgraph's box. */
  const shownEdge = (/** @type {string} */ id) => {
    const e = edges(shownText).find((x) => x.svgId === id);
    return e && { ...e, from: drawnEnd(e.from), to: drawnEnd(e.to) };
  };
  /** A drawn node's shape as written, or null for one these edits cannot read (an id they do not take). */
  const shownShape = (/** @type {string} */ id) => { try { return shapeOf(shownText, id); } catch { return null; } };
  const input = /** @type {HTMLTextAreaElement} */ (els.labelBox);

  /** What a press says while another edit is still saving. */
  const BUSY = 'Another edit is still saving. Try again once it has saved.';
  /** The start of what a refused save says; the reason follows, as a sentence of its own. */
  const NOT_SAVED = 'Your change was not saved. ';
  /** Say why something was refused. Under the lock its notice already says why, so the refusal is shorter. */
  const refuse = (/** @type {string} */ why) => ui.notice(why === LOCKED ? "The diagram can't be edited while the code is being edited." : why, 'warning');
  /** Say why nothing happens while the code panel holds the lock; false when it does not. */
  function refuseLocked() {
    if (locked) refuse(LOCKED);
    return locked;
  }

  function setEditable() {
    selectable = drawnEditable;
    editable = drawnEditable && !locked;
    els.stage.classList.toggle('selectable', selectable);
    els.diagram.classList.toggle('locked', locked);
    if (!selectable) { closeFind(null); deselect({ keep: true }); }
    if (!editable) closeLabelBox();
    historyChanged();
  }
  const historyChanged = () => ui.history({ undo: editable && history.size > 0, redo: editable && history.redoSize > 0 });

  // --- the menus -----------------------------------------------------------------------------------------------

  // What each menu item does (menu-items.mjs lists them). An item with a submenu does nothing itself.
  /** The selection, where a menu item or a key acts on it: there is one. */
  const selection = () => /** @type {Item} */ (selected);

  /** The end of the picking edge being moved, if this pick is the reassign pick. */
  const movingEnd = () => (picking === 'start' || picking === 'end' ? picking : null);
  /**
   * Reassign end… or Reassign start… on the selected edge: it moves the end `end`, the one its key names. The candidate starts on the edge
   * itself, as Connect to…'s does on its item (the user), the arrows going on from that end.
   */
  function startMove(/** @type {'start' | 'end'} */ end) {
    if (!shownEdge(selection().id)) return;
    picking = end;
    moves.forgetCandidate(moves.came());
    markCandidate(selection(), { quiet: true });
    pickNotice();
  }

  /**
   * In the reassign pick, move the other end (Space), or `to` (a click on the edge's line). Only the moving end changes,
   * and the notice stays; a candidate on the edge counts from the new end, as the tick shows.
   */
  function swapMovingEnd(/** @type {'start' | 'end'} */ to) {
    if (!movingEnd() || to === picking) return;
    picking = to;
    const id = selection().id;
    if (candidate && same(candidate, selection())) moves.candidateFrom(to === 'end' ? otherEnd(layout(), id, null) : null);
    markSource();
    // The notice stays (the user), and the tick is only seen: a screen reader hears which end moves now.
    ui.announce(`Reassigning the edge's ${to}`);
  }

  /** Merge into…: the candidate starts on the selected node. */
  function startMerge() {
    picking = 'merge';
    moves.forgetCandidate();
    markCandidate(selection(), { quiet: true });
    pickNotice();
  }

  /** Connect to… or Connect from…: the candidate starts on the item itself (the user): Enter at once makes a self-loop. */
  function startConnect(/** @type {'connect' | 'connect-from'} */ way) {
    picking = way;
    moves.forgetCandidate();
    markCandidate(selection(), { quiet: true });
    pickNotice();
  }
  /**
   * Insert node on the selected edge: a new node in its middle, its label box open. The node goes in on the tick's
   * side of the label, which stays on the other new edge (the user: the tick lies between the label and that end).
   */
  function startInsert() {
    const id = selection().id;
    const side = endSide === 'end' ? 'first' : 'second';
    addAndName((text) => insertNode(text, id, { side }), null, 'node', true);
  }

  /**
   * Copy node or Copy subgraph: the selection, as it is now, to the page's clipboard (and the system's, as Mermaid
   * text).
   */
  function copySelected() {
    const sel = selection();
    try {
      copied = sel.kind === 'subgraph' ? { kind: 'subgraph', copy: copySubgraph(shownText, sel.id), name: named(sel) }
        : { kind: 'node', copy: copyNode(shownText, sel.id), name: named(sel) };
    } catch (e) { refuse(e.message || String(e)); return; }
    dropCut();
    ui.copied(copied.kind === 'subgraph' ? copiedSubgraphText(copied.copy) : copiedText(copied.copy));
    ui.announce(`Copied ${copied.name}`);
  }

  /** The title written for subgraph `id` when it has no id in the file, else null. */
  const titleOf = (/** @type {string} */ id) => {
    const sg = subgraphs(shownText).find((g) => g.id === id);
    return sg && !sg.written ? shownText.slice(sg.title.start, sg.title.end) : null;
  };
  /** Cut node or Cut subgraph: the selection, marked dashed until a paste moves it or Escape drops it. It replaces any copy. */
  function cutSelected() {
    const sel = selection();
    if (sel.kind !== 'node' && sel.kind !== 'subgraph') return;
    copied = null;
    cut = { kind: sel.kind, id: sel.id, name: named(sel), title: sel.kind === 'subgraph' ? titleOf(sel.id) : null };
    markCut();
    ui.announce(`Cut ${cut.name}`);
  }
  /** Drop the cut, and its mark. */
  function dropCut() {
    cut = null;
    markCut();
  }
  /**
   * Mark the cut node dashed, and nothing else. A cut whose node is gone from the file is dropped; one hidden in a
   * collapsed subgraph is kept, unmarked, and marked again once it is drawn.
   */
  function markCut() {
    clearMarks('data-page-cut');
    glowCut();
    if (!cut) return;
    const there = cut.kind === 'node' ? hasNode(shownText, cut.id)
      : subgraphs(shownText).some((g) => g.id === cut?.id) && titleOf(cut.id) === cut.title;
    if (!there) { cut = null; glowCut(); return; }
    for (const e of elsOf({ kind: cut.kind, id: cut.id })) mark(e, 'data-page-cut');
  }
  let shiftHeld = false;
  /** @type {string | null} the action of the menu item with focus, while a menu is open */
  let menuFocus = null;
  /**
   * A cut node's edges glow while it is cut, as a pick's moving edges do (the user), under a marker of their own, since
   * a pick's glow goes with each selection. Pale red where the paste would delete them: on an edge, where the move
   * applies; with Shift held or "Move node here without edges" focused in a menu, where that applies. A cut subgraph's
   * edges never change in its move, so they do not glow.
   */
  function glowCut() {
    for (const e of drawn('[data-page-cut-glow]')) e.remove();
    if (cut?.kind !== 'node') return;
    const id = cut.id;
    const list = selected ? MENUS[isBox(selected) ? 'box' : selected.kind] : MENUS.space;
    const action = selected?.kind === 'edge' ? 'paste-node' : (shiftHeld || menuFocus === 'paste-node-bare') ? 'paste-node-bare' : null;
    const item = action && !picking ? list.find((i) => i.action === action) : undefined;
    const red = Boolean(item && applies(item, menuState()));
    const own = drawnEdges(edges(shownText), collapse.subs, collapse.overrides).filter((e) => e.from === id || e.to === id);
    for (const { svgId } of own) {
      const path = edgeEls(svgId).find((x) => x.matches('path:not([data-page-only])'));
      if (!path) continue;
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      glow.setAttribute('d', path.getAttribute('d') ?? '');
      glow.setAttribute('data-page-cut-glow', red ? 'delete' : '');
      glow.setAttribute('data-page-only', '');   // the SVG export leaves it out
      path.before(glow);
    }
  }
  /**
   * What Delete subgraph and contents would take, pale red, before it is pressed (docs/ux.md, the Shift rule): with a
   * subgraph selected and Shift held, or the item focused or hovered in its menu, where it applies. Its contents are
   * marked, not the selected box, which shows the selection: each node and box drawn in it gets a wide pale band under
   * its shape, and each edge that would go glows.
   */
  function glowDoomed() {
    for (const e of drawn('[data-page-doomed]')) e.remove();
    if (selected?.kind !== 'subgraph' || picking) return;
    if (!shiftHeld && menuFocus !== 'delete-subgraph-contents') return;
    const item = /** @type {import('./menu-items.mjs').MenuItem} */ (MENUS[isBox(selected) ? 'box' : 'subgraph']
      .find((i) => i.action === 'delete-subgraph-contents'));
    if (!applies(item, menuState())) return;
    const sgs = subgraphs(shownText);
    const { nodes, tree, edges: gone } = contentsOf(shownText, selected.id, sgs);
    const band = (/** @type {Element} */ shape) => {
      const copy = /** @type {Element} */ (shape.cloneNode(false));
      copy.removeAttribute('id');
      copy.removeAttribute('class');
      copy.removeAttribute('style');
      // An edge's arrowheads are its markers: the band has none, as the cut's glow has none.
      copy.removeAttribute('marker-start');
      copy.removeAttribute('marker-end');
      copy.setAttribute('data-page-doomed', '');
      copy.setAttribute('data-page-only', '');   // the SVG export leaves it out
      shape.before(copy);
    };
    for (const id of nodes) {
      for (const g of elsOf({ kind: 'node', id })) {
        for (const shape of g.querySelectorAll(':scope > :is(rect, polygon, circle, ellipse, path), :scope > g > :is(rect, polygon, circle, ellipse, path)')) {
          if (!shape.closest('.label')) band(shape);
        }
      }
    }
    for (const k of tree.slice(1)) {
      const box = clusterEl(/** @type {string} */ (sgs[k].id))?.querySelector(':scope > rect');
      if (box) band(box);
    }
    const ids = new Set(gone.map((e) => e.svgId));
    for (const { svgId } of drawnEdges(edges(shownText), collapse.subs, collapse.overrides).filter((e) => ids.has(e.svgId))) {
      const path = edgeEls(svgId).find((x) => x.matches('path:not([data-page-only])'));
      if (path) band(path);
    }
  }
  /** The glows that Shift and the focused menu item change: the cut's, and what deleting with contents would take. */
  const glows = () => { glowCut(); glowDoomed(); };
  /** Shift held or let go, read from every key and pointer event, since one pressed elsewhere sends no keydown here. */
  const holdShift = (/** @type {boolean} */ on) => { if (on !== shiftHeld) { shiftHeld = on; glows(); } };
  window.addEventListener('keydown', (e) => holdShift(e.shiftKey || e.key === 'Shift'), true);
  window.addEventListener('keyup', (e) => holdShift(e.key === 'Shift' ? false : e.shiftKey), true);
  for (const type of ['pointerdown', 'pointermove']) {
    window.addEventListener(type, (e) => holdShift(/** @type {PointerEvent} */ (e).shiftKey), true);
  }
  window.addEventListener('blur', () => holdShift(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) holdShift(false); });

  /**
   * Move node here: the cut node into the selected edge (its own edges deleted), inside the selected subgraph, into
   * the block of the selected node, or to the top level. `withEdges` false deletes its edges first. It stays
   * selected after, or the box it went into.
   */
  function moveCutHere(/** @type {boolean} */ withEdges) {
    const moving = /** @type {Cut} */ (cut);
    const { id, name } = moving;
    const sel = selected;
    const node = /** @type {Item} */ ({ kind: moving.kind, id });
    const nameOf = (/** @type {string} */ x) => named({ kind: 'node', id: x });
    /** @type {(text: string) => { text: string }} */
    let change;
    let where = 'here';
    if (moving.kind === 'subgraph') {
      const to = sel?.kind === 'subgraph' ? sel.id : sel?.kind === 'node' ? blockAround(sel) : null;
      change = (text) => moveSubgraph(text, id, to, nameOf);
      where = to === null ? 'to the top level' : `into ${named({ kind: 'subgraph', id: to })}`;
    } else if (sel?.kind === 'edge') {
      const svgId = sel.id, side = endSide === 'end' ? 'first' : 'second';
      change = (text) => moveIntoEdge(text, id, svgId, side, nameOf);
      where = 'into the edge';
    } else {
      const to = sel?.kind === 'subgraph' ? sel.id : sel?.kind === 'node' ? blockAround(sel) : null;
      change = (text) => moveCut(text, id, to, withEdges, nameOf);
      where = to === null ? 'to the top level' : `into ${named({ kind: 'subgraph', id: to })}`;
    }
    const box = sel?.kind === 'subgraph' && isBox(sel) ? sel : null;
    editDrawn(change, {
      afterSave: (_, entry) => { cutsMoved.set(entry, moving); dropCut(); ui.announce(`Moved ${name} ${where}`); },
      // Into a collapsed subgraph, what moved is hidden there: its box is selected, and nothing is expanded.
      after: box ? () => ({ item: box }) : relocated(node),
    });
  }

  /**
   * Paste node: a new copy of the node last copied, onto the selected edge (inserted on the tick's side, as Insert node
   * does, with no other edges), inside the selected subgraph, in the block of the selected node, or at the top level.
   * `withEdges`: it gets the original's edges too, except on an edge. The copy is selected after.
   */
  function paste(/** @type {boolean} */ withEdges) {
    if (cut) { moveCutHere(withEdges); return; }
    if (!copied) return;
    const sel = selected;
    if (copied.kind === 'subgraph') {
      const { copy, name } = copied;
      const into = sel?.kind === 'subgraph' || sel?.kind === 'node' ? { kind: sel.kind, id: sel.id } : null;
      editDrawn((text) => pasteSubgraph(text, copy, into, withEdges), {
        afterSave: () => ui.announce(`Pasted ${name}`),
        after: (result) => ({ item: { kind: 'subgraph', id: result.id } }),
      });
      return;
    }
    const { copy, name } = copied;
    const into = sel?.kind === 'edge' ? { kind: /** @type {const} */ ('edge'), svgId: sel.id, side: endSide === 'end' ? /** @type {const} */ ('first') : /** @type {const} */ ('second') }
      : sel?.kind === 'subgraph' || sel?.kind === 'node' ? { kind: sel.kind, id: sel.id } : null;
    editDrawn((text) => pasteNode(text, copy, into, withEdges), {
      afterSave: () => ui.announce(`Pasted ${name}`),
      after: (result) => ({ item: { kind: 'node', id: result.id } }),
    });
  }

  /** Whether the pick makes an edge: Connect to… or Connect from…. */
  const connecting = () => picking === 'connect' || picking === 'connect-from';

  /** Rotate or flip the selected subgraph on its own, or with nothing selected the whole diagram. */
  function turnIt(/** @type {'rotate' | 'flip'} */ which) {
    const id = selectedSubgraph();
    const what = id ? named({ kind: 'subgraph', id }) : 'the diagram';
    const verb = which === 'rotate' ? 'Rotated' : 'Flipped';
    ui.turn(which, id).then((on) => { viewer.fit(); ui.announce(`${verb} ${what}${on ? '' : ' back'}`); });
  }

  /** @type {Record<string, string>} what each pick asks for: what is picked */
  const PICKED = {
    connect: 'node or subgraph to connect to', 'connect-from': 'node or subgraph to connect from',
    start: 'node or subgraph to reassign the edge to', end: 'node or subgraph to reassign the edge to',
  };
  /**
   * What the pick is, and how to leave it (docs/ux.md, Messages: not how to pick): the pick's notice, held while it
   * lasts.
   */
  function pickNotice() {
    const what = picking === 'merge' ? `node to merge ${named(selection())} into`
      : PICKED[picking ?? 'connect'];
    ui.mode(`Pick the ${what}. Press Escape or click away to cancel.`);
  }

  /** @type {Record<string, () => void>} */
  const handlers = {
    'add-connected-node': () => { const from = selection().id; addAndName((text) => addConnected(text, from)); },
    'connect': () => startConnect('connect'),
    'connect-from': () => startConnect('connect-from'),
    'reassign-end': () => startMove('end'),
    'reassign-start': () => startMove('start'),
    'merge-into': () => startMerge(),
    'open-link': () => openLink(false),
    'open-link-tab': () => openLink(true),
    'show-link': () => {
      const link = links.get(selection().id);
      if (link) ui.notice(`This node links to: ${link}`, 'info');
    },
    'edit-link': () => editLink(),
    'edit-node': () => openLabelBox(selection()),
    'edit-label': () => openLabelBox(selection()),
    'edit-title': () => openLabelBox(selection()),
    'delete-node': () => deleteSelected(),
    'delete-edge': () => deleteSelected(),
    'delete-subgraph': () => deleteSelected(),
    'delete-subgraph-contents': () => deleteSelected(true),
    'insert-node': () => startInsert(),
    'copy-node': () => copySelected(),
    'copy-subgraph': () => copySelected(),
    'cut-node': () => cutSelected(),
    'cut-subgraph': () => cutSelected(),
    'paste-node': () => paste(true),
    'paste-node-bare': () => paste(false),
    'reverse-edge': () => { const id = selection().id; editDrawn((text) => reverseEdge(text, id), { after: sameEdge(id) }); },
    'add-node': () => {
      const subgraph = selectedSubgraph();
      addAndName((text) => addNode(text, { subgraph }), subgraph);
    },
    'add-subgraph': () => {
      const parent = selectedSubgraph();
      addAndName((text) => addSubgraph(text, { parent }), parent, 'subgraph');
    },
    // Page-only (collapse.mjs): the file is not written, and no undo step is made.
    'collapse-subgraph': () => { const { id } = selection(); ui.setView(id, 'collapsed').then(() => ui.announce(`Collapsed ${named({ kind: 'subgraph', id })}`)); },
    'expand-subgraph': () => { const { id } = selection(); ui.setView(id, 'expanded').then(() => ui.announce(`Expanded ${named({ kind: 'subgraph', id })}`)); },
    // The whole diagram, leaving a part (main.mjs) if one is shown: F is the way back (the user).
    'fit-view': () => ui.showPart(null),
    // Page-only, as the address's part (main.mjs): every refit fits it, until F fits the whole diagram.
    'fit-subgraph': () => ui.showPart(selection().id),
    // A node or an edge (with its label) fitted to the window, the address unchanged: only a subgraph is a part.
    'fit-node': () => viewer.fitRects(elsOf(selection()).map((e) => e.getBoundingClientRect()).filter((r) => r.width || r.height)),
    'fit-edge': () => viewer.fitRects(elsOf(selection()).map((e) => e.getBoundingClientRect()).filter((r) => r.width || r.height)),
    // Page-only (turn.mjs), as collapse is: the whole diagram, or the selected subgraph on its own. A turn is for
    // fitting the window (the user), so it fits after.
    'rotate': () => turnIt('rotate'),
    'flip': () => turnIt('flip'),
    'find': () => openFind(),
    // The selection in the middle of the view, at the zoom it has (the user).
    'center-view': () => {
      const sel = selection();
      let at = null;
      if (sel.kind === 'edge') at = layout().edges.find((e) => e.id === sel.id)?.mid ?? null;
      else {
        const r = elsOf(sel)[0]?.getBoundingClientRect();
        if (r) at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      if (at) viewer.center(at.x, at.y); else viewer.fit();
    },
  };
  // A handler for every action and an action for every handler: a typo in either would otherwise only show as a
  // menu item that does nothing.
  const actions = new Set(Object.values(MENUS).flat().filter((i) => !i.submenu).map((i) => i.action));
  for (const a of actions) if (!handlers[a]) throw new Error(`No handler for the menu action ${a}`);
  for (const a of Object.keys(handlers)) if (!actions.has(a)) throw new Error(`No menu item runs ${a}`);

  const arrowPicker = createPicker({
    title: 'Arrow type',
    entries: ARROW_TYPES,
    onPick: (arrow) => setArrow(selection().id, arrow),
  });
  /**
   * Give edge `id` the arrow type `arrow`, from the picker, which stays open on the new entry. The arrow type it has
   * already writes nothing.
   */
  function setArrow(/** @type {string} */ id, /** @type {string} */ arrow) {
    if (arrowType(shownEdge(id)?.arrow ?? '') === arrow) return;
    const name = ARROW_TYPES.find((a) => a.key === arrow)?.name;
    const again = sameEdge(id);
    editDrawn((text) => setEdgeArrow(text, id, arrow), {
      keep: true,
      after: (result) => { const next = again(result); return next && { ...next, menu: true }; },
      afterSave: () => ui.announce(`Changed the edge to ${name}`),
    });
  }
  const menuOptions = {
    parent: els.diagram,
    bounds: () => els.diagram.getBoundingClientRect(),
    returnFocus: els.diagram,
    submenus: {
      'arrow-types': arrowPicker,
    },
    onRun: (/** @type {string} */ action) => handlers[action](),
    onRefuse: (/** @type {string} */ why) => { refused = true; refuse(why); },
    // Only a menu's own notice goes with it; the one saying there is no edge match stays.
    onClose: () => { if (refused) ui.hideNotice(); refused = false; },
    onFocus: (/** @type {string | null} */ action) => { if (action !== menuFocus) { menuFocus = action; glows(); } },
  };
  const menus = Object.fromEntries(Object.entries(MENUS).map(([kind, items]) => [kind, createMenu(items, menuOptions)]));
  const closeMenus = () => { for (const m of Object.values(menus)) m.close(); };
  const menuOpen = () => menus.node.isOpen() || menus.edge.isOpen() || menus.subgraph.isOpen() || menus.box.isOpen()
    || menus.title.isOpen();
  /** A subgraph drawn collapsed, as one box. */
  const isBox = (/** @type {Item | null} */ sel) => sel?.kind === 'subgraph' && Boolean(clusterEl(sel.id)?.hasAttribute('data-page-collapsed'));
  /** The menu of `sel`'s kind; a collapsed subgraph's is the box's. */
  const menuOf = (/** @type {Item} */ sel) => menus[isBox(sel) ? 'box' : sel.kind];

  /** What the menus need to know to gray their items. */
  function menuState() {
    return {
      edgesOk,
      selfLoop: selected?.kind === 'edge' && shownEdge(selected.id)?.from === shownEdge(selected.id)?.to,
      nameWhy: selected?.kind === 'subgraph' ? subgraphRefusal(shownText, selected.id) : null,
      collapseWhy: selected?.kind === 'subgraph' && !collapse.subs.some((s) => s.id === selected?.id) ? NO_SUBGRAPH_MATCH : null,
      turn: ui.turned(selectedSubgraph()),
      turnWhy: selected?.kind === 'subgraph' ? turnWhy(selected.id) : null,
      insertWhy: selected?.kind === 'edge' ? insertWhy(selected.id) : null,
      locked,
      copied: copied?.kind ?? null,
      cut: cut?.kind ?? null,
      cutWhy: cutWhy(),
      partWhy: selected?.kind === 'subgraph' && !subgraphs(shownText).find((g) => g.id === selected?.id)?.written ? PART_UNNAMED : null,
      link: selected?.kind === 'node' ? linkOf(selected.id) : undefined,
      linkText: selected?.kind === 'node' ? links.get(selected.id) ?? null : null,
      linkScript: selected?.kind === 'node' && writtenLink(shownText, selected.id) === 'script',
    };
  }

  /** Where node `id`'s link leads, or why Open link does nothing (links.mjs). */
  function linkOf(/** @type {string} */ id) {
    return linkTarget(links.get(id), hasClick(shownText, id), file);
  }
  /** Open the selected node's link, in a new tab with `tab` (main.mjs). The menu and the keys gray it when it has none. */
  function openLink(/** @type {boolean} */ tab) {
    const to = linkOf(selection().id);
    if ('why' in to) return;
    ui.announce(`Opening ${'url' in to ? to.url : to.path}`);
    ui.openLink(to, tab);
  }

  /**
   * Edit link: the browser's prompt, holding the link as the file writes it; an emptied one is removed. The edit runs
   * on the file as it is once the prompt is answered, since the page cannot poll while the prompt is open.
   */
  function editLink() {
    if (busy) { ui.notice(BUSY, 'error'); return; }
    const node = selection();
    const now = writtenLink(shownText, node.id);
    const current = now && now !== 'script' ? now.url : null;
    const change = linkEdit(current, window.prompt(`Edit the link of ${named(node)}. Leave it empty to remove the link.`, current ?? ''));
    if (!change) return;
    edit((text) => ({ text: setLink(text, node.id, change.link) }), {
      after: () => ({ item: node }),
      afterSave: () => ui.announce(change.link === null ? 'Link removed' : 'Link saved'),
    });
  }

  /** Why the cut node or subgraph cannot be moved to the selection (Move … here), or null: it would not move. */
  function cutWhy() {
    if (!cut) return null;
    const item = /** @type {Item} */ ({ kind: cut.kind, id: cut.id });
    if (selected?.kind === 'edge') {
      if (cut.kind === 'subgraph') return "A subgraph can't be put into an edge.";
      const e = shownEdge(selected.id);
      return e && (e.from === cut.id || e.to === cut.id) ? "This edge is the node's own." : null;
    }
    if (selected?.kind === 'title') return null;
    const to = selected?.kind === 'subgraph' ? selected.id : selected?.kind === 'node' ? blockAround(selected) : null;
    if (cut.kind === 'subgraph' && to !== null && (to === cut.id || inside(to, cut.id))) {
      return "A subgraph can't be moved into itself.";
    }
    if (blockAround(item) !== to) return null;
    return to === null ? 'It is already at the top level.' : 'It is already in this subgraph.';
  }

  /** Why a node cannot be inserted into edge `id`: its line is in a collapsed subgraph, where N would be hidden. */
  function insertWhy(/** @type {string} */ id) {
    const e = shownEdge(id);
    if (!e) return null;
    const line = shownText.slice(0, e.statement.start).split('\n').length - 1;
    const sg = subgraphs(shownText).filter((g) => g.end !== null && g.start < line && line < g.end).at(-1);
    if (!sg?.id) return null;
    return drawnEnd(sg.id) !== sg.id || isBox({ kind: 'subgraph', id: sg.id }) ? INSERT_COLLAPSED : null;
  }
  /** Why the selected subgraph cannot be turned on its own, or null when it can (turn.mjs turnable). */
  function turnWhy(/** @type {string} */ id) {
    if (isBox({ kind: 'subgraph', id })) return 'This subgraph is collapsed. Expand it first (H) to turn it.';
    if (!collapse.subs.some((s) => s.id === id)) return NO_SUBGRAPH_MATCH;
    return turnable(id, collapse.subs, edges(shownText)) ? null : "Mermaid ignores this subgraph's direction, because a node inside it links outside it.";
  }

  // --- selection -----------------------------------------------------------------------------------------------

  // The page's marks: the selection, Connect to…'s candidate, find's matches and its current one. Mermaid writes
  // classDef, style and linkStyle colors inline with !important, which no stylesheet rule beats: while an item is
  // marked, its inline colors lose the !important (the original kept in data-page-style), so the mark's colors show.
  const MARKED = '[data-page-selected], [data-page-candidate], [data-page-source], [data-page-cut], [data-page-match], [data-page-current]';
  /** Give `el` the mark `attr`, loosening its inline colors. */
  const mark = (/** @type {Element} */ el, /** @type {string} */ attr) => {
    el.setAttribute(attr, '');
    for (const e of [el, ...el.querySelectorAll('[style*="important"]')]) {
      const style = e.getAttribute('style');
      if (!style?.includes('important')) continue;
      e.setAttribute('data-page-style', style);
      e.setAttribute('style', style.replaceAll('!important', ''));
    }
  };
  /** Take the marks `attrs` off everything, giving Mermaid's colors back where no mark is left. */
  const clearMarks = (/** @type {string[]} */ ...attrs) => {
    for (const attr of attrs) for (const e of drawn(`[${attr}]`)) e.removeAttribute(attr);
    for (const e of drawn('[data-page-style]')) {
      if (e.closest(MARKED)) continue;
      e.setAttribute('style', e.getAttribute('data-page-style') ?? '');
      e.removeAttribute('data-page-style');
    }
  };
  const unmark = () => {
    clearMarks('data-page-selected', 'data-page-candidate', 'data-page-source');
    for (const e of drawn('[data-page-end], [data-page-glow]')) e.remove();
    candidate = null;
  };
  /**
   * During a pick, what it will change (the user: solid is where the keys are, marked is what changes):
   * the selected node or subgraph outlined dashed in place of its selection, and each edge that will move glows, a
   * wide pale line under it, so its own dashes and arrowheads still read; in the reassign pick, the tick dashed at the
   * end that moves. A collapsed box's glow is only on its own
   * edges, the ones that move.
   */
  function markSource() {
    clearMarks('data-page-source');
    for (const e of drawn('[data-page-end], [data-page-glow]')) e.remove();
    if (!picking || !selected) return;
    const sel = selected, which = picking;
    for (const e of elsOf(sel)) { e.removeAttribute('data-page-selected'); mark(e, 'data-page-source'); }
    const moving = sel.kind === 'edge' ? [sel.id] : which !== 'merge' ? []
      : drawnEdges(edges(shownText), collapse.subs, collapse.overrides).filter((e) => e.from === sel.id || e.to === sel.id)
        .map((e) => e.svgId);
    for (const id of moving) {
      const path = edgeEls(id).find((x) => x.matches('path:not([data-page-only])'));
      if (!path) continue;
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      glow.setAttribute('d', path.getAttribute('d') ?? '');
      glow.setAttribute('data-page-glow', '');
      glow.setAttribute('data-page-only', '');   // the SVG export leaves it out
      path.before(glow);
    }
    if (movingEnd()) markEnd();
  }

  /** Select a node, an edge or a subgraph (it is outlined); with `menu`, also open its menu beside it. */
  function select(/** @type {Item} */ sel, /** @type {{ keepMode?: boolean, menu?: boolean, moving?: boolean }} */ { keepMode = false, menu = false, moving = false } = {}) {
    const was = candidate;
    unmark();
    // An item no longer drawn (the file changed under an open label box) cannot be selected.
    if (!elsOf(sel).length) { deselect(); return; }
    // A menu opened again for the same item stays open, so a change to the file does not reset it.
    const again = same(selected, sel);
    // A click, a find, an edit (not `moving`: a key, which keeps them): the trail starts again, and I forgets where you
    // were.
    if (!again && !moving) moves.forget();
    for (const [kind, m] of Object.entries(menus)) if (!(menu && again && kind === sel.kind)) m.close();
    selected = sel;
    keepSelection(sel);
    ui.selected(sel);
    for (const e of elsOf(sel)) mark(e, 'data-page-selected');
    if (sel.kind === 'edge') markEnd();
    if (!keepMode) picking = null;
    glows();
    // A pick kept through a new drawing: its marks again, the outline where it was if that is still drawn.
    if (picking) {
      markSource();
      if (was && elsOf(was).length) markCandidate(was, { quiet: true });
    }
    if (!menu || picking) return;
    if (sel.kind === 'edge') {
      const arrow = shownEdge(sel.id)?.arrow ?? '';
      arrowPicker.current(arrowType(arrow), arrow);
    }
    menuOf(sel).open(/** @type {Element} */ (selectedEl()).getBoundingClientRect(), menuState());
  }

  /** @type {'start' | 'end' | null} the end of the selected edge its mark is at */
  let endSide = null;
  /** Whether the edge leaves that end up or down, so its tick lies flat (else upright). */
  let endFlat = true;
  /**
   * Mark the end the selected edge counts as reached from, whose edges the cross arrows step (the user): the end
   * tick, a short bar across the way the edge leaves its node there (the user), flat or upright, never tilted, in the
   * stage so it moves with the diagram, sized in the diagram's units with a floor on screen, and slid along the line
   * to where it runs that way, clear of any text. `measure`: work out which end again (a new selection, a click, or
   * Space); else the same end, redrawn for a new zoom.
   */
  function markEnd(measure = true) {
    for (const e of drawn('[data-page-end]')) e.remove();
    if (selected?.kind !== 'edge') return;
    const id = selected.id;
    if (measure) {
      const { boxes, edges } = layout();
      const e = edges.find((x) => x.id === id);
      endSide = e ? (movingEnd() ?? countedEnd(boxes, e, moves.came())) : null;
      const key = e && (endSide === 'start' ? heading(e.start, e.startOut) : heading(e.end, e.endOut));
      endFlat = key === 'ArrowUp' || key === 'ArrowDown';
    }
    const path = /** @type {SVGPathElement | undefined} */ (edgeEls(id).find((e) => e.matches('path:not([data-page-only])')));
    const m = path?.getScreenCTM();
    if (!path || !m || !endSide) return;
    const k = Math.hypot(m.a, m.b) || 1, len = path.getTotalLength();
    const screen = (/** @type {DOMPoint} */ p) => ({ x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f });
    const texts = drawn('g.edgeLabel, .cluster-label, g.node .label, .flowchartTitleText')
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width);
    // In the diagram's units, as the line and its arrowhead are, so it grows and shrinks with them (the user); never
    // smaller on screen than END_TICK_MIN by END_STROKE_MIN.
    const width = Math.max(END_STROKE, END_STROKE_MIN / k), h = Math.max(END_TICK, END_TICK_MIN / k) / 2;
    /** The tick `d` in from the counted end, in the path's own units. */
    /** Whether the line at `at` runs within 30° of the way the edge leaves its node. */
    const runs = (/** @type {number} */ at) => {
      const a = path.getPointAtLength(Math.max(0, at - 1)), b = path.getPointAtLength(Math.min(len, at + 1));
      const t = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return Math.abs(endFlat ? b.y - a.y : b.x - a.x) / t >= Math.cos(Math.PI / 6);
    };
    const tick = (/** @type {number} */ d) => {
      const s = Math.min(len, d), at = endSide === 'start' ? s : len - s;
      const p = path.getPointAtLength(at);
      // Across the way the edge leaves its node (the user): flat for up or down, upright for sideways, never tilted.
      // `straight` where the line runs that way for the tick's width on both sides, so it crosses the line clear of
      // any bend rather than lying along it.
      const [nx, ny] = endFlat ? [h, 0] : [0, h];
      const straight = runs(at) && runs(Math.max(0, at - h)) && runs(Math.min(len, at + h));
      const centered = runs(at) && runs(Math.max(0, at - END_RUN)) && runs(Math.min(len, at + END_RUN));
      return { ends: [{ x: p.x - nx, y: p.y - ny }, { x: p.x + nx, y: p.y + ny }], straight, centered };
    };
    const clear = (/** @type {{ x: number, y: number }[]} */ ends) => {
      const [u, v] = ends.map((q) => screen(/** @type {DOMPoint} */ (q)));
      const r = { left: Math.min(u.x, v.x) - 3, right: Math.max(u.x, v.x) + 3, top: Math.min(u.y, v.y) - 3, bottom: Math.max(u.y, v.y) + 3 };
      return !texts.some((t) => r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top);
    };
    // Just past the arrowhead (or the node, at a plain end: the user wants it close, to be seen), then on along the
    // line, up to its middle, until it runs the way the edge leaves its node and no text is under it.
    const start = markerReach(path, endSide) + END_GAP + width / 2;
    // Zoomed out, a straight stretch can be shorter than the tick is wide: then straight for END_RUN either side will
    // do.
    const find = (/** @type {'straight' | 'centered'} */ need) => {
      for (let d = start; d <= len / 2; d += 3) {
        const at = tick(d);
        if (at[need] && clear(at.ends)) return at.ends;
      }
      return null;
    };
    // No stretch that way before the middle (the last one hides under the arrowhead, before a bend): at the
    // arrowhead's base, still across the way the edge leaves its node (the user).
    const ends = find('straight') ?? find('centered') ?? tick(start).ends;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    for (const [a, v] of Object.entries({ x1: ends[0].x, y1: ends[0].y, x2: ends[1].x, y2: ends[1].y })) el.setAttribute(a, String(v));
    el.setAttribute('stroke-width', String(width));
    // In the reassign pick, dashed as what the pick will change is: four dashes across, at any size.
    if (movingEnd()) { el.setAttribute('stroke-dasharray', String((2 * h) / 7)); el.setAttribute('data-page-moving', ''); }
    el.setAttribute('data-page-end', '');
    el.setAttribute('data-page-only', '');
    // Among the edges, so nodes paint over it: where a line starts inside a node's box, part of it hides. The user
    // prefers that to a tick over the node or slid clear of it.
    /** @type {Element} */ (path.parentNode).append(el);
  }

  /**
   * How far the marker at `side` of `path` (an arrowhead, a circle, a cross) reaches back along it from the end, in the
   * path's units; 0 with none. Mermaid's markers are sized in the diagram's units (userSpaceOnUse).
   */
  function markerReach(/** @type {SVGPathElement} */ path, /** @type {'start' | 'end'} */ side) {
    const id = path.getAttribute(`marker-${side}`)?.match(/#([^)]+)\)/)?.[1];
    const marker = id ? document.getElementById(id) : null;
    const box = /** @type {SVGMarkerElement | null} */ (marker)?.viewBox?.baseVal;
    if (!marker || !box?.width) return 0;
    const refX = Number(marker.getAttribute('refX')) || 0, w = Number(marker.getAttribute('markerWidth')) || 0;
    return (w * Math.max(refX - box.x, box.x + box.width - refX)) / box.width;
  }

  /**
   * After a click on an edge's line at (`x`, `y`): it counts from the end on the click's side (the user: every click
   * decides, so it is the same each time), split at its label where it has one, else at its middle, along the line.
   * A click on the label itself counts from its source.
   */
  function countFromClick(/** @type {Element} */ target, /** @type {number} */ x, /** @type {number} */ y) {
    const side = clickedSide(target, x, y);
    if (!side) return;
    moves.countFrom(side === 'end' ? otherEnd(layout(), /** @type {Item} */ (selected).id, null) : null);
    markEnd();
  }
  /** Which end of the selected edge a click on it at (`x`, `y`) is on, by countFromClick's rule; null off an edge. */
  function clickedSide(/** @type {Element} */ target, /** @type {number} */ x, /** @type {number} */ y) {
    if (selected?.kind !== 'edge') return null;
    const id = selected.id;
    const path = /** @type {SVGPathElement | undefined} */ (edgeEls(id).find((e) => e.matches('path:not([data-page-only])')));
    const m = path?.getScreenCTM();
    if (!path || !m) return null;
    const len = path.getTotalLength();
    /** How far along the line the point nearest (`px`, `py`) is. */
    const along = (/** @type {number} */ px, /** @type {number} */ py) => {
      let best = 0, near = Infinity;
      for (let s = 0; s <= len; s += 2) {
        const p = path.getPointAtLength(s);
        const d = Math.hypot(p.x * m.a + p.y * m.c + m.e - px, p.x * m.b + p.y * m.d + m.f - py);
        if (d < near) { near = d; best = s; }
      }
      return best;
    };
    const label = edgeEls(id).find((e) => e.matches('g.edgeLabel'))?.getBoundingClientRect();
    const split = label?.width ? along(label.left + label.width / 2, label.top + label.height / 2) : len / 2;
    return !target.closest('g.edgeLabel') && along(x, y) > split ? 'end' : 'start';
  }

  /** Let go of the selection; with `keep`, as the page does when nothing can be selected, the kept one stays kept. */
  function deselect({ keep = false } = {}) {
    unmark();
    selected = null;
    if (!keep) keepSelection(null);
    ui.selected(null);
    picking = null;
    closeMenus();
    glows();
  }

  // The empty-space menu, at the pointer: it adds a node or a subgraph at the top level. Mermaid lays the diagram out,
  // so what is added lands where the layout puts it, not where the menu was opened. It follows that point on a pan or
  // zoom.
  function openSpaceMenu(/** @type {number} */ x, /** @type {number} */ y) {
    deselect();
    spaceAt = viewer.toStage(x, y);
    menus.space.open({ left: x, top: y, right: x, bottom: y }, menuState(), { gap: 0 });
  }

  /**
   * Add a node or a subgraph (`kind`) and open the label box on it once it is drawn; naming it is part of the same undo
   * step. `into`: the subgraph it goes in, if any.
   * @param {(text: string) => { text: string, id: string }} change
   * @param {string | null} [into]
   * @param {'node' | 'subgraph'} [kind]
   */
  function addAndName(change, into = null, kind = 'node', drawn = false) {
    const view = viewer.getView();
    /** @type {EditOptions} */
    const options = {
      afterSave: (result, entry) => { naming = { kind, id: result.id, entry, view, moved: false }; },
      after: (result) => ({ item: { kind, id: result.id }, label: true }),
    };
    if (drawn || (into && drawnOnly(into))) editDrawn(change, options); else edit(change, options);
  }

  /** After an edit to the edge drawn as `id`: that edge again, found by its place, which no edit changes. */
  const sameEdge = (/** @type {string} */ id) => {
    const index = shownEdge(id)?.index;
    /** @returns {{ item: Item } | null} */
    return (/** @type {{ text: string }} */ result) => {
      const e = index === undefined ? undefined : edges(result.text)[index];
      return e ? { item: { kind: 'edge', id: e.svgId } } : null;
    };
  };

  /** Open the label box on a subgraph's title, unless writing it would need an id the file cannot take. */
  function editTitle(/** @type {Item} */ sel) {
    if (!refuseLocked() && !refuseUnnamed(sel.id)) openLabelBox(sel);
  }

  /**
   * An item clicked while an edit saves (most often one a click away from the label box started): once the edit's
   * text is drawn, select that item, not what the edit would select (the edited item, a new edge, a picker's item
   * with its menu). Clicks on empty space leave the edit's own choice.
   */
  function clickedDuringEdit(/** @type {Item | null} */ item, menu = false) {
    if (!item) return;
    // A node just added is then not named: its next label edit is not part of the add.
    if (pending?.label) naming = null;
    if (pending) pending = { ...pending, item, menu, label: false, clicked: true };
    else if (busy) clickedMeanwhile = { item, menu, clicked: true };
  }

  /** In a mode (a pick, the lock), the next key or click that acts takes away what was refused in it; its notice stays. */
  function clearRefusal() { if (picking || locked) ui.hideNotice(); }

  function clicked(/** @type {Element} */ target, /** @type {number} */ x = NaN, /** @type {number} */ y = NaN) {
    if (!selectable) return;
    if (ended()) return;
    clearRefusal();
    const item = itemAt(target);
    clickedDuringEdit(item);
    if (picking) {
      // In the reassign pick, a click on the edge itself makes it the candidate, and its side is the end that moves.
      const side = movingEnd() && item && same(item, selected) && !Number.isNaN(x) ? clickedSide(target, x, y) : null;
      if (side) {
        // Its arrows count from the clicked side, as a click on a selected edge's line does.
        moves.forgetCandidate(side === 'end' ? otherEnd(layout(), /** @type {Item} */ (item).id, null) : null);
        markCandidate(/** @type {Item} */ (item));
        swapMovingEnd(side);
      }
      else pick(item?.kind === 'edge' ? null : item);
      return;
    }
    // Said aloud as the keys' selection is (the user: screen readers within reason); a click away, only when it let go.
    if (item) {
      select(item);
      if (!Number.isNaN(x)) countFromClick(target, x, y);
      ui.announce(selectedSaid(item));
    } else {
      const had = Boolean(selected);
      deselect(); cleared = null; clearedCursor = null;
      if (!keptClick) ui.hideNotice();
      if (had) ui.announce('Nothing selected');
    }
    keptClick = false;
  }

  /** Leave Connect to… or a move with nothing done: by Escape or a click away. */
  function cancelPick() {
    picking = null;
    ui.mode(null);
    select(selection());
  }

  /** End the pick on `to`, a click's or Enter's (null: a click on empty space). */
  function pick(/** @type {Item | null} */ to) {
    if (connecting()) connectTo(to);
    else if (picking === 'start' || picking === 'end') moveTo(to);
    else mergeTo(to);
  }

  /** Where the selected node or subgraph is drawn: the subgraph around it, or null at the top level. */
  function blockAround(/** @type {Item} */ item) {
    const sgs = subgraphs(shownText);
    if (item.kind === 'node') return blockOf(shownText, item.id, sgs)?.id ?? null;
    const sg = sgs.find((g) => g.id === item.id && g.end !== null);
    return sg?.parent == null ? null : sgs[sg.parent].id;
  }
  /** After a move: the item again, found by its title when it is a subgraph Mermaid names by its place. */
  const relocated = (/** @type {Item} */ item) => {
    const sg = item.kind === 'subgraph' ? subgraphs(shownText).find((g) => g.id === item.id) : null;
    const title = sg && !sg.written ? shownText.slice(sg.title.start, sg.title.end) : null;
    /** @type {(result: { text: string }) => { item: Item } | null} */
    const next = (result) => {
      if (title === null) return { item };
      const now = subgraphs(result.text).find((g) => !g.written && result.text.slice(g.title.start, g.title.end) === title);
      return now ? { item: /** @type {Item} */ ({ kind: 'subgraph', id: /** @type {string} */ (now.id) }) } : null;
    };
    return next;
  };
  /** Whether subgraph `id` is inside subgraph `outer`. */
  const inside = (/** @type {string} */ id, /** @type {string} */ outer) => {
    const sgs = subgraphs(shownText);
    const a = sgs.find((g) => g.id === id), b = sgs.find((g) => g.id === outer);
    return Boolean(a && b && b.end !== null && a.start > b.start && a.start < b.end);
  };
  /** End Merge into… on `to`: the selected node merged into it, or nothing for null. */
  function mergeTo(/** @type {Item | null} */ to) {
    const from = selection();   // the pick starts on the selected node
    picking = null;
    ui.mode(null);
    if (!to) { deselect(); return; }
    if (to.kind !== 'node') { ui.notice("A node can only be merged into another node, not into a subgraph.", 'warning'); select(from); return; }
    // Onto itself: nothing to merge (the candidate starts there).
    if (same(to, from)) { select(from); return; }
    const names = [named(from), named(to)];
    let r = { text: '', moved: 0, dropped: 0 };
    editDrawn((text) => { r = mergeNode(text, from.id, to.id); return r; }, {
      afterSave: () => {
        const n = (/** @type {number} */ k, /** @type {string} */ what) => `${k} ${what}${k === 1 ? '' : 's'}`;
        const what = [r.moved ? `${n(r.moved, 'edge')} moved` : '', r.dropped ? `${n(r.dropped, 'duplicate')} dropped` : ''];
        ui.announce(`${names[0]} merged into ${names[1]}` + (r.moved || r.dropped ? `: ${what.filter(Boolean).join(', ')}` : ''));
      },
      after: () => ({ item: to }),
    });
  }

  /** End the reassign pick on `to`: the end being moved of the selected edge moved there, or nothing for null. */
  function moveTo(/** @type {Item | null} */ to) {
    const edge = selection();   // the pick starts on the selected edge
    const end = /** @type {'start' | 'end'} */ (picking);
    picking = null;
    ui.mode(null);
    if (!to) { deselect(); return; }
    if (to.kind === 'subgraph' && refuseUnnamed(to.id)) { select(edge); return; }
    // Onto the end it has: nothing changed, so nothing is written (the outline starts there).
    if (shownEdge(edge.id)?.[end === 'start' ? 'from' : 'to'] === to.id) { select(edge); return; }
    const name = named(to);
    editDrawn((text) => retarget(text, edge.id, end, to.id), {
      afterSave: () => ui.announce(`Moved the edge's ${end} to ${name}`),
      // Found by its place, which retarget returns; its counted end is the one moved, so the tick shows where it went.
      after: (result) => {
        const e = edges(result.text)[result.index];
        return e ? { item: { kind: 'edge', id: e.svgId }, far: end === 'end' } : null;
      },
    });
  }

  /** End Connect to… on `to`: an edge from the selection to it (Connect from…: from it to the selection), or nothing for null. */
  function connectTo(/** @type {Item | null} */ to) {
    const sel = selection();   // the pick starts on the selection
    const back = picking === 'connect-from';
    picking = null;
    ui.mode(null);
    if (!to) { deselect(); return; }
    if (to.kind === 'subgraph' && refuseUnnamed(to.id)) { select(sel); return; }
    deselect();
    const [from, end] = back ? [to, sel] : [sel, to];
    const names = [named(from), named(end)];
    const change = (/** @type {string} */ text) => connect(text, from.id, end.id);
    /** @type {EditOptions} */
    const options = {
      afterSave: () => ui.announce(`Connected ${names[0]} to ${names[1]}`),
      // The new edge is appended: it is the last.
      after: (result) => {
        const e = edges(result.text).at(-1);
        return e ? { item: { kind: 'edge', id: e.svgId } } : null;
      },
    };
    const drawn = [from, end].some((x) => x.kind === 'subgraph' && drawnOnly(x.id));
    if (drawn) editDrawn(change, options); else edit(change, options);
  }

  /** A right-click or long-press; or, `byKey`, the menu key or Shift+F10, which open what . opens. */
  function contextMenu(/** @type {Element} */ target, /** @type {number} */ x, /** @type {number} */ y, byKey = false) {
    if (!selectable) return false;
    if (byKey) { keys['.'](); return true; }
    if (picking) return true;
    if (ended()) return true;
    const item = itemAt(target);
    clickedDuringEdit(item, true);
    // On an edge, the tick goes to the clicked side, as a left click puts it, so the menu acts where you pointed.
    if (item) { select(item, { menu: true }); if (!Number.isNaN(x)) countFromClick(target, x, y); }
    else openSpaceMenu(x, y);
    return true;
  }

  /**
   * Make an edit that names what is drawn (an edge, a node to delete, a subgraph with no id in the file): only good
   * for the text it was drawn from.
   * @param {(text: string) => { text: string }} change
   * @param {EditOptions} [options]
   */
  function editDrawn(change, options = {}) {
    const drawnFrom = shownText;
    return edit((text) => {
      if (text !== drawnFrom) throw new Error('The diagram changed. Select it again.');
      return change(text);
    }, options);
  }

  /** Delete the selected node or edge. */
  /**
   * Delete the selection: a node or an edge; a subgraph alone (Delete subgraph: what it held stays) or, `contents`,
   * with everything in it (Delete subgraph and contents). On a node or an edge `contents` changes nothing.
   */
  function deleteSelected(contents = false) {
    const sel = selected;
    if (!sel || refuseLocked()) return;
    if (sel.kind === 'title') { ui.notice("Removing the title isn't supported. Edit it in the file.", 'warning'); return; }
    if (!edgesOk) { ui.notice(NO_EDGE_MATCH, 'warning'); return; }
    // Named before the edit: once deleted, the node is no longer drawn.
    const name = sel.kind !== 'edge' && named(sel);
    const count = (/** @type {number} */ n, /** @type {string} */ what) => `${n} ${what}${n === 1 ? '' : 's'}`;
    // Where the keyboard goes after (the user: it keeps its place): back along the trail to the first item still
    // drawn; with no trail, an edge's source (a node clicked: nothing). Taken now: the edit starts the trail afresh.
    const back = moves.fallback(sel);
    const source = sel.kind === 'edge' ? shownEdge(sel.id)?.from : null;
    if (source) back.push({ kind: subgraphs(shownText).some((g) => g.id === source) ? 'subgraph' : 'node', id: source });
    /** @type {(text: string) => { text: string, edges?: number, nodes?: number }} */
    const change = sel.kind === 'edge' ? (text) => deleteEdge(text, sel.id)
      : sel.kind === 'node' ? (text) => deleteNode(text, sel.id)
        : contents ? (text) => deleteSubgraphContents(text, sel.id) : (text) => deleteSubgraph(text, sel.id);
    editDrawn(change, {
      after: () => (back.length ? { item: back[0], others: back.slice(1), reveal: true } : null),
      afterSave: (result) => {
        if (sel.kind === 'edge') { ui.announce('Deleted the edge'); return; }
        const went = [...(result.nodes ? [count(result.nodes, 'node')] : []), ...(result.edges ? [count(result.edges, 'edge')] : [])];
        ui.announce(`Deleted ${name}` + (went.length ? `, ${went.join(' and ')}` : ''));
      },
    });
  }

  // Keys (GLOBAL_KEYS): Ctrl+Z (Cmd+Z) undoes; Ctrl+Shift+Z (Cmd+Shift+Z) or Ctrl+Y redoes (not Cmd+Y: Chrome on macOS
  // opens its History with it); N adds a node (connected to the selected node, or in the selected subgraph); Enter or F2
  // opens the selected node's panel, or edits the selected edge's label or subgraph's title, and with nothing selected
  // selects the node nearest the middle of the view; the arrows move a selected node along the edges; Delete or
  // Backspace deletes the selection; . opens the selection's menu, or with nothing selected the empty-space menu at the middle of the
  // diagram; F fits the diagram to the window, whatever is selected or being picked; with nothing selected the arrows move
  // the diagram; + (or =) and - zoom; Escape backs out of whatever is open. The view keys (VIEW_KEYS) also work when
  // the diagram is not editable (a sequence diagram still fits and moves).
  // None of them while the label box (or another field) has the keyboard; an open menu takes its own keys first.
  /** The edge menu's `action` by its key, on a selected edge: refused, saying why, where the menu grays it. */
  function edgeKey(/** @type {string} */ action) {
    if (picking || selected?.kind !== 'edge') return false;
    const item = /** @type {import('./menu-items.mjs').MenuItem} */ (MENUS.edge.find((i) => i.action === action));
    const state = menuState();
    if (!applies(item, state)) { refuse(whyNot(item, state)); return true; }
    handlers[action]();
    return true;
  }
  /** The node's or subgraph's menu `action` by its key, on a selected one: refused, saying why, where the menu grays it. */
  function itemKey(/** @type {string} */ action) {
    if (picking || (selected?.kind !== 'node' && selected?.kind !== 'subgraph')) return false;
    const item = MENUS[isBox(selected) ? 'box' : selected.kind].find((i) => i.action === action);
    if (!item) return false;
    const state = menuState();
    if (!applies(item, state)) { refuse(whyNot(item, state)); return true; }
    handlers[action]();
    return true;
  }
  /** The empty-space menu's `action` by its key, with nothing selected and no pick. */
  function spaceKey(/** @type {string} */ action) {
    if (picking || selected) return false;
    handlers[action]();
    return true;
  }
  /** Deselect, keeping what was selected for Enter or I to bring back. Whether anything was. */
  function letGo() {
    const had = Boolean(selected);
    if (selected) { cleared = selected; clearedCursor = moves.cursor(); }
    deselect();
    return had;
  }
  /** Select again what Escape or O let go of, as it was, or the box it is hidden in since. Whether there was one. */
  function bringBack() {
    if (cleared && elsOf(cleared).length) {
      // As it was (the user: an edge kept its counted end), so the keys go on from where they were.
      if (clearedCursor) moves.restore(clearedCursor);
      selectByKey(cleared, undefined, Boolean(clearedCursor));
      return true;
    }
    const box = cleared && (cleared.kind === 'node' || cleared.kind === 'subgraph') ? drawnEnd(cleared.id) : null;
    if (box && clusterEl(box)) { selectByKey({ kind: 'subgraph', id: box }); return true; }
    return false;
  }
  /** @type {[string, () => boolean][]} Escape's steps on the diagram, in order */
  const ESCAPE = [
    ['pick', () => Boolean(picking) && (cancelPick(), true)],
    // A cut is a pick spread over time: Escape drops it first, the selection kept; a click away does not.
    ['cut', () => Boolean(cut) && (dropCut(), ui.announce('Cut dropped'), true)],
    // Both go in one press.
    ['selection and notice', () => {
      const had = letGo();
      const hid = ui.hideNotice();   // in a mode, only what shows over its notice
      if (had) ui.announce('Nothing selected');   // after hideNotice, which empties the live regions
      return hid || had;
    }],
    ['code panel', () => ui.escape()],
  ];
  /** @type {Record<string, () => unknown>} what each key does, by name (below); truthy when it was used */
  const keys = {
    // S adds a subgraph: inside a selected subgraph, or with nothing selected at the top level, as their menus' S does.
    s: () => itemKey('add-subgraph') || spaceKey('add-subgraph'),
    n: () => {
      if (picking) return false;
      if (selected?.kind === 'edge') return edgeKey('insert-node');
      // On a subgraph, as its menu's N does: grayed on a collapsed box, whose new node would be hidden.
      if (selected?.kind === 'subgraph') return itemKey('add-node');
      const from = selectedNode();
      if (from) addAndName((text) => addConnected(text, from));
      else handlers['add-node']();
      return true;
    },
    // C starts Connect to… on a selected node or subgraph, as their menus' C does, refused as it is grayed there. While
    // picking it does nothing: Escape or a click away is the way out of every pick (the user), as the notice says.
    // C on an edge is Reassign end…: what the edge goes to, as C on a node picks what a new edge goes to.
    c: () => {
      if (picking) return true;
      if (edgeKey('reassign-end')) return true;
      if (selected?.kind !== 'node' && selected?.kind !== 'subgraph') return false;
      const item = /** @type {import('./menu-items.mjs').MenuItem} */ (MENUS[selected.kind].find((i) => i.action === 'connect'));
      const state = menuState();
      if (!applies(item, state)) { refuse(whyNot(item, state)); return true; }
      handlers.connect();
      return true;
    },
    // Shift+C, Reassign start… on an edge and Connect from… on a node: C the other way round (docs/ux.md), refused as
    // the menu grays it; nothing in a pick.
    'shift+c': () => (picking ? true : edgeKey('reassign-start') || itemKey('connect-from')),
    // R reverses a selected edge; with nothing selected it rotates the diagram, Shift+R flips it, as the empty-space
    // menu's R and Shift+R do. Nothing on a node or a subgraph, nor in a pick.
    r: () => edgeKey('reverse-edge') || spaceKey('rotate') || itemKey('rotate'),
    'shift+r': () => spaceKey('flip') || itemKey('flip'),
    enter: () => {
      // Enter on the edge being reassigned: nothing to do, as Enter at once on a node's own pick writes nothing.
      if (movingEnd() && candidate && same(candidate, selection())) return true;
      if (picking && candidate?.kind === 'edge') {
        ui.notice(connecting() ? 'An edge cannot be connected to.'
          : picking === 'merge' ? "An edge cannot take a node's place."
            : 'An edge cannot be attached to another edge.', 'warning');
        return true;
      }
      if (picking) { if (candidate) pick(candidate); return Boolean(candidate); }
      if (selected) { editLabelOrTitle(selected); return true; }
      if (bringBack()) return true;
      const r = els.diagram.getBoundingClientRect();
      const id = nearest(layout().boxes.filter((b) => b.kind === 'node'), r.left + r.width / 2, r.top + r.height / 2);
      if (id) selectByKey({ kind: 'node', id });
      return Boolean(id);
    },
    f2: () => selected && !picking && (editLabelOrTitle(selected), true),
    delete: () => selected && !picking && (deleteSelected(), true),
    backspace: () => selected && !picking && (deleteSelected(), true),
    // D deletes as Delete does (the user: the home row). With Shift, a subgraph goes with everything in it; a node or
    // an edge, which hold nothing, go as with D.
    d: () => selected && !picking && (deleteSelected(), true),
    'shift+d': () => selected && !picking && (deleteSelected(true), true),
    'shift+delete': () => selected && !picking && (deleteSelected(true), true),
    'shift+backspace': () => selected && !picking && (deleteSelected(true), true),
    // M is Merge into… on a node; nothing elsewhere.
    m: () => itemKey('merge-into'),
    // L follows a node's link; Shift+L in a new tab.
    l: () => itemKey('open-link'),
    'shift+l': () => itemKey('open-link-tab'),
    'ctrl+shift+l': () => itemKey('show-link'),
    k: () => itemKey('edit-link'),
    // . opens the selection's menu, or with nothing selected the empty-space menu, as the menu key and Shift+F10 do.
    '.': () => {
      if (picking) return false;
      if (selected) { select(selected, { menu: true }); return true; }
      const r = els.diagram.getBoundingClientRect();
      openSpaceMenu(r.left + r.width / 2, r.top + r.height / 2);
      return true;
    },
    // F fits the diagram; with an item selected, it centers it at the zoom it has instead (the user). The title, at
    // the diagram's top, is fitted with it.
    f: () => {
      if (!selected || selected.kind === 'title') handlers['fit-view'](); else handlers['center-view']();
      return true;
    },
    // Shift+F fits the selection, which F only centers: a subgraph as the part, as their menus' Shift+F does.
    'shift+f': () => edgeKey('fit-edge') || itemKey('fit-node') || itemKey('fit-subgraph'),
    ...Object.fromEntries(['Up', 'Down', 'Left', 'Right'].flatMap((d) => {
      const key = `Arrow${d}`, name = key.toLowerCase();
      return [[name, () => arrow(key, 'plain')], [`ctrl+${name}`, () => arrow(key, 'ctrl')], [`shift+${name}`, () => arrow(key, 'shift')]];
    })),
    // O from a top-level item selects nothing, as Escape does, so Enter or I brings it back.
    o: () => {
      const went = moves.out();
      if (went !== 'top') return went;
      letGo();
      ui.announce('Nothing selected');
      return true;
    },
    // I on a collapsed subgraph expands it first: what it holds must be drawn to go into. With nothing selected, it
    // goes back in to what O or Escape let go of.
    i: () => {
      if (!picking && !selected) return bringBack();
      const at = picking ? candidate : selected;
      if (!at || !isBox(at)) return moves.into();
      ui.setView(at.id, 'expanded').then(() => moves.into());
      return true;
    },
    // H collapses a selected subgraph, or expands it, as its menu's H does: page-only.
    h: () => {
      if (picking || selected?.kind !== 'subgraph') return false;
      const box = isBox(selected);
      const item = /** @type {import('./menu-items.mjs').MenuItem} */ (MENUS[box ? 'box' : 'subgraph']
        .find((i) => i.action === (box ? 'expand-subgraph' : 'collapse-subgraph')));
      const state = menuState();
      if (!applies(item, state)) { refuse(whyNot(item, state)); return true; }
      handlers[item.action]();
      return true;
    },
    '/': () => { openFind(); return true; },
    // Space: the selected edge counts as reached from its other end, whose edges the cross arrows then step. In
    // the reassign pick, the other end moves instead, wherever the candidate is (one edge moves: no other to mean).
    ' ': () => {
      const end = movingEnd();
      if (end) { swapMovingEnd(end === 'start' ? 'end' : 'start'); return true; }
      const to = moves.other();
      if (!to) return false;
      markEnd();
      const kind = drawn('[data-page-subgraph]').some((g) => g.dataset.pageSubgraph === to.id) ? 'subgraph' : 'node';
      ui.announce(`Reached from ${named(/** @type {Item} */ ({ kind, id: to.id }))}`);
      return true;
    },
    '+': () => { viewer.zoom(ZOOM_STEP); return true; },
    // 0 is actual size, as a browser's Ctrl+0 is (the user): the digits are the pickers' only.
    0: () => { viewer.zoomTo(1); return true; },
    '=': () => { viewer.zoom(ZOOM_STEP); return true; },
    '-': () => { viewer.zoom(1 / ZOOM_STEP); return true; },
    // Escape steps out one level, the first of these that lets go of something. Help
    // (main.mjs), a menu or submenu (menu.mjs), the label box and its shape picker, and the find box take it first, as
    // they hold focus; so does the code panel (code-panel.mjs) for its own levels while focus is in it. It is claimed
    // only when it let go of something, so that otherwise the browser's own use of it goes ahead.
    escape: () => ESCAPE.some(([, step]) => step()),
  };
  const VIEW_KEYS = ['f', 'shift+f', 'escape', '+', '=', '-', '0',
    ...['up', 'down', 'left', 'right'].flatMap((d) => [`arrow${d}`, `ctrl+arrow${d}`, `shift+arrow${d}`])];
  for (const k of Object.keys(GLOBAL_KEYS)) if (!keys[k]) throw new Error(`No handler for the key ${k}`);
  const editLabelOrTitle = (/** @type {Item} */ sel) => (sel.kind === 'subgraph' ? editTitle(sel) : openLabelBox(sel));

  /**
   * The diagram as navigate.mjs reads it, measured on screen: every node's and subgraph's box, each with the subgraph
   * it is drawn in, and (with an edge match) every edge with the points where its line meets its ends.
   */
  function layout() {
    const box = (/** @type {'node' | 'subgraph'} */ kind, /** @type {string} */ id, /** @type {Element} */ el) => {
      const r = el.getBoundingClientRect();
      return { kind, id, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    };
    const boxes = nest([
      ...drawn('g.node[data-page-node]').map((g) => box('node', /** @type {string} */ (g.dataset.pageNode), g)),
      ...drawn('[data-page-subgraph]').map((g) => box('subgraph', /** @type {string} */ (g.dataset.pageSubgraph),
        g.querySelector(':scope > rect') ?? g)),
    ]);
    /** @type {import('./navigate.mjs').Edge[]} */
    const lines = [];
    if (edgesOk) {
      const paths = new Map(drawn('path[data-edge="true"][data-page-edge]').map((p) => [p.dataset.pageEdge, p]));
      for (const e of edges(shownText)) {
        const path = /** @type {SVGPathElement | undefined} */ (paths.get(e.svgId));
        const m = path?.getScreenCTM();
        if (!path || !m) continue;
        const onScreen = (/** @type {number} */ at) => {
          const p = path.getPointAtLength(at);
          return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
        };
        const length = path.getTotalLength();
        const label = edgeEls(e.svgId).find((el) => el.matches('g.edgeLabel'))?.getBoundingClientRect();
        const mid = label?.width ? { x: label.left + label.width / 2, y: label.top + label.height / 2 } : onScreen(length / 2);
        // Which way the edge heads as it leaves each end: measured 20 px along, where a curve that leaves a corner has
        // already turned (40 px reads the early bend of a short edge as its heading).
        const along = Math.min(20, length / 2);
        lines.push({
          id: e.svgId, from: drawnEnd(e.from), to: drawnEnd(e.to), mid,
          start: onScreen(0), startOut: onScreen(along), end: onScreen(length), endOut: onScreen(length - along),
        });
      }
    }
    return { boxes, edges: lines };
  }
  /**
   * An arrow key, `how`: plain, with Ctrl (or Alt), or with Shift. With nothing selected it moves the diagram: plain a
   * tenth of the view, Ctrl half, Shift a fiftieth. With something selected (or in Connect to…, the candidate), plain
   * walks the edges and Ctrl jumps by place (keys.mjs); Shift does nothing yet.
   */
  function arrow(/** @type {string} */ key, /** @type {'plain' | 'ctrl' | 'shift'} */ how) {
    const [vx, vy] = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[key] ?? [0, 0];
    if (!selected) {
      const step = { plain: PAN_STEP, ctrl: PAN_BIG, shift: PAN_SMALL }[how];
      viewer.pan(vx * step, vy * step);
      return true;
    }
    if (how === 'shift') return false;
    moves.arrow(key, how === 'ctrl');
    return true;
  }
  const moves = createKeys({
    layout,
    select: (item) => selectByKey(item, undefined, true),
    markCandidate: (item) => markCandidate(item),
    notice: (message, kind) => ui.notice(message, kind),
    titleEl,
    state: { selected: () => selected, picking: () => picking !== null, candidate: () => candidate, edgesOk: () => edgesOk },
  });
  /** In Connect to…, the node or subgraph Enter would pick: outlined as the selection is, said aloud and brought into view. */
  function markCandidate(/** @type {Item} */ item, { quiet = false } = {}) {
    clearMarks('data-page-candidate');
    candidate = item;
    markSource();
    for (const e of elsOf(item)) mark(e, 'data-page-candidate');
    const what = item.kind === 'edge' ? (movingEnd() && same(item, selection()) ? 'the edge being reassigned'
      : movingEnd() ? 'an edge cannot be attached to another edge' : 'an edge, cannot be connected to')
      : picking === 'start' || picking === 'end' ? `press Enter to move the edge's ${picking} here`
        : !connecting() ? (same(item, selection()) ? 'itself: pick another node' : 'press Enter to merge into this')
        : same(item, selection()) ? 'press Enter to connect to itself' : 'press Enter to connect';
    // At the start the notice says it all; a screen reader hears that one line.
    if (quiet) return;
    ui.announce(`${named(item)}: ${what}`);
    reveal(item);
  }
  /** Bring `item` into view: all that is drawn for it, an edge's line and its label together, and any `more`. */
  function reveal(/** @type {Item} */ item, /** @type {DOMRect[]} */ more = []) {
    const rects = [...elsOf(item).map((e) => e.getBoundingClientRect()), ...more].filter((r) => r.width || r.height);
    if (!rects.length) return;
    const left = Math.min(...rects.map((r) => r.left)), right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top)), bottom = Math.max(...rects.map((r) => r.bottom));
    viewer.reveal(new DOMRect(left, top, right - left, bottom - top));
  }
  /** What a selection says aloud: the item, and where a node links, so the keyboard hears what the mouse sees. */
  function selectedSaid(/** @type {Item} */ item) {
    const link = item.kind === 'node' ? links.get(item.id) : undefined;
    return `${named(item)} selected${link && link !== 'about:blank' ? `, links to ${link}` : ''}`;
  }
  /**
   * Select from the keyboard: said aloud, since nothing else tells a screen reader, and brought into view; `moving`,
   * by an arrow, O or I, which keep the trail and I's place inside.
   */
  function selectByKey(/** @type {Item} */ item, /** @type {string | undefined} */ said = undefined, moving = false) {
    select(item, { moving });
    ui.announce(`${said ? `${said}; ` : ''}${selectedSaid(item)}`);
    reveal(item);
  }

  // --- find: / -------------------------------------------------------------------------------------------------

  // What was typed is matched against the whole diagram (find.mjs). Typing never moves the view; Tab and Shift+Tab
  // step through the matches, the first of them with any off screen moving the view once to show them all, so Escape
  // is the way out of the box. The selection is set aside meanwhile: Enter selects the current match; Escape puts back
  // the selection, and the view too unless the user moved it since; a click away puts back the selection and keeps
  // the view (docs/ux.md).
  const findBox = /** @type {HTMLInputElement} */ (els.findBox);
  /**
   * `view`: the view before the find, put back on Escape unless the user has `moved` it since. Inside a pick,
   * `candidate`: where the candidate was, put back unless Enter moves it to the current match.
   * @type {{ before: Item | null, candidate: Item | null, matches: import('./find.mjs').Findable[], at: number, view: ReturnType<typeof viewer.getView>, moved: boolean } | null}
   */
  let finding = null;
  /** What the last find looked for, shown again by the next. */
  let lastQuery = '';
  /** How much of the diagram area's top the find bar covers. */
  const underBar = () => (els.find.hidden ? 0 : els.find.getBoundingClientRect().bottom - els.diagram.getBoundingClientRect().top);
  /** What can be found, and whether each is drawn wholly on screen, not under the find bar. */
  function findables() {
    const area = els.diagram.getBoundingClientRect();
    const top = area.top + Math.max(0, underBar());
    /** @type {import('./find.mjs').Findable[]} */
    const out = [];
    const add = (/** @type {Item} */ item, /** @type {Element | null | undefined} */ el, /** @type {string} */ text) => {
      const r = el?.getBoundingClientRect();
      if (!r || !text.trim()) return;
      // Wholly inside the area, with no margin: one a few pixels from an edge is on screen and needs no move, though a
      // frame (viewer.frame) leaves a margin.
      const on = r.left >= area.left && r.right <= area.right && r.top >= top && r.bottom <= area.bottom;
      const box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      out.push({ kind: item.kind, id: item.id, text, x: r.left + r.width / 2, y: r.top + r.height / 2, box, on });
    };
    for (const g of drawn('g.node[data-page-node]')) {
      const item = /** @type {Item} */ ({ kind: 'node', id: g.dataset.pageNode });
      add(item, g, labelEl(item)?.innerText ?? '');
    }
    if (edgesOk) {
      for (const g of drawn('g.edgeLabel[data-page-edge]')) add({ kind: 'edge', id: /** @type {string} */ (g.dataset.pageEdge) }, g, g.textContent ?? '');
    }
    for (const g of drawn('[data-page-subgraph]')) {
      const item = /** @type {Item} */ ({ kind: 'subgraph', id: g.dataset.pageSubgraph });
      const title = g.querySelector(':scope > :is(.cluster-label, g.label)');
      add(item, title, labelEl(item)?.innerText ?? title?.textContent ?? '');
    }
    add(TITLE, titleEl(), titleEl()?.textContent ?? '');
    return out;
  }
  // The current match blinks (blink.mjs). The page's clock sets data-page-blink-off on the stage, which the styles
  // read, so re-marking never restarts it and every part of the match blinks together.
  const blink = createBlink();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let blinkTimer;
  /** Show the blink's phase now, and wake when it next changes. */
  function blinkTick() {
    clearTimeout(blinkTimer);
    const now = performance.now();
    els.stage.toggleAttribute('data-page-blink-off', blink.phase(now) === 'off');
    const wait = blink.next(now);
    // A wake a hair early would show the old phase again: aim just past the change.
    blinkTimer = wait === null ? undefined : setTimeout(blinkTick, wait + 5);
  }
  /** Mark the matches; `again` blinks the current one afresh even when it has not changed (a step, a typed change). */
  function markMatches(again = false) {
    clearMarks('data-page-match', 'data-page-current');
    const current = finding?.matches[finding.at];
    if (finding) {
      const { matches, at } = finding;
      // All that is drawn for it, as the selection marks: for an edge, its line as well as its label.
      matches.forEach((m, k) => {
        for (const el of elsOf(m)) {
          mark(el, 'data-page-match');
          if (k === at) mark(el, 'data-page-current');
        }
      });
      showCount();
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    blink.show(current ? `${current.kind}:${current.id}` : null, performance.now(), reduce, again);
    blinkTick();
  }
  function showCount() {
    if (finding) els.findCount.textContent = findBox.value.trim() ? countText(finding.matches, finding.at) : '';
  }
  /** Match again in what is drawn now, keeping the current match where it is still found. */
  function refind() {
    const f = /** @type {NonNullable<typeof finding>} */ (finding);
    const was = f.matches[f.at];
    f.matches = find(findables(), findBox.value);
    const still = was ? f.matches.findIndex((m) => same(m, was)) : -1;
    f.at = still >= 0 ? still : Math.min(f.at, Math.max(0, f.matches.length - 1));
  }
  /** Match what is in the box, the current match the best one on screen, and say what was found. */
  function matchTyped() {
    const f = /** @type {NonNullable<typeof finding>} */ (finding);
    f.matches = find(findables(), findBox.value);
    f.at = firstShown(f.matches);
    markMatches(true);
    const at = f.matches[f.at];
    const off = f.matches.filter((m) => !m.on).length;
    ui.announce(at ? `${f.matches.length} found${off ? `, ${off} off screen` : ''}; ${named(at)}` : findBox.value.trim() ? 'No match' : '');
  }
  function openFind() {
    if (finding) { findBox.focus(); return; }
    finding = { before: selected, candidate, matches: [], at: 0, view: viewer.getView(), moved: false };
    // Inside a pick the selection stays: it is what the pick acts on.
    if (!picking) deselect();
    ui.hideNotice();
    findBox.value = lastQuery;
    els.find.hidden = false;
    findBox.focus();
    findBox.select();
    matchTyped();
  }
  /**
   * Close the box: select `pick`, or put back what was selected before; `restore` (Escape) puts
   * back the view as well, unless the user has moved it since. Inside a pick, `pick` takes the candidate instead
   * (the user: Enter in find points, a second Enter picks), and without one the outline goes back where it was.
   */
  function closeFind(/** @type {Item | null} */ pick, restore = false) {
    const was = finding;
    if (!was) return;
    finding = null;
    lastQuery = findBox.value;
    markMatches();
    els.find.hidden = true;
    if (restore && !was.moved) {
      // A view never touched followed the window: fitting it again puts it back and keeps it following.
      if (was.view.touched) viewer.setView(was.view); else viewer.fit();
    }
    if (picking) {
      const to = pick ?? was.candidate;
      moves.forgetCandidate();
      if (to && elsOf(to).length) markCandidate(to, { quiet: !pick });
    // No reveal for a pick: Enter has centered one off screen, and one on screen stays put (an edge's line may not be).
    } else if (pick) { select(pick); ui.announce(selectedSaid(pick)); } else if (was.before && elsOf(was.before).length) select(was.before);
    if (findBox === document.activeElement) els.diagram.focus();
  }
  findBox.addEventListener('input', () => { if (finding) matchTyped(); });
  findBox.addEventListener('keydown', (e) => {
    if (!finding) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(null, true); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const at = finding.matches[finding.at];
      if (!at) return;
      // The candidate never rests on the title: the find stays open.
      if (picking && at.kind === 'title') { ui.notice('The title cannot be picked.', 'warning'); return; }
      // A jump to a match is to its middle (the user), so it is not left at the edge; one on screen stays put. The
      // candidate brings its own into view.
      if (!at.on && !picking) viewer.center((at.box.left + at.box.right) / 2, (at.box.top + at.box.bottom) / 2);
      closeFind(at);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    }
  });
  /** To the next match (`dir` 1) or the one before (-1), as Tab and Shift+Tab, or Next and Previous. */
  function step(/** @type {1 | -1} */ dir) {
    if (!finding) return;
    const n = finding.matches.length;
    if (!n) return;
    // One move, then none (the user): with any match off screen, show them all, which counts them again.
    if (finding.matches.some((m) => !m.on)) viewer.frame(finding.matches.map((m) => m.box), underBar());
    finding.at = (finding.at + dir + n) % n;
    markMatches(true);
    ui.announce(named(finding.matches[finding.at]));
  }
  // The bar's buttons, for the mouse and touch: a press leaves focus in the find box, so its keys still work.
  for (const [button, act] of /** @type {const} */ ([
    [els.findPrev, () => step(-1)], [els.findNext, () => step(1)], [els.findCancel, () => closeFind(null, true)],
  ])) {
    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', act);
  }
  // The footer's Find opens the find, or closes it as a click away does. The document's click-away below leaves the
  // find to it, or it would close the find this click opened. A click that left a label box that could not save does
  // nothing, as in the diagram (ended()).
  els.findToggle.addEventListener('click', () => {
    if (swallowClick) return;
    // As for /: find selects, and nothing is selected in a diagram that cannot be.
    if (!selectable) return;
    if (finding) { closeFind(null); return; }
    openFind();
  });
  // A drag is never a cancel (the user): a press in the diagram may become a pan or a pinch, so it ends nothing, and
  // only the viewer's click (a release without a drag) does (ended()). Outside the diagram a press is a click in
  // practice, and its focus move still blurs the label box, which saves it (commit).
  document.addEventListener('pointerdown', (e) => {
    // Any press is a new click: one left over from a refused save (its click landed outside the diagram) goes. This
    // runs before the press moves focus, and so before that blur can set it again.
    swallowClick = false;
    keptClick = false;
    const at = /** @type {Element} */ (e.target);
    // Keep focus in the label box, the find box or a menu through a drag: a press in the diagram would move it to
    // #diagram. The box and its shape picker keep their own presses (the caret, text selection, the shapes), and so do menus.
    if ((labelling || finding || menuOpen() || menus.space.isOpen()) && els.diagram.contains(at) && at !== input
      && !shapePickerBox.contains(at) && !at.closest('[data-overlay]')) e.preventDefault();
  });
  // A click outside the diagram (header, footer, Help) is a click away: it ends a find and Connect to… as Escape
  // does, and closes the menus. Clicks in the diagram are the viewer's (clicked()): the browser's own click there
  // fires after a drag too.
  document.addEventListener('click', (e) => {
    const at = /** @type {Node} */ (e.target);
    if (els.diagram.contains(at) || els.find.contains(at)) return;
    // The footer's Find works inside a pick: it opens or closes the find, and the pick goes on.
    if (els.findToggle.contains(at)) { closeMenus(); return; }
    if (finding) closeFind(null);
    if (picking) cancelPick();
    closeMenus();
  });
  /**
   * A click or a right-click in the diagram, away from the label box or the find bar, ends them first: the label is
   * saved (commit) and the find closed, the old selection back. Returns true when the click does nothing more: the save
   * was refused, and the box stays.
   */
  function ended() {
    if (finding) closeFind(null);
    if (labelling) {
      commit();
      // Saved, the box gone: focus goes to the diagram, where the press, kept from moving it, would have put it.
      if (!labelling) els.diagram.focus();
    }
    if (!swallowClick) return false;
    swallowClick = false;
    return true;
  }
  document.addEventListener('keydown', (e) => {
    if (/** @type {Element} */ (e.target).closest?.('input, textarea, select, [contenteditable]')) return;
    // While a dialog (Help: a popover that is not one of the page's overlays) is open, its keys are its own: arrows
    // scroll it and Escape closes it.
    if (document.querySelector(':popover-open:not([data-overlay])')) return;
    const key = e.key.toLowerCase();
    // Enter and Space on a focused button outside the diagram (the footer's, Help's) press it.
    if ((key === 'enter' || key === ' ') && /** @type {Element} */ (e.target).closest?.('button')) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'c' || key === 'x' || key === 'v') && copyKey(key, e)) {
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && key === 'z') {
      e.preventDefault();
      clearRefusal();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && key === 'y') {
      e.preventDefault();
      clearRefusal();
      redo();
      return;
    }
    // A key's name carries its modifiers: `ctrl+` for Ctrl, or on a Mac Option too (macOS keeps Ctrl+Arrows), then
    // `shift+` only where the key has a Shift entry of its own, so letters stay case-insensitive. Off a Mac, Alt is the
    // browser's (Alt+Left and Alt+Right go back and forward). The system is Help's, as its key labels show.
    const mac = document.documentElement.dataset.os === 'mac';
    if (e.altKey && !mac) return;
    // A Mac's menus show Ctrl+Shift+L as ⌘⇧L (keyLabel), so ⌘ works for it as it does for copy and paste.
    const meta = mac && e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey && key === 'l';
    if (e.metaKey && !meta) return;
    const mod = e.ctrlKey || e.altKey || meta ? 'ctrl+' : '';
    const name = e.shiftKey && keys[`${mod}shift+${key}`] ? `${mod}shift+${key}` : mod + key;
    if (!keys[name]) return;
    // A diagram that cannot be selected (not a flowchart) takes only the view keys, silently.
    if (!selectable && !VIEW_KEYS.includes(name)) return;
    if (name !== 'escape') clearRefusal();   // Escape's own steps take it first
    if (keys[name]()) e.preventDefault();
  });

  /**
   * Ctrl+C, Ctrl+V and Ctrl+Shift+V (⌘ on a Mac) on the diagram: copy and paste a node or a subgraph. Whether the page took the key:
   * when it does nothing here (focus or a text selection elsewhere, nothing to copy or paste), the browser's own
   * copy and paste go on. A paste the selection's menu grays is refused, saying why.
   */
  function copyKey(/** @type {string} */ key, /** @type {KeyboardEvent} */ e) {
    const at = /** @type {Node} */ (e.target);
    if (!(at === document.body || els.diagram.contains(at)) || !selectable || picking) return false;
    if (!document.getSelection()?.isCollapsed) return false;
    if (key === 'c' || key === 'x') {
      if (e.shiftKey || !selected) return false;
      clearRefusal();
      // Said, not left to the browser's copy, which would copy nothing (the user wants a message).
      if (selected.kind !== 'node' && selected.kind !== 'subgraph') {
        refuse(`Only a node or a subgraph can be ${key === 'c' ? 'copied' : 'cut'}.`);
        return true;
      }
      if (menuOpen()) closeMenus();
      handlers[`${key === 'c' ? 'copy' : 'cut'}-${selected.kind}`]();
      return true;
    }
    if (!copied && !cut) return false;
    clearRefusal();
    const list = selected ? MENUS[isBox(selected) ? 'box' : selected.kind] : MENUS.space;
    // On an edge there is only Paste node: the copy is inserted, with no other edges, either way.
    const action = e.shiftKey && selected?.kind !== 'edge' ? 'paste-node-bare' : 'paste-node';
    const item = list.find((i) => i.action === action);
    if (!item) return false;
    closeMenus();
    const state = menuState();
    if (!applies(item, state)) { refuse(whyNot(item, state)); return true; }
    handlers[action]();
    return true;
  }

  // --- the label box: editing a label in place -----------------------------------------------------------------

  // The box is laid exactly over the node, or over the edge's label (the middle of its line if it has none): that size,
  // or larger when the text needs it, kept centered as it grows. Enter saves; Shift+Enter starts a new line, which the
  // label keeps as a line break.
  const measure = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
  const LINE_HEIGHT = 18;

  /** What the label box covers: the node, the subgraph's title, the edge's label, or the middle of the edge's line. */
  function labelBoxRect(/** @type {Item} */ target) {
    if (target.kind === 'node') return nodeEl(target.id)?.getBoundingClientRect();
    if (target.kind === 'subgraph') return clusterEl(target.id)?.querySelector(':scope > :is(.cluster-label, g.label)')?.getBoundingClientRect();
    if (target.kind === 'title') return titleEl()?.getBoundingClientRect();
    const parts = edgeEls(target.id);
    const label = parts.find((e) => e.matches('g.edgeLabel'));
    const r = label?.getBoundingClientRect();
    if (r && r.width && r.height) return r;
    const path = /** @type {SVGPathElement | undefined} */ (parts.find((e) => e.matches('path[data-page-only]')));
    if (!path) return null;
    const p = path.getPointAtLength(path.getTotalLength() / 2), m = path.getScreenCTM();
    if (!m) return null;
    const x = p.x * m.a + p.y * m.c + m.e, y = p.x * m.b + p.y * m.d + m.f;
    return { left: x, top: y, width: 0, height: 0 };
  }

  // The node panel: on a node, a shape picker lies under the box. Down from the box's last line goes into it, where
  // the arrows move focus; a digit, a click, or Enter on the focused shape selects it (Enter also goes back to the box);
  // Up from the top row or Escape goes back to the box, keeping what was selected. Enter in the box writes the label
  // and the shape as one change. Nothing is drawn until then (docs/ux.md, the preview rule).
  const shapePicker = createPicker({
    title: 'Shape',
    entries: NODE_SHAPES,
    columns: 10,
    hosted: true,
    onPick: (at) => selectShape(at),
  });
  /** Select shape `at` in the shape picker, and say so: nothing else shows it to a screen reader. */
  function selectShape(/** @type {string} */ at) {
    shapePicker.current(at);
    const entry = NODE_SHAPES.find((e) => e.key === at);
    ui.announce(`${entry?.name}${entry?.meaning && entry.meaning !== entry.name ? `, ${entry.meaning}` : ''} selected`);
  }
  const shapePickerBox = Object.assign(document.createElement('div'), { className: 'menu shape-picker', popover: 'manual' });
  shapePickerBox.dataset.overlay = '';
  // A press anywhere on the shape picker, icon or not, leaves focus where it is: on the body, it would close the box.
  shapePickerBox.addEventListener('mousedown', (e) => e.preventDefault());
  // Keys the picker leaves: Enter selects the focused shape and goes back to the box; Up from the top row and Escape go
  // back to the box; Tab saves, as from the box. None goes on to the page's own keys; Ctrl, Cmd and Alt combinations do, as from a menu.
  shapePickerBox.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const on = /** @type {HTMLElement} */ (document.activeElement);
    if (e.key === 'Enter' && on.dataset.key) { e.preventDefault(); selectShape(on.dataset.key); input.focus(); }
    else if (e.key === 'Tab') { e.preventDefault(); saveLabel(keepEmptied()); }
    else if (e.key === 'Escape' || (e.key === 'ArrowUp' && !e.defaultPrevented)) { e.preventDefault(); input.focus(); }
    e.stopPropagation();
  });
  // The box closes when focus leaves both it and the shape picker.
  shapePickerBox.addEventListener('focusout', (e) => {
    const to = /** @type {Node | null} */ (e.relatedTarget);
    if (to !== input && !shapePickerBox.contains(to)) commit();
  });
  const shapePickerHint = Object.assign(document.createElement('div'), {
    className: 'visually-hidden', id: 'shape-picker-hint', textContent: 'Down arrow chooses a shape',
  });
  shapePickerBox.append(shapePicker.el, shapePickerHint);
  els.diagram.append(shapePickerBox);
  let shapePickerOpen = false;
  /** @type {'below' | 'above'} the side of the label box the shape picker opened on, kept as it follows the box */
  let shapePickerSide = 'below';
  /** @type {string | null} the shape the node had when the shape picker opened, or null for one these edits cannot read */
  let shapePickerFrom = null;

  /** Place the shape picker under the label box; `fresh`, as it opens: above it when there is no room below. */
  function placeShapePicker(fresh = false) {
    if (!shapePickerOpen) return;
    const r = input.getBoundingClientRect(), s = shapePickerBox.getBoundingClientRect();
    const center = (r.left + r.right) / 2 - s.width / 2;
    const at = place({ left: center, top: r.top, right: center + s.width, bottom: r.bottom }, s,
      els.diagram.getBoundingClientRect(), { side: fresh ? 'below' : shapePickerSide, gap: 6, flip: fresh });
    if (fresh) shapePickerSide = at.flipped ? 'above' : 'below';
    shapePickerBox.style.left = at.left + 'px';
    shapePickerBox.style.top = at.top + 'px';
  }

  /**
   * Bring what was just added into view with its label box and the shape picker under it (the user), so all of it can
   * be used. The shape picker counts where it would lie below the box, not where the window's edge has pushed it; once
   * in view, it is placed afresh, so one flipped above for want of room goes back below.
   */
  function revealLabelBox(/** @type {Item} */ item) {
    const r = input.getBoundingClientRect(), s = shapePickerBox.getBoundingClientRect();
    const below = new DOMRect((r.left + r.right) / 2 - s.width / 2, r.bottom + 6, s.width, s.height);
    reveal(item, shapePickerOpen ? [r, below] : [r]);
    placeShapePicker(true);
  }

  /** Open the shape picker for node `id`; `added`: the node was just added, so it is a rectangle whatever it reads as. */
  function openShapePicker(/** @type {string} */ id, /** @type {boolean} */ added) {
    shapePickerOpen = true;
    shapePickerFrom = shownShape(id) ?? (added ? 'rect' : null);
    // A shape not in the list is named, with none pressed; one that cannot be read shows nothing as current.
    shapePicker.current(shapePickerFrom, shapePickerFrom ?? '');
    shapePickerBox.showPopover();
    input.setAttribute('aria-describedby', shapePickerHint.id);
    placeShapePicker(true);
  }

  function closeShapePicker() {
    shapePickerOpen = false;
    shapePickerFrom = null;
    if (shapePickerBox.matches(':popover-open')) shapePickerBox.hidePopover();
    input.removeAttribute('aria-describedby');
  }

  function openLabelBox(/** @type {Item} */ target) {
    if (refuseLocked()) return;
    const r = labelBoxRect(target);
    if (!r) return;
    closeMenus();
    labelling = target;
    // innerText, not textContent: a label's line breaks (<br>) come through as newlines.
    // An SVG element (a label Mermaid drew as SVG text) has no innerText.
    const shown = target.kind === 'edge'
      ? edgeEls(target.id).find((e) => e.matches('g.edgeLabel'))
      : labelEl(target) || elsOf(target)[0];
    input.value = shown ? (shown instanceof HTMLElement ? shown.innerText : shown.textContent).trim() : '';
    input.dataset.initial = input.value;
    input.setAttribute('aria-label', { node: 'Node label', edge: 'Edge label', subgraph: 'Subgraph title', title: 'Diagram title' }[target.kind]);
    input.style.display = 'block';
    sizeLabelBox();
    if (target.kind === 'node') openShapePicker(target.id, same(naming, target));
    input.focus();
    input.select();
  }

  function sizeLabelBox() {
    const r = labelling && labelBoxRect(labelling);
    if (!r) return;
    const box = els.diagram.getBoundingClientRect();
    measure.font = getComputedStyle(input).font;
    const textLines = input.value.split('\n');
    const w = Math.max(r.width, 80, ...textLines.map((l) => measure.measureText(l).width + 24));
    const h = Math.max(r.height, 28, textLines.length * LINE_HEIGHT + 12);
    input.style.width = w + 'px';
    input.style.height = h + 'px';
    input.style.left = (r.left - box.left + r.width / 2 - w / 2) + 'px';
    input.style.top = (r.top - box.top + r.height / 2 - h / 2) + 'px';
    placeShapePicker();
  }

  // labelling goes first: hiding the input blurs it, and a blur with the box still open would save it (commit).
  function closeLabelBox() {
    labelling = null;
    input.style.display = 'none';
    closeShapePicker();
  }

  /**
   * Focus left the label box and its shape picker (a click or tap away, Tab): save, as Enter does; only Escape discards
   * (docs/ux.md). An emptied label is kept as it was, and the click goes on. What cannot be saved (a shape the label
   * cannot take, or another edit still saving) keeps the box open, focus back in it, and the click that left it does
   * nothing.
   */
  function commit() {
    if (!labelling) return;
    // Refused already by this press: its own focus move blurs the box a second time.
    if (swallowClick) { input.focus(); return; }
    if (busy) { ui.notice(BUSY, 'error'); keepBox(); return; }
    const kept = keepEmptied();
    if (!submitLabel(kept)) keepBox();
    else if (kept) keptClick = true;
  }
  /**
   * Leaving the box (a click away, Tab) with a node's label or a subgraph's title emptied keeps it as it was, rather
   * than refusing the save as Enter does. Returns the notice that says so, or null.
   */
  function keepEmptied() {
    if (!labelling || labelling.kind === 'edge' || input.value.trim() || input.value === input.dataset.initial) return null;
    input.value = input.dataset.initial ?? '';
    return labelling.kind === 'node' ? 'The label was kept, because a label cannot be empty.' : 'The title was kept, because a title cannot be empty.';
  }
  function keepBox() {
    swallowClick = true;
    input.focus();
  }

  input.addEventListener('input', sizeLabelBox);
  input.addEventListener('blur', (e) => {
    if (!shapePickerBox.contains(/** @type {Node | null} */ (e.relatedTarget))) commit();
  });
  input.addEventListener('keydown', (e) => {
    const target = labelling;
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (naming && same(naming, target)) { cancelAdd(naming); return; }
      closeLabelBox();
      els.diagram.focus();
      naming = null;
      ui.hideNotice();   // a refused save's error is about the box, which is gone
      if (target) select(target);
      return;
    }
    // Down goes into the shape picker only from the last line, where it would not move the caret. The line is the text's:
    // the box widens to its text (sizeLabelBox), so a line never wraps.
    if (e.key === 'ArrowDown' && shapePickerOpen && !input.value.slice(input.selectionEnd).includes('\n')) {
      e.preventDefault();
      shapePicker.focus();
      return;
    }
    if (!target || !(e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) return;
    e.preventDefault();
    saveLabel(e.key === 'Tab' ? keepEmptied() : null);
  });

  /**
   * Escape in the box an add opened: take the add back, as if it never was, with nothing left to redo. Only while the
   * file is still as the add left it; otherwise the item stays, named as it was added.
   */
  function cancelAdd(/** @type {NonNullable<typeof naming>} */ added) {
    if (busy) { ui.notice(BUSY, 'error'); return; }
    const what = added.kind === 'node' ? 'node' : 'subgraph';
    closeLabelBox();
    naming = null;
    els.diagram.focus();
    exclusively(async () => {
      ui.hideNotice();
      const base = source.snapshot();
      if (base.text !== added.entry.after) {
        ui.notice(`The ${what} was kept, because the file has changed since it was added.`, 'warning');
        select(added);
        return;
      }
      if (!(await save(added.entry.before, base.version))) return;
      history.discard(added.entry);
      deselect();
      // Put back the view from before the add once the smaller diagram is drawn: a fit now would fit it with the node.
      if (!added.moved) viewBack = { text: added.entry.before, view: added.view };
      await display(added.entry.before);
      ui.announce('Add cancelled');
    });
  }

  /**
   * Enter, or Tab either way: save, and leave focus in the diagram, where what was edited is selected, rather than on
   * the next control in the page, which is not where the user was working.
   */
  function saveLabel(/** @type {string | null} */ kept = null) {
    if (submitLabel(kept)) els.diagram.focus();
  }

  /**
   * Save what the label box holds (and the shape picker's shape, while it is open), as Enter does. Returns false when it was
   * refused, the box still open. `kept` is the notice for an emptied label kept as it was, shown once the save is done.
   */
  function submitLabel(/** @type {string | null} */ kept = null) {
    const target = labelling;
    if (!target) return false;
    const label = input.value;
    const relabelled = label !== input.dataset.initial;
    // A node needs a label and a subgraph a title; an edge's label can be emptied, which removes it. One drawn with
    // none (a `bolt` node) can still change shape.
    if (target.kind !== 'edge' && !label.trim() && relabelled) {
      ui.notice(target.kind === 'node' ? 'A label cannot be empty.' : 'A title cannot be empty.', 'error');
      return false;
    }
    const picked = shapePickerOpen ? shapePicker.value() : null;
    const shape = picked && picked !== shapePickerFrom ? picked : null;
    /** A node's new label and shape, as one change. */
    const renamed = (/** @type {string} */ text) => {
      const named = relabelled ? relabel(text, target.id, label).text : text;
      return shape ? setShape(named, target.id, shape) : { text: named };
    };
    // A shape the label cannot take is refused before the box closes, so what was typed is kept to try another.
    if (shape) {
      try { renamed(source.snapshot().text ?? ''); } catch (err) { ui.notice(NOT_SAVED + err.message, 'error'); return false; }
    }
    closeLabelBox();
    // Enter on an unchanged label is not an edit: the file keeps its own spelling of the label. The item stays
    // selected, as after an edit: the two look alike.
    if (!relabelled && !shape) { select(target); naming = null; if (kept) ui.notice(kept, 'warning'); return true; }
    if (target.kind === 'title') {
      edit((text) => setTitle(text, label), { after: () => ({ item: TITLE }) });
      return true;
    }
    if (target.kind === 'edge') {
      editDrawn((text) => setEdgeLabel(text, target.id, label), { after: sameEdge(target.id) });
      return true;
    }
    const into = naming && same(naming, target) ? naming.entry : null;
    naming = null;
    if (target.kind === 'node') {
      const names = [named(target), NODE_SHAPES.find((e) => e.key === shape)?.name];
      // A shape change is not seen by a screen reader, unlike a label it typed.
      const afterSave = shape && !relabelled ? () => {
        ui.announce(`Changed ${names[0]} to ${names[1]}`);
        if (kept) ui.notice(kept, 'warning');
      } : undefined;
      edit(renamed, { into, afterSave, after: () => ({ item: target }) });
      return true;
    }
    const change = (/** @type {string} */ text) => setSubgraphTitle(text, target.id, label);
    /** @type {EditOptions} */
    const options = { into, after: (result) => ({ item: { kind: 'subgraph', id: result.id } }) };
    if (drawnOnly(target.id)) editDrawn(change, options); else edit(change, options);
    return true;
  }

  // --- edges ---------------------------------------------------------------------------------------------------

  // Edges can be selected only when the text's edges are exactly the ones drawn, in order: then an edge's SVG id says
  // which text it is. Each gets a wide invisible path over it, since a line is hard to hit, and its label selects it
  // too. Nodes are drawn after edges, so a click near a node still picks the node.
  function tagEdges(/** @type {string} */ text) {
    const lines = drawn('path[data-edge="true"]');
    const ids = drawnEdges(edges(text), collapse.subs, collapse.overrides).map((e) => e.svgId);
    edgesOk = ids.length === lines.length && lines.every((p, k) => p.dataset.id === ids[k]);
    if (!edgesOk) {
      ui.notice("merma can't match this diagram's edges to its text, so edges can't be selected and nodes can't be "
        + 'deleted here. Edit those in the file.', 'warning');
      return;
    }
    for (const p of lines) {
      p.dataset.pageEdge = p.dataset.id;
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', p.getAttribute('d') ?? '');
      hit.setAttribute('fill', 'none');
      hit.setAttribute('data-page-only', '');
      hit.dataset.pageEdge = p.dataset.id;
      p.after(hit);
    }
    for (const g of drawn('g.edgeLabel')) {
      const id = /** @type {SVGElement | null} */ (g.querySelector('[data-id]'))?.dataset.id;
      if (id) g.dataset.pageEdge = id;
    }
  }

  // --- saving --------------------------------------------------------------------------------------------------

  // One edit or undo at a time: a second one started while the first is saving (a held Ctrl+Z, a double-clicked menu
  // item) would be based on the text from before the first.
  // While the code panel holds the lock nothing here writes the file, whatever reached it (a key, a button), except the
  // panel's own save (`whileLocked`).
  async function exclusively(/** @type {() => Promise<void>} */ work, { whileLocked = false } = {}) {
    if (busy) return;
    if (!whileLocked && refuseLocked()) return;
    busy = true;
    try {
      await work();
    } finally {
      busy = false;
      historyChanged();
    }
  }

  // Make an edit to the file's latest text and save it over that text's version. The edit runs on the text as the page
  // has it now, so a change it has already picked up is kept; one it has not yet seen, even one that arrives while the
  // edit is being checked, makes the save fail rather than be overwritten. `into` is the history entry this edit
  // completes, if any; `after` picks what is selected once the edit's text is drawn.
  /**
   * @param {(text: string) => { text: string }} change
   * @param {EditOptions} [options]
   */
  function edit(change, { afterSave, into = null, after, keep = false } = {}) {
    return exclusively(async () => {
      const was = selected;
      const wasCame = was?.kind === 'edge' ? moves.came() : undefined;
      ui.hideNotice();
      // After an edit there is no trail back, and I forgets where you were (the user), even with the same item selected.
      moves.forget();
      clickedMeanwhile = null;
      const base = source.snapshot();
      if (base.text === null || !base.version) return;
      let result;
      try {
        result = change(base.text);
      } catch (e) {
        ui.notice(NOT_SAVED + (e.message || e), 'error');
        return;
      }
      if (!(await save(result.text, base.version))) return;
      const entry = history.record(base.text, result.text, into);
      // The action is done: its menu closes, but a picker's stays for the next pick. What it acted on is selected again
      // once drawn (`after`), or nothing.
      if (!keep) deselect();
      const clickedAway = clickedMeanwhile;
      clickedMeanwhile = null;
      const next = clickedAway ?? after?.(result);
      pending = next ? { text: result.text, ...next } : null;
      // An edit that completes another (naming an add) keeps that one's selection before.
      selections.set(entry, {
        before: selections.get(entry)?.before ?? (was && { item: was, came: wasCame }),
        after: next && !clickedAway ? { item: next.item, others: 'others' in next ? next.others : undefined, far: 'far' in next ? next.far : undefined } : null,
      });
      ui.announce('Saved');   // what afterSave announces, if anything, replaces it
      afterSave?.(result, entry);
      // An add's label box does not open on what was clicked instead, so what it added is not being named.
      if (clickedAway) naming = null;
      await display(result.text);
      settled = selected;
    });
  }

  function redo() {
    return exclusively(async () => {
      const base = source.snapshot();
      if (base.text === null) return;
      ui.hideNotice();
      const redoing = history.peekRedo(base.text);
      if (redoing.ok === false) {
        if (redoing.reason === 'empty') ui.notice('There is nothing to redo.', 'info');
        else ui.notice("Redo isn't possible, because the file has changed since.", 'error');
        return;
      }
      const entry = history.nextRedo;
      if (!(await save(redoing.text, base.version))) return;
      history.redone();
      const moved = entry && cutsMoved.get(entry);
      if (moved && cut?.kind === moved.kind && cut.id === moved.id) cut = null;
      // Redo selects what its edit did only if you have not moved since (the user: it does not pull you away); else
      // your selection stays, or, when the redo takes it away, goes where the edit's would.
      const sel = entry && selections.get(entry)?.after;
      const was = selected;
      const stayed = same(was, settled);
      const chain = sel ? [sel.item, ...(sel.others ?? [])] : [];
      deselect();
      closeLabelBox();
      if (stayed) pending = sel ? { text: redoing.text, ...sel, reveal: true, say: 'Redone' } : null;
      else pending = was ? { text: redoing.text, item: was, others: chain } : null;
      await display(redoing.text);
      if (!(stayed && sel && selected)) ui.announce('Redone');
      settled = selected;
    });
  }

  function undo() {
    return exclusively(async () => {
      const base = source.snapshot();
      if (base.text === null) return;
      ui.hideNotice();
      const undoing = history.peek(base.text);
      if (undoing.ok === false) {
        if (undoing.reason === 'empty') ui.notice('There is nothing to undo.', 'info');
        else ui.notice("Undo isn't possible, because the file has changed since that edit.", 'error');
        return;
      }
      const entry = history.newest;
      if (!(await save(undoing.text, base.version))) return;
      history.pop();
      const moved = entry && cutsMoved.get(entry);
      if (moved) { cut = moved; copied = null; }
      deselect();
      closeLabelBox();
      const sel = entry && selections.get(entry)?.before;
      pending = sel ? { text: undoing.text, item: sel.item, came: sel.came, reveal: true, say: 'Undone' } : null;
      await display(undoing.text);
      if (!selected) ui.announce('Undone');
      settled = selected;
    });
  }

  /**
   * Save text for the file over version `base` (default: the version the page has now), after checking it parses.
   * Returns true when saved. `says` replaces the notices for text that does not parse and for a file changed since.
   */
  async function save(/** @type {string} */ text, base = source.version, /** @type {{ invalid?: string, conflict?: string }} */ says = {}) {
    try {
      await parse(text);
    } catch (e) {
      const error = e.message || String(e);
      if (limitOf(error) === 'edges') ui.notice(limitSentence('edges', limits, true), 'error');
      else ui.notice((says.invalid ?? 'Your change was not saved, because it would make the diagram invalid.') + '\n' + error, 'error');
      return false;
    }
    const saved = await source.save(text, base);
    if (saved.ok === false) {
      ui.notice((saved.conflict && says.conflict) || NOT_SAVED + saved.message + (saved.conflict ? ' The new version is shown now. Try again.' : ''), 'error');
      return false;
    }
    return true;
  }

  return {
    save,
    viewChanged: (/** @type {boolean} */ byUser) => {
      // What is on screen changed, so the count's "off screen" did; what matches, and its marks, did not.
      if (finding) {
        if (byUser) finding.moved = true;
        refind();
        showCount();
      }
      if (naming && byUser) naming.moved = true;
      if (labelling) sizeLabelBox();
      markEnd(false);
      const el = selectedEl();
      if (selected && el) menuOf(selected).reposition(el.getBoundingClientRect());
      if (spaceAt) {
        const { x, y } = viewer.toClient(spaceAt);
        menus.space.reposition({ left: x, top: y, right: x, bottom: y });
      }
    },
    clicked,
    contextMenu,

    /**
     * Double-click on a node opens its panel; on an edge or a subgraph, edits its label or title. Returns whether it
     * was one.
     */
    doubleClicked(/** @type {Element} */ target) {
      if (!selectable) return false;
      const sel = itemAt(target);
      if (!sel) return false;
      select(sel);
      editLabelOrTitle(sel);
      return true;
    },

    /**
     * A new version of the file is on screen: tag its nodes, edges and subgraphs, and keep the selection if it is still
     * there (an edge's, or an id-less subgraph's, only while the text is the same: their ids are renumbered when edges
     * or subgraphs come and go).
     */
    rendered(/** @type {string} */ text, view = collapse, drawnLinks = links) {
      collapse = view;
      links = drawnLinks;
      drawnEditable = isFlowchart(text);
      setEditable();
      // Tagged while locked too, so unlocking finds the drawing ready.
      if (!drawnEditable) return;
      const changed = text !== shownText;
      shownText = text;
      const renderId = /** @type {string} */ (viewer.renderId);   // what is on screen was rendered
      for (const g of drawn('g.node')) {
        const id = nodeIdFromSvgId(g.id, renderId);
        if (id) g.dataset.pageNode = id;
        // A node merma can follow a link from reads as a link (style.css), its blue chosen by its own fill: its first
        // shape, the body of one drawn in parts (a cylinder's, a double circle's outer ring, a subroutine's box).
        const link = id ? links.get(id) : undefined;
        if (link && link !== 'about:blank') {
          const shape = g.querySelector(':scope > :is(rect, path, polygon, circle, ellipse), :scope > g:not(.label) :is(rect, path, polygon, circle, ellipse)');
          g.dataset.pageLink = linkTone(shape ? getComputedStyle(shape).fill : '');
        }
      }
      // A subgraph whose id merma cannot read (`subgraph a-b [X]`) is left unselectable, as such a node's edges are.
      const known = new Set(subgraphs(text).map((s) => s.id));
      // A collapsed subgraph is drawn as a node-like box, `<render id>-<subgraph id>` with no `flowchart-`.
      for (const g of drawn('g.cluster, g.node:has(> rect.collapsed-group)')) {
        const id = subgraphIdFromSvgId(g.id, renderId);
        if (!id || !known.has(id)) continue;
        g.dataset.pageSubgraph = id;
        if (g.matches('g.node')) g.dataset.pageCollapsed = '';
      }
      tagEdges(text);
      markCut();
      glowDoomed();
      // A new drawing while finding: find again in it, so no mark is left on what has gone.
      if (finding) { refind(); markMatches(); }
      const back = viewBack;
      viewBack = null;
      if (back && text === back.text) { if (back.view.touched) viewer.setView(back.view); else viewer.fit(); }
      const menu = menuOpen();
      const sel = selected;
      const next = pending;
      pending = null;
      const item = next && text === next.text ? [next.item, ...(next.others ?? [])].find((i) => elsOf(i).length) : null;
      // A find opened while the edit saved (the footer's Find, a click away from the label box): what the edit selects
      // is set aside with the find, for Escape or a click away to put back.
      // An add's panel does not open then, so the add is over: what it added is not being named.
      if (next && item && finding) { finding.before = item; if (next.label) naming = null; return; }
      if (next && item) {
        // An edit's own text: what it acted on, its menu still open after a picker's pick; or what was right-clicked
        // meanwhile, with its menu.
        if (next.reveal) selectByKey(item, next.say);
        else select(item, { menu: Boolean(next.menu) && (menu || Boolean(next.clicked)) });
        if (next.far && item.kind === 'edge') { moves.countFrom(otherEnd(layout(), item.id, null)); markEnd(); }
        else if (next.came !== undefined && item === next.item && item.kind === 'edge') { moves.countFrom(next.came); markEnd(); }
        if (next.label) { openLabelBox(item); revealLabelBox(item); }
        return;
      }
      const kept = sel && elsOf(sel).length
        && (restoring || sel.kind === 'node' || !changed || (sel.kind === 'subgraph' && !drawnOnly(sel.id)));
      restoring = false;
      if (kept) { select(sel, { keepMode: sel.kind !== 'edge', menu }); return; }
      // A node or subgraph now hidden in a collapsed one: the box it is drawn as, with the trail started afresh.
      const box = sel && (sel.kind === 'node' || sel.kind === 'subgraph') ? drawnEnd(sel.id) : null;
      if (sel && box && box !== sel.id && clusterEl(box)) { moves.forget(); select({ kind: 'subgraph', id: box }, { menu }); }
      else if (sel) deselect();
    },

    /** The file no longer renders: what is on screen is an older version, so editing it would edit something else. */
    failed() { drawnEditable = false; setEditable(); },

    /**
     * The page now shows `next`, read by `nextSource`: what was selected, found, cut or set aside goes, and the undo
     * history is that file's, as it was when the page last left it. Only called when idle(): nothing is being saved,
     * named or picked. The copy stays, so it can be pasted into the new file.
     */
    switchFile(/** @type {typeof source} */ nextSource, /** @type {string} */ next) {
      source = nextSource;
      links = new Map();
      drawnEditable = false;
      setEditable();   // closes find and the menus, and lets go of the selection, which stays kept for that file
      file = next;
      selected = keptSelection();
      restoring = Boolean(selected);
      clearTimeout(blinkTimer);
      dropCut();
      cleared = null;
      clearedCursor = null;
      spaceAt = null;
      pending = null;
      naming = null;
      viewBack = null;
      settled = null;
      refused = false;
      clickedMeanwhile = null;
      moves.forget();
      shownText = '';
      collapse = { subs: [], overrides: new Map() };
      edgesOk = false;
      history = histories.get(next) ?? createHistory();
      histories.set(next, history);
      historyChanged();
    },

    /**
     * The code panel starts editing the code: nothing else edits the file until unlock(). Refused, saying why, while an
     * edit here is under way.
     */
    lockForCode() {
      if (labelling || picking) { ui.notice('Finish editing the diagram first.', 'warning'); return false; }
      // A press that started a save as its click away (the label box's) does not wait for it, as for Undo.
      if (busy) { ui.notice(BUSY, 'error'); return false; }
      locked = true;
      setEditable();
      ui.mode(LOCKED);
      return true;
    },
    unlock() {
      if (!locked) return;
      locked = false;
      setEditable();
      ui.mode(null);
    },

    /**
     * Save the code panel's text over `base`, the file as it was when its editing began, so a change since is refused
     * rather than overwritten. One undo step; the lock ends when it saves. Resolves to whether it saved.
     */
    async saveCode(/** @type {string} */ text, /** @type {{ text: string, version: string }} */ base) {
      let ok = false;
      await exclusively(async () => {
        if (!(await save(text, base.version, {
          invalid: 'The code was not saved, because it is not valid Mermaid.',
          conflict: 'The code was not saved, because the file changed after you pressed Edit. Cancel shows the file as it is now.',
        }))) return;
        ok = true;
        history.record(base.text, text, null);
        moves.forget();
        clickedMeanwhile = null;
        locked = false;
        setEditable();
        ui.mode(null);
        ui.announce('Saved');
        await display(text);
        settled = selected;
      }, { whileLocked: true });
      return ok;
    },

    state: () => ({
      selected: selectedNode(), selectedEdge: selected?.kind === 'edge' ? selected.id : null,
      selectedSubgraph: selectedSubgraph(), picking, editable, edgesOk,
    }),

    /**
     * Undo or redo from a button. Unlike the keys, which a held key repeats, a press while an edit saves says why it did
     * nothing: most often the label box's own save, which the press started by clicking away from it.
     */
    undo: () => (busy ? ui.notice(BUSY, 'error') : undo()),
    redo: () => (busy ? ui.notice(BUSY, 'error') : redo()),

    /** Whether the code panel holds the lock: its code is being edited. */
    codeLocked: () => locked,

    /** Why another file cannot be opened now, or null: it would lose what is under way here. */
    switchRefused() {
      if (busy) return BUSY;
      if (locked) return 'The code is being edited. Save or cancel it to open another diagram.';
      if (labelling || picking) return 'Finish editing the diagram first.';
      return null;
    },

    /** Nothing in progress that a reload would lose: no edit being saved, no label box open, no connection half made. */
    idle: () => !busy && !labelling && !picking && !locked,
  };
}
