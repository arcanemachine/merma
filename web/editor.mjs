// Editing a flowchart by pointing: click a node, an edge or a subgraph to select it, right-click (or long-press) for
// its menu, or right-click empty space to add a node; each action is a small text edit to the file
// (patch/flowchart.mjs). Each edit is checked with Mermaid's parser before it is saved, and saved over the version it
// was based on (source.mjs), so a change saved meanwhile by an agent or an editor is never overwritten. What this adds to the drawing is marked
// `data-page-…`, which the SVG export leaves out.

import { ARROW_TYPES } from './arrow-types.mjs';
import { createHistory } from './history.mjs';
import { createMenu } from './menu.mjs';
import { GLOBAL_KEYS, MENUS, NO_EDGE_MATCH } from './menu-items.mjs';
import { byPlace, edgeStep, nearest, step } from './navigate.mjs';
import {
  addConnected, addNode, addSubgraph, arrowType, connect, deleteEdge, deleteNode, direction, edges, isFlowchart, nodeIdFromSvgId,
  relabel, reverseEdge, setEdgeArrow, setEdgeLabel, setShape, setSubgraphTitle, setTitle, shapeOf, subgraphIdFromSvgId,
  subgraphRefusal, subgraphs,
} from './patch/flowchart.mjs';
import { createPicker } from './picker.mjs';
import { place } from './place.mjs';
import { NODE_SHAPES } from './shapes.mjs';

// With nothing selected, an arrow key moves the diagram a tenth of the area's size; + and - zoom by this factor.
const PAN_STEP = 0.1;
const ZOOM_STEP = 1.25;

/**
 * How an edit goes on once saved. `afterSave(result, entry)`: anything to do then (announce it, note what is being
 * named); `into`: the history entry the edit completes; `after(result)`: the item to select once its text is drawn,
 * with `label` to open the label box on it, or `menu` to keep its menu open, or null for nothing; `keep`: the menu the
 * edit was made from stays open meanwhile (a picker's pick).
 * @typedef {object} EditOptions
 * @property {(result: any, entry: import('./history.mjs').Entry) => void} [afterSave]
 * @property {import('./history.mjs').Entry | null} [into]
 * @property {(result: any) => ({ item: Item, label?: boolean, menu?: boolean } | null)} [after]
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
 * @param {Record<'stage'|'diagram'|'labelBox', HTMLElement>} deps.els
 */
