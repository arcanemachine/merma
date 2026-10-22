// The shapes a node can be given, in a fixed order: an entry's digit picks it, so the order never changes and new
// entries go at the end. `key` is the shape's `@{ shape }` name; `name` and `meaning` are the "Shape Name" and
// "Semantic Name" columns of Mermaid's flowchart docs. Which shapes also have brackets is in BRACKETS
// (patch/flowchart.mjs).

import { icon } from './icons.mjs';

/** A shape's outline in a 28 × 18 frame. */
const shape = (/** @type {string} */ inner) => icon(28, 18, `<g stroke-width="1.5">${inner}</g>`);

/** @type {import('./picker.mjs').PickerEntry[]} */
export const NODE_SHAPES = [
  { key: 'rect', digit: '1', name: 'Rectangle', meaning: 'Process', icon: shape('<rect x="2" y="3" width="24" height="12"/>') },
  { key: 'rounded', digit: '2', name: 'Rounded rectangle', meaning: 'Event', icon: shape('<rect x="2" y="3" width="24" height="12" rx="4"/>') },
  { key: 'diam', digit: '3', name: 'Diamond', meaning: 'Decision', icon: shape('<path d="M14 1 L26 9 L14 17 L2 9 Z"/>') },
  { key: 'stadium', digit: '4', name: 'Stadium', meaning: 'Terminal point', icon: shape('<rect x="2" y="3" width="24" height="12" rx="6"/>') },
  { key: 'cyl', digit: '5', name: 'Cylinder', meaning: 'Database', icon: shape('<path d="M5 4 V14 A9 2.5 0 0 0 23 14 V4 A9 2.5 0 0 0 5 4 A9 2.5 0 0 0 23 4"/>') },
  { key: 'lean-r', digit: '6', name: 'Lean right', meaning: 'Data input/output', icon: shape('<path d="M7 3 H26 L21 15 H2 Z"/>') },
  { key: 'fr-rect', digit: '7', name: 'Framed rectangle', meaning: 'Subprocess', icon: shape('<rect x="2" y="3" width="24" height="12"/><path d="M5 3 V15 M23 3 V15"/>') },
  { key: 'hex', digit: '8', name: 'Hexagon', meaning: 'Prepare conditional', icon: shape('<path d="M7 3 H21 L26 9 L21 15 H7 L2 9 Z"/>') },
  { key: 'circle', digit: '9', name: 'Circle', meaning: 'Start', icon: shape('<circle cx="14" cy="9" r="7"/>') },
  { key: 'doc', digit: '0', name: 'Document', meaning: 'Document', icon: shape('<path d="M3 3 H25 V14 Q19.5 11 14 14 T3 14 Z"/>') },
  { key: 'odd', name: 'Odd', meaning: 'Odd', icon: shape('<path d="M2 3 H26 V15 H2 L7 9 Z"/>') },
  { key: 'lean-l', name: 'Lean left', meaning: 'Data input/output', icon: shape('<path d="M2 3 H21 L26 15 H7 Z"/>') },
  { key: 'trap-b', name: 'Trapezoid base bottom', meaning: 'Priority action', icon: shape('<path d="M7 3 H21 L26 15 H2 Z"/>') },
  { key: 'trap-t', name: 'Trapezoid base top', meaning: 'Manual operation', icon: shape('<path d="M2 3 H26 L21 15 H7 Z"/>') },
  { key: 'dbl-circ', name: 'Double circle', meaning: 'Stop', icon: shape('<circle cx="14" cy="9" r="7.5"/><circle cx="14" cy="9" r="4.5"/>') },
  { key: 'docs', name: 'Stacked document', meaning: 'Multi-document', icon: shape('<path d="M2 6 H21 V15 Q16.25 12.5 11.5 15 T2 15 Z M5 6 V3.5 H24 V12.5 H21 M8 3.5 V1 H27 V10 H24"/>') },
  { key: 'sl-rect', name: 'Sloped rectangle', meaning: 'Manual input', icon: shape('<path d="M2 8 L26 3 V15 H2 Z"/>') },
  { key: 'delay', name: 'Half-rounded rectangle', meaning: 'Delay', icon: shape('<path d="M2 3 H20 A6 6 0 0 1 20 15 H2 Z"/>') },
  { key: 'bow-rect', name: 'Bow tie rectangle', meaning: 'Stored data', icon: shape('<path d="M6 3 H26 Q22 9 26 15 H6 Q2 9 6 3 Z"/>') },
  { key: 'curv-trap', name: 'Curved trapezoid', meaning: 'Display', icon: shape('<path d="M8 3 H20 Q26 3 26 9 Q26 15 20 15 H8 L2 9 Z"/>') },
];
