// Editing a flowchart by pointing: click a node, an edge or a subgraph to select it, right-click (or long-press) for
// its menu, or right-click empty space to add a node; each action is a small text edit to the file
// (patch/flowchart.mjs). Each edit is checked with Mermaid's parser before it is saved, and saved over the version it
// was based on (source.mjs), so a change saved meanwhile by an agent or an editor is never overwritten. What this adds to the drawing is marked
// `data-page-…`, which the SVG export leaves out.

import { ARROW_TYPES } from './arrow-types.mjs';
import { createHistory } from './history.mjs';
import { find, firstShown, countText } from './find.mjs';
import { createMenu } from './menu.mjs';
import { GLOBAL_KEYS, MENUS, NO_EDGE_MATCH } from './menu-items.mjs';
import { createKeys } from './keys.mjs';
import { countedEnd, nearest, nest } from './navigate.mjs';
import {
  addConnected, addNode, addSubgraph, arrowType, connect, deleteEdge, deleteNode, edges, isFlowchart, nodeIdFromSvgId,
  relabel, reverseEdge, setEdgeArrow, setEdgeLabel, setShape, setSubgraphTitle, setTitle, shapeOf, subgraphIdFromSvgId,
  subgraphRefusal, subgraphs,
} from './patch/flowchart.mjs';
import { createPicker } from './picker.mjs';
import { place } from './place.mjs';
import { NODE_SHAPES } from './shapes.mjs';

// With nothing selected, an arrow key moves the diagram a tenth of the area's size (Ctrl half, Shift a fiftieth); + and
// - zoom by this factor.
const PAN_STEP = 0.1;
const PAN_BIG = 0.5;
const PAN_SMALL = 0.02;
const ZOOM_STEP = 1.25;
// The selected edge's end mark: its length across the line, in screen pixels.
const END_TICK = 12;

/**
 * How an edit goes on once saved. `afterSave(result, entry)`: anything to do then (announce it, note what is being
 * named); `into`: the history entry the edit completes; `after(result)`: the item to select once its text is drawn,
 * with `label` to open the label box on it, or `menu` to keep its menu open, or null for nothing; `keep`: the menu the
 * edit was made from stays open meanwhile (a picker's pick).
 * @typedef {object} EditOptions
 * @property {(result: any, entry: import('./history.mjs').Entry) => void} [afterSave]
 * @property {import('./history.mjs').Entry | null} [into]
 * @property {(result: any) => ({ item: Item, label?: boolean, menu?: boolean, others?: Item[], reveal?: boolean } | null)} [after]
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
 * @param {ReturnType<typeof import('./viewer.mjs').createViewer>} deps.viewer
 * @param {(text: string) => Promise<unknown>} deps.parse throws when the text is not valid Mermaid
 * @param {(text: string) => Promise<void>} deps.display show saved text as the page shows any new version
 * @param {{ notice(message: string, kind: 'info'|'warning'|'error'): void, hideNotice(): void, announce(message: string): void, history(can: { undo: boolean, redo: boolean }): void }} deps.ui
 *   `history`: whether there is anything to undo or redo, told whenever that may have changed
 * @param {Record<'stage'|'diagram'|'labelBox'|'find'|'findBox'|'findCount', HTMLElement>} deps.els
 */
