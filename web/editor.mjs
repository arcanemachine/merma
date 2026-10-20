// Editing a flowchart by pointing: click a node, pick an action from its menu, and the file gets a small text edit
// (patch/flowchart.mjs). Each edit is checked with Mermaid's parser before it is saved, and saved over the version it
// was based on (source.mjs), so a change saved meanwhile by an agent or an editor is never overwritten.

import { addConnected, connect, isFlowchart, nodeIdFromSvgId, relabel } from './patch/flowchart.mjs';

const HINT = 'Click a node to edit, double-click to rename · scroll to zoom, drag to move';
const VIEW_HINT = 'Scroll to zoom, drag to move';

/**
 * @param {object} deps
 * @param {ReturnType<import('./source.mjs').createSource>} deps.source
 * @param {ReturnType<import('./viewer.mjs').createViewer>} deps.viewer
 * @param {(text: string) => Promise<unknown>} deps.parse throws when the text is not valid Mermaid
 * @param {(text: string) => Promise<void>} deps.display show saved text as the page shows any new version
 * @param {{ notice(message: string, bad?: boolean): void, hideNotice(): void, toast(message: string): void }} deps.ui
 * @param {Record<'stage'|'diagram'|'menu'|'menuAdd'|'menuConnect'|'menuRename'|'rename'|'hint', HTMLElement>} deps.els
 */
