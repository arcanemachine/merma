// The diagram view: renders Mermaid text into the stage, and lets the user zoom (wheel, pinch), move (drag) and fit
// (double-click) it. It knows nothing about files or editing: it reports clicks, double-clicks and context menus
// (right-click, long-press), and whoever wired it decides what they mean. Elements marked `data-overlay` (a menu or an
// input laid over the diagram) are left to themselves. What the page adds to the drawing is marked `data-page-…`: the
// SVG export leaves out elements marked `data-page-only` and every `data-page-…` attribute.

// A change to this version changes the module's name in types/mermaid.d.ts too.
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
// A touch held this long without moving is a long-press, reported as a context menu. Android raises the browser's own
// contextmenu event for it; iOS Safari does not, hence the timer.
const LONG_PRESS_MS = 500;
// Two taps this close in time and place are a double-tap: about iOS's own window, and a finger's slop.
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP = 24;

/** Check that `text` is valid Mermaid; throws with Mermaid's message if not. */
export const parse = (/** @type {string} */ text) => mermaid.parse(text);

/**
 * @param {object} els
 * @param {HTMLElement} els.diagram the area the diagram is shown in
 * @param {HTMLElement} els.stage the element inside it that holds the SVG and is moved and scaled
 * @param {object} [hooks]
 * @param {(target: Element) => void} [hooks.onClick] a click, with the element pressed
 * @param {(target: Element) => boolean} [hooks.onDoubleClick] a double-click, with the element pressed; return true to
 *   say it was handled, or the view is fitted
 * @param {(target: Element, x: number, y: number, byKey: boolean) => boolean} [hooks.onContextMenu] a right-click or
 *   long-press, at client coordinates, or the menu key or Shift+F10 (`byKey`: its target is the focused diagram, and
 *   its coordinates are the browser's guess); return true to say it was handled (the browser's own menu is then not
 *   shown)
 * @param {() => void} [hooks.onViewChange] the diagram moved or was zoomed on screen
 */
