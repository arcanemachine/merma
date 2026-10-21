// Editing a flowchart by pointing: click a node, an edge or a subgraph to select it, right-click (or long-press) for
// its menu, or right-click empty space to add a node; each action is a small text edit to the file
// (patch/flowchart.mjs). Each edit is checked with Mermaid's parser before it is saved, and saved over the version it
// was based on (source.mjs), so a change saved meanwhile by an agent or an editor is never overwritten. What this adds to the drawing is marked
// `data-page-…`, which the SVG export leaves out.

import { ARROW_TYPES } from './arrow-types.mjs';
import { createHistory } from './history.mjs';
import { createMenu } from './menu.mjs';
import { GLOBAL_KEYS, MENUS } from './menu-items.mjs';
import {
  addConnected, addNode, addSubgraph, arrowType, connect, deleteEdge, deleteNode, edges, isFlowchart, nodeIdFromSvgId,
  relabel, reverseEdge, setEdgeArrow, setEdgeLabel, setSubgraphTitle, subgraphIdFromSvgId, subgraphRefusal, subgraphs,
} from './patch/flowchart.mjs';
import { createPicker } from './picker.mjs';

/**
 * @param {object} deps
 * @param {ReturnType<import('./source.mjs').createSource>} deps.source
 * @param {ReturnType<import('./viewer.mjs').createViewer>} deps.viewer
 * @param {(text: string) => Promise<unknown>} deps.parse throws when the text is not valid Mermaid
 * @param {(text: string) => Promise<void>} deps.display show saved text as the page shows any new version
 * @param {{ notice(message: string, kind: 'info'|'warning'|'error'): void, hideNotice(): void, announce(message: string): void }} deps.ui
 * @param {Record<'stage'|'diagram'|'labelBox', HTMLElement>} deps.els
 */
