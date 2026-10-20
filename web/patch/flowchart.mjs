// Small text edits to a Mermaid flowchart, for the live page's edit menu. Each function takes the file's text and
// returns new text that differs only where the edit must: comments, directives, frontmatter, spacing and every other
// line stay byte-for-byte as they were. Plain functions with no DOM, so Node can test them.

const ID = String.raw`[\p{L}\p{N}_]+`;
const ID_CHAR = /[\p{L}\p{N}_]/u;

// Lines that name a node without being a place to define one.
const NOT_A_STATEMENT = /^\s*(style|classDef|class|click|linkStyle|subgraph|direction|end)\b/;

// Shape openers and their closers, longest first so `((` wins over `(`. Trapezoids close with either slash.
const SHAPES = [
  ['(((', [')))']], ['([', ['])']], ['[[', [']]']], ['[(', [')]']], ['((', ['))']], ['{{', ['}}']],
  ['[/', ['/]', '\\]']], ['[\\', ['\\]', '/]']], ['[', [']']], ['(', [')']], ['{', ['}']], ['>', [']']],
];

/** Split into lines, each keeping its own line ending, so joining them gives back the exact text. */
function lines(text) {
  return text.match(/[^\n]*\n|[^\n]+$/g) || [];
}

/** Index of the first line after any frontmatter, init directives, comments and blank lines: the header line. */
function headerIndex(ls) {
  let i = 0;
  if (ls[0] && ls[0].trim() === '---') {
    i = 1;
    while (i < ls.length && ls[i].trim() !== '---') i++;
    i++;
  }
  while (i < ls.length && (ls[i].trim() === '' || ls[i].trim().startsWith('%%'))) i++;
  return i;
}

/** True for `flowchart` and `graph` diagrams, the only types these edits understand. */
export function isFlowchart(text) {
  const ls = lines(text);
  const header = ls[headerIndex(ls)] || '';
  return /^\s*(flowchart|graph)\b/.test(header);
}

/**
 * The line with everything that is not syntax blanked out: quoted strings, shape and edge labels, `@{…}` blocks and
 * comments become spaces. Positions are kept, so an index into the mask is an index into the line.
 */
function mask(line) {
  if (/^\s*%%/.test(line)) return line.replace(/[^\n]/g, ' ');
  const out = line.split('');
  const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '"') {
      const end = line.indexOf('"', i + 1);
      const stop = end < 0 ? line.length : end + 1;
      blank(i, stop);
      i = stop;
    } else if (c === '|') {
      // An edge label: |text| or |"text"|, where the quoted form may itself hold a pipe.
      const q = line[i + 1] === '"' ? line.indexOf('"', i + 2) : i;
      const end = line.indexOf('|', q < 0 ? i + 1 : q + 1);
      const stop = end < 0 ? line.length : end + 1;
      blank(i, stop);
      i = stop;
    } else if (c === '@' && line[i + 1] === '{') {
      const end = line.indexOf('}', i);
      const stop = end < 0 ? line.length : end + 1;
      blank(i, stop);
      i = stop;
    } else if (i > 0 && ID_CHAR.test(line[i - 1]) && SHAPES.some(([open]) => line.startsWith(open, i))) {
      const span = shapeSpan(line, i);
      const stop = span ? span.end : line.length;
      blank(i, stop);
      i = stop;
    } else {
      i++;
    }
  }
  return out.join('');
}

/** For a shape opener at `at`, where its label starts and ends and where the whole shape ends. */
function shapeSpan(line, at) {
  for (const [open, closers] of SHAPES) {
    if (!line.startsWith(open, at)) continue;
    const start = at + open.length;
    let from = start;
    if (line[start] === '"') {
      const q = line.indexOf('"', start + 1);
      if (q < 0) return null;
      from = q + 1;
    }
    let best = null;
    for (const close of closers) {
      const k = line.indexOf(close, from);
      if (k >= 0 && (best === null || k < best.k)) best = { k, close };
    }
    if (!best) return null;
    return { open, labelStart: start, labelEnd: best.k, end: best.k + best.close.length };
  }
  return null;
}

