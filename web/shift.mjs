// Whether Shift is held, for what shows only while it is (the shape picker's second ten, Insert node's other half).
// Read from every key and pointer event, so a Shift pressed before the page had focus counts from the first event,
// and let go when the window loses focus, since its keyup then never comes. Listened for from the first watch, not on
// import, so a test can import a module that uses it without a page.

/** @type {((held: boolean) => void)[]} */
const watchers = [];
let held = false;

function set(/** @type {boolean} */ on) {
  if (on === held) return;
  held = on;
  for (const w of watchers) w(on);
}

/** Call `onChange(held)` whenever Shift is pressed or let go. */
export function watchShift(/** @type {(held: boolean) => void} */ onChange) {
  if (!watchers.length) {
    for (const type of ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup']) {
      document.addEventListener(type, (e) => set(/** @type {KeyboardEvent | PointerEvent} */ (e).shiftKey), true);
    }
    window.addEventListener('blur', () => set(false));
  }
  watchers.push(onChange);
}

/** Whether Shift is held now. */
export const shiftHeld = () => held;
