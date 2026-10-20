// Editing a flowchart by pointing: click a node or an edge to select it, right-click (or long-press) for its menu, or
// right-click empty space to add a node; each action is a small text edit to the file (patch/flowchart.mjs). Each edit
// is checked with Mermaid's parser before it is saved, and saved over the version it was based on (source.mjs), so a
// change saved meanwhile by an agent or an editor is never overwritten. What this adds to the drawing is marked
// `data-page-…`, which the SVG export leaves out.

import { createHistory } from './history.mjs';
import {
  addConnected, addNode, connect, deleteEdge, deleteNode, edges, isFlowchart, nodeIdFromSvgId, relabel,
  subgraphIdFromSvgId,
} from './patch/flowchart.mjs';

/**
 * @param {object} deps
 * @param {ReturnType<import('./source.mjs').createSource>} deps.source
 * @param {ReturnType<import('./viewer.mjs').createViewer>} deps.viewer
 * @param {(text: string) => Promise<unknown>} deps.parse throws when the text is not valid Mermaid
 * @param {(text: string) => Promise<void>} deps.display show saved text as the page shows any new version
 * @param {{ notice(message: string, bad?: boolean): void, hideNotice(): void, toast(message: string): void }} deps.ui
 * @param {Record<'stage'|'diagram'|'menu'|'menuAdd'|'menuConnect'|'menuRename'|'menuDelete'|'edgeMenu'|'edgeDelete'|'spaceMenu'|'spaceAdd'|'rename', HTMLElement>} deps.els
 */