export function createEditor({ source, viewer, parse, display, ui, els }) {
  let editable = false;
  let selected = null;        // the selected node's Mermaid id
  let connecting = false;     // after "Connect to…": the next node clicked is the edge's target
  let pendingRename = null;   // a node just added: open Rename on it once it is drawn

  const nodeEl = (id) => [...els.stage.querySelectorAll('g.node[data-node-id]')].find((g) => g.dataset.nodeId === id);
  const input = /** @type {HTMLInputElement} */ (els.rename);

  function setEditable(on) {
    editable = on;
    els.stage.classList.toggle('editable', on);
    els.hint.textContent = on ? HINT : VIEW_HINT;
    if (!on) { deselect(); closeRename(); }
  }

  // --- selection and the menu ----------------------------------------------------------------------------------

  function select(id, { keepMode = false } = {}) {
    for (const g of els.stage.querySelectorAll('g.node.selected')) g.classList.remove('selected');
    selected = id;
    nodeEl(id).classList.add('selected');
    if (!keepMode) connecting = false;
    els.menu.classList.toggle('show', !connecting);
    positionMenu();
  }

  function deselect() {
    for (const g of els.stage.querySelectorAll('g.node.selected')) g.classList.remove('selected');
    selected = null;
    connecting = false;
    els.menu.classList.remove('show');
  }

  // Beside the node, inside the diagram area: to its right, or to its left when there is no room.
  function positionMenu() {
    const g = selected && nodeEl(selected);
    if (!g) return;
    const box = els.diagram.getBoundingClientRect();
    const r = g.getBoundingClientRect();
    const w = els.menu.offsetWidth, h = els.menu.offsetHeight;
    let left = r.right - box.left + 8;
    if (left + w > box.width) left = Math.max(0, r.left - box.left - w - 8);
    const top = Math.min(Math.max(0, r.top - box.top), Math.max(0, box.height - h));
    els.menu.style.left = left + 'px';
    els.menu.style.top = top + 'px';
  }

  function clicked(target) {
    if (!editable) return;
    const id = target.closest('g.node[data-node-id]')?.dataset.nodeId;
    if (connecting) {
      const from = selected;
      connecting = false;
      ui.hideNotice();
      if (!id) { deselect(); return; }
      if (id === from) { ui.notice('Pick a different node to connect to.'); select(from); return; }
      deselect();
      edit((text) => connect(text, from, id));
      return;
    }
    if (!id) { deselect(); ui.hideNotice(); return; }
    select(id);
  }

  els.menuAdd.addEventListener('click', () => {
    edit((text) => addConnected(text, selected), (result) => { pendingRename = result.id; });
  });
  els.menuConnect.addEventListener('click', () => {
    connecting = true;
    els.menu.classList.remove('show');
    ui.notice(`Click the node to connect ${selected} to. Escape cancels.`);
  });
  els.menuRename.addEventListener('click', () => openRename(selected));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.activeElement === input) return;
    if (connecting) { connecting = false; ui.hideNotice(); select(selected); return; }
    deselect();
    ui.hideNotice();
  });

  // --- renaming in place ---------------------------------------------------------------------------------------

  // The input is laid exactly over the node: its width, or wider when the text needs it, kept centred as it grows.
  const measure = document.createElement('canvas').getContext('2d');

  function openRename(id) {
    const g = nodeEl(id);
    if (!g) return;
    els.menu.classList.remove('show');
    const box = els.diagram.getBoundingClientRect();
    const r = g.getBoundingClientRect();
    input.dataset.nodeId = id;
    input.value = (g.querySelector('.nodeLabel') || g).textContent.trim();
    input.dataset.initial = input.value;
    input.style.height = Math.max(r.height, 28) + 'px';
    input.style.top = (r.top - box.top + r.height / 2 - Math.max(r.height, 28) / 2) + 'px';
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
    const w = Math.max(r.width, measure.measureText(input.value).width + 24);
    input.style.width = w + 'px';
    input.style.left = (r.left - box.left + r.width / 2 - w / 2) + 'px';
  }

  function closeRename() {
    input.style.display = 'none';
    delete input.dataset.nodeId;
  }

  input.addEventListener('input', sizeRename);
  input.addEventListener('blur', () => { if (input.dataset.nodeId) closeRename(); });
  input.addEventListener('keydown', (e) => {
    const id = input.dataset.nodeId;
    if (e.key === 'Escape') { e.stopPropagation(); closeRename(); if (id) select(id); return; }
    if (e.key !== 'Enter') return;
    const label = input.value;
    if (!label.trim()) { ui.notice('A label cannot be empty.', true); return; }
    const unchanged = label === input.dataset.initial;
    closeRename();
    // Enter on an unchanged label is not an edit: the file keeps its own spelling of the label.
    if (unchanged) { deselect(); return; }
    edit((text) => relabel(text, id, label));
  });

  // --- saving --------------------------------------------------------------------------------------------------

  // Make an edit to the file's latest text and save it. The edit runs on the text as the page has it now, so a change
  // it has already picked up is kept; one it has not yet seen makes the save fail.
  async function edit(change, afterSave) {
    ui.hideNotice();
    if (source.text === null || !source.version) return;
    let result;
    try {
      result = change(source.text);
    } catch (e) {
      ui.notice('Not saved: ' + (e.message || e), true);
      return;
    }
    if (!(await save(result.text))) return;
    // The action is done: drop the selection, so its menu does not linger over the diagram.
    deselect();
    afterSave?.(result);
    await display(result.text);
  }

  /** Save text for the file, after checking it parses. Returns true when saved. */
  async function save(text) {
    try {
      await parse(text);
    } catch (e) {
      ui.notice('Not saved: the edit would make the diagram invalid.\n' + (e.message || e), true);
      return false;
    }
    const saved = await source.save(text);
    if (!saved.ok) {
      ui.notice('Not saved: ' + saved.message + (saved.conflict ? ' Showing the new version; try again.' : ''), true);
      return false;
    }
    ui.toast('Saved');
    return true;
  }

  return {
    save,
    viewChanged: () => { if (selected) positionMenu(); },
    clicked,

    /** Double-click on a node renames it. Returns whether it was one. */
    doubleClicked(target) {
      const id = editable && target.closest('g.node[data-node-id]')?.dataset.nodeId;
      if (!id) return false;
      select(id);
      openRename(id);
      return true;
    },

    /** A new version of the file is on screen: tag its nodes, and keep the selection if its node is still there. */
    rendered(text) {
      setEditable(isFlowchart(text));
      if (!editable) return;
      for (const g of els.stage.querySelectorAll('g.node')) {
        const id = nodeIdFromSvgId(g.id, viewer.renderId);
        if (id) g.dataset.nodeId = id;
      }
      if (selected && nodeEl(selected)) select(selected, { keepMode: true });
      else deselect();
      if (pendingRename && nodeEl(pendingRename)) {
        const id = pendingRename;
        pendingRename = null;
        select(id);
        openRename(id);
      }
    },

    /** The file no longer renders: what is on screen is an older version, so editing it would edit something else. */
    failed() { setEditable(false); },

    state: () => ({ selected, connecting, editable }),
  };
}
