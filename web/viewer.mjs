// The diagram view: renders Mermaid text into the stage, and lets the user zoom (wheel), move (drag) and fit
// (double-click) it. It knows nothing about files.

import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs';

// useMaxWidth: false renders every diagram type at its natural size; the view below fits and zooms it.
const natural = { useMaxWidth: false };
mermaid.initialize({
  startOnLoad: false,
  flowchart: natural, sequence: natural, class: natural, state: natural, er: natural,
  gantt: natural, journey: natural, pie: natural, mindmap: natural, timeline: natural, gitGraph: natural,
});

const PAD = 24;

/**
 * @param {object} els
 * @param {HTMLElement} els.diagram the area the diagram is shown in
 * @param {HTMLElement} els.stage the element inside it that holds the SVG and is moved and scaled
 */
export function createViewer({ diagram, stage }) {
  // A scale and offset applied to the stage. Until the user zooms or drags, the view fits the diagram to the window
  // (never enlarging it); after that, it is kept across re-renders so edits do not reset it.
  const view = { x: 0, y: 0, k: 1 };
  let size = { w: 0, h: 0 };
  let touched = false;
  let n = 0;

  function apply() {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
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

  let drag = null;
  diagram.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY };
    diagram.setPointerCapture(e.pointerId);
    diagram.classList.add('dragging');
  });
  diagram.addEventListener('pointermove', (e) => {
    if (!drag) return;
    view.x += e.clientX - drag.x;
    view.y += e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    touched = true;
    apply();
  });
  const endDrag = () => { drag = null; diagram.classList.remove('dragging'); };
  diagram.addEventListener('pointerup', endDrag);
  diagram.addEventListener('pointercancel', endDrag);
  diagram.addEventListener('dblclick', fit);
  // Refit when the diagram's box changes (window resize, the header growing when the host path arrives, an error
  // message appearing above it).
  new ResizeObserver(() => { if (!touched) fit(); }).observe(diagram);

  return {
    fit,

    /** Render `text` in place of the current diagram. On a syntax error the last good render stays. */
    async show(text) {
      const id = 'd' + n++;
      try {
        const { svg } = await mermaid.render(id, text);
        stage.innerHTML = svg;
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