export function createEditor({ source, viewer, parse, display, ui, els }) {
  let editable = false;
  let selected = null;        // { kind: 'node', id } or { kind: 'edge', id }: a Mermaid node id, or an edge's SVG id
  let menuOpen = false;       // the selection's menu is showing
  let shownText = null;       // the text on screen, which edge ids refer to
  let edgesOk = false;        // the edges on screen match the text's, so edges can be selected and nodes deleted
  let spaceSubgraph = null;   // the subgraph the empty-space menu adds into, or null for the top level
  let connecting = false;     // after "Connect to…": the next node clicked is the edge's target
  let pendingRename = null;   // a node just added: open Rename on it once it is drawn
  const history = createHistory();
  let busy = false;           // an edit or undo is being checked or saved; input meanwhile is ignored
  let naming = null;          // { id, entry } while a node just added is being named: its name belongs to its add

  const nodeEl = (id) => [...els.stage.querySelectorAll('g.node[data-page-node]')].find((g) => g.dataset.pageNode === id);
  const edgeEls = (id) => [...els.stage.querySelectorAll('[data-page-edge]')].filter((e) => e.dataset.pageEdge === id);
  const selectedEl = () => (selected?.kind === 'node' ? nodeEl(selected.id) : selected && edgeEls(selected.id)[0]);
  const nodeOf = (target) => target.closest('g.node[data-page-node]')?.dataset.pageNode;
  const edgeOf = (target) => (edgesOk ? target.closest('[data-page-edge]')?.dataset.pageEdge : undefined);
  const selectedNode = () => (selected?.kind === 'node' ? selected.id : null);
  const input = /** @type {HTMLTextAreaElement} */ (els.rename);

  function setEditable(on) {
    editable = on;
    els.stage.classList.toggle('editable', on);
    if (!on) { deselect(); closeRename(); }
  }

  // --- selection and the menus ---------------------------------------------------------------------------------

  const unglow = () => { for (const e of els.stage.querySelectorAll('[data-page-selected]')) e.removeAttribute('data-page-selected'); };

  /** Select a node or an edge (it glows); with `menu`, also open its menu. */
  function select(sel, { keepMode = false, menu = false } = {}) {
    unglow();
    closeSpaceMenu();
    selected = sel;
    for (const e of sel.kind === 'node' ? [nodeEl(sel.id)] : edgeEls(sel.id)) e.setAttribute('data-page-selected', '');
    if (!keepMode) connecting = false;
    menuOpen = menu && !connecting;
    els.menu.classList.toggle('show', menuOpen && sel.kind === 'node');
    els.edgeMenu.classList.toggle('show', menuOpen && sel.kind === 'edge');
    positionMenu();
  }

  function deselect() {
    unglow();
    selected = null;
    connecting = false;
    menuOpen = false;
    els.menu.classList.remove('show');
    els.edgeMenu.classList.remove('show');
    closeSpaceMenu();
  }

  // The empty-space menu, at the pointer: it adds a node, into the subgraph the pointer was over if any. Mermaid lays
  // the diagram out, so the node lands where the layout puts it, not where the menu was opened.
  function openSpaceMenu(target, x, y) {
    deselect();
    const cluster = target.closest('g.cluster');
    spaceSubgraph = cluster ? subgraphIdFromSvgId(cluster.id, viewer.renderId) : null;
    const title = cluster?.querySelector('.cluster-label, .nodeLabel')?.textContent.trim() || spaceSubgraph;
    els.spaceAdd.textContent = spaceSubgraph ? `Add node in ${title}` : 'Add node';
    els.spaceMenu.classList.add('show');
    const box = els.diagram.getBoundingClientRect();
    const w = els.spaceMenu.offsetWidth, h = els.spaceMenu.offsetHeight;
    els.spaceMenu.style.left = Math.min(x - box.left, box.width - w) + 'px';
    els.spaceMenu.style.top = Math.min(y - box.top, box.height - h) + 'px';
  }

  function closeSpaceMenu() { els.spaceMenu.classList.remove('show'); }

  /** Add a node and open Rename on it once it is drawn; naming it is part of the same undo step. */
  function addAndName(change) {
    edit(change, (result, entry) => {
      pendingRename = result.id;
      naming = { id: result.id, entry };
    });
  }

  // Beside the selection, inside the diagram area: to its right, or to its left when there is no room.
  function positionMenu() {
    const g = selectedEl();
    if (!g) return;
    const menu = selected.kind === 'node' ? els.menu : els.edgeMenu;
    const box = els.diagram.getBoundingClientRect();
    const r = g.getBoundingClientRect();
    const w = menu.offsetWidth, h = menu.offsetHeight;
    let left = r.right - box.left + 8;
    if (left + w > box.width) left = Math.max(0, r.left - box.left - w - 8);
    const top = Math.min(Math.max(0, r.top - box.top), Math.max(0, box.height - h));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function clicked(target) {
    if (!editable) return;
    const id = nodeOf(target);
    if (connecting) {
      const from = selectedNode();
      connecting = false;
      ui.hideNotice();
      if (!id) { deselect(); return; }
      if (id === from) { ui.notice('Pick a different node to connect to.'); select(selected); return; }
      deselect();
      edit((text) => connect(text, from, id));
      return;
    }
    const edge = !id && edgeOf(target);
    if (id) select({ kind: 'node', id });
    else if (edge) select({ kind: 'edge', id: edge });
    else { deselect(); ui.hideNotice(); }
  }

  function contextMenu(target, x, y) {
    if (!editable) return false;
    if (connecting) return true;
    const id = nodeOf(target);
    const edge = !id && edgeOf(target);
    if (id) select({ kind: 'node', id }, { menu: true });
    else if (edge) select({ kind: 'edge', id: edge }, { menu: true });
    else openSpaceMenu(target, x, y);
    return true;
  }

  /** Delete the selected node or edge. Edge ids are only good for the text they were drawn from. */
  function deleteSelected() {
    const sel = selected;
    if (!sel) return;
    if (!edgesOk) { ui.notice('Deleting is off for this diagram: merma cannot match its edges to the text.', true); return; }
    const drawnFrom = shownText;
    edit((text) => {
      if (text !== drawnFrom) throw new Error('the diagram changed; select it again.');
      return sel.kind === 'edge' ? deleteEdge(text, sel.id) : deleteNode(text, sel.id);
    }, (result) => {
      if (sel.kind === 'edge') ui.toast('Deleted the edge');
      else ui.toast(`Deleted ${sel.id}` + (result.edges ? ` and ${result.edges} edge${result.edges === 1 ? '' : 's'}` : ''));
    });
  }

  els.menuAdd.addEventListener('click', () => addAndName((text) => addConnected(text, selected.id)));
  els.spaceAdd.addEventListener('click', () => {
    const subgraph = spaceSubgraph;
    closeSpaceMenu();
    addAndName((text) => addNode(text, { subgraph }));
  });
  els.menuConnect.addEventListener('click', () => {
    connecting = true;
    els.menu.classList.remove('show');
    ui.notice(`Click the node to connect ${selected.id} to. Escape cancels.`);
  });
  els.menuRename.addEventListener('click', () => openRename(selected.id));
  els.menuDelete.addEventListener('click', deleteSelected);
  els.edgeDelete.addEventListener('click', deleteSelected);

  // Keys: Ctrl+Z undoes; N adds a node (connected to the selected node, if any); Enter or F2 renames the selected node;
  // Delete or Backspace deletes the selection; Escape backs out of whatever is open. None of them while the rename box
  // (or another field) has the keyboard.
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (editable && e.key.toLowerCase() === 'n' && !connecting) {
      e.preventDefault();
      const from = selectedNode();
      addAndName((text) => (from ? addConnected(text, from) : addNode(text)));
      return;
    }
    if (editable && selectedNode() && !connecting && (e.key === 'Enter' || e.key === 'F2')) {
      e.preventDefault();
      openRename(selected.id);
      return;
    }
    if (editable && selected && !connecting && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      deleteSelected();
      return;
    }
    if (e.key !== 'Escape') return;
    if (connecting) { connecting = false; ui.hideNotice(); select(selected); return; }
    deselect();
    ui.hideNotice();
  });

  // --- renaming in place ---------------------------------------------------------------------------------------

  // The box is laid exactly over the node: its size, or larger when the text needs it, kept centred as it grows.
  // Enter saves; Shift+Enter starts a new line, which the label keeps as a line break.
  const measure = document.createElement('canvas').getContext('2d');
  const LINE_HEIGHT = 18;

  function openRename(id) {
    const g = nodeEl(id);
    if (!g) return;
    els.menu.classList.remove('show');
    menuOpen = false;
    input.dataset.nodeId = id;
    // innerText, not textContent: a label's line breaks (<br>) come through as newlines.
    // An SVG element (a label Mermaid drew as SVG text) has no innerText.
    const label = g.querySelector('.nodeLabel') || g;
    input.value = (label.innerText ?? label.textContent).trim();
    input.dataset.initial = input.value;
    input.style.display = 'block';
    sizeRename();
    input.focus();
    input.select();
  }

  function sizeRename() {
    const g = nodeEl(input.dataset.nodeId);
    if (!g) return;
    const box = els.diagram.getBoundingClientRect();
    const r = g.getBoundingClientRect();
    measure.font = getComputedStyle(input).font;
    const textLines = input.value.split('\n');
    const w = Math.max(r.width, ...textLines.map((l) => measure.measureText(l).width + 24));
    const h = Math.max(r.height, 28, textLines.length * LINE_HEIGHT + 12);
    input.style.width = w + 'px';
    input.style.height = h + 'px';
    input.style.left = (r.left - box.left + r.width / 2 - w / 2) + 'px';
    input.style.top = (r.top - box.top + r.height / 2 - h / 2) + 'px';
  }

  function closeRename() {
    input.style.display = 'none';
    delete input.dataset.nodeId;
  }

  input.addEventListener('input', sizeRename);
  input.addEventListener('blur', () => { if (input.dataset.nodeId) closeRename(); });
  input.addEventListener('keydown', (e) => {
    const id = input.dataset.nodeId;
    if (e.key === 'Escape') { e.stopPropagation(); closeRename(); naming = null; if (id) select({ kind: 'node', id }); return; }
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const label = input.value;
    if (!label.trim()) { ui.notice('A label cannot be empty.', true); return; }
    const unchanged = label === input.dataset.initial;
    closeRename();
    // Enter on an unchanged label is not an edit: the file keeps its own spelling of the label.
    if (unchanged) { deselect(); naming = null; return; }
    const into = naming?.id === id ? naming.entry : null;
    naming = null;
    edit((text) => relabel(text, id, label), null, into);
  });

  // --- edges ---------------------------------------------------------------------------------------------------

  // Edges can be selected only when the text's edges are exactly the ones drawn, in order: then an edge's SVG id says
  // which text it is. Each gets a wide invisible path over it, since a line is hard to hit, and its label selects it
  // too. Nodes are drawn after edges, so a click near a node still picks the node.
  function tagEdges(text) {
    const drawn = [...els.stage.querySelectorAll('path[data-edge="true"]')];
    const ids = edges(text).map((e) => e.svgId);
    edgesOk = ids.length === drawn.length && drawn.every((p, k) => p.dataset.id === ids[k]);
    els.menuDelete.hidden = !edgesOk;
    if (!edgesOk) {
      ui.notice("merma can't match this diagram's edges to its text, so edges can't be selected and nodes can't be "
        + 'deleted here; edit those in the file.');
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
        ui.notice('Not saved: ' + (e.message || e), true);
        return;
      }
      if (!(await save(result.text, base.version))) return;
      const entry = history.record(base.text, result.text, into);
      // The action is done: drop the selection, so its menu does not linger over the diagram.
      deselect();
      afterSave?.(result, entry);
      await display(result.text);
    });
  }

  function undo() {
    return exclusively(async () => {
      const base = source.snapshot();
      if (base.text === null) return;
      ui.hideNotice();
      const undoing = history.peek(base.text);
      if (!undoing.ok) {
        if (undoing.reason === 'empty') ui.notice('Nothing to undo.');
        else ui.notice('Cannot undo: the file has changed since that edit.', true);
        return;
      }
      if (!(await save(undoing.text, base.version))) return;
      history.pop();
      deselect();
      closeRename();
      await display(undoing.text);
      ui.toast('Undone');
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
      ui.notice('Not saved: the edit would make the diagram invalid.\n' + (e.message || e), true);
      return false;
    }
    const saved = await source.save(text, base);
    if (!saved.ok) {
      ui.notice('Not saved: ' + saved.message + (saved.conflict ? ' Showing the new version; try again.' : ''), true);
      return false;
    }
    ui.toast('Saved');
    return true;
  }

  return {
    save,
    viewChanged: () => { if (selected) positionMenu(); closeSpaceMenu(); },
    clicked,
    contextMenu,

    /** Double-click on a node renames it; on an edge it does nothing. Returns whether it was either. */
    doubleClicked(target) {
      if (!editable) return false;
      const id = nodeOf(target);
      if (!id) return Boolean(edgeOf(target));
      select({ kind: 'node', id });
      openRename(id);
      return true;
    },

    /**
     * A new version of the file is on screen: tag its nodes and edges, and keep the selection if it is still there
     * (an edge's only while the text is the same: edge ids are renumbered when edges come and go).
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
      tagEdges(text);
      if (selected?.kind === 'node' && nodeEl(selected.id)) select(selected, { keepMode: true, menu: menuOpen });
      else if (selected?.kind === 'edge' && !changed && edgeEls(selected.id).length) select(selected, { menu: menuOpen });
      else deselect();
      if (pendingRename && nodeEl(pendingRename)) {
        const id = pendingRename;
        pendingRename = null;
        select({ kind: 'node', id });
        openRename(id);
      }
    },

    /** The file no longer renders: what is on screen is an older version, so editing it would edit something else. */
    failed() { setEditable(false); },

    state: () => ({
      selected: selectedNode(), selectedEdge: selected?.kind === 'edge' ? selected.id : null, connecting, editable, edgesOk,
    }),

    /** Nothing in progress that a reload would lose: no edit being saved, no rename open, no connection half made. */
    idle: () => !busy && !input.dataset.nodeId && !connecting,
  };
}