export function createEditor({ source, viewer, parse, display, ui, els }) {
  let editable = false;
  /** @type {Item | null} */
  let selected = null;
  /** @type {string} the text on screen, which edge ids refer to */
  let shownText = '';
  let edgesOk = false;        // the edges on screen match the text's, so edges can be selected and nodes deleted
  let connecting = false;     // after "Connect to…": the next node or subgraph clicked is the edge's target
  /** @type {string | null} while connecting by keys: the node the arrows have reached, which Enter connects to */
  let candidate = null;
  /**
   * What to select once the text an edit saved is drawn, with the label box on it for a node or subgraph just added.
   * Good for that text only: an edge is found by its place in it. `clicked`: an item clicked while the edit saved,
   * whose menu opens even though the edit closed every menu.
   * @type {{ text: string, item: Item, label?: boolean, menu?: boolean, clicked?: boolean } | null}
   */
  let pending = null;
  const history = createHistory();
  let busy = false;           // an edit or undo is being checked or saved; input meanwhile is ignored
  /** @type {(Item & { entry: import('./history.mjs').Entry }) | null} while what was just added is named: its name belongs to its add */
  let naming = null;
  /** @type {Item | null} while the label box is open over it */
  let labelling = null;
  let refused = false;        // the notice shows why a menu item does not apply
  let swallowClick = false;   // a click away from the label box that could not save it: the click does nothing
  let keptClick = false;      // a click away that kept an emptied label: its notice outlasts the click
  /** @type {{ at: string, trail: import('./navigate.mjs').Trail } | null} the last arrow key's move, while it is selected */
  let walk = null;
  /** @type {{ at: string, group: string[] } | null} the last Ctrl+arrow's move: the edges the next steps go through */
  let edgeWalk = null;
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
      return `the edge from ${end(e.from)} to ${end(e.to)}`;
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
   * the ways in that pass no menu, which greys its items instead.
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
    if (!on) { deselect(); closeLabelBox(); }
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
      ui.notice('Click the node or subgraph the edge goes to, or reach it with the arrows and press Enter. Click away or '
        + 'press Escape to cancel.', 'info');
    },
    'edit-node': () => openLabelBox(selection()),
    'edit-label': () => openLabelBox(selection()),
    'edit-title': () => openLabelBox(selection()),
    'delete-node': () => deleteSelected(),
    'delete-edge': () => deleteSelected(),
    'remove-label': () => { const id = selection().id; editDrawn((text) => setEdgeLabel(text, id, ''), { after: sameEdge(id) }); },
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
  };
  // A handler for every action and an action for every handler: a typo in either would otherwise only show as a
  // menu item that does nothing.
  const actions = new Set(Object.values(MENUS).flat().filter((i) => !i.submenu).map((i) => i.action));
  for (const a of actions) if (!handlers[a]) throw new Error(`No handler for the menu action ${a}`);
  for (const a of Object.keys(handlers)) if (!actions.has(a)) throw new Error(`No menu item runs ${a}`);

  const arrowPicker = createPicker({
    title: 'Arrow type',
    entries: ARROW_TYPES,
    onPick: (arrow) => setArrow(selection().id, arrow, true),
  });
  /**
   * Give edge `id` the arrow type `arrow`, from the picker (`inMenu`: it stays open, on the new entry) or a digit. The
   * arrow type it has already writes nothing.
   */
  function setArrow(/** @type {string} */ id, /** @type {string} */ arrow, inMenu = false) {
    if (arrowType(shownEdge(id)?.arrow ?? '') === arrow) return;
    const name = ARROW_TYPES.find((a) => a.key === arrow)?.name;
    const again = sameEdge(id);
    editDrawn((text) => setEdgeArrow(text, id, arrow), {
      keep: inMenu,
      after: (result) => { const next = again(result); return next && { ...next, menu: inMenu }; },
      afterSave: () => ui.announce(`Changed the edge to ${name}`),
    });
  }
  /** Give node `id` the shape `shape`, from a digit; the shape it has already writes nothing. */
  function setNodeShape(/** @type {string} */ id, /** @type {string} */ shape) {
    if (shownShape(id) === shape) return;
    const item = /** @type {Item} */ ({ kind: 'node', id });
    const names = [named(item), NODE_SHAPES.find((e) => e.key === shape)?.name];
    edit((text) => setShape(text, id, shape), {
      after: () => ({ item }),
      afterSave: () => ui.announce(`Changed ${names[0]} to ${names[1]}`),
    });
  }
  /**
   * A digit on a selected node or edge sets its shape or arrow type, as the pickers' digits do: read by `e.code`, so a
   * digit means the same on any layout. A numpad key is a digit only with Num Lock on; off, it is an arrow. Returns
   * whether it was one.
   */
  function digitKey(/** @type {KeyboardEvent} */ e) {
    const d = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1];
    if (!d || (e.code.startsWith('Numpad') && e.key !== d) || !selected || connecting) return false;
    const entries = selected.kind === 'node' ? NODE_SHAPES : selected.kind === 'edge' ? ARROW_TYPES : [];
    const entry = entries.find((e) => e.digit === d);
    if (!entry) return false;
    if (selected.kind === 'node') setNodeShape(selected.id, entry.key); else setArrow(selected.id, entry.key);
    return true;
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

  /** What the menus need to know to grey their items. */
  function menuState() {
    return {
      edgesOk,
      hasLabel: selected?.kind === 'edge' && Boolean(shownEdge(selected.id)?.label),
      nameWhy: selected?.kind === 'subgraph' ? subgraphRefusal(shownText, selected.id) : null,
    };
  }

  // --- selection -----------------------------------------------------------------------------------------------

  const unmark = () => {
    for (const e of drawn('[data-page-selected]')) e.removeAttribute('data-page-selected');
    for (const e of drawn('[data-page-candidate]')) e.removeAttribute('data-page-candidate');
    candidate = null;
  };

  /** Select a node, an edge or a subgraph (it is outlined); with `menu`, also open its menu beside it. */
  function select(/** @type {Item} */ sel, /** @type {{ keepMode?: boolean, menu?: boolean }} */ { keepMode = false, menu = false } = {}) {
    unmark();
    // An item no longer drawn (the file changed under an open label box) cannot be selected.
    if (!elsOf(sel).length) { deselect(); return; }
    // A menu opened again for the same item stays open, so a change to the file does not reset it.
    const again = same(selected, sel);
    if (!again) walk = edgeWalk = null;   // a run of arrow keys ends when something else selects
    for (const [kind, m] of Object.entries(menus)) if (!(menu && again && kind === sel.kind)) m.close();
    selected = sel;
    for (const e of elsOf(sel)) e.setAttribute('data-page-selected', '');
    if (!keepMode) connecting = false;
    if (!menu || connecting) return;
    if (sel.kind === 'edge') {
      const arrow = shownEdge(sel.id)?.arrow ?? '';
      arrowPicker.current(arrowType(arrow), arrow);
    }
    menus[sel.kind].open(/** @type {Element} */ (selectedEl()).getBoundingClientRect(), menuState());
  }

  function deselect() {
    unmark();
    selected = null;
    connecting = false;
    closeMenus();
  }

  // The empty-space menu, at the pointer: it adds a node or a subgraph at the top level. Mermaid lays the diagram out,
  // so what is added lands where the layout puts it, not where the menu was opened.
  function openSpaceMenu(/** @type {number} */ x, /** @type {number} */ y) {
    deselect();
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
    if (swallowClick) { swallowClick = false; return; }
    const item = itemAt(target);
    clickedDuringEdit(item);
    if (connecting) { connectTo(item?.kind === 'edge' ? null : item); return; }
    if (item) select(item);
    else { deselect(); if (!keptClick) ui.hideNotice(); }
    keptClick = false;
  }

  /** End Connect to… on `to`, a click's or Enter's: an edge from the selection to it, or nothing for null. */
  function connectTo(/** @type {Item | null} */ to) {
    const from = selection();   // Connect to… starts from the selection
    connecting = false;
    ui.hideNotice();
    if (!to) { deselect(); return; }
    if (same(to, from)) { ui.notice('Pick a different node or subgraph to connect to.', 'warning'); select(from); return; }
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

  function contextMenu(/** @type {Element} */ target, /** @type {number} */ x, /** @type {number} */ y) {
    if (!editable) return false;
    if (connecting) return true;
    if (swallowClick) { swallowClick = false; return true; }
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
    editDrawn((text) => (sel.kind === 'edge' ? deleteEdge(text, sel.id) : deleteNode(text, sel.id)), { afterSave: (result) => {
      if (sel.kind === 'edge') ui.announce('Deleted the edge');
      else ui.announce(`Deleted ${name}` + (result.edges ? ` and ${result.edges} edge${result.edges === 1 ? '' : 's'}` : ''));
    } });
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
    enter: () => {
      if (connecting) { if (candidate) connectTo({ kind: 'node', id: candidate }); return Boolean(candidate); }
      if (selected) { editLabelOrTitle(selected); return true; }
      const r = els.diagram.getBoundingClientRect();
      const id = nearest(nodeBoxes(), r.left + r.width / 2, r.top + r.height / 2);
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
    f: () => { viewer.fit(); return true; },
    arrowup: () => arrow('ArrowUp', 0, -PAN_STEP),
    arrowdown: () => arrow('ArrowDown', 0, PAN_STEP),
    arrowleft: () => arrow('ArrowLeft', -PAN_STEP, 0),
    arrowright: () => arrow('ArrowRight', PAN_STEP, 0),
    'shift+arrowup': () => arrow('ArrowUp', 0, -PAN_STEP, true),
    'shift+arrowdown': () => arrow('ArrowDown', 0, PAN_STEP, true),
    'shift+arrowleft': () => arrow('ArrowLeft', -PAN_STEP, 0, true),
    'shift+arrowright': () => arrow('ArrowRight', PAN_STEP, 0, true),
    'ctrl+arrowup': () => edgeArrow('ArrowUp', true),
    'ctrl+arrowdown': () => edgeArrow('ArrowDown', true),
    'ctrl+arrowleft': () => edgeArrow('ArrowLeft', true),
    'ctrl+arrowright': () => edgeArrow('ArrowRight', true),
    '+': () => { viewer.zoom(ZOOM_STEP); return true; },
    '=': () => { viewer.zoom(ZOOM_STEP); return true; },
    '-': () => { viewer.zoom(1 / ZOOM_STEP); return true; },
    // Escape is claimed only when it let go of something, so that otherwise the browser's own use of it (closing Help)
    // goes ahead.
    escape: () => {
      if (connecting) { connecting = false; ui.hideNotice(); select(selection()); return true; }
      const had = Boolean(selected);
      deselect();
      ui.hideNotice();
      return had;
    },
  };
  const VIEW_KEYS = ['f', 'escape', '+', '=', '-',
    ...['up', 'down', 'left', 'right'].flatMap((d) => [`arrow${d}`, `shift+arrow${d}`])];
  for (const k of Object.keys(GLOBAL_KEYS)) if (!keys[k]) throw new Error(`No handler for the key ${k}`);
  const editLabelOrTitle = (/** @type {Item} */ sel) => (sel.kind === 'subgraph' ? editTitle(sel) : openLabelBox(sel));

  /** The drawn nodes, as navigate.mjs reads them. */
  const nodeBoxes = () => drawn('g.node[data-page-node]').map((g) => {
    const r = g.getBoundingClientRect();
    return { id: /** @type {string} */ (g.dataset.pageNode), x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  });
  /**
   * An arrow key: with a node selected it moves the selection along the edges, or with Shift (`place`) to the nearest
   * node that way on screen (navigate.mjs); with nothing selected it moves the diagram, `fx` and `fy` of the area's
   * size.
   */
  function arrow(/** @type {string} */ key, /** @type {number} */ fx, /** @type {number} */ fy, place = false) {
    if (!selected) { viewer.pan(fx, fy); return true; }
    // In Connect to… the arrows move the candidate, from the node the edge starts at; from a subgraph, the first
    // arrow reaches the node nearest the middle of the view.
    const at = connecting ? candidate ?? selectedNode() : selectedNode();
    const graph = {
      boxes: nodeBoxes(),
      links: edges(shownText).map((e) => ({ from: e.from, to: e.to })),
      direction: direction(shownText),
    };
    if (selected.kind === 'edge' && !connecting) return place ? false : edgeArrow(key, false);
    // The title: Down goes to the nearest node below it.
    if (!connecting && selected.kind === 'title') {
      const t = titleEl()?.getBoundingClientRect();
      const id = t && key === 'ArrowDown' && nearest(graph.boxes.filter((b) => b.y > t.bottom), t.left + t.width / 2, t.bottom);
      if (id) selectByKey({ kind: 'node', id });
      return true;
    }
    if (!at) {
      if (!connecting) return false;
      const r = els.diagram.getBoundingClientRect();
      const id = nearest(graph.boxes, r.left + r.width / 2, r.top + r.height / 2);
      if (id) markCandidate(id);
      return true;
    }
    // A move by place starts a new run: Up then goes to a parent, not back to where Shift left.
    const found = place ? byPlace(graph.boxes, at, key) : null;
    const next = place
      ? found && { id: found, trail: { path: [], group: [] } }
      : step(graph, at, key, walk?.at === at ? walk.trail : null);
    if (next) {
      if (connecting) markCandidate(next.id); else selectByKey({ kind: 'node', id: next.id });
      walk = { at: next.id, trail: next.trail };
    } else if (!place && !connecting && key === 'ArrowUp' && titleEl() && !byPlace(graph.boxes, at, key)) {
      // Up from the top row, with nowhere else to go, reaches the title.
      selectByKey(TITLE);
    }
    return true;
  }
  /**
   * Ctrl (or Alt) + an arrow onto and between edges, from the selected node or edge; with an edge selected, the plain
   * arrows do the same (navigate.mjs). `ctrl`: a plain arrow on a node is not this one's.
   */
  function edgeArrow(/** @type {string} */ key, /** @type {boolean} */ ctrl) {
    if (connecting || !selected || (selected.kind !== 'node' && selected.kind !== 'edge')) return false;
    if (selected.kind === 'node' && !ctrl) return false;
    // Without an edge match no edge can be selected (only a node can be selected then), as Delete says.
    if (!edgesOk) { ui.notice(NO_EDGE_MATCH, 'warning'); return true; }
    const graph = {
      boxes: nodeBoxes(),
      edges: edges(shownText).map((e) => ({ id: e.svgId, from: e.from, to: e.to })),
      direction: direction(shownText),
    };
    const at = /** @type {{ kind: 'node' | 'edge', id: string }} */ (selected);
    const next = edgeStep(graph, at, key, edgeWalk?.at === at.id ? edgeWalk.group : null);
    if (next) {
      selectByKey({ kind: next.kind, id: next.id });
      edgeWalk = { at: next.id, group: next.group };
    }
    return true;
  }
  /** In Connect to…, the node Enter would connect to: outlined, said aloud and brought into view. */
  function markCandidate(/** @type {string} */ id) {
    for (const e of drawn('[data-page-candidate]')) e.removeAttribute('data-page-candidate');
    candidate = id;
    const el = nodeEl(id);
    el?.setAttribute('data-page-candidate', '');
    ui.announce(`${named({ kind: 'node', id })}: press Enter to connect`);
    if (el) viewer.reveal(el.getBoundingClientRect());
  }
  /** Select from the keyboard: said aloud, since nothing else tells a screen reader, and brought into view. */
  function selectByKey(/** @type {Item} */ item) {
    select(item);
    walk = null;
    ui.announce(`${named(item)} selected`);
    const el = elsOf(item)[0];
    if (el) viewer.reveal(el.getBoundingClientRect());
  }

  // A press anywhere outside the diagram (header, footer) is a click away too: it cancels Connect to… as Escape does,
  // and closes the menus. Presses inside the diagram are the viewer's, which reports them as clicks.
  document.addEventListener('pointerdown', (e) => {
    // Any press is a new click: one left over from a refused save (its click landed outside the diagram) goes. This
    // runs before the press moves focus, and so before that blur can set it again.
    swallowClick = false;
    keptClick = false;
    // A press outside the label box and its strip ends it (and saves, commit): by the press itself, not by the focus
    // it moves, which a touch moves only once it is a tap.
    const at = /** @type {Node} */ (e.target), focused = /** @type {HTMLElement | null} */ (document.activeElement);
    if (labelling && at !== input && !stripBox.contains(at) && (focused === input || stripBox.contains(focused))) focused?.blur();
    if (els.diagram.contains(at)) return;
    if (connecting) { connecting = false; ui.hideNotice(); select(selection()); }
    closeMenus();
  });
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
    // Plain digits only: browsers keep Ctrl and Alt digits for switching tabs.
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && editable && digitKey(e)) { e.preventDefault(); return; }
    const mod = e.ctrlKey || e.altKey ? 'ctrl+' : '';
    const name = e.shiftKey && keys[`${mod}shift+${key}`] ? `${mod}shift+${key}` : mod + key;
    if (e.metaKey || !keys[name] || (!editable && !VIEW_KEYS.includes(name))) return;
    if (keys[name]()) e.preventDefault();
  });

  // --- the label box: editing a label in place -----------------------------------------------------------------

  // The box is laid exactly over the node, or over the edge's label (the middle of its line if it has none): that size,
  // or larger when the text needs it, kept centred as it grows. Enter saves; Shift+Enter starts a new line, which the
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
  /** @type {string | null} the shape the node had when the strip opened, or null for one these edits cannot read */
  let stripFrom = null;

  function placeStrip() {
    if (!stripOpen) return;
    const r = input.getBoundingClientRect(), s = stripBox.getBoundingClientRect();
    const centre = (r.left + r.right) / 2 - s.width / 2;
    const at = place({ left: centre, top: r.top, right: centre + s.width, bottom: r.bottom }, s,
      els.diagram.getBoundingClientRect(), { side: 'below', gap: 6 });
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
    placeStrip();
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
      ui.hideNotice();
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
      ui.announce('Saved');   // what afterSave announces, if anything, replaces it
      afterSave?.(result, entry);
      // An add's label box does not open on what was clicked instead, so what it added is not being named.
      if (clickedAway) naming = null;
      await display(result.text);
    });
  }

  function redo() {
    return exclusively(async () => {
      const base = source.snapshot();
      if (base.text === null) return;
      ui.hideNotice();
      const redoing = history.peekRedo(base.text);
      if (redoing.ok === false) {
        if (redoing.reason === 'empty') ui.notice('Nothing to redo.', 'warning');
        else ui.notice('Cannot redo: the file has changed since.', 'error');
        return;
      }
      if (!(await save(redoing.text, base.version))) return;
      history.redone();
      deselect();
      closeLabelBox();
      await display(redoing.text);
      ui.announce('Redone');
    });
  }

  function undo() {
    return exclusively(async () => {
      const base = source.snapshot();
      if (base.text === null) return;
      ui.hideNotice();
      const undoing = history.peek(base.text);
      if (undoing.ok === false) {
        if (undoing.reason === 'empty') ui.notice('Nothing to undo.', 'warning');
        else ui.notice('Cannot undo: the file has changed since that edit.', 'error');
        return;
      }
      if (!(await save(undoing.text, base.version))) return;
      history.pop();
      deselect();
      closeLabelBox();
      await display(undoing.text);
      ui.announce('Undone');
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
    viewChanged: () => {
      const el = selectedEl();
      if (selected && el) menus[selected.kind].reposition(el.getBoundingClientRect());
      menus.space.close();
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
      const menu = menuOpen();
      const sel = selected;
      const next = pending;
      pending = null;
      if (next && text === next.text && elsOf(next.item).length) {
        // An edit's own text: what it acted on, its menu still open after a picker's pick; or what was right-clicked
        // meanwhile, with its menu.
        select(next.item, { menu: Boolean(next.menu) && (menu || Boolean(next.clicked)) });
        if (next.label) openLabelBox(next.item);
        return;
      }
      const kept = sel && elsOf(sel).length
        && (sel.kind === 'node' || !changed || (sel.kind === 'subgraph' && !drawnOnly(sel.id)));
      if (kept) select(sel, { keepMode: sel.kind !== 'edge', menu });
      else deselect();
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