export function createEditor({ source, viewer, parse, display, ui, els }) {
  let editable = false;
  /** @type {Item | null} */
  let selected = null;
  /** @type {string} the text on screen, which edge ids refer to */
  let shownText = '';
  let edgesOk = false;        // the edges on screen match the text's, so edges can be selected and nodes deleted
  let connecting = false;     // after "Connect to…": the next node or subgraph clicked is the edge's target
  /** @type {Item | null} while connecting by keys: the node or subgraph the arrows have reached, which Enter connects to */
  let candidate = null;
  /** @type {Item | null} what Escape last cleared, for Enter to bring back; a click on empty space forgets it */
  let cleared = null;
  /** @type {{ x: number, y: number } | null} where the empty-space menu was opened, in stage coordinates */
  let spaceAt = null;
  /**
   * What to select once the text an edit saved is drawn, with the label box on it for a node or subgraph just added.
   * Good for that text only: an edge is found by its place in it. `clicked`: an item clicked while the edit saved,
   * whose menu opens even though the edit closed every menu. `others`: where to go instead, in order, when `item` is
   * not drawn; `reveal`: brought into view and read out, as a key's selection is, after `say` (what was done) in one
   * line.
   * @type {{ text: string, item: Item, label?: boolean, menu?: boolean, clicked?: boolean, others?: Item[], reveal?: boolean, say?: string } | null}
   */
  let pending = null;
  const history = createHistory();
  /**
   * For each history entry, what was selected just before its edit, and what its edit selected after (with where to go
   * instead): undo selects the first, redo the second, each against exactly the text it puts back.
   * @type {WeakMap<import('./history.mjs').Entry, { before: Item | null, after: { item: Item, others?: Item[] } | null }>}
   */
  const selections = new WeakMap();
  /** @type {Item | null} what the last edit, undo or redo left selected: redo moves the selection only from there */
  let settled = null;
  let busy = false;           // an edit or undo is being checked or saved; input meanwhile is ignored
  /** @type {(Item & { entry: import('./history.mjs').Entry }) | null} while what was just added is named: its name belongs to its add */
  let naming = null;
  /** @type {Item | null} while the label box is open over it */
  let labelling = null;
  let refused = false;        // the notice shows why a menu item does not apply
  let swallowClick = false;   // a click away from the label box that could not save it: the click does nothing
  let keptClick = false;      // a click away that kept an emptied label: its notice outlasts the click
  /** @type {{ item: Item, menu: boolean, clicked: true } | null} an item clicked while an edit saves: selected once drawn */
  let clickedMeanwhile = null;

  /** The drawing's elements that match `selector`: SVG, apart from labels' HTML. */
  const drawn = (/** @type {string} */ selector) => /** @type {SVGElement[]} */ ([...els.stage.querySelectorAll(selector)]);
  const nodeEl = (/** @type {string} */ id) => drawn('g.node[data-page-node]').find((g) => g.dataset.pageNode === id);
  const edgeEls = (/** @type {string} */ id) => drawn('[data-page-edge]').filter((e) => e.dataset.pageEdge === id);
  const clusterEl = (/** @type {string} */ id) => drawn('g.cluster[data-page-subgraph]').find((g) => g.dataset.pageSubgraph === id);
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
    const subgraph = (/** @type {SVGElement | null} */ (target.closest('g.cluster[data-page-subgraph]')))?.dataset.pageSubgraph;
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
  const shownEdge = (/** @type {string} */ id) => edges(shownText).find((e) => e.svgId === id);
  /** A drawn node's shape as written, or null for one these edits cannot read (an id they do not take). */
  const shownShape = (/** @type {string} */ id) => { try { return shapeOf(shownText, id); } catch { return null; } };
  const input = /** @type {HTMLTextAreaElement} */ (els.labelBox);

  function setEditable(/** @type {boolean} */ on) {
    editable = on;
    els.stage.classList.toggle('editable', on);
    if (!on) { closeFind(null); deselect(); closeLabelBox(); }
    historyChanged();
  }
  const historyChanged = () => ui.history({ undo: editable && history.size > 0, redo: editable && history.redoSize > 0 });

  // --- the menus -----------------------------------------------------------------------------------------------

  // What each menu item does (menu-items.mjs lists them). An item with a submenu does nothing itself.
  /** The selection, where a menu item or a key acts on it: there is one. */
  const selection = () => /** @type {Item} */ (selected);

  /** @type {Record<string, () => void>} */
  const handlers = {
    'add-connected-node': () => { const from = selection().id; addAndName((text) => addConnected(text, from)); },
    'connect': () => {
      connecting = true;
      moves.forgetCandidate();
      // The dashed outline starts on the item itself (the user): Enter at once connects it to itself.
      markCandidate(selection(), { quiet: true });
      ui.notice('Click the node or subgraph the edge goes to, or move the dashed outline to it with the arrows and press '
        + 'Enter (on this one, a self-loop). Click away or press Escape to cancel.', 'info');
    },
    'edit-node': () => openLabelBox(selection()),
    'edit-label': () => openLabelBox(selection()),
    'edit-title': () => openLabelBox(selection()),
    'delete-node': () => deleteSelected(),
    'delete-edge': () => deleteSelected(),
    'reverse-edge': () => { const id = selection().id; editDrawn((text) => reverseEdge(text, id), { after: sameEdge(id) }); },
    'add-node': () => {
      const subgraph = selectedSubgraph();
      addAndName((text) => addNode(text, { subgraph }), subgraph);
    },
    'add-subgraph': () => {
      const parent = selectedSubgraph();
      addAndName((text) => addSubgraph(text, { parent }), parent, 'subgraph');
    },
    'fit-view': () => viewer.fit(),
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
    onRefuse: (/** @type {string} */ why) => { refused = true; ui.notice(why, 'warning'); },
    // Only a menu's own notice goes with it; the one saying there is no edge match stays.
    onClose: () => { if (refused) ui.hideNotice(); refused = false; },
  };
  const menus = Object.fromEntries(Object.entries(MENUS).map(([kind, items]) => [kind, createMenu(items, menuOptions)]));
  const closeMenus = () => { for (const m of Object.values(menus)) m.close(); };
  const menuOpen = () => menus.node.isOpen() || menus.edge.isOpen() || menus.subgraph.isOpen() || menus.title.isOpen();

  /** What the menus need to know to gray their items. */
  function menuState() {
    return {
      edgesOk,
      selfLoop: selected?.kind === 'edge' && shownEdge(selected.id)?.from === shownEdge(selected.id)?.to,
      nameWhy: selected?.kind === 'subgraph' ? subgraphRefusal(shownText, selected.id) : null,
    };
  }

  // --- selection -----------------------------------------------------------------------------------------------

  // The page's marks: the selection, Connect to…'s candidate, find's matches and its current one. Mermaid writes
  // classDef, style and linkStyle colors inline with !important, which no stylesheet rule beats: while an item is
  // marked, its inline colors lose the !important (the original kept in data-page-style), so the mark's colors show.
  const MARKED = '[data-page-selected], [data-page-candidate], [data-page-match], [data-page-current]';
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
    clearMarks('data-page-selected', 'data-page-candidate');
    for (const e of drawn('[data-page-end]')) e.remove();
    candidate = null;
  };

  /** Select a node, an edge or a subgraph (it is outlined); with `menu`, also open its menu beside it. */
  function select(/** @type {Item} */ sel, /** @type {{ keepMode?: boolean, menu?: boolean, moving?: boolean }} */ { keepMode = false, menu = false, moving = false } = {}) {
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
    for (const e of elsOf(sel)) mark(e, 'data-page-selected');
    if (sel.kind === 'edge') markEnd();
    if (!keepMode) connecting = false;
    if (!menu || connecting) return;
    if (sel.kind === 'edge') {
      const arrow = shownEdge(sel.id)?.arrow ?? '';
      arrowPicker.current(arrowType(arrow), arrow);
    }
    menus[sel.kind].open(/** @type {Element} */ (selectedEl()).getBoundingClientRect(), menuState());
  }

  /** @type {'start' | 'end' | null} the end of the selected edge its mark is at */
  let endSide = null;
  /**
   * Mark the end the selected edge counts as reached from, whose edges the cross arrows step (the user): a short tick
   * across its line, in the stage so it moves with the diagram, at one size on screen whatever the zoom, and slid
   * along the line until it is clear of any text. `measure`: work out which end again (a new selection, or Space);
   * else the same end, redrawn for a new zoom.
   */
  function markEnd(measure = true) {
    for (const e of drawn('[data-page-end]')) e.remove();
    if (selected?.kind !== 'edge') return;
    const id = selected.id;
    if (measure) {
      const { boxes, edges } = layout();
      const e = edges.find((x) => x.id === id);
      endSide = e ? countedEnd(boxes, e, moves.came()) : null;
    }
    const path = /** @type {SVGPathElement | undefined} */ (edgeEls(id).find((e) => e.matches('path:not([data-page-only])')));
    const m = path?.getScreenCTM();
    if (!path || !m || !endSide) return;
    const k = Math.hypot(m.a, m.b) || 1, len = path.getTotalLength();
    const screen = (/** @type {DOMPoint} */ p) => ({ x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f });
    const texts = drawn('g.edgeLabel, .cluster-label, g.node .label, .flowchartTitleText')
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width);
    /** The tick `d` screen px in from the counted end: its two ends in the path's own units. */
    const tick = (/** @type {number} */ d) => {
      const s = Math.min(len, d / k), at = endSide === 'start' ? s : len - s;
      const p = path.getPointAtLength(at);
      const a = path.getPointAtLength(Math.max(0, at - 1)), b = path.getPointAtLength(Math.min(len, at + 1));
      const t = Math.hypot(b.x - a.x, b.y - a.y) || 1, h = END_TICK / 2 / k;
      const nx = -(b.y - a.y) / t * h, ny = (b.x - a.x) / t * h;
      return [{ x: p.x - nx, y: p.y - ny }, { x: p.x + nx, y: p.y + ny }];
    };
    const clear = (/** @type {{ x: number, y: number }[]} */ ends) => {
      const [u, v] = ends.map((q) => screen(/** @type {DOMPoint} */ (q)));
      const r = { left: Math.min(u.x, v.x) - 3, right: Math.max(u.x, v.x) + 3, top: Math.min(u.y, v.y) - 3, bottom: Math.max(u.y, v.y) + 3 };
      return !texts.some((t) => r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top);
    };
    // Past the arrowhead, then on along the line, up to its middle, until no text is under it.
    let ends = tick(12);
    for (let d = 12; d <= (len * k) / 2; d += 3) {
      const at = tick(d);
      if (clear(at)) { ends = at; break; }
    }
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    for (const [a, v] of Object.entries({ x1: ends[0].x, y1: ends[0].y, x2: ends[1].x, y2: ends[1].y })) el.setAttribute(a, String(v));
    el.setAttribute('data-page-end', '');
    el.setAttribute('data-page-only', '');
    /** @type {Element} */ (path.parentNode).append(el);
  }

  function deselect() {
    unmark();
    selected = null;
    connecting = false;
    closeMenus();
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
  function addAndName(change, into = null, kind = 'node') {
    /** @type {EditOptions} */
    const options = {
      afterSave: (result, entry) => { naming = { kind, id: result.id, entry }; },
      after: (result) => ({ item: { kind, id: result.id }, label: true }),
    };
    if (into && drawnOnly(into)) editDrawn(change, options); else edit(change, options);
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
    if (!refuseUnnamed(sel.id)) openLabelBox(sel);
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

  function clicked(/** @type {Element} */ target) {
    if (!editable) return;
    if (ended()) return;
    const item = itemAt(target);
    clickedDuringEdit(item);
    if (connecting) { connectTo(item?.kind === 'edge' ? null : item); return; }
    if (item) select(item);
    else { deselect(); cleared = null; if (!keptClick) ui.hideNotice(); }
    keptClick = false;
  }

  /** Leave Connect to… with nothing connected: by Escape or a click away. */
  function cancelConnect() {
    connecting = false;
    ui.hideNotice();
    select(selection());
  }

  /** End Connect to… on `to`, a click's or Enter's: an edge from the selection to it, or nothing for null. */
  function connectTo(/** @type {Item | null} */ to) {
    const from = selection();   // Connect to… starts from the selection
    connecting = false;
    ui.hideNotice();
    if (!to) { deselect(); return; }
    if (to.kind === 'subgraph' && refuseUnnamed(to.id)) { select(from); return; }
    deselect();
    const names = [named(from), named(to)];
    const change = (/** @type {string} */ text) => connect(text, from.id, to.id);
    /** @type {EditOptions} */
    const options = {
      afterSave: () => ui.announce(`Connected ${names[0]} to ${names[1]}`),
      // The new edge is appended: it is the last.
      after: (result) => {
        const e = edges(result.text).at(-1);
        return e ? { item: { kind: 'edge', id: e.svgId } } : null;
      },
    };
    const drawn = [from, to].some((x) => x.kind === 'subgraph' && drawnOnly(x.id));
    if (drawn) editDrawn(change, options); else edit(change, options);
  }

  /** A right-click or long-press; or, `byKey`, the menu key or Shift+F10, which open what M opens. */
  function contextMenu(/** @type {Element} */ target, /** @type {number} */ x, /** @type {number} */ y, byKey = false) {
    if (!editable) return false;
    if (byKey) { keys.m(); return true; }
    if (connecting) return true;
    if (ended()) return true;
    const item = itemAt(target);
    clickedDuringEdit(item, true);
    if (item) select(item, { menu: true });
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
      if (text !== drawnFrom) throw new Error('the diagram changed; select it again.');
      return change(text);
    }, options);
  }

  /** Delete the selected node or edge. */
  function deleteSelected() {
    const sel = selected;
    if (!sel) return;
    if (sel.kind === 'subgraph') { ui.notice('Deleting a subgraph is not supported yet; edit it in the file.', 'warning'); return; }
    if (sel.kind === 'title') { ui.notice('Removing the title is not supported; edit it in the file.', 'warning'); return; }
    if (!edgesOk) { ui.notice(NO_EDGE_MATCH, 'warning'); return; }
    // Named before the edit: once deleted, the node is no longer drawn.
    const name = sel.kind === 'node' && named(sel);
    // Where the keyboard goes after (the user: it keeps its place): back along the trail to the first item still
    // drawn; with no trail, an edge's source (a node clicked: nothing). Taken now: the edit starts the trail afresh.
    const back = moves.fallback(sel);
    const source = sel.kind === 'edge' ? shownEdge(sel.id)?.from : null;
    if (source) back.push({ kind: subgraphs(shownText).some((g) => g.id === source) ? 'subgraph' : 'node', id: source });
    editDrawn((text) => (sel.kind === 'edge' ? deleteEdge(text, sel.id) : deleteNode(text, sel.id)), {
      after: () => (back.length ? { item: back[0], others: back.slice(1), reveal: true } : null),
      afterSave: (result) => {
        if (sel.kind === 'edge') ui.announce('Deleted the edge');
        else ui.announce(`Deleted ${name}` + (result.edges ? ` and ${result.edges} edge${result.edges === 1 ? '' : 's'}` : ''));
      },
    });
  }

  // Keys (GLOBAL_KEYS): Ctrl+Z (Cmd+Z) undoes; Ctrl+Shift+Z (Cmd+Shift+Z) or Ctrl+Y redoes (not Cmd+Y: Chrome on macOS
  // opens its History with it); N adds a node (connected to the selected node, or in the selected subgraph); Enter or F2
  // opens the selected node's panel, or edits the selected edge's label or subgraph's title, and with nothing selected
  // selects the node nearest the middle of the view; the arrows move a selected node along the edges; Delete or
  // Backspace deletes the selection; M opens the selection's menu, or with nothing selected the empty-space menu at the middle of the
  // diagram; F fits the diagram to the window, whatever is selected or waiting; with nothing selected the arrows move
  // the diagram; + (or =) and - zoom; Escape backs out of whatever is open. The view keys (VIEW_KEYS) also work when
  // the diagram is not editable (a sequence diagram still fits and moves).
  // None of them while the label box (or another field) has the keyboard; an open menu takes its own keys first.
  /** @type {Record<string, () => unknown>} what each key does, by name (below); truthy when it was used */
  const keys = {
    n: () => {
      if (connecting) return false;
      const from = selectedNode();
      if (from) addAndName((text) => addConnected(text, from));
      else handlers['add-node']();
      return true;
    },
    // C starts Connect to… on a selected node or subgraph, as their menus' C does, refused as it is grayed there. While
    // connecting it does nothing: Escape or a click away is the way out of every wait (the user), as the notice says.
    c: () => {
      if (connecting) return true;
      if (selected?.kind !== 'node' && selected?.kind !== 'subgraph') return false;
      const item = MENUS[selected.kind].find((i) => i.action === 'connect');
      const state = menuState();
      if (item?.applies && !item.applies(state)) { ui.notice(item.why?.(state) ?? '', 'warning'); return true; }
      handlers.connect();
      return true;
    },
    // R reverses a selected edge, as the edge menu's R does, and is refused as it is grayed there.
    r: () => {
      if (connecting || selected?.kind !== 'edge') return false;
      const item = MENUS.edge.find((i) => i.action === 'reverse-edge');
      const state = menuState();
      if (item?.applies && !item.applies(state)) { ui.notice(item.why?.(state) ?? '', 'warning'); return true; }
      handlers['reverse-edge']();
      return true;
    },
    enter: () => {
      if (connecting && candidate?.kind === 'edge') {
        ui.notice('Pick a node or subgraph to connect to: an edge cannot be connected to.', 'warning');
        return true;
      }
      if (connecting) { if (candidate) connectTo(candidate); return Boolean(candidate); }
      if (selected) { editLabelOrTitle(selected); return true; }
      // What Escape cleared comes back, while it is still drawn; else the middle node.
      if (cleared && elsOf(cleared).length) { selectByKey(cleared); return true; }
      const r = els.diagram.getBoundingClientRect();
      const id = nearest(layout().boxes.filter((b) => b.kind === 'node'), r.left + r.width / 2, r.top + r.height / 2);
      if (id) selectByKey({ kind: 'node', id });
      return Boolean(id);
    },
    f2: () => selected && !connecting && (editLabelOrTitle(selected), true),
    delete: () => selected && !connecting && (deleteSelected(), true),
    backspace: () => selected && !connecting && (deleteSelected(), true),
    m: () => {
      if (connecting) return false;
      if (selected) { select(selected, { menu: true }); return true; }
      const r = els.diagram.getBoundingClientRect();
      openSpaceMenu(r.left + r.width / 2, r.top + r.height / 2);
      return true;
    },
    // F fits the diagram; with an item selected, it centers it at the zoom it has instead (the user). The title, at
    // the diagram's top, is fitted with it.
    f: () => {
      if (!selected || selected.kind === 'title') viewer.fit(); else handlers['center-view']();
      return true;
    },
    ...Object.fromEntries(['Up', 'Down', 'Left', 'Right'].flatMap((d) => {
      const key = `Arrow${d}`, name = key.toLowerCase();
      return [[name, () => arrow(key, 'plain')], [`ctrl+${name}`, () => arrow(key, 'ctrl')], [`shift+${name}`, () => arrow(key, 'shift')]];
    })),
    o: () => moves.out(),
    i: () => moves.into(),
    '/': () => { if (connecting) return false; openFind(); return true; },
    // Space: the selected edge counts as reached from its other end, whose edges the cross arrows then step.
    ' ': () => {
      const to = moves.other();
      if (!to) return false;
      markEnd();
      const kind = drawn('g.cluster[data-page-subgraph]').some((g) => g.dataset.pageSubgraph === to.id) ? 'subgraph' : 'node';
      ui.announce(`Reached from ${named(/** @type {Item} */ ({ kind, id: to.id }))}`);
      return true;
    },
    '+': () => { viewer.zoom(ZOOM_STEP); return true; },
    // 0 is actual size, as a browser's Ctrl+0 is (the user): the digits are the pickers' only.
    0: () => { viewer.zoomTo(1); return true; },
    '=': () => { viewer.zoom(ZOOM_STEP); return true; },
    '-': () => { viewer.zoom(1 / ZOOM_STEP); return true; },
    // Escape is claimed only when it let go of something, so that otherwise the browser's own use of it (closing Help)
    // goes ahead.
    escape: () => {
      if (connecting) { cancelConnect(); return true; }
      const had = Boolean(selected);
      if (selected) cleared = selected;
      deselect();
      ui.hideNotice();
      return had;
    },
  };
  const VIEW_KEYS = ['f', 'escape', '+', '=', '-', '0',
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
      ...drawn('g.cluster[data-page-subgraph]').map((g) => box('subgraph', /** @type {string} */ (g.dataset.pageSubgraph),
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
          id: e.svgId, from: e.from, to: e.to, mid,
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
    state: { selected: () => selected, connecting: () => connecting, candidate: () => candidate, edgesOk: () => edgesOk },
  });
  /** In Connect to…, the node or subgraph Enter would connect to: outlined dashed, said aloud and brought into view. */
  function markCandidate(/** @type {Item} */ item, { quiet = false } = {}) {
    clearMarks('data-page-candidate');
    candidate = item;
    for (const e of elsOf(item)) mark(e, 'data-page-candidate');
    const el = elsOf(item)[0];
    const what = item.kind === 'edge' ? 'an edge, cannot be connected to'
      : same(item, selection()) ? 'press Enter to connect to itself' : 'press Enter to connect';
    // At the start the notice says it all; a screen reader hears that one line.
    if (quiet) return;
    ui.announce(`${named(item)}: ${what}`);
    if (el) viewer.reveal(el.getBoundingClientRect());
  }
  /**
   * Select from the keyboard: said aloud, since nothing else tells a screen reader, and brought into view; `moving`,
   * by an arrow, O or I, which keep the trail and I's place inside.
   */
  function selectByKey(/** @type {Item} */ item, /** @type {string | undefined} */ said = undefined, moving = false) {
    select(item, { moving });
    ui.announce(`${said ? `${said}; ` : ''}${named(item)} selected`);
    const el = elsOf(item)[0];
    if (el) viewer.reveal(el.getBoundingClientRect());
  }

  // --- find: / -------------------------------------------------------------------------------------------------

  // What was typed is matched against the whole diagram (find.mjs). Typing never moves the view; Tab and Shift+Tab
  // step through the matches, the first of them with any off screen moving the view once to show them all, so Escape
  // is the way out of the box. The selection is set aside meanwhile: Enter selects the current match; Escape puts back
  // the selection, and the view too unless the user moved it since; a click away puts back the selection and keeps
  // the view (docs/ux.md).
  const findBox = /** @type {HTMLInputElement} */ (els.findBox);
  /**
   * `view`: the view before the find, put back on Escape unless the user has `moved` it since.
   * @type {{ before: Item | null, matches: import('./find.mjs').Findable[], at: number, view: ReturnType<typeof viewer.getView>, moved: boolean } | null}
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
    for (const g of drawn('g.cluster[data-page-subgraph]')) {
      const item = /** @type {Item} */ ({ kind: 'subgraph', id: g.dataset.pageSubgraph });
      add(item, g.querySelector('.cluster-label'), labelEl(item)?.innerText ?? g.querySelector('.cluster-label')?.textContent ?? '');
    }
    add(TITLE, titleEl(), titleEl()?.textContent ?? '');
    return out;
  }
  function markMatches() {
    clearMarks('data-page-match', 'data-page-current');
    if (!finding) return;
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
    markMatches();
    const at = f.matches[f.at];
    const off = f.matches.filter((m) => !m.on).length;
    ui.announce(at ? `${f.matches.length} found${off ? `, ${off} off screen` : ''}; ${named(at)}` : findBox.value.trim() ? 'No match' : '');
  }
  function openFind() {
    if (finding) { findBox.focus(); return; }
    finding = { before: selected, matches: [], at: 0, view: viewer.getView(), moved: false };
    deselect();
    ui.hideNotice();
    findBox.value = lastQuery;
    els.find.hidden = false;
    findBox.focus();
    findBox.select();
    matchTyped();
  }
  /**
   * Close the box: select `pick`, or put back what was selected before; `restore` (Escape) puts
   * back the view as well, unless the user has moved it since.
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
    // No reveal for a pick: Enter has centered one off screen, and one on screen stays put (an edge's line may not be).
    if (pick) { select(pick); ui.announce(`${named(pick)} selected`); } else if (was.before && elsOf(was.before).length) select(was.before);
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
      // A jump to a match is to its middle (the user), so it is not left at the edge; one on screen stays put.
      if (!at.on) viewer.center((at.box.left + at.box.right) / 2, (at.box.top + at.box.bottom) / 2);
      closeFind(at);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const n = finding.matches.length;
      if (!n) return;
      // One move, then none (the user): with any match off screen, show them all, which counts them again.
      if (finding.matches.some((m) => !m.on)) viewer.frame(finding.matches.map((m) => m.box), underBar());
      finding.at = (finding.at + (e.shiftKey ? -1 : 1) + n) % n;
      markMatches();
      ui.announce(named(finding.matches[finding.at]));
    }
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
    // #diagram. The box and its strip keep their own presses (the caret, text selection, the shapes), and so do menus.
    if ((labelling || finding || menuOpen() || menus.space.isOpen()) && els.diagram.contains(at) && at !== input
      && !stripBox.contains(at) && !at.closest('[data-overlay]')) e.preventDefault();
  });
  // A click outside the diagram (header, footer, Help) is a click away: it ends a find and Connect to… as Escape
  // does, and closes the menus. Clicks in the diagram are the viewer's (clicked()): the browser's own click there
  // fires after a drag too.
  document.addEventListener('click', (e) => {
    const at = /** @type {Node} */ (e.target);
    if (els.diagram.contains(at) || els.find.contains(at)) return;
    if (finding) closeFind(null);
    if (connecting) cancelConnect();
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
    if ((e.ctrlKey || e.metaKey) && !e.altKey && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && key === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    // A key's name carries its modifiers: `ctrl+` for Ctrl or Alt (Option on a Mac; either on every system), then
    // `shift+` only where the key has a Shift entry of its own, so letters stay case-insensitive.
    const mod = e.ctrlKey || e.altKey ? 'ctrl+' : '';
    const name = e.shiftKey && keys[`${mod}shift+${key}`] ? `${mod}shift+${key}` : mod + key;
    if (e.metaKey || !keys[name] || (!editable && !VIEW_KEYS.includes(name))) return;
    if (keys[name]()) e.preventDefault();
  });

  // --- the label box: editing a label in place -----------------------------------------------------------------

  // The box is laid exactly over the node, or over the edge's label (the middle of its line if it has none): that size,
  // or larger when the text needs it, kept centered as it grows. Enter saves; Shift+Enter starts a new line, which the
  // label keeps as a line break.
  const measure = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
  const LINE_HEIGHT = 18;

  /** What the label box covers: the node, the subgraph's title, the edge's label, or the middle of the edge's line. */
  function labelBoxRect(/** @type {Item} */ target) {
    if (target.kind === 'node') return nodeEl(target.id)?.getBoundingClientRect();
    if (target.kind === 'subgraph') return clusterEl(target.id)?.querySelector('.cluster-label')?.getBoundingClientRect();
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

  // The node panel: on a node, a strip of shapes lies under the box. Down from the box's last line goes into it, where
  // the arrows move focus; a digit, a click, or Enter on the focused shape selects it (Enter also goes back to the box);
  // Up from the top row or Escape goes back to the box, keeping what was selected. Enter in the box writes the label
  // and the shape as one change. Nothing is drawn until then (docs/ux.md, the preview rule).
  const strip = createPicker({
    title: 'Shape',
    entries: NODE_SHAPES,
    columns: 10,
    strip: true,
    onPick: (at) => selectShape(at),
  });
  /** Select shape `at` in the strip, and say so: nothing else shows it to a screen reader. */
  function selectShape(/** @type {string} */ at) {
    strip.current(at);
    const entry = NODE_SHAPES.find((e) => e.key === at);
    ui.announce(`${entry?.name}${entry?.meaning && entry.meaning !== entry.name ? `, ${entry.meaning}` : ''} selected`);
  }
  const stripBox = Object.assign(document.createElement('div'), { className: 'menu strip', popover: 'manual' });
  stripBox.dataset.overlay = '';
  // A press anywhere on the strip, icon or not, leaves focus where it is: on the body, it would close the box.
  stripBox.addEventListener('mousedown', (e) => e.preventDefault());
  // Keys the picker leaves: Enter selects the focused shape and goes back to the box; Up from the top row and Escape go
  // back to the box; Tab saves, as from the box. None goes on to the page's own keys; Ctrl, Cmd and Alt combinations do, as from a menu.
  stripBox.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const on = /** @type {HTMLElement} */ (document.activeElement);
    if (e.key === 'Enter' && on.dataset.key) { e.preventDefault(); selectShape(on.dataset.key); input.focus(); }
    else if (e.key === 'Tab') { e.preventDefault(); saveLabel(keepEmptied()); }
    else if (e.key === 'Escape' || (e.key === 'ArrowUp' && !e.defaultPrevented)) { e.preventDefault(); input.focus(); }
    e.stopPropagation();
  });
  // The box closes when focus leaves both it and the strip.
  stripBox.addEventListener('focusout', (e) => {
    const to = /** @type {Node | null} */ (e.relatedTarget);
    if (to !== input && !stripBox.contains(to)) commit();
  });
  const stripHint = Object.assign(document.createElement('div'), {
    className: 'visually-hidden', id: 'strip-hint', textContent: 'Down arrow chooses a shape',
  });
  stripBox.append(strip.el, stripHint);
  els.diagram.append(stripBox);
  let stripOpen = false;
  /** @type {'below' | 'above'} the side of the label box the strip opened on, kept as it follows the box */
  let stripSide = 'below';
  /** @type {string | null} the shape the node had when the strip opened, or null for one these edits cannot read */
  let stripFrom = null;

  /** Place the strip under the label box; `fresh`, as it opens: above it when there is no room below. */
  function placeStrip(fresh = false) {
    if (!stripOpen) return;
    const r = input.getBoundingClientRect(), s = stripBox.getBoundingClientRect();
    const center = (r.left + r.right) / 2 - s.width / 2;
    const at = place({ left: center, top: r.top, right: center + s.width, bottom: r.bottom }, s,
      els.diagram.getBoundingClientRect(), { side: fresh ? 'below' : stripSide, gap: 6, flip: fresh });
    if (fresh) stripSide = at.flipped ? 'above' : 'below';
    stripBox.style.left = at.left + 'px';
    stripBox.style.top = at.top + 'px';
  }

  /** Open the strip for node `id`; `added`: the node was just added, so it is a rectangle whatever it reads as. */
  function openStrip(/** @type {string} */ id, /** @type {boolean} */ added) {
    stripOpen = true;
    stripFrom = shownShape(id) ?? (added ? 'rect' : null);
    // A shape not in the list is named, with none pressed; one that cannot be read shows nothing as current.
    strip.current(stripFrom, stripFrom ?? '');
    stripBox.showPopover();
    input.setAttribute('aria-describedby', stripHint.id);
    placeStrip(true);
  }

  function closeStrip() {
    stripOpen = false;
    stripFrom = null;
    if (stripBox.matches(':popover-open')) stripBox.hidePopover();
    input.removeAttribute('aria-describedby');
  }

  function openLabelBox(/** @type {Item} */ target) {
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
    if (target.kind === 'node') openStrip(target.id, same(naming, target));
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
    placeStrip();
  }

  // labelling goes first: hiding the input blurs it, and a blur with the box still open would save it (commit).
  function closeLabelBox() {
    labelling = null;
    input.style.display = 'none';
    closeStrip();
  }

  /**
   * Focus left the label box and its strip (a click or tap away, Tab): save, as Enter does; only Escape discards
   * (docs/ux.md). An emptied label is kept as it was, and the click goes on. What cannot be saved (a shape the label
   * cannot take, or another edit still saving) keeps the box open, focus back in it, and the click that left it does
   * nothing.
   */
  function commit() {
    if (!labelling) return;
    // Refused already by this press: its own focus move blurs the box a second time.
    if (swallowClick) { input.focus(); return; }
    if (busy) { ui.notice('Not saved: another edit is still saving; try again.', 'error'); keepBox(); return; }
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
    return labelling.kind === 'node' ? 'Label kept: a label cannot be empty.' : 'Title kept: a title cannot be empty.';
  }
  function keepBox() {
    swallowClick = true;
    input.focus();
  }

  input.addEventListener('input', sizeLabelBox);
  input.addEventListener('blur', (e) => {
    if (!stripBox.contains(/** @type {Node | null} */ (e.relatedTarget))) commit();
  });
  input.addEventListener('keydown', (e) => {
    const target = labelling;
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (naming && same(naming, target)) { cancelAdd(naming); return; }
      closeLabelBox();
      naming = null;
      ui.hideNotice();   // a refused save's error is about the box, which is gone
      if (target) select(target);
      return;
    }
    // Down goes into the strip only from the last line, where it would not move the caret. The line is the text's:
    // the box widens to its text (sizeLabelBox), so a line never wraps.
    if (e.key === 'ArrowDown' && stripOpen && !input.value.slice(input.selectionEnd).includes('\n')) {
      e.preventDefault();
      strip.focus();
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
    if (busy) { ui.notice('Not cancelled: another edit is still saving; try again.', 'error'); return; }
    const what = added.kind === 'node' ? 'Node' : 'Subgraph';
    closeLabelBox();
    naming = null;
    els.diagram.focus();
    exclusively(async () => {
      ui.hideNotice();
      const base = source.snapshot();
      if (base.text !== added.entry.after) {
        ui.notice(`${what} kept: the file has changed since it was added.`, 'warning');
        select(added);
        return;
      }
      if (!(await save(added.entry.before, base.version))) return;
      history.discard(added.entry);
      deselect();
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
   * Save what the label box holds (and the strip's shape, while it is open), as Enter does. Returns false when it was
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
    const picked = stripOpen ? strip.value() : null;
    const shape = picked && picked !== stripFrom ? picked : null;
    /** A node's new label and shape, as one change. */
    const renamed = (/** @type {string} */ text) => {
      const named = relabelled ? relabel(text, target.id, label).text : text;
      return shape ? setShape(named, target.id, shape) : { text: named };
    };
    // A shape the label cannot take is refused before the box closes, so what was typed is kept to try another.
    if (shape) {
      try { renamed(source.snapshot().text ?? ''); } catch (err) { ui.notice('Not saved: ' + err.message, 'error'); return false; }
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
    const ids = edges(text).map((e) => e.svgId);
    edgesOk = ids.length === lines.length && lines.every((p, k) => p.dataset.id === ids[k]);
    if (!edgesOk) {
      ui.notice("merma can't match this diagram's edges to its text, so edges can't be selected and nodes can't be "
        + 'deleted here; edit those in the file.', 'warning');
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
  async function exclusively(/** @type {() => Promise<void>} */ work) {
    if (busy) return;
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
        ui.notice('Not saved: ' + (e.message || e), 'error');
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
        before: selections.get(entry)?.before ?? was,
        after: next && !clickedAway ? { item: next.item, others: 'others' in next ? next.others : undefined } : null,
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
        if (redoing.reason === 'empty') ui.notice('Nothing to redo.', 'info');
        else ui.notice('Cannot redo: the file has changed since.', 'error');
        return;
      }
      const entry = history.nextRedo;
      if (!(await save(redoing.text, base.version))) return;
      history.redone();
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
        if (undoing.reason === 'empty') ui.notice('Nothing to undo.', 'info');
        else ui.notice('Cannot undo: the file has changed since that edit.', 'error');
        return;
      }
      const entry = history.newest;
      if (!(await save(undoing.text, base.version))) return;
      history.pop();
      deselect();
      closeLabelBox();
      const sel = entry && selections.get(entry)?.before;
      pending = sel ? { text: undoing.text, item: sel, reveal: true, say: 'Undone' } : null;
      await display(undoing.text);
      if (!selected) ui.announce('Undone');
      settled = selected;
    });
  }

  /**
   * Save text for the file over version `base` (default: the version the page has now), after checking it parses.
   * Returns true when saved.
   */
  async function save(/** @type {string} */ text, base = source.version) {
    try {
      await parse(text);
    } catch (e) {
      ui.notice('Not saved: the edit would make the diagram invalid.\n' + (e.message || e), 'error');
      return false;
    }
    const saved = await source.save(text, base);
    if (saved.ok === false) {
      ui.notice('Not saved: ' + saved.message + (saved.conflict ? ' Showing the new version; try again.' : ''), 'error');
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
      if (labelling) sizeLabelBox();
      markEnd(false);
      const el = selectedEl();
      if (selected && el) menus[selected.kind].reposition(el.getBoundingClientRect());
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
      if (!editable) return false;
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
    rendered(/** @type {string} */ text) {
      setEditable(isFlowchart(text));
      if (!editable) return;
      const changed = text !== shownText;
      shownText = text;
      const renderId = /** @type {string} */ (viewer.renderId);   // what is on screen was rendered
      for (const g of drawn('g.node')) {
        const id = nodeIdFromSvgId(g.id, renderId);
        if (id) g.dataset.pageNode = id;
      }
      // A subgraph whose id merma cannot read (`subgraph a-b [X]`) is left unselectable, as such a node's edges are.
      const known = new Set(subgraphs(text).map((s) => s.id));
      for (const g of drawn('g.cluster')) {
        const id = subgraphIdFromSvgId(g.id, renderId);
        if (id && known.has(id)) g.dataset.pageSubgraph = id;
      }
      tagEdges(text);
      // A new drawing while finding: find again in it, so no mark is left on what has gone.
      if (finding) { refind(); markMatches(); }
      const menu = menuOpen();
      const sel = selected;
      const next = pending;
      pending = null;
      const item = next && text === next.text ? [next.item, ...(next.others ?? [])].find((i) => elsOf(i).length) : null;
      if (next && item) {
        // An edit's own text: what it acted on, its menu still open after a picker's pick; or what was right-clicked
        // meanwhile, with its menu.
        if (next.reveal) selectByKey(item, next.say);
        else select(item, { menu: Boolean(next.menu) && (menu || Boolean(next.clicked)) });
        if (next.label) openLabelBox(item);
        return;
      }
      const kept = sel && elsOf(sel).length
        && (sel.kind === 'node' || !changed || (sel.kind === 'subgraph' && !drawnOnly(sel.id)));
      if (kept) select(sel, { keepMode: sel.kind !== 'edge', menu });
      else if (sel) deselect();
    },

    /** The file no longer renders: what is on screen is an older version, so editing it would edit something else. */
    failed() { setEditable(false); },

    state: () => ({
      selected: selectedNode(), selectedEdge: selected?.kind === 'edge' ? selected.id : null,
      selectedSubgraph: selectedSubgraph(), connecting, editable, edgesOk,
    }),

    /**
     * Undo or redo from a button. Unlike the keys, which a held key repeats, a press while an edit saves says why it did
     * nothing: most often the label box's own save, which the press started by clicking away from it.
     */
    undo: () => (busy ? ui.notice('Not undone: another edit is still saving; try again.', 'error') : undo()),
    redo: () => (busy ? ui.notice('Not redone: another edit is still saving; try again.', 'error') : redo()),

    /** Nothing in progress that a reload would lose: no edit being saved, no label box open, no connection half made. */
    idle: () => !busy && !labelling && !connecting,
  };
}
