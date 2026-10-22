// The arrow types an edge can be given, in a fixed order: an entry's digit picks it, so the order never changes and new
// entries go at the end. `key` is the arrow's shortest Mermaid syntax, as in ARROWS (patch/flowchart.mjs); names
// follow Mermaid's docs ("open link" is a line: no head).

import { icon } from './icons.mjs';

/** @type {Record<string, (x: number, dir: number) => string>} each end's drawing at `x`, pointing `dir` (1 right, -1 left) */
const HEADS = {
  none: () => '',
  point: (x, dir) => `<path d="M${x} 6 l${-6 * dir} -4 v8 z" fill="currentColor" stroke="none"/>`,
  circle: (x) => `<circle cx="${x - 3}" cy="6" r="3" stroke-width="1.5"/>`,
  cross: (x) => `<path d="M${x - 6} 2 l6 8 m0 -8 l-6 8" stroke-width="1.5"/>`,
};
/** @type {Record<string, string>} */
const STROKES = {
  normal: 'stroke-width="1.5"',
  dotted: 'stroke-width="1.5" stroke-dasharray="2 2"',
  thick: 'stroke-width="3.5"',
  invisible: 'stroke-width="1.5" stroke-dasharray="1 3" opacity="0.35"',
};

/**
 * A small drawing of an edge: its line and its ends.
 * @param {string} stroke a key of STROKES
 * @param {string} end a key of HEADS, as `start`
 * @param {string} [start]
 */
function arrow(stroke, end, start = 'none') {
  return icon(40, 12, `<path d="M${start === 'none' ? 2 : 6} 6 H${end === 'none' ? 38 : 34}" ${STROKES[stroke]}/>`
    + HEADS[end](38, 1) + (start === 'none' ? '' : HEADS[start](2, -1)));
}

/** @type {import('./picker.mjs').PickerEntry[]} */
export const ARROW_TYPES = [
  { key: '-->', digit: '1', name: 'Arrow', icon: arrow('normal', 'point') },
  { key: '---', digit: '2', name: 'Line', icon: arrow('normal', 'none') },
  { key: '-.->', digit: '3', name: 'Dotted arrow', icon: arrow('dotted', 'point') },
  { key: '-.-', digit: '4', name: 'Dotted line', icon: arrow('dotted', 'none') },
  { key: '==>', digit: '5', name: 'Thick arrow', icon: arrow('thick', 'point') },
  { key: '===', digit: '6', name: 'Thick line', icon: arrow('thick', 'none') },
  { key: '--o', digit: '7', name: 'Circle', icon: arrow('normal', 'circle') },
  { key: '--x', digit: '8', name: 'Cross', icon: arrow('normal', 'cross') },
  { key: '<-->', digit: '9', name: 'Two-way arrow', icon: arrow('normal', 'point', 'point') },
  { key: '~~~', digit: '0', name: 'Invisible', icon: arrow('invisible', 'none') },
];
