// The page's theme, light or dark (docs/ux.md): the system's, unless one is chosen in this browser. No DOM.

/** Where the chosen theme is kept (localStorage); index.html reads it too, before the page paints. */
export const THEME_KEY = 'merma:theme';

/** The page theme choices, in the Page theme submenu's order: System follows the system's setting. */
export const THEMES = [
  { key: 'system', name: 'System' },
  { key: 'light', name: 'Light' },
  { key: 'dark', name: 'Dark' },
];

/** The theme shown: the one chosen ('light' or 'dark'; anything else is none), else the system's. */
export function shownTheme(/** @type {string | null} */ chosen, /** @type {boolean} */ systemDark) {
  return chosen === 'light' || chosen === 'dark' ? chosen : systemDark ? 'dark' : 'light';
}

/** The choice that a kept value stands for: 'light', 'dark', or 'system' for none (or anything else). */
export function themeChoice(/** @type {string | null} */ chosen) {
  return chosen === 'light' || chosen === 'dark' ? chosen : 'system';
}