export function createViewer({ diagram, stage }, hooks = {}) {
  const { onClick = () => {}, onDoubleClick = () => false, onContextMenu = () => false, onViewChange = () => {} } = hooks;
  // A scale and offset applied to the stage. The first render is fitted to the window (never enlarged); after that the
  // view is kept across re-renders (the user), so an edit moves nothing under the pointer. Until the user zooms or
  // drags, a change in the window's size fits it again.
  const view = { x: 0, y: 0, k: 1 };
  let size = { w: 0, h: 0 };
  let touched = false;
  // F and its kin toggle between a view and the whole diagram (the user): `fitted` is the view the last fit made, and
  // `before` the view a toggle's fit replaced, put back by the next toggle while the view is still the fitted one. Only
  // that one view is remembered, so fit, back, fit, back always comes back to it.
  /** @type {{ x: number, y: number, k: number } | null} */
  let fitted = null;
  /** @type {{ x: number, y: number, k: number, touched: boolean } | null} */
  let before = null;
  let n = 0;
  /** @type {string | null} */
  let renderId = null;
  // Mermaid lays a diagram out in a scratch element before handing back its SVG. Left to itself it puts that element
  // in the body, where it takes up room in the page's layout for a frame or more, so the page jumps on every render.
  const scratch = document.createElement('div');
  Object.assign(scratch.style, { position: 'absolute', left: '0', top: '0', visibility: 'hidden', pointerEvents: 'none' });
  scratch.setAttribute('aria-hidden', 'true');
  diagram.append(scratch);

  function apply() {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    onViewChange();
  }

  // The fit leaves the diagram area's top padding clear, besides its own margin.
  function fit() {
    const box = diagram.getBoundingClientRect();
    if (!size.w || !size.h) return;
    const top = parseFloat(getComputedStyle(diagram).paddingTop) || 0;
    view.k = Math.min(1, (box.width - 2 * PAD) / size.w, (box.height - top - 2 * PAD) / size.h);
    view.x = (box.width - size.w * view.k) / 2;
    view.y = top + (box.height - top - size.h * view.k) / 2;
    touched = false;
    fitted = { ...view };
    apply();
  }
  /** Whether the view is still the one the last fit made: a pan or a zoom since moves it off. */
  const atFit = () => Boolean(fitted && Math.abs(view.x - fitted.x) < 0.5 && Math.abs(view.y - fitted.y) < 0.5
    && view.k === fitted.k);
  /** Fit, remembering the view it replaces; at that fit still, put the remembered view back instead. */
  function toggleFit() {
    if (before && atFit()) {
      ({ x: view.x, y: view.y, k: view.k, touched } = before);
      before = null;
      apply();
      return;
    }
    before = { ...view, touched };
    fit();
  }

  /** Zoom by `factor` about the point (`px`, `py`) of the diagram area. */
  function zoomAt(/** @type {number} */ px, /** @type {number} */ py, /** @type {number} */ factor) {
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
  // A press is one gesture, `drag`, however many fingers it has: a second finger on a touch screen makes it a pinch
  // (zoom about the point between the fingers, and move with it), and is never a click or a long-press.
  /**
   * @typedef {object} Drag
   * @property {number} x @property {number} y where the pointer was at the last move
   * @property {number} startX @property {number} startY where the press started
   * @property {boolean} moving it moved past the click slop
   * @property {Element} target the element pressed
   * @property {boolean} [handled] already reported (a long-press, or a pinch): its release is not a click
   * @property {ReturnType<typeof setTimeout>} [timer] the long-press timer
   * @property {{ dist: number, x: number, y: number } | null} [pinch] two fingers' spread and middle, while pinching
   */
  /** @type {Drag | null} */
  let drag = null;
  /** @type {Element | null} the element the last click pressed, for the double-click that follows it */
  let clicked = null;
  // A double-tap is the viewer's own: iOS Safari fires no dblclick where the page takes the gestures (touch-action:
  // none), and Android's, which it does fire, is then ignored, so every browser does the same.
  /** @type {{ t: number, x: number, y: number } | null} the last tap, while a second could make it a double */
  let tapped = null;
  let lastPointer = '';
  /** @type {Map<number, { x: number, y: number }>} pointerId → the fingers (or the mouse) down in this gesture */
  const pointers = new Map();
  const spread = () => {
    const [a, b] = pointers.values();
    const box = diagram.getBoundingClientRect();
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2 - box.left, y: (a.y + b.y) / 2 - box.top };
  };
  /** Carry on with the fingers still down, from where they are now, so the view does not jump. */
  function reanchor() {
    const d = /** @type {Drag} */ (drag);   // only called during a gesture
    if (pointers.size >= 2) { d.pinch = spread(); return; }
    const [rest] = pointers.values();
    d.pinch = null;
    d.x = d.startX = rest.x;
    d.y = d.startY = rest.y;
  }
  diagram.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || /** @type {Element} */ (e.target).closest('[data-overlay]')) return;
    // A primary pointer is the only one of its kind down: a gesture still open then lost its release, and is replaced.
    if (drag && e.pointerType !== 'mouse' && !e.isPrimary) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      diagram.setPointerCapture(e.pointerId);
      clearTimeout(drag.timer);
      drag.handled = drag.moving = true;
      reanchor();
      return;
    }
    pointers.clear();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const target = /** @type {Element} */ (e.target);
    drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moving: false, target };
    diagram.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      const press = drag;
      press.timer = setTimeout(() => {
        if (drag !== press || press.moving) return;
        press.handled = true;   // the release that follows is not a click
        onContextMenu(press.target, press.startX, press.startY, false);
      }, LONG_PRESS_MS);
    }
  });
  diagram.addEventListener('contextmenu', (e) => {
    if (/** @type {Element} */ (e.target).closest('[data-overlay]')) return;
    // On Android this is the long-press itself: whichever of it and the timer above comes first reports it, once.
    if (drag?.handled) { e.preventDefault(); return; }
    if (drag) { clearTimeout(drag.timer); drag.handled = true; }
    // A right-click is button 2; the menu key and Shift+F10 come with button 0 and no press before them (a long-press
    // has one, so it is never taken for a key).
    const byKey = !drag && e.button !== 2;
    if (onContextMenu(drag?.target ?? /** @type {Element} */ (e.target), e.clientX, e.clientY, byKey)) e.preventDefault();
  });
  diagram.addEventListener('pointermove', (e) => {
    if (!drag || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (drag.pinch) {
      const was = drag.pinch, now = spread();
      view.x += now.x - was.x;
      view.y += now.y - was.y;
      drag.pinch = now;
      zoomAt(now.x, now.y, was.dist ? now.dist / was.dist : 1);
      return;
    }
    if (!drag.moving) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < CLICK_SLOP) return;
      drag.moving = true;
      clearTimeout(drag.timer);
      diagram.classList.add('dragging');
    }
    view.x += e.clientX - drag.x;
    view.y += e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    touched = true;
    apply();
  });
  const endDrag = () => { if (drag) clearTimeout(drag.timer); drag = null; pointers.clear(); diagram.classList.remove('dragging'); };
  /** A finger lifted: the gesture goes on while any are down. Returns whether it did. */
  const lifted = (/** @type {PointerEvent} */ e) => {
    if (!drag || !pointers.delete(e.pointerId) || !pointers.size) return false;
    reanchor();
    return true;
  };
  diagram.addEventListener('pointerup', (e) => {
    if (lifted(e)) return;
    lastPointer = e.pointerType;
    const press = drag;
    endDrag();
    clicked = press && !press.moving && !press.handled ? press.target : null;
    if (!clicked) { tapped = null; return; }
    onClick(clicked);
    if (e.pointerType !== 'touch') return;
    const now = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    const twice = tapped && now.t - tapped.t < DOUBLE_TAP_MS && Math.hypot(now.x - tapped.x, now.y - tapped.y) < DOUBLE_TAP_SLOP;
    tapped = twice ? null : now;
    if (twice) doubled();
  });
  diagram.addEventListener('pointercancel', (e) => { if (!lifted(e)) { endDrag(); tapped = null; } });
  diagram.addEventListener('dblclick', (e) => {
    if (lastPointer === 'touch' || /** @type {Element} */ (e.target).closest('[data-overlay]')) return;
    doubled();
  });
  /** A double-click or double-tap on what the last click pressed: whoever wired the viewer handles it, or it fits. */
  function doubled() {
    if (!(clicked?.isConnected && onDoubleClick(clicked))) toggleFit();
  }
  // Refit when the diagram's box changes (window resize, the header growing when the host path arrives, an error
  // message appearing above it).
  new ResizeObserver(() => { if (!touched) fit(); }).observe(diagram);

  return {
    fit,
    toggleFit,

    /** Whether the next toggleFit() puts a view back, rather than fitting. */
    canGoBack: () => Boolean(before && atFit()),

    /** The selection changed: the next toggle fits afresh. */
    forgetFit() { before = null; },

    /** The current zoom and offset, and whether the user has moved it (if not, the view follows the window). */
    getView: () => ({ ...view, touched }),

    /** Put back a view from getView(). It counts as the user's, so a refit (window resize) leaves it alone. */
    setView(/** @type {{ x: number, y: number, k: number }} */ { x, y, k }) {
      Object.assign(view, { x, y, k });
      touched = true;
      apply();
    },

    /** Move the diagram by a fraction of the area's size, as scrolling would: (1, 0) shows what is to the right. */
    pan(/** @type {number} */ fx, /** @type {number} */ fy) {
      const box = diagram.getBoundingClientRect();
      view.x -= fx * box.width;
      view.y -= fy * box.height;
      touched = true;
      apply();
    },

    /** Zoom by `factor` about the middle of the diagram area. */
    zoom(/** @type {number} */ factor) {
      const box = diagram.getBoundingClientRect();
      zoomAt(box.width / 2, box.height / 2, factor);
    },

    /**
     * Move the view the least it takes to bring `rect` (client coordinates) inside the diagram area, a margin in from
     * its edges and clear of its top padding, where the notice lies; nothing moves when it is inside already. A rect
     * too big to fit is aligned at its top left.
     */
    reveal(/** @type {DOMRect} */ rect) {
      const box = diagram.getBoundingClientRect();
      const top = box.top + (parseFloat(getComputedStyle(diagram).paddingTop) || 0) + PAD;
      const shift = (/** @type {number} */ lo, /** @type {number} */ hi, /** @type {number} */ min, /** @type {number} */ max) =>
        (lo < min || hi - lo > max - min ? min - lo : hi > max ? max - hi : 0);
      const dx = shift(rect.left, rect.right, box.left + PAD, box.right - PAD);
      const dy = shift(rect.top, rect.bottom, top, box.bottom - PAD);
      if (!dx && !dy) return;
      view.x += dx;
      view.y += dy;
      touched = true;
      apply();
    },

    /**
     * Move the view so the point (`x`, `y`, client coordinates) is in the middle of the diagram area, below its top
     * padding, at the zoom it has. Returns false, moving nothing, when it is there already (within a pixel).
     */
    centre(/** @type {number} */ x, /** @type {number} */ y) {
      const box = diagram.getBoundingClientRect();
      const top = box.top + (parseFloat(getComputedStyle(diagram).paddingTop) || 0);
      const dx = box.left + box.width / 2 - x, dy = (top + box.bottom) / 2 - y;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return false;
      view.x += dx;
      view.y += dy;
      touched = true;
      apply();
      return true;
    },

    /** The id the shown SVG was rendered under; Mermaid starts its element ids with it. */
    get renderId() { return renderId; },

    /** Render `text` in place of the current diagram. On a syntax error the last good render stays. */
    async show(/** @type {string} */ text) {
      const id = 'd' + n++;
      try {
        const { svg } = await mermaid.render(id, text, scratch);
        const first = renderId === null;
        stage.innerHTML = svg;
        renderId = id;
        const rect = /** @type {SVGSVGElement} */ (stage.querySelector('svg')).getBoundingClientRect();
        size = { w: rect.width / view.k, h: rect.height / view.k };
        if (first) fit();
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
      if (!svg) return null;
      const copy = /** @type {SVGSVGElement} */ (svg.cloneNode(true));
      for (const e of copy.querySelectorAll('[data-page-only]')) e.remove();
      for (const e of [copy, ...copy.querySelectorAll('*')]) {
        // A marked item's inline colours, set aside while marked (editor.mjs), go back as Mermaid drew them.
        const style = e.getAttribute('data-page-style');
        if (style !== null) e.setAttribute('style', style);
        for (const a of [...e.attributes]) if (a.name.startsWith('data-page-')) e.removeAttribute(a.name);
      }
      return new XMLSerializer().serializeToString(copy);
    },
  };
}