/** Each place `id` appears as a node reference in the diagram body: [{ line, col }]. */
function mentions(text, id) {
  const ls = lines(text);
  const found = [];
  const re = new RegExp(String.raw`(?<![\p{L}\p{N}_])${escapeRe(id)}(?![\p{L}\p{N}_])`, 'gu');
  for (let n = headerIndex(ls) + 1; n < ls.length; n++) {
    const m = mask(ls[n]);
    for (const hit of m.matchAll(re)) found.push({ line: n, col: hit.index });
  }
  return found;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertId(id) {
  if (!new RegExp(`^${ID}$`, 'u').test(id)) throw new Error(`Not a node id this editor can change: ${id}`);
}

function assertNode(text, id) {
  assertId(id);
  if (!mentions(text, id).length) throw new Error(`Node ${id} is not in the file.`);
}

/**
 * A label as Mermaid source, quoted: the characters that would end the quote or be read as markup become Mermaid's
 * entity codes, so the node shows exactly what was typed. Line breaks become spaces.
 */
export function quoteLabel(label) {
  const codes = { '#': '#35;', '"': '#quot;', '<': '#lt;', '>': '#gt;', '&': '#amp;' };
  return '"' + label.replace(/\r?\n/g, ' ').replace(/[#"<>&]/g, (c) => codes[c]) + '"';
}

/** The first of `n1`, `n2`, … that appears nowhere in the text, labels and comments included. */
export function freeId(text) {
  for (let k = 1; ; k++) {
    const id = 'n' + k;
    if (!new RegExp(String.raw`(?<![\p{L}\p{N}_])${id}(?![\p{L}\p{N}_])`, 'u').test(text)) return id;
  }
}

/** Insert a line after line `n`, with the indentation of line `n`. */
function insertAfter(text, n, body) {
  const ls = lines(text);
  const ref = ls[n];
  const indent = ref.match(/^[ \t]*/)[0];
  const newline = ref.endsWith('\n') ? '' : '\n';
  ls.splice(n + 1, 0, newline + indent + body + (newline ? '' : '\n'));
  return ls.join('');
}

/** Index of the last line with any content. */
function lastContentLine(text) {
  const ls = lines(text);
  for (let n = ls.length - 1; n >= 0; n--) if (ls[n].trim()) return n;
  return -1;
}

/**
 * Add a new node connected from `fromId`: `fromId --> nK["New node"]`, placed after the last line that mentions
 * `fromId`, so it lands in the same subgraph. Returns { text, id }.
 */
export function addConnected(text, fromId, label = 'New node') {
  assertNode(text, fromId);
  const id = freeId(text);
  const last = mentions(text, fromId).at(-1).line;
  return { text: insertAfter(text, last, `${fromId} --> ${id}[${quoteLabel(label)}]`), id };
}

/**
 * Connect two existing nodes: `a --> b`, appended after the last line of the file. That is at the top level, outside
 * any subgraph, so neither node changes subgraph.
 */
export function connect(text, a, b) {
  assertNode(text, a);
  assertNode(text, b);
  return { text: insertAfter(text, lastContentLine(text), `${a} --> ${b}`) };
}

/**
 * Change a node's label where it is first given a shape (`A[old]` → `A["new"]`, `A@{ … label: "new" }`), keeping the
 * shape. A node that only ever appears bare gets `["new"]` at its first appearance in an edge or node statement.
 */
export function relabel(text, id, label) {
  assertNode(text, id);
  const ls = lines(text);
  const quoted = quoteLabel(label);
  const found = mentions(text, id);

  for (const { line, col } of found) {
    const s = ls[line];
    const after = col + id.length;
    if (s.startsWith('@{', after)) {
      const end = s.indexOf('}', after);
      const block = s.slice(after, end + 1);
      const labelRe = /(label\s*:\s*)("(?:[^"\\]|\\.)*"|[^,}]*)/;
      const next = labelRe.test(block)
        ? block.replace(labelRe, (_, key) => key + quoted)
        : block.replace(/^@\{\s*/, (open) => open + `label: ${quoted}, `);
      ls[line] = s.slice(0, after) + next + s.slice(end + 1);
      return { text: ls.join('') };
    }
    const span = SHAPES.some(([open]) => s.startsWith(open, after)) ? shapeSpan(s, after) : null;
    if (span) {
      // Trapezoid and parallelogram labels sit inside their slashes: `[/label/]`. Keep the slashes.
      ls[line] = s.slice(0, span.labelStart) + quoted + s.slice(span.labelEnd);
      return { text: ls.join('') };
    }
  }

  const bare = found.find(({ line }) => !NOT_A_STATEMENT.test(ls[line]));
  if (!bare) throw new Error(`Node ${id} appears only in style or class lines; there is no place to label it.`);
  const s = ls[bare.line];
  const at = bare.col + id.length;
  ls[bare.line] = s.slice(0, at) + `[${quoted}]` + s.slice(at);
  return { text: ls.join('') };
}

/** The Mermaid node id behind an SVG node element's id: `<render id>-flowchart-<node id>-<n>`. */
export function nodeIdFromSvgId(svgId, renderId) {
  const prefix = `${renderId}-flowchart-`;
  if (!svgId.startsWith(prefix)) return null;
  const m = svgId.slice(prefix.length).match(/^(.+)-\d+$/);
  return m ? m[1] : null;
}
