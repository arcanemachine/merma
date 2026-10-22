// A menu drawn from its items (menu-items.mjs): one button per item, its key underlined, an item that does not apply
// greyed with its reason as the hover title. It is a manual popover, so it sits above everything without z-index, and
// it stays open until whoever opened it closes it: a pan of the diagram is not a click away.
//
// Keys while focus is in it (it takes focus when it opens): Up and Down move, an item's letter or Enter runs it, Right
// opens the focused item's submenu and Left, Escape or the item's letter again closes it, Escape closes the menu.
// Other keys stop here, so the page's own keys (N, Delete…) do not act behind an open menu; Ctrl, Cmd and Alt
// combinations go on (undo still works).

import { keyIndex } from './menu-items.mjs';
import { place } from './place.mjs';

/**
 * @param {import('./menu-items.mjs').MenuItem[]} items
 * @param {object} options
 * @param {HTMLElement} options.parent where the menu lives in the DOM (events from it are the overlay's, not the diagram's)
 * @param {() => DOMRect} options.bounds the area it must stay inside
 * @param {HTMLElement} options.returnFocus what gets focus back when the menu closes with focus in it
 * @param {Record<string, { el: HTMLElement, focus(): void }>} [options.submenus] by an item's `submenu`
 * @param {(action: string) => void} options.onRun
 * @param {(why: string) => void} options.onRefuse an item that does not apply was chosen
 * @param {() => void} [options.onClose] it closed, by whatever means
 */
export function createMenu(items, { parent, bounds, returnFocus, submenus = {}, onRun, onRefuse, onClose = () => {} }) {
  const el = popover('menu');
  el.setAttribute('role', 'menu');
  const sub = popover('menu submenu');
  parent.append(el, sub);
  /** @type {import('./menu-items.mjs').MenuState} set when the menu opens */
  let state;
  /** @type {{ left: number, top: number, right: number, bottom: number } | null} */
  let anchor = null;
  let gap = 8;
  /** @type {import('./menu-items.mjs').MenuItem | null} the item whose submenu is open */
  let openSub = null;

  const buttons = items.map((item) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.dataset.action = item.action;
    if (item.separated) b.classList.add('separated');
    if (item.submenu) { b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); }
    b.addEventListener('click', () => choose(item));
    // The item under the pointer is the focused one, so there is one highlight and Enter runs what it shows.
    b.addEventListener('pointerenter', () => b.focus());
    el.append(b);
    return b;
  });

  /** @typedef {import('./menu-items.mjs').MenuItem} MenuItem */
  const applies = (/** @type {MenuItem} */ item) => !item.applies || item.applies(state);

  /** Draw the items for the current state: labels, keys, and which are greyed. */
  function render() {
    items.forEach((item, i) => {
      const b = buttons[i];
      const label = item.label;
      const at = keyIndex(label, item.key);
      const text = document.createElement('span');
      text.append(label.slice(0, at), Object.assign(document.createElement('u'), { textContent: label[at] }),
        label.slice(at + 1));
      b.replaceChildren(text);
      if (item.submenu) b.append(Object.assign(document.createElement('span'), { className: 'more', textContent: '▸' }));
      const off = !applies(item);
      b.setAttribute('aria-disabled', String(off));
      if (off) b.title = item.why?.(state) ?? ''; else b.removeAttribute('title');
    });
  }

  function choose(/** @type {MenuItem} */ item) {
    if (!applies(item)) { onRefuse(item.why?.(state) ?? ''); return; }
    if (item.submenu) { if (openSub === item) closeSub(); else openSubmenu(item); return; }
    close();
    onRun(item.action);
  }

  /** Open the submenu of `item`, an item that has one. */
  function openSubmenu(/** @type {MenuItem} */ item) {
    closeSub();
    openSub = item;
    const host = submenus[/** @type {string} */ (item.submenu)];
    sub.replaceChildren(host.el);
    sub.showPopover();
    buttons[items.indexOf(item)].setAttribute('aria-expanded', 'true');
    placeSub();
    host.focus();
  }

  function closeSub() {
    if (!openSub) return;
    const b = buttons[items.indexOf(openSub)];
    b.setAttribute('aria-expanded', 'false');
    openSub = null;
    if (sub.matches(':popover-open')) sub.hidePopover();
    if (sub.contains(document.activeElement) || document.activeElement === document.body) b.focus();
  }

  function placeSub() {
    if (!openSub) return;
    const r = buttons[items.indexOf(openSub)].getBoundingClientRect();
    put(sub, place(r, sub.getBoundingClientRect(), bounds(), { gap: 4 }));
  }

  function put(/** @type {HTMLElement} */ box, /** @type {{ left: number, top: number }} */ at) {
    box.style.left = at.left + 'px';
    box.style.top = at.top + 'px';
  }

  /** Where the menu sits: beside `anchor` (a rectangle, or a point as a rectangle of no size). */
  function reposition(to = anchor) {
    if (!isOpen() || !to) return;
    anchor = to;
    put(el, place(anchor, el.getBoundingClientRect(), bounds(), { gap }));
    placeSub();
  }

  const isOpen = () => el.matches(':popover-open');

  function close() {
    closeSub();
    const had = el.contains(document.activeElement) || sub.contains(document.activeElement);
    if (!isOpen()) return;
    el.hidePopover();
    if (had) returnFocus.focus();
    onClose();
  }

  el.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const at = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    const item = items[at];
    const key = e.key.toLowerCase();
    const byKey = items.find((i) => i.key === key);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(at + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
    } else if (e.key === 'ArrowRight' && item?.submenu) {
      e.preventDefault();
      if (openSub !== item) choose(item); else submenus[item.submenu].focus();
    } else if (e.key === 'ArrowLeft' && openSub) {
      e.preventDefault();
      closeSub();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (openSub) closeSub();
      else close();
    } else if (byKey && e.key.length === 1) {
      e.preventDefault();
      buttons[items.indexOf(byKey)].focus();
      choose(byKey);
    }
    e.stopPropagation();
  });

  // Keys the picker leaves (Escape, Left at the start of a row) close the submenu, back to its item; so does the item's
  // letter, as a second click on the item does.
  sub.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' || e.key === 'ArrowLeft' || e.key.toLowerCase() === openSub?.key) { e.preventDefault(); closeSub(); }
    e.stopPropagation();
  });

  return {
    el,
    /**
     * Open beside `at` for `menuState`, focusing its first item that applies; `gap` is 0 to open at a point. When it is
     * open already, it is only redrawn and moved.
     * @param {{ left: number, top: number, right: number, bottom: number }} at
     * @param {import('./menu-items.mjs').MenuState} menuState
     * @param {{ gap?: number }} [options]
     */
    open(at, menuState, { gap: g = 8 } = {}) {
      state = menuState;
      gap = g;
      render();
      // Already open (the file changed under it): keep its submenu and its focus.
      const fresh = !isOpen();
      if (fresh) el.showPopover();
      reposition(at);
      if (fresh) (buttons.find((_, i) => applies(items[i])) ?? buttons[0]).focus();
    },
    reposition,
    close,
    isOpen,
    /** Whether an element is part of this menu or its submenu. */
    contains: (/** @type {Node} */ node) => el.contains(node) || sub.contains(node),
  };
}

function popover(/** @type {string} */ className) {
  const box = document.createElement('div');
  box.className = className;
  box.popover = 'manual';
  box.dataset.overlay = '';
  return box;
}
