// The diagram view: renders Mermaid text into the stage, and lets the user zoom (wheel), move (drag) and fit
// (double-click) it. It knows nothing about files or editing: it reports clicks, and whoever wired it decides what a
// click means. Elements marked `data-overlay` (a menu or an input laid over the diagram) are left to themselves.

import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs';

// useMaxWidth: false renders every diagram type at its natural size; the view below fits and zooms it.
const natural = { useMaxWidth: false };
mermaid.initialize({
  startOnLoad: false,
  flowchart: natural, sequence: natural, class: natural, state: natural, er: natural,
  gantt: natural, journey: natural, pie: natural, mindmap: natural, timeline: natural, gitGraph: natural,
});

const PAD = 24;
// A press that moves less than this many pixels before release is a click; more is a move.
const CLICK_SLOP = 4;

/** Check that `text` is valid Mermaid; throws with Mermaid's message if not. */
export const parse = (text) => mermaid.parse(text);

/**
 * @param {object} els
 * @param {HTMLElement} els.diagram the area the diagram is shown in
 * @param {HTMLElement} els.stage the element inside it that holds the SVG and is moved and scaled
 * @param {object} [hooks]
 * @param {(target: Element) => void} [hooks.onClick] a click, with the element pressed
 * @param {(target: Element) => boolean} [hooks.onDoubleClick] a double-click, with the element pressed; return true to
 *   say it was handled, or the view is fitted
 * @param {() => void} [hooks.onViewChange] the diagram moved or was zoomed on screen
 */
export function createViewer({ diagram, stage }, { onClick = () => {}, onDoubleClick = () => false, onViewChange = () => {} } = {}) {
  // A scale and offset applied to the stage. Until the user zooms or drags, the view fits the diagram to the window
  // (never enlarging it); after that, it is kept across re-renders so edits do not reset it.
  const view = { x: 0, y: 0, k: 1 };
  let size = { w: 0, h: 0 };
  let touched = false;
  let n = 0;
  let renderId = null;

  function apply() {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    onViewChange();
  }

  function fit() {
    const box = diagram.getBoundingClientRect();
    if (!size.w || !size.h) return;
    view.k = Math.min(1, (box.width - 2 * PAD) / size.w, (box.height - 2 * PAD) / size.h);
    view.x = (box.width - size.w * view.k) / 2;
    view.y = (box.height - size.h * view.k) / 2;
    touched = false;
    apply();
  }

  function zoomAt(px, py, factor) {
    const k = Math.min(8, Math.max(0.1, view.k * factor));
    view.x = px - (px - view.x) * (k / view.k);
    view.y = py - (py - view.y) * (k / view.k);
    view.k = k;
    touched = true;
    apply();
  }

  diagram.addEventListener('wheel', (e) => {
    e.preventDefault();
    const box = diagram.getBoundingClientRect();
    zoomAt(e.clientX - box.left, e.clientY - box.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // The pointer is captured on press, so the move and the release reach the diagram even off its edge. That also makes
  // the browser's own click events target the diagram itself, so a click is reported with the element pressed.
  let drag = null;
  let clicked = null;   // the element the last click pressed, for the double-click that follows it
  diagram.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('[data-overlay]')) return;
    drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moving: false, target: e.target };
    diagram.setPointerCapture(e.pointerId);
  });
  diagram.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moving) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < CLICK_SLOP) return;
      drag.moving = true;
      diagram.classList.add('dragging');
    }
    view.x += e.clientX - drag.x;
    view.y += e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    touched = true;
    apply();
  });
  const endDrag = () => { drag = null; diagram.classList.remove('dragging'); };
  diagram.addEventListener('pointerup', () => {
    const press = drag;
    endDrag();
    clicked = press && !press.moving ? press.target : null;
    if (clicked) onClick(clicked);
  });
  diagram.addEventListener('pointercancel', endDrag);
  diagram.addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-overlay]')) return;
    if (!(clicked?.isConnected && onDoubleClick(clicked))) fit();
  });
  // Refit when the diagram's box changes (window resize, the header growing when the host path arrives, an error
  // message appearing above it).
  new ResizeObserver(() => { if (!touched) fit(); }).observe(diagram);

  return {
    fit,

    /** The id the shown SVG was rendered under; Mermaid starts its element ids with it. */
    get renderId() { return renderId; },

    /** Render `text` in place of the current diagram. On a syntax error the last good render stays. */
    async show(text) {
      const id = 'd' + n++;
      try {
        const { svg } = await mermaid.render(id, text);
        stage.innerHTML = svg;
        renderId = id;
        const rect = stage.querySelector('svg').getBoundingClientRect();
        size = { w: rect.width / view.k, h: rect.height / view.k };
        if (!touched) fit();
        return { ok: true };
      } catch (e) {
        // A failed render can leave its scratch element in the page.
        document.getElementById('d' + id)?.remove();
        document.getElementById(id)?.remove();
        return { ok: false, error: e.message || String(e) };
      }
    },

    /**
     * The diagram as rendered (not the zoomed view). XMLSerializer, not outerHTML: the labels hold HTML (<br>), which
     * must be well-formed XML in a standalone .svg.
     */
    svgMarkup() {
      const svg = stage.querySelector('svg');
      return svg && new XMLSerializer().serializeToString(svg);
    },
  };
}