export function createEditor({ source, viewer, parse, display, ui, els }) {
  let editable = false;
  let selected = null;        // { kind: 'node' | 'edge' | 'subgraph', id }: a Mermaid id, or an edge's SVG id
  let shownText = null;       // the text on screen, which edge ids refer to
  let edgesOk = false;        // the edges on screen match the text's, so edges can be selected and nodes deleted
  let connecting = false;     // after "Connect to…": the next node or subgraph clicked is the edge's target
  let pendingLabel = null;    // { kind, id } of a node or subgraph just added: open the label box on it once drawn
  const history = createHistory();
  let busy = false;           // an edit or undo is being checked or saved; input meanwhile is ignored
  let naming = null;          // { kind, id, entry } while what was just added is named: its name belongs to its add
  let labelling = null;       // { kind, id } while the label box is open over it
  let refused = false;        // the notice shows why a menu item does not apply

  const nodeEl = (id) => [...els.stage.querySelectorAll('g.node[data-page-node]')].find((g) => g.dataset.pageNode === id);
  const edgeEls = (id) => [...els.stage.querySelectorAll('[data-page-edge]')].filter((e) => e.dataset.pageEdge === id);
  const clusterEl = (id) => [...els.stage.querySelectorAll('g.cluster[data-page-subgraph]')].find((g) => g.dataset.pageSubgraph === id);
  /** What is drawn for an item: a node's or a subgraph's group, or an edge's line, hit path and label. */
  const elsOf = (sel) => (sel.kind === 'edge' ? edgeEls(sel.id) : [sel.kind === 'node' ? nodeEl(sel.id) : clusterEl(sel.id)].filter(Boolean));
  const selectedEl = () => selected && elsOf(selected)[0];
  /** The node, edge or subgraph a click on `target` is on, or null. Nodes and edges are drawn over subgraphs. */
  function itemAt(target) {
    const node = target.closest('g.node[data-page-node]')?.dataset.pageNode;
    if (node) return { kind: 'node', id: node };
    const edge = edgesOk && target.closest('[data-page-edge]')?.dataset.pageEdge;
    if (edge) return { kind: 'edge', id: edge };
    const subgraph = target.closest('g.cluster[data-page-subgraph]')?.dataset.pageSubgraph;
    return subgraph ? { kind: 'subgraph', id: subgraph } : null;
  }
  const same = (a, b) => a?.kind === b?.kind && a?.id === b?.id;
  const selectedNode = () => (selected?.kind === 'node' ? selected.id : null);
  const selectedSubgraph = () => (selected?.kind === 'subgraph' ? selected.id : null);
  /** The label element of a node, or the title element of a subgraph. */
  const labelEl = (sel) => (sel.kind === 'node' ? nodeEl(sel.id) : clusterEl(sel.id))?.querySelector('.nodeLabel');
  /**
   * A node or a subgraph as messages name it: its label or title as drawn, in quotes, on one line; one drawn with
   * none shows its id.
   */
  const named = (sel) => `"${(labelEl(sel)?.innerText ?? sel.id).trim().replace(/\s+/g, ' ') || sel.id}"`;
  /**
   * Whether an edit naming subgraph `id` is good only for the text it was drawn from: one with no id in the file is
   * known by Mermaid's `subGraph<k>`, which renumbers when subgraphs come and go.
   */
  const drawnOnly = (id) => !subgraphs(shownText).find((s) => s.id === id)?.written;
  /**
   * Refuse, with a warning, an edit that would need an id written for a subgraph the file already names otherwise: for
   * the ways in that pass no menu, which greys its items instead.
   */
  function refuseUnnamed(id) {
    const why = subgraphRefusal(shownText, id);
    if (why) ui.notice(why, 'warning');
    return Boolean(why);
  }
  const shownEdge = (id) => edges(shownText).find((e) => e.svgId === id);
  const input = /** @type {HTMLTextAreaElement} */ (els.labelBox);

  function setEditable(on) {
    editable = on;
    els.stage.classList.toggle('editable', on);
    if (!on) { deselect(); closeLabelBox(); }
  }

  // --- the menus -----------------------------------------------------------------------------------------------

  // What each menu item does (menu-items.mjs lists them). An item with a submenu does nothing itself.
  const handlers = {
    'add-connected-node': () => addAndName((text) => addConnected(text, selected.id)),
    'connect': () => {
      connecting = true;
      ui.notice('Click the node or subgraph the edge goes to. Click away or press Escape to cancel.', 'info');
    },
    'edit-label': () => openLabelBox(selected),
    'edit-title': () => openLabelBox(selected),
    'delete-node': () => deleteSelected(),
    'delete-edge': () => deleteSelected(),
    'remove-label': () => { const id = selected.id; editDrawn((text) => setEdgeLabel(text, id, '')); },
    'reverse-edge': () => { const id = selected.id; editDrawn((text) => reverseEdge(text, id)); },
    'add-node': () => {
      const subgraph = selectedSubgraph();
      addAndName((text) => addNode(text, { subgraph }), subgraph);
    },
    'add-subgraph': () => {
      const parent = selectedSubgraph();
      addAndName((text) => addSubgraph(text, { parent }), parent, 'subgraph');
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
    onPick: (arrow) => {
      const id = selected.id;
      editDrawn((text) => setEdgeArrow(text, id, arrow));
    },
  });

  const menuOptions = {
    parent: els.diagram,
    bounds: () => els.diagram.getBoundingClientRect(),
    returnFocus: els.diagram,
    submenus: { 'arrow-types': arrowPicker },
    onRun: (action) => handlers[action](),
    onRefuse: (why) => { refused = true; ui.notice(why, 'warning'); },
    // Only a menu's own notice goes with it; the one saying there is no edge match stays.
    onClose: () => { if (refused) ui.hideNotice(); refused = false; },
  };
  const menus = Object.fromEntries(Object.entries(MENUS).map(([kind, items]) => [kind, createMenu(items, menuOptions)]));
  const closeMenus = () => { for (const m of Object.values(menus)) m.close(); };
  const menuOpen = () => menus.node.isOpen() || menus.edge.isOpen() || menus.subgraph.isOpen();

  /** What the menus need to know to grey their items. */
  function menuState() {
    return {
      edgesOk,
      hasLabel: selected?.kind === 'edge' && Boolean(shownEdge(selected.id)?.label),
      nameWhy: selected?.kind === 'subgraph' ? subgraphRefusal(shownText, selected.id) : null,
    };
  }

  // --- selection -----------------------------------------------------------------------------------------------

  const unglow = () => { for (const e of els.stage.querySelectorAll('[data-page-selected]')) e.removeAttribute('data-page-selected'); };

  /** Select a node, an edge or a subgraph (it glows); with `menu`, also open its menu beside it. */
  function select(sel, { keepMode = false, menu = false } = {}) {
    unglow();
    // A menu opened again for the same item stays open, so a change to the file does not reset it.
    const again = same(selected, sel);
    for (const [kind, m] of Object.entries(menus)) if (!(menu && again && kind === sel.kind)) m.close();
    selected = sel;
    for (const e of elsOf(sel)) e.setAttribute('data-page-selected', '');
    if (!keepMode) connecting = false;
    if (!menu || connecting) return;
    if (sel.kind === 'edge') {
      const arrow = shownEdge(sel.id)?.arrow ?? '';
      arrowPicker.current(arrowType(arrow), arrow);
    }
    menus[sel.kind].open(selectedEl().getBoundingClientRect(), menuState());
  }

  function deselect() {
    unglow();
    selected = null;
    connecting = false;
    closeMenus();
  }

  // The empty-space menu, at the pointer: it adds a node or a subgraph at the top level. Mermaid lays the diagram out,
  // so what is added lands where the layout puts it, not where the menu was opened.
  function openSpaceMenu(x, y) {
    deselect();
    menus.space.open({ left: x, top: y, right: x, bottom: y }, menuState(), { gap: 0 });
  }

  /**
   * Add a node or a subgraph (`kind`) and open the label box on it once it is drawn; naming it is part of the same undo
   * step. `into`: the subgraph it goes in, if any.
   */
  function addAndName(change, into = null, kind = 'node') {
    const done = (result, entry) => {
      pendingLabel = { kind, id: result.id };
      naming = { kind, id: result.id, entry };
    };
    if (into && drawnOnly(into)) editDrawn(change, done); else edit(change, done);
  }

  /** Open the label box on a subgraph's title, unless writing it would need an id the file cannot take. */
  function editTitle(sel) {
    if (!refuseUnnamed(sel.id)) openLabelBox(sel);
  }

  function clicked(target) {
    if (!editable) return;
    const item = itemAt(target);
    if (connecting) {
      const from = selected;
      connecting = false;
      ui.hideNotice();
      const to = item?.kind === 'edge' ? null : item;
      if (!to) { deselect(); return; }
      if (same(to, from)) { ui.notice('Pick a different node or subgraph to connect to.', 'warning'); select(selected); return; }
      if (to.kind === 'subgraph' && refuseUnnamed(to.id)) { select(selected); return; }
      deselect();
      const names = [named(from), named(to)];
      const change = (text) => connect(text, from.id, to.id);
      const announce = () => ui.announce(`Connected ${names[0]} to ${names[1]}`);
      const drawn = [from, to].some((x) => x.kind === 'subgraph' && drawnOnly(x.id));
      if (drawn) editDrawn(change, announce); else edit(change, announce);
      return;
    }
    if (item) select(item);
    else { deselect(); ui.hideNotice(); }
  }

  function contextMenu(target, x, y) {
    if (!editable) return false;
    if (connecting) return true;
    const item = itemAt(target);
    if (item) select(item, { menu: true });
    else openSpaceMenu(x, y);
    return true;
  }

  /**
   * Make an edit that names what is drawn (an edge, a node to delete, a subgraph with no id in the file): only good
   * for the text it was drawn from.
   */
  function editDrawn(change, afterSave, into = null) {
    const drawnFrom = shownText;
    return edit((text) => {
      if (text !== drawnFrom) throw new Error('the diagram changed; select it again.');
      return change(text);
    }, afterSave, into);
  }

  /** Delete the selected node or edge. */
  function deleteSelected() {
    const sel = selected;
    if (!sel) return;
    if (sel.kind === 'subgraph') { ui.notice('Deleting a subgraph is not supported yet; edit it in the file.', 'warning'); return; }
    if (!edgesOk) { ui.notice(MENUS.node.find((i) => i.action === 'delete-node').why(), 'warning'); return; }
    // Named before the edit: once deleted, the node is no longer drawn.
    const name = sel.kind === 'node' && named(sel);
    editDrawn((text) => (sel.kind === 'edge' ? deleteEdge(text, sel.id) : deleteNode(text, sel.id)), (result) => {
      if (sel.kind === 'edge') ui.announce('Deleted the edge');
      else ui.announce(`Deleted ${name}` + (result.edges ? ` and ${result.edges} edge${result.edges === 1 ? '' : 's'}` : ''));
    });
  }

  // Keys (GLOBAL_KEYS): Ctrl+Z (Cmd+Z) undoes; Ctrl+Shift+Z (Cmd+Shift+Z) or Ctrl+Y redoes (not Cmd+Y: Chrome on macOS
  // opens its History with it); N adds a node (connected to the selected node, or in the selected subgraph); Enter or F2
  // edits the selected item's label or title; Delete or Backspace deletes the selection; M opens the selection's menu,
  // or with nothing selected the empty-space menu at the middle of the diagram; Escape backs out of whatever is open.
  // None of them while the label box (or another field) has the keyboard; an open menu takes its own keys first.
  const keys = {
    n: () => {
      if (connecting) return false;
      const from = selectedNode();
      if (from) addAndName((text) => addConnected(text, from));
      else handlers['add-node']();
      return true;
    },
    enter: () => selected && !connecting && (editLabelOrTitle(selected), true),
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
    // Escape is claimed only when it let go of something, so that otherwise the browser's own use of it (closing Help)
    // goes ahead.
    escape: () => {
      if (connecting) { connecting = false; ui.hideNotice(); select(selected); return true; }
      const had = Boolean(selected);
      deselect();
      ui.hideNotice();
      return had;
    },
  };
  for (const k of Object.keys(GLOBAL_KEYS)) if (!keys[k]) throw new Error(`No handler for the key ${k}`);
  const editLabelOrTitle = (sel) => (sel.kind === 'subgraph' ? editTitle(sel) : openLabelBox(sel));

  // A press anywhere outside the diagram (header, footer) is a click away too: it cancels Connect to… as Escape does,
  // and closes the menus. Presses inside the diagram are the viewer's, which reports them as clicks.
  document.addEventListener('pointerdown', (e) => {
    if (els.diagram.contains(e.target)) return;
    if (connecting) { connecting = false; ui.hideNotice(); select(selected); }
    closeMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const key = e.key.toLowerCase();
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
    if (e.ctrlKey || e.metaKey || e.altKey || !keys[key] || (!editable && key !== 'escape')) return;
    if (keys[key]()) e.preventDefault();
  });

  // --- the label box: editing a label in place -----------------------------------------------------------------

  // The box is laid exactly over the node, or over the edge's label (the middle of its line if it has none): that size,
  // or larger when the text needs it, kept centred as it grows. Enter saves; Shift+Enter starts a new line, which the
  // label keeps as a line break.
  const measure = document.createElement('canvas').getContext('2d');
  const LINE_HEIGHT = 18;

  /** What the label box covers: the node, the subgraph's title, the edge's label, or the middle of the edge's line. */
  function labelBoxRect(target) {
    if (target.kind === 'node') return nodeEl(target.id)?.getBoundingClientRect();
    if (target.kind === 'subgraph') return clusterEl(target.id)?.querySelector('.cluster-label')?.getBoundingClientRect();
    const parts = edgeEls(target.id);
    const label = parts.find((e) => e.matches('g.edgeLabel'));
    const r = label?.getBoundingClientRect();
    if (r && r.width && r.height) return r;
    const path = parts.find((e) => e.matches('path[data-page-only]'));
    if (!path) return null;
    const p = path.getPointAtLength(path.getTotalLength() / 2), m = path.getScreenCTM();
    const x = p.x * m.a + p.y * m.c + m.e, y = p.x * m.b + p.y * m.d + m.f;
    return { left: x, top: y, width: 0, height: 0 };
  }

  function openLabelBox(target) {
    const r = labelBoxRect(target);
    if (!r) return;
    closeMenus();
    labelling = target;
    // innerText, not textContent: a label's line breaks (<br>) come through as newlines.
    // An SVG element (a label Mermaid drew as SVG text) has no innerText.
    const shown = target.kind === 'edge'
      ? edgeEls(target.id).find((e) => e.matches('g.edgeLabel'))
      : labelEl(target) || elsOf(target)[0];
    input.value = shown ? (shown.innerText ?? shown.textContent).trim() : '';
    input.dataset.initial = input.value;
    input.setAttribute('aria-label', { node: 'Node label', edge: 'Edge label', subgraph: 'Subgraph title' }[target.kind]);
    input.style.display = 'block';
    sizeLabelBox();
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
  }

  function closeLabelBox() {
    input.style.display = 'none';
    labelling = null;
  }

  input.addEventListener('input', sizeLabelBox);
  input.addEventListener('blur', () => { if (labelling) closeLabelBox(); });
  input.addEventListener('keydown', (e) => {
    const target = labelling;
    if (e.key === 'Escape') { e.stopPropagation(); closeLabelBox(); naming = null; if (target) select(target); return; }
    if (e.key !== 'Enter' || e.shiftKey || !target) return;
    e.preventDefault();
    const label = input.value;
    // A node needs a label and a subgraph a title; an edge's label can be emptied, which removes it.
    if (target.kind !== 'edge' && !label.trim()) {
      ui.notice(target.kind === 'node' ? 'A label cannot be empty.' : 'A title cannot be empty.', 'error');
      return;
    }
    const unchanged = label === input.dataset.initial;
    closeLabelBox();
    // Enter on an unchanged label is not an edit: the file keeps its own spelling of the label.
    if (unchanged) { deselect(); naming = null; return; }
    if (target.kind === 'edge') { editDrawn((text) => setEdgeLabel(text, target.id, label)); return; }
    const into = same(naming, target) ? naming.entry : null;
    naming = null;
    if (target.kind === 'node') { edit((text) => relabel(text, target.id, label), null, into); return; }
    const change = (text) => setSubgraphTitle(text, target.id, label);
    if (drawnOnly(target.id)) editDrawn(change, null, into); else edit(change, null, into);
  });

  // --- edges ---------------------------------------------------------------------------------------------------

  // Edges can be selected only when the text's edges are exactly the ones drawn, in order: then an edge's SVG id says
  // which text it is. Each gets a wide invisible path over it, since a line is hard to hit, and its label selects it
  // too. Nodes are drawn after edges, so a click near a node still picks the node.
  function tagEdges(text) {
    const drawn = [...els.stage.querySelectorAll('path[data-edge="true"]')];
    const ids = edges(text).map((e) => e.svgId);
    edgesOk = ids.length === drawn.length && drawn.every((p, k) => p.dataset.id === ids[k]);
    if (!edgesOk) {
      ui.notice("merma can't match this diagram's edges to its text, so edges can't be selected and nodes can't be "
        + 'deleted here; edit those in the file.', 'warning');
      return;
    }
    for (const p of drawn) {
      p.dataset.pageEdge = p.dataset.id;
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', p.getAttribute('d'));
      hit.setAttribute('fill', 'none');
      hit.setAttribute('data-page-only', '');
      hit.dataset.pageEdge = p.dataset.id;
      p.after(hit);
    }
    for (const g of els.stage.querySelectorAll('g.edgeLabel')) {
      const id = g.querySelector('[data-id]')?.dataset.id;
      if (id) g.dataset.pageEdge = id;
    }
  }

  // --- saving --------------------------------------------------------------------------------------------------

  // One edit or undo at a time: a second one started while the first is saving (a held Ctrl+Z, a double-clicked menu
  // item) would be based on the text from before the first.
  async function exclusively(work) {
    if (busy) return;
    busy = true;
    try {
      await work();
    } finally {
      busy = false;
    }
  }

  // Make an edit to the file's latest text and save it over that text's version. The edit runs on the text as the page
  // has it now, so a change it has already picked up is kept; one it has not yet seen, even one that arrives while the
  // edit is being checked, makes the save fail rather than be overwritten. `into` is the history entry this edit
  // completes, if any.
  function edit(change, afterSave, into = null) {
    return exclusively(async () => {
      ui.hideNotice();
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
      // The action is done: drop the selection, so its menu does not linger over the diagram.
      deselect();
      ui.announce('Saved');   // what afterSave announces, if anything, replaces it
      afterSave?.(result, entry);
      await display(result.text);
    });
  }

  function redo() {
    return exclusively(async () => {
      const base = source.snapshot();
      if (base.text === null) return;
      ui.hideNotice();
      const redoing = history.peekRedo(base.text);
      if (!redoing.ok) {
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
      if (!undoing.ok) {
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
  async function save(text, base = source.version) {
    try {
      await parse(text);
    } catch (e) {
      ui.notice('Not saved: the edit would make the diagram invalid.\n' + (e.message || e), 'error');
      return false;
    }
    const saved = await source.save(text, base);
    if (!saved.ok) {
      ui.notice('Not saved: ' + saved.message + (saved.conflict ? ' Showing the new version; try again.' : ''), 'error');
      return false;
    }
    return true;
  }

  return {
    save,
    viewChanged: () => {
      if (selected && selectedEl()) menus[selected.kind].reposition(selectedEl().getBoundingClientRect());
      menus.space.close();
    },
    clicked,
    contextMenu,

    /** Double-click on a node, an edge or a subgraph edits its label or title. Returns whether it was one. */
    doubleClicked(target) {
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
    rendered(text) {
      setEditable(isFlowchart(text));
      if (!editable) return;
      const changed = text !== shownText;
      shownText = text;
      for (const g of els.stage.querySelectorAll('g.node')) {
        const id = nodeIdFromSvgId(g.id, viewer.renderId);
        if (id) g.dataset.pageNode = id;
      }
      // A subgraph whose id merma cannot read (`subgraph a-b [X]`) is left unselectable, as such a node's edges are.
      const known = new Set(subgraphs(text).map((s) => s.id));
      for (const g of els.stage.querySelectorAll('g.cluster')) {
        const id = subgraphIdFromSvgId(g.id, viewer.renderId);
        if (known.has(id)) g.dataset.pageSubgraph = id;
      }
      tagEdges(text);
      const menu = menuOpen();
      const kept = selected && elsOf(selected).length
        && (selected.kind === 'node' || !changed || (selected.kind === 'subgraph' && !drawnOnly(selected.id)));
      if (kept) select(selected, { keepMode: selected.kind !== 'edge', menu });
      else deselect();
      if (pendingLabel && elsOf(pendingLabel).length) {
        const sel = pendingLabel;
        pendingLabel = null;
        select(sel);
        openLabelBox(sel);
      }
    },

    /** The file no longer renders: what is on screen is an older version, so editing it would edit something else. */
    failed() { setEditable(false); },

    state: () => ({
      selected: selectedNode(), selectedEdge: selected?.kind === 'edge' ? selected.id : null,
      selectedSubgraph: selectedSubgraph(), connecting, editable, edgesOk,
    }),

    /** Nothing in progress that a reload would lose: no edit being saved, no label box open, no connection half made. */
    idle: () => !busy && !labelling && !connecting,
  };
}
