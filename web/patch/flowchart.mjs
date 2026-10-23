// Small text edits to a Mermaid flowchart, for the live page's edit menu. Each function takes the file's text and
// returns new text that differs only where the edit must: comments, directives, frontmatter, spacing and every other
// line stay byte-for-byte as they were. Plain functions with no DOM, so Node can test them.
//
// The rule every edit keeps: no edit puts an edge before an existing one. `linkStyle N` styles the Nth edge in the
// file, so an edge inserted earlier would silently restyle every edge after it. New edges are appended at the end.

/** @typedef {{ start: number, end: number }} Span where something is: offsets into the text, or a line */
/** @typedef {Span & { text: string, form?: 'text' }} Label an edge label as written, quotes kept; `form` for `-- a -->` */
/** @typedef {Span & { arrow: string, label: Label | null, userId: string | null }} Link a connector: `e1@-->|a|` */
/** @typedef {Span & { id: string }} Ref a node reference as written: `A[Start]:::cls` */
/**
 * One statement of the diagram body: a line, or part of one between `;`.
 * @typedef {object} Statement
 * @property {number} start
 * @property {number} end
 * @property {number} line its line's number
 * @property {boolean} [alone] the only statement on its line
 * @property {string | null} keyword `style`, `class`, `linkStyle`… for a statement that is not about nodes, else null
 * @property {Ref[][]} groups node groups, each a node or several joined by `&`…
 * @property {Link[]} links …joined by connectors
 * @property {boolean} complete all of it was read
 */
/**
 * A subgraph, as subgraphs() reads it.
 * @typedef {object} Subgraph
 * @property {string | null} id Mermaid's id (null while unclosed and written with none)
 * @property {boolean} written the file writes its id
 * @property {number} start the line of `subgraph`
 * @property {number | null} end the line of its `end`, null while unclosed
 * @property {number | null} parent the index of the subgraph it is in, or null
 * @property {Span & { form: 'bracket' | 'bare' }} title
 */
/** @typedef {{ from: string, to: string, arrow: string, label: { text: string } | null }} EdgeSig what an edge reads as */
/** @typedef {{ drop?: boolean, body?: string, reverse?: boolean }} PairChange what to do to one pair of a statement */
/** @typedef {{ text: string, ids?: string[] }} Part a statement written in place of another, and the nodes it names */
/** @typedef {{ s: Statement, parts: Part[] }} Change a statement and what replaces it (nothing: it goes) */

const ID = String.raw`[\p{L}\p{N}_]+`;
const ID_CHAR = /[\p{L}\p{N}_]/u;

// Lines that name a node without being a place to define one.
const NOT_A_STATEMENT = /^\s*(style|classDef|class|click|linkStyle|subgraph|direction|end)\b/;

// Shape openers and their closers, longest first so `((` wins over `(`. Trapezoids close with either slash.
/** @type {[string, string[]][]} */
const SHAPES = [
  ['(((', [')))']], ['([', ['])']], ['[[', [']]']], ['[(', [')]']], ['((', ['))']], ['{{', ['}}']],
  ['[/', ['/]', '\\]']], ['[\\', ['\\]', '/]']], ['[', [']']], ['(', [')']], ['{', ['}']], ['>', [']']],
];

/** A line's indentation. */
const indentOf = (/** @type {string} */ line) => /^[ \t]*/.exec(line)?.[0] ?? '';

/** Split into lines, each keeping its own line ending, so joining them gives back the exact text. */
function lines(/** @type {string} */ text) {
  return text.match(/[^\n]*\n|[^\n]+$/g) || [];
}

/** Index of the first line after any frontmatter, init directives, comments and blank lines: the header line. */
function headerIndex(/** @type {string[]} */ ls) {
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
export function isFlowchart(/** @type {string} */ text) {
  const ls = lines(text);
  const header = ls[headerIndex(ls)] || '';
  return /^\s*(flowchart|graph)\b/.test(header);
}

/** A flowchart's top-level direction, from its header (`flowchart LR`): TB (also written TD), BT, LR or RL. */
export function direction(/** @type {string} */ text) {
  const ls = lines(text);
  const d = /^\s*(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/i.exec(ls[headerIndex(ls)] || '')?.[1].toUpperCase();
  return /** @type {'TB' | 'BT' | 'LR' | 'RL'} */ (!d || d === 'TD' ? 'TB' : d);
}

/**
 * The line with everything that is not syntax blanked out: quoted strings, shape and edge labels, `@{…}` blocks and
 * comments become spaces. Positions are kept, so an index into the mask is an index into the line.
 */
function mask(/** @type {string} */ line) {
  if (/^\s*%%/.test(line)) return line.replace(/[^\n]/g, ' ');
  const out = line.split('');
  const blank = (/** @type {number} */ from, /** @type {number} */ to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '"') {
      const end = line.indexOf('"', i + 1);
      const stop = end < 0 ? line.length : end + 1;
      blank(i, stop);
      i = stop;
    } else if (c === '|') {
      const stop = pipeEnd(line, i);
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

/** For an edge label at `at` (`|text|`, or `|"text"|`, which may itself hold a pipe), the index just past it. */
function pipeEnd(/** @type {string} */ line, /** @type {number} */ at) {
  const q = line[at + 1] === '"' ? line.indexOf('"', at + 2) : at;
  const end = line.indexOf('|', q < 0 ? at + 1 : q + 1);
  return end < 0 ? line.length : end + 1;
}

/** For a shape opener at `at`, where its label starts and ends and where the whole shape ends. */
function shapeSpan(/** @type {string} */ line, /** @type {number} */ at) {
  for (const [open, closers] of SHAPES) {
    if (!line.startsWith(open, at)) continue;
    const start = at + open.length;
    let from = start;
    if (line[start] === '"') {
      const q = line.indexOf('"', start + 1);
      if (q < 0) return null;
      from = q + 1;
    }
    /** @type {{ k: number, close: string } | null} */
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
function mentions(/** @type {string} */ text, /** @type {string} */ id) {
  const ls = lines(text);
  const found = [];
  const re = new RegExp(String.raw`(?<![\p{L}\p{N}_])${escapeRe(id)}(?![\p{L}\p{N}_])`, 'gu');
  for (let n = headerIndex(ls) + 1; n < ls.length; n++) {
    const m = mask(ls[n]);
    for (const hit of m.matchAll(re)) found.push({ line: n, col: hit.index });
  }
  return found;
}

function escapeRe(/** @type {string} */ s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertId(/** @type {string} */ id) {
  if (!new RegExp(`^${ID}$`, 'u').test(id)) throw new Error(`Not a node id this editor can change: ${id}`);
}

function assertNode(/** @type {string} */ text, /** @type {string} */ id) {
  assertId(id);
  if (!mentions(text, id).length) throw new Error(`Node ${id} is not in the file.`);
}

/**
 * A label as Mermaid source, quoted: the characters that would end the quote or be read as markup become Mermaid's
 * entity codes, so the node shows exactly what was typed. A line break becomes `<br>`, the one tag left as markup:
 * it is how Mermaid breaks a label's line.
 */
export function quoteLabel(/** @type {string} */ label) {
  /** @type {Record<string, string>} */
  const codes = { '#': '#35;', '"': '#quot;', '<': '#lt;', '>': '#gt;', '&': '#amp;' };
  return '"' + label.split(/\r?\n/).map((part) => part.replace(/[#"<>&]/g, (c) => codes[c])).join('<br>') + '"';
}

/** The first of `n1`, `n2`, … (or of another prefix) that appears nowhere in the text, labels and comments included. */
export function freeId(/** @type {string} */ text, prefix = 'n') {
  for (let k = 1; ; k++) {
    const id = prefix + k;
    if (!new RegExp(String.raw`(?<![\p{L}\p{N}_])${id}(?![\p{L}\p{N}_])`, 'u').test(text)) return id;
  }
}

/** Insert a line after line `n`, with the indentation of line `n` (or `indent`). */
function insertAfter(/** @type {string} */ text, /** @type {number} */ n, /** @type {string} */ body, /** @type {string | null} */ indent = null) {
  const ls = lines(text);
  const ref = ls[n];
  indent ??= indentOf(ref);
  const newline = ref.endsWith('\n') ? '' : '\n';
  ls.splice(n + 1, 0, newline + indent + body + (newline ? '' : '\n'));
  return ls.join('');
}

/** Append a line after the last line with content, indented like the header's first statement. */
function appendLine(/** @type {string} */ text, /** @type {string} */ body) {
  return insertAfter(text, lastContentLine(text), body, statementIndent(text));
}

/** The indentation of the first statement after the header, used for lines appended at the top level. */
function statementIndent(/** @type {string} */ text) {
  const ls = lines(text);
  for (let k = headerIndex(ls) + 1; k < ls.length; k++) if (ls[k].trim()) return indentOf(ls[k]);
  return '  ';
}

/** Index of the last line with any content. */
function lastContentLine(/** @type {string} */ text) {
  const ls = lines(text);
  for (let n = ls.length - 1; n >= 0; n--) if (ls[n].trim()) return n;
  return -1;
}

/**
 * Every subgraph in the file, in text order. `id` is Mermaid's: the word before a bracketed title (`subgraph pay [Payment]`), or a bare title with no whitespace
 * in it (`subgraph Payment`, `subgraph "Payment"`). A bare title with whitespace has no id in the file (`written`
 * false), and Mermaid calls it `subGraph<k>`, k counting every subgraph in the order their `end`s come: an id only
 * good for the text it was drawn from. `title`: the bracket's contents, or the bare title.
 * @returns {Subgraph[]}
 */
export function subgraphs(/** @type {string} */ text) {
  const ls = lines(text);
  /** @type {Subgraph[]} */
  const out = [];
  /** @type {number[]} */
  const open = [];
  let closed = 0;
  let offset = 0;
  const header = headerIndex(ls);
  for (let k = 0; k < ls.length; offset += ls[k].length, k++) {
    if (k <= header) continue;
    const line = ls[k], m = mask(line);
    const kw = m.match(/^\s*subgraph(?=[\s;]|$)/);
    if (kw) {
      const semi = m.indexOf(';', kw[0].length);
      let to = semi < 0 ? line.length : semi;
      while (to > kw[0].length && /\s/.test(line[to - 1])) to--;
      let from = kw[0].length;
      while (from < to && /\s/.test(line[from])) from++;
      const raw = line.slice(from, to);
      const bracket = raw.match(new RegExp(`^("[^"]*"|${ID})\\s*\\[`, 'u'));
      const bare = raw.replace(/^"(.*)"$/, '$1');
      // A bracketed title follows the id; a bare one with no whitespace is the id too.
      const id = bracket && raw.endsWith(']') ? bracket[1].replace(/^"(.*)"$/, '$1') : bare && !/\s/.test(bare) ? bare : null;
      /** @type {Subgraph['title']} */
      const title = bracket && raw.endsWith(']')
        ? { start: offset + from + bracket[0].length, end: offset + to - 1, form: 'bracket' }
        : { start: offset + from, end: offset + to, form: 'bare' };
      open.push(out.length);
      out.push({ id, written: id !== null, start: k, end: null, parent: open.at(-2) ?? null, title });
    } else if (/^\s*end\s*;?\s*$/.test(m) && open.length) {
      const s = out[/** @type {number} */ (open.pop())];
      s.end = k;
      if (!s.written) s.id = `subGraph${closed}`;
      closed++;
    }
  }
  return out;
}

/** The subgraphs open at line `n` (its `subgraph` line included, its `end` not), innermost last. */
function subgraphsAt(/** @type {string} */ text, /** @type {number} */ n, all = subgraphs(text)) {
  return all.filter((s) => s.start <= n && (s.end === null || s.end > n));
}

/** The closed subgraph Mermaid calls `id`, or null. */
function subgraphBlock(/** @type {string} */ text, /** @type {string} */ id) {
  return subgraphs(text).find((s) => s.id === id && s.end !== null) ?? null;
}

/**
 * Add a new node connected from `fromId`. No edit ever puts an edge in the middle of the file: `linkStyle` colours
 * edges by their position, so an edge inserted earlier would recolour every edge after it. So the edge is appended
 * at the end, outside any subgraph (an edge there moves nobody). When `fromId`'s last statement is inside a subgraph,
 * the new node is declared after that line, so it joins the same subgraph. Returns { text, id }.
 */
export function addConnected(/** @type {string} */ text, /** @type {string} */ fromId, label = 'New node') {
  assertNode(text, fromId);
  const id = freeId(text);
  const node = `${id}[${quoteLabel(label)}]`;
  // Placed by the node's last statement, not its last mention: `class`, `style` and `click` lines usually sit at the
  // bottom of the file, outside every subgraph.
  const ls = lines(text);
  const all = mentions(text, fromId);
  // assertNode found a mention.
  const last = /** @type {{ line: number }} */ (all.filter(({ line }) => !NOT_A_STATEMENT.test(ls[line])).at(-1) ?? all.at(-1)).line;
  if (!subgraphsAt(text, last).length) return { text: appendLine(text, `${fromId} --> ${node}`), id };
  const declared = insertAfter(text, last, node);
  return { text: appendLine(declared, `${fromId} --> ${id}`), id };
}

/**
 * Add a new node with no edges: inside subgraph `subgraph` (before its `end`) when given, else at the end of the
 * file. Returns { text, id }.
 * @param {string} text
 * @param {{ subgraph?: string | null, label?: string }} [options]
 */
export function addNode(text, { subgraph = null, label = 'New node' } = {}) {
  const id = freeId(text);
  const node = `${id}[${quoteLabel(label)}]`;
  if (!subgraph) return { text: appendLine(text, node), id };
  return { text: insideSubgraph(text, subgraph, [node]), id };
}

/** Insert `body` lines as the last lines of subgraph `id`, before its `end`. */
function insideSubgraph(/** @type {string} */ text, /** @type {string} */ id, /** @type {string[]} */ body) {
  const block = subgraphBlock(text, id);
  if (!block) throw new Error('That subgraph is not in the file.');
  const end = /** @type {number} */ (block.end);   // subgraphBlock finds closed subgraphs only
  const ls = lines(text);
  // Indented like the subgraph's own lines: the line above `end`, or one step deeper than `end` for an empty one.
  const above = end - 1 > block.start ? ls[end - 1] : null;
  const indent = above ? indentOf(above) : indentOf(ls[end]) + '  ';
  ls.splice(end, 0, ...body.map((l) => indent + l + '\n'));
  return ls.join('');
}

/**
 * Connect two existing nodes: `a --> b`, appended after the last line of the file. That is at the top level, outside
 * any subgraph, so neither node changes subgraph.
 */
export function connect(/** @type {string} */ text, /** @type {string} */ a, /** @type {string} */ b) {
  const from = endpoint(text, a);
  const to = endpoint(from.text, b);
  return { text: appendLine(to.text, `${from.id} --> ${to.id}`) };
}

/**
 * A node or a subgraph an edge can name: { text, id }. A subgraph with no id in the file is given one first, since an
 * edge can only name it by an id.
 */
function endpoint(/** @type {string} */ text, /** @type {string} */ id) {
  const sg = subgraphBlock(text, id);
  if (!sg) { assertNode(text, id); return { text, id }; }
  if (sg.written) { assertId(id); return { text, id }; }
  return nameSubgraph(text, sg);
}

/**
 * Why subgraph `id` cannot be given an id, or null when it can (or has one). The file can name an id-less subgraph
 * only by Mermaid's `subGraph<k>`, in a `style` or `class` line or an edge; giving it an id of its own would break
 * them.
 */
export function subgraphRefusal(/** @type {string} */ text, /** @type {string} */ id) {
  const sg = subgraphBlock(text, id);
  if (!sg || sg.written || !mentions(text, id).length) return null;
  return `This subgraph has no id in the file, and lines there name it ${id}. Give it an id in the file first.`;
}

/** Give id-less subgraph `sg` an id of its own (`subgraph "A b"` → `subgraph s1 ["A b"]`), with `title` if given. */
function nameSubgraph(/** @type {string} */ text, /** @type {Subgraph} */ sg, /** @type {string | null} */ title = null) {
  const why = subgraphRefusal(text, /** @type {string} */ (sg.id));   // a closed subgraph has one
  if (why) throw new Error(why);
  const id = freeId(text, 's');
  const raw = text.slice(sg.title.start, sg.title.end);
  const shown = title ?? (/^".*"$/.test(raw) ? raw : `"${raw}"`);
  return { text: text.slice(0, sg.title.start) + `${id} [${shown}]` + text.slice(sg.title.end), id };
}

/**
 * Give subgraph `id` the title `title`, quoted: the bracket's contents are replaced (`subgraph pay ["New"]`); a bare
 * title that is also the id gets a bracket after it, keeping the id (`subgraph Payment ["New"]`); a subgraph with no
 * id is given one, since a new title with no whitespace in it would otherwise become its id. Returns { text, id }: the
 * id it has after.
 */
export function setSubgraphTitle(/** @type {string} */ text, /** @type {string} */ id, /** @type {string} */ title) {
  const sg = subgraphBlock(text, id);
  if (!sg) throw new Error('That subgraph is not in the file.');
  const quoted = quoteLabel(title);
  const { start, end, form } = sg.title;
  if (form === 'bracket') return { text: text.slice(0, start) + quoted + text.slice(end), id };
  if (sg.written) return { text: text.slice(0, end) + ` [${quoted}]` + text.slice(end), id };
  return nameSubgraph(text, sg, quoted);
}

/**
 * Add an empty subgraph, `subgraph s1 ["New subgraph"]` and its `end`: inside subgraph `parent` (before its `end`) when
 * given, else at the end of the file. Returns { text, id }.
 * @param {string} text
 * @param {{ parent?: string | null, title?: string }} [options]
 */
export function addSubgraph(text, { parent = null, title = 'New subgraph' } = {}) {
  const id = freeId(text, 's');
  const head = `subgraph ${id} [${quoteLabel(title)}]`;
  if (!parent) {
    const indent = statementIndent(text);
    return { text: insertAfter(text, lastContentLine(text), `${head}\n${indent}end`, indent), id };
  }
  return { text: insideSubgraph(text, parent, [head, 'end']), id };
}

/**
 * Change a node's label where it is first given a shape (`A[old]` → `A["new"]`, `A@{ … label: "new" }`), keeping the
 * shape. A node that only ever appears bare gets `["new"]` at its first appearance in an edge or node statement.
 */
export function relabel(/** @type {string} */ text, /** @type {string} */ id, /** @type {string} */ label) {
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
        ? block.replace(labelRe, (_, /** @type {string} */ key) => key + quoted)
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

// --- shapes --------------------------------------------------------------------------------------------------

/**
 * The shapes Mermaid also writes with brackets, by their `@{ shape }` name: [opener, closer]. Every other shape is
 * written `A@{ shape: doc }`.
 * @type {Record<string, [string, string]>}
 */
export const BRACKETS = {
  rect: ['[', ']'], rounded: ['(', ')'], diam: ['{', '}'], stadium: ['([', '])'], cyl: ['[(', ')]'],
  'fr-rect': ['[[', ']]'], hex: ['{{', '}}'], circle: ['((', '))'], 'dbl-circ': ['(((', ')))'], odd: ['>', ']'],
  'lean-r': ['[/', '/]'], 'lean-l': ['[\\', '\\]'], 'trap-b': ['[/', '\\]'], 'trap-t': ['[\\', '/]'],
};

const SHAPE_KEY = /(shape\s*:\s*)("[^"]*"|[^,}\s]+)/;
// A class on a node, `A:::hot`. Mermaid 12.2.0 takes it before an `@{ … }` (`A:::hot@{ shape: doc }`), not after.
const CLASS_AT = new RegExp(`^:::${ID}`, 'u');

/**
 * Where a node's shape is written: its last mention with brackets or an `@{ shape }` (Mermaid takes the shape from
 * the last), else its last `@{ … }` with no shape, else null: a node only ever written bare.
 */
function shapedMention(/** @type {string} */ text, /** @type {string} */ id) {
  const ls = lines(text);
  /** @type {{ line: number, at: number, span: NonNullable<ReturnType<typeof shapeSpan>> | null, block: string | null } | null} */
  let shaped = null, block = null;
  for (const { line, col } of mentions(text, id)) {
    const s = ls[line];
    let at = col + id.length;
    const cls = CLASS_AT.exec(s.slice(at))?.[0] ?? '';
    if (s.startsWith('@{', at + cls.length)) at += cls.length;
    if (s.startsWith('@{', at)) {
      const b = s.slice(at, s.indexOf('}', at) + 1);
      if (SHAPE_KEY.test(b)) shaped = { line, at, span: null, block: b };
      else block = { line, at, span: null, block: b };
    } else {
      const span = SHAPES.some(([open]) => s.startsWith(open, at)) ? shapeSpan(s, at) : null;
      if (span) shaped = { line, at, span, block: null };
    }
  }
  return shaped ?? block;
}

/**
 * A node's shape as written: its `@{ shape }` name (an alias or a name Mermaid lacks is returned as written), or
 * `rect` for a node written bare.
 */
export function shapeOf(/** @type {string} */ text, /** @type {string} */ id) {
  assertNode(text, id);
  const m = shapedMention(text, id);
  if (m?.span) {
    const s = lines(text)[m.line];
    const pair = [m.span.open, s.slice(m.span.labelEnd, m.span.end)];
    return Object.keys(BRACKETS).find((at) => BRACKETS[at][0] === pair[0] && BRACKETS[at][1] === pair[1]) ?? pair.join('');
  }
  const v = m?.block?.match(SHAPE_KEY)?.[2];
  return v ? v.replace(/^"|"$/g, '') : 'rect';
}

/**
 * Give a node another shape where its shape is written (shapedMention): an `@{ … }` gets its `shape:` changed or
 * added; brackets become the new shape's brackets around the same label, or `@{ shape: doc, label: "…" }` for a shape
 * with none (after any `:::class`). A node written only bare gets the shape at its first appearance in a node or edge
 * statement, labelled with its id as Mermaid draws it: `A{A}`, or `A@{ shape: doc }`.
 */
export function setShape(/** @type {string} */ text, /** @type {string} */ id, /** @type {string} */ at) {
  assertNode(text, id);
  if (!/^[a-z][a-z-]*$/.test(at)) throw new Error(`Not a shape name: ${at}`);
  const ls = lines(text);
  const to = BRACKETS[at];
  const m = shapedMention(text, id);
  if (m) {
    const s = ls[m.line];
    if (m.block !== null) {
      const b = m.block;
      const next = SHAPE_KEY.test(b) ? b.replace(SHAPE_KEY, (_, /** @type {string} */ key) => key + at)
        : /^@\{\s*\}$/.test(b) ? `@{ shape: ${at} }`
          : b.replace(/^@\{\s*/, (open) => open + `shape: ${at}, `);
      ls[m.line] = s.slice(0, m.at) + next + s.slice(m.at + b.length);
      return { text: ls.join('') };
    }
    const span = /** @type {NonNullable<typeof m.span>} */ (m.span);
    const label = s.slice(span.labelStart, span.labelEnd);
    if (to) {
      ls[m.line] = s.slice(0, m.at) + to[0] + label + to[1] + s.slice(span.end);
      return { text: ls.join('') };
    }
    // These edits read `@{ … }` as ending at its first `}`, quoted or not; and Mermaid 12.2.0 draws a Markdown string
    // in `label:` as plain text, backticks and all.
    if (label.includes('}')) throw new Error('its label has a } in it, which a shape with no brackets cannot hold here.');
    if (/^"`/.test(label.trim())) throw new Error('its label is Markdown, which Mermaid does not draw in a shape with no brackets.');
    // An unquoted label is quoted as written, entity codes and markup kept; only a `"` (valid in `[/a"b/]`) is coded.
    const quoted = /^".*"$/s.test(label.trim()) ? label.trim() : `"${label.trim().replaceAll('"', '#quot;')}"`;
    const cls = CLASS_AT.exec(s.slice(span.end))?.[0] ?? '';
    ls[m.line] = s.slice(0, m.at) + cls + `@{ shape: ${at}, label: ${quoted} }` + s.slice(span.end + cls.length);
    return { text: ls.join('') };
  }
  const bare = mentions(text, id).find(({ line }) => !NOT_A_STATEMENT.test(ls[line]));
  if (!bare) throw new Error(`Node ${id} appears only in style or class lines; there is no place to give it a shape.`);
  const s = ls[bare.line];
  let after = bare.col + id.length;
  if (!to) after += CLASS_AT.exec(s.slice(after))?.[0].length ?? 0;
  ls[bare.line] = s.slice(0, after) + (to ? to[0] + id + to[1] : `@{ shape: ${at} }`) + s.slice(after);
  return { text: ls.join('') };
}

// Connectors, as Mermaid 12.2.0's lexer reads them. A link: optional head (`<`, `o`, `x`), then a solid, thick, dotted
// or invisible body, then an optional tail. A text-form opener (`--`, `==`, `-.` with a head) starts a label that runs
// to the next closer: `A -- yes --> B` is `A -->|yes| B`.
const LINK = /^[xo<]?(?:-{2,}[-xo>]|={2,}[=xo>]|-?\.+-[xo>]?|~{3,})/;
const OPENER = /^[xo<]?(?:--|==|-\.)/;
const CLOSERS = { '-': /\s*-{2,}[-xo>]/y, '=': /\s*={2,}[=xo>]/y, '.': /\s*\.+-[xo>]?/y };
const ID_AT = new RegExp(`^${ID}`, 'u');

/**
 * An edge, as edges() reads it.
 * @typedef {object} Edge
 * @property {number} index its number for `linkStyle`
 * @property {string} from
 * @property {string} to
 * @property {string | null} userId its edge id, if the file gives it one (`A e1@--> B`)
 * @property {Span} link its connector, from any edge id through any label
 * @property {string} arrow the connector without its label
 * @property {Label | null} label
 * @property {Span} fromRef the two node references as written
 * @property {Span} toRef
 * @property {Span} statement
 * @property {number} step which connector of the statement it is from
 * @property {string} svgId the `data-id` Mermaid gives its path
 */

/**
 * Every edge in the file, in Mermaid's order: statements in text order, a chain left to right, `A & B --> C & D` as
 * A→C, A→D, B→C, B→D. Positions are offsets into `text`.
 * - `index`: the edge's number for `linkStyle`.
 * - `svgId`: the `data-id` Mermaid gives its path. The first a→b edge is `L_a_b_0`; the k-th repeat (k ≥ 1) is
 *   `L_a_b_{k+1}`. An edge id (`A e1@--> B`, kept in `userId`) is used as is, unless an earlier edge has that id.
 * - `link`: the connector, from any edge id through any label; `arrow`: the connector without its label (`-->`,
 *   `-.->`, `<-->`, `~~~`, …); `label`: the label as written in the source (quotes kept) and where it is, or null.
 * - `fromRef`, `toRef`: the two node references as written (`A[Start]:::cls`); `statement`: the whole statement;
 *   `step`: which connector of the statement this edge is from (a chain has several; an `&` group shares one).
 * Statements are read one line at a time, so one that spans lines (a multi-line quoted label) is missed, and a node id
 * with `-` or `.` in it (valid in Mermaid, not here) ends its statement early: compare the result with what Mermaid
 * drew before relying on it. Not a flowchart: []. Each call returns new objects: compare edges by `index`, never by
 * identity.
 */
export function edges(/** @type {string} */ text) {
  if (!isFlowchart(text)) return [];
  /** @type {Omit<Edge, 'index'>[]} */
  const found = [];
  for (const s of statements(text)) {
    s.links.forEach((link, step) => {
      const starts = s.groups[step], ends = s.groups[step + 1];
      for (const a of starts) {
        for (const b of ends) {
          const named = a === starts.at(-1) && b === ends[0];
          found.push({
            from: a.id, to: b.id, userId: named ? link.userId : null,
            link: { start: link.start, end: link.end }, arrow: link.arrow, label: link.label,
            fromRef: { start: a.start, end: a.end }, toRef: { start: b.start, end: b.end },
            statement: { start: s.start, end: s.end }, step, svgId: '',
          });
        }
      }
    });
  }
  /** @type {Map<string, number>} */
  const pairs = new Map();
  /** @type {Set<string>} */
  const taken = new Set();
  for (const e of found) {
    const k = `${e.from}\0${e.to}`;
    const count = pairs.get(k) ?? 0;
    pairs.set(k, count + 1);
    e.svgId = e.userId && !taken.has(e.userId) ? e.userId : `L_${e.from}_${e.to}_${count ? count + 1 : 0}`;
    taken.add(e.svgId);
  }
  return found.map((e, index) => ({ index, ...e }));
}

/** The edge Mermaid drew with `data-id` `svgId`, or null. */
export function edgeBySvgId(/** @type {string} */ text, /** @type {string} */ svgId) {
  return edges(text).find((e) => e.svgId === svgId) ?? null;
}

/**
 * The diagram body's statements in text order, split at line ends and `;`.
 * @returns {Statement[]}
 */
function statements(/** @type {string} */ text) {
  const ls = lines(text);
  const header = headerIndex(ls);
  /** @type {Statement[]} */
  const out = [];
  let offset = 0;
  for (let n = 0; n < ls.length; offset += ls[n].length, n++) {
    if (n < header) continue;
    const line = ls[n];
    let m = mask(line);
    // The header line can carry statements too, after a `;`: `flowchart LR; A --> B`.
    if (n === header) {
      const semi = m.indexOf(';');
      if (semi < 0) continue;
      m = ' '.repeat(semi + 1) + m.slice(semi + 1);
    }
    /** @type {Statement[]} */
    const found = [];
    for (const part of m.matchAll(/[^;\n]+/g)) {
      // Trimmed on the line itself: in the mask, a shape at the end of the statement is blank.
      const st = part.index + part[0].search(/\S|$/);
      let end = part.index + part[0].length;
      while (end > st && /\s/.test(line[end - 1])) end--;
      if (st < end) found.push(readStatement(line, m, st, end, offset, n));
    }
    for (const s of found) out.push({ ...s, alone: found.length === 1 });
  }
  return out;
}

/** Read one statement, `m.slice(st, end)` of line `n`, which starts at `offset` in the text. */
function readStatement(/** @type {string} */ line, /** @type {string} */ m, /** @type {number} */ st, /** @type {number} */ end, /** @type {number} */ offset, /** @type {number} */ n) {
  /** @type {Statement} */
  const s = { start: offset + st, end: offset + end, line: n, keyword: null, groups: [], links: [], complete: false };
  const keyword = m.slice(st, end).match(NOT_A_STATEMENT);
  if (keyword) { s.keyword = keyword[1]; return s; }
  let i = st;
  const skip = () => { while (i < end && /\s/.test(m[i])) i++; };
  const group = () => {
    /** @type {Ref[]} */
    const refs = [];
    for (;;) {
      skip();
      const id = m.slice(i, end).match(ID_AT);
      if (!id) return refs;
      const from = i;
      i += id[0].length;
      if (line.startsWith('@{', i)) i = line.indexOf('}', i) + 1 || end;
      else if (SHAPES.some(([open]) => line.startsWith(open, i))) i = shapeSpan(line, i)?.end ?? end;
      const cls = m.slice(i, end).match(new RegExp(`^:::${ID}`, 'u'));
      if (cls) i += cls[0].length;
      refs.push({ id: id[0], start: offset + from, end: offset + i });
      skip();
      if (m[i] !== '&') return refs;
      i++;
    }
  };
  const first = group();
  if (!first.length) return s;
  s.groups.push(first);
  while (i < end) {
    const link = connector(line, m, i, end);
    if (!link) return s;
    i = link.end;
    const next = group();
    if (!next.length) return s;
    /**
     * A span moved from the line to the text.
     * @template {Span} T
     * @param {T | null} span
     * @returns {T | null}
     */
    const at = (span) => span && { ...span, start: offset + span.start, end: offset + span.end };
    s.links.push({ .../** @type {Link} */ (at(link)), label: at(link.label) });
    s.groups.push(next);
  }
  s.complete = true;
  return s;
}

// --- changing and deleting edges and nodes ---------------------------------------------------------------------

/**
 * The arrow types an edge can be given. Each takes the extra body length to keep (`---->` is `-->` plus 2).
 * @type {Record<string, (n: number) => string>}
 */
export const ARROWS = {
  '-->': (n) => '--' + '-'.repeat(n) + '>',
  '---': (n) => '---' + '-'.repeat(n),
  '-.->': (n) => '-.' + '.'.repeat(n) + '->',
  '-.-': (n) => '-.' + '.'.repeat(n) + '-',
  '==>': (n) => '==' + '='.repeat(n) + '>',
  '===': (n) => '===' + '='.repeat(n),
  '--o': (n) => '--' + '-'.repeat(n) + 'o',
  '--x': (n) => '--' + '-'.repeat(n) + 'x',
  '<-->': (n) => '<--' + '-'.repeat(n) + '>',
  '~~~': (n) => '~~~' + '~'.repeat(n),
};

/** The ARROWS key an arrow is, at any length (`---->` is `-->`), or null for one not offered there (`o--o`). */
export function arrowType(/** @type {string} */ arrow) {
  const n = extraLength(arrow);
  return Object.keys(ARROWS).find((k) => ARROWS[k](n) === arrow) ?? null;
}

/** How much longer than its shortest form an arrow is. A longer arrow asks Mermaid for a longer edge. */
function extraLength(/** @type {string} */ arrow) {
  const count = (/** @type {string} */ c) => arrow.split(c).length - 1;
  if (arrow.includes('.')) return count('.') - 1;
  if (arrow.includes('~')) return count('~') - 3;
  if (arrow.includes('=')) return count('=') - (/^=+$/.test(arrow) ? 3 : 2);
  return count('-') - (/^-+$/.test(arrow) ? 3 : 2);
}

/** The edge Mermaid drew as `svgId`, its statement, and its pair's key there (`"step i j"`). */
function locate(/** @type {string} */ text, /** @type {string} */ svgId) {
  const e = edges(text).find((x) => x.svgId === svgId);
  if (!e) throw new Error('That edge is not in the file.');
  // An edge is read from a statement, so its statement is there.
  const s = /** @type {Statement} */ (statements(text).find((x) => x.start === e.statement.start));
  const i = s.groups[e.step].findIndex((r) => r.start === e.fromRef.start);
  const j = s.groups[e.step + 1].findIndex((r) => r.start === e.toRef.start);
  return { e, s, key: `${e.step} ${i} ${j}` };
}

/**
 * Delete the edge Mermaid drew as `svgId`. Its statement is rewritten without it (a chain is split there; in an `&`
 * group, one statement per start node keeps every other edge in place), `linkStyle` numbers after it move down by
 * one, and its `id@{ … }` line goes if it had an edge id. Its two nodes stay, with their shapes and subgraphs.
 */
export function deleteEdge(/** @type {string} */ text, /** @type {string} */ svgId) {
  const { e, s, key } = locate(text, svgId);
  return { text: transform(text, { at: s.start, pairs: new Map([[key, { drop: true }]]), removed: [e] }) };
}

/**
 * Delete node `id`: from every statement (its edges with it, a chain split where it was, an `&` group without it),
 * its `style` and `click` lines, and its name in `class` lines. `linkStyle` numbers follow the edges that are left.
 * Its neighbours stay, with their shapes and subgraphs. Returns { text, edges }: how many edges went with it.
 */
export function deleteNode(/** @type {string} */ text, /** @type {string} */ id) {
  assertNode(text, id);
  const gone = edges(text).filter((e) => e.from === id || e.to === id);
  return { text: transform(text, { gone: id, removed: gone }), edges: gone.length };
}

/** Give an edge the label `label` (`-->|"label"|`), or none when it is blank. Its arrow stays. */
export function setEdgeLabel(/** @type {string} */ text, /** @type {string} */ svgId, /** @type {string} */ label) {
  const quoted = label.trim() ? quoteLabel(label) : null;
  return { text: reconnect(text, svgId, (e) => ({ arrow: e.arrow, label: quoted })) };
}

/** Give an edge another arrow type (a key of ARROWS), keeping its label and its length. */
export function setEdgeArrow(/** @type {string} */ text, /** @type {string} */ svgId, /** @type {string} */ arrow) {
  if (!ARROWS[arrow]) throw new Error(`Not an arrow type: ${arrow}`);
  return {
    text: reconnect(text, svgId, (e) => ({
      arrow: ARROWS[arrow](Math.max(0, extraLength(e.arrow))),
      label: e.label && pipeLabel(e.label),
    })),
  };
}

/**
 * A label as it goes between pipes. A pipe label is kept as written. A text-form label (`-- yes (maybe) -->`) is
 * quoted, since between pipes `(`, `[`, `{` and the like need quotes; only its `"` is escaped, leaving any entity code
 * (`#quot;`) in it as it was.
 */
function pipeLabel(/** @type {Label} */ label) {
  if (label.form !== 'text' || /^".*"$/.test(label.text)) return label.text;
  return `"${label.text.replace(/"/g, '#quot;')}"`;
}

/**
 * Give the edge `svgId` the connector `next(edge)` returns ({ arrow, label }). A connector that joins one node to one
 * node is replaced where it is; one shared with other edges (`A --> B & C`) gives this edge its own statement.
 */
function reconnect(/** @type {string} */ text, /** @type {string} */ svgId, /** @type {(e: Edge) => { arrow: string, label: string | null }} */ next) {
  const { e, s, key } = locate(text, svgId);
  const { arrow, label } = next(e);
  const body = arrow + (label ? `|${label}|` : '');
  const expect = (/** @type {Edge} */ x) => (x.index === e.index ? { ...x, arrow, label: label ? { text: label } : null } : x);
  if (s.groups[e.step].length === 1 && s.groups[e.step + 1].length === 1) {
    const id = s.links[e.step].userId;
    const out = text.slice(0, e.link.start) + (id ? id + '@' : '') + body + text.slice(e.link.end);
    check(text, out, expect);
    return out;
  }
  return transform(text, { at: s.start, pairs: new Map([[key, { body }]]), expect });
}

/** Turn an edge around: `A --> B` becomes `B --> A`, with the same connector. In a chain, it gets its own statement. */
export function reverseEdge(/** @type {string} */ text, /** @type {string} */ svgId) {
  const { e, s, key } = locate(text, svgId);
  const expect = (/** @type {Edge} */ x) => (x.index === e.index ? { ...x, from: x.to, to: x.from } : x);
  return { text: transform(text, { at: s.start, pairs: new Map([[key, { reverse: true }]]), expect }) };
}

/**
 * The text with the statement at `at` rewritten by `pairs` (per `"step i j"`: { drop }, { body } a new connector, or
 * { reverse }), or with node `gone` taken out of every statement. `removed`: the edges this deletes, whose `linkStyle`
 * numbers go and whose `e1@{ … }` lines go. `expect(edge)`: each old edge as it should read after, or null.
 * @param {string} text
 * @param {object} options
 * @param {number} [options.at]
 * @param {Map<string, PairChange>} [options.pairs]
 * @param {string | null} [options.gone]
 * @param {Edge[]} [options.removed]
 * @param {((e: Edge) => EdgeSig | null) | null} [options.expect]
 */
function transform(text, { at = -1, pairs = new Map(), gone = null, removed = [], expect = null }) {
  const all = statements(text);
  /** @type {Change[]} */
  const changes = [];
  const touched = all.filter((s) => s.start === at || (gone && !s.keyword && s.groups.flat().some((r) => r.id === gone)));
  for (const s of touched) {
    if (!s.complete) throw new Error(`Line ${s.line + 1} is not one this editor can change; edit it in the file.`);
  }

  // A node left out of a rewritten statement is kept as a bare statement if dropping it would lose it, or lose its
  // place: when no other statement in the same subgraph (at the top level: anywhere) still names it.
  // A subgraph named in an edge is defined by its block: dropping the edge never leaves its id behind.
  const sgs = subgraphs(text);
  const blocks = new Set(sgs.filter((sg) => sg.written).map((sg) => sg.id));
  const scopeOf = (/** @type {Statement} */ s) => subgraphsAt(text, s.line, sgs).at(-1)?.start ?? null;
  const named = (/** @type {Statement} */ s) => new Set(s.groups.flat().map((r) => r.id));
  const elsewhere = all.filter((s) => !s.keyword && !touched.includes(s)).map((s) => ({ scope: scopeOf(s), ids: named(s) }));
  for (const s of touched) {
    const scope = scopeOf(s);
    const stays = (/** @type {string} */ nodeId) => blocks.has(nodeId) || elsewhere.some((o) => o.ids.has(nodeId) && (scope === null || o.scope === scope));
    const parts = rewrite(text, s, { pairs: s.start === at ? pairs : new Map(), gone, stays });
    changes.push({ s, parts });
    elsewhere.push({ scope, ids: new Set(parts.flatMap((p) => p.ids ?? [])) });
  }

  const indexes = new Set(removed.map((e) => e.index));
  const userIds = new Set(removed.filter((e) => e.userId && e.svgId === e.userId).map((e) => e.userId));
  for (const s of all) {
    const body = text.slice(s.start, s.end);
    if (s.keyword === 'linkStyle') {
      const m = body.match(/^(linkStyle\s+)(\d+(?:\s*,\s*\d+)*)/);
      if (!m) continue;
      const nums = m[2].split(/\s*,\s*/).map(Number);
      const left = nums.filter((n) => !indexes.has(n)).map((n) => n - [...indexes].filter((r) => r < n).length);
      if (left.join() === nums.join()) continue;
      changes.push({ s, parts: left.length ? [{ text: m[1] + left.join(',') + body.slice(m[0].length) }] : [] });
    } else if (gone && (s.keyword === 'style' || s.keyword === 'click')) {
      if (body.match(new RegExp(`^${s.keyword}\\s+(${ID})`, 'u'))?.[1] === gone) changes.push({ s, parts: [] });
    } else if (gone && s.keyword === 'class') {
      const m = body.match(/^(class\s+)(\S+)/);
      if (!m) continue;
      const names = m[2].split(',');
      if (!names.includes(gone)) continue;
      const left = names.filter((x) => x !== gone);
      changes.push({ s, parts: left.length ? [{ text: m[1] + left.join(',') + body.slice(m[0].length) }] : [] });
    } else if (!s.keyword && !s.links.length && s.groups.length === 1 && s.groups[0].length === 1) {
      const [ref] = s.groups[0];
      if (userIds.has(ref.id) && text.startsWith(ref.id + '@{', ref.start)) changes.push({ s, parts: [] });
    }
  }

  const out = apply(text, changes);
  check(text, out, expect ?? ((e) => (indexes.has(e.index) ? null : e)), gone, new Set([...userIds, ...blocks]));
  return out;
}

/**
 * Throw unless `out`'s edges are `expect` applied to `text`'s, in order, and every node of `text` (but `gone`, and
 * the ids in `skip`: edge ids, whose `e1@{ … }` lines read as node statements, and subgraph ids) is still named. No
 * test reaches the throw: it catches a bug in the rewriting, not an input.
 */
function check(/** @type {string} */ text, /** @type {string} */ out, /** @type {(e: Edge) => EdgeSig | null} */ expect, /** @type {string | null} */ gone = null,
  skip = new Set()) {
  const sig = (/** @type {EdgeSig} */ e) => [e.from, e.to, e.arrow, e.label?.text ?? ''].join(' ');
  const want = edges(text).map(expect).filter((e) => e !== null).map(sig);
  const nodes = (/** @type {string} */ t) => new Set(statements(t).flatMap((s) => s.groups.flat().map((r) => r.id)));
  const after = nodes(out);
  const lost = [...nodes(text)].some((n) => n !== gone && !skip.has(n) && !after.has(n));
  if (edges(out).map(sig).join('\n') !== want.join('\n') || lost) {
    throw new Error('This edit could not be made safely; nothing was changed.');
  }
}

/**
 * Statement `s` rewritten by `pairs` and without node `gone`, as a list of statements ({ text, ids }) to write in its
 * place. Edges keep their order. A step whose pairs are all kept, unreversed and with one connector stays one
 * connector (and chains on); any other step is written one statement per start node, in order, split further where
 * its ends' connectors differ, with a reversed pair as a statement of its own. Consecutive starts are merged only when
 * each is a single plain statement with the same ends, since anything more would reorder their edges. A node written
 * more than once keeps its shape and label at its first appearance only.
 * @param {string} text
 * @param {Statement} s
 * @param {{ pairs: Map<string, PairChange>, gone: string | null, stays: (id: string) => boolean }} options
 * @returns {Part[]}
 */
function rewrite(text, s, { pairs, gone, stays }) {
  const G = s.groups, L = s.links;
  const alive = (/** @type {number} */ g, /** @type {number} */ i) => G[g][i].id !== gone;
  const indexes = (/** @type {number} */ g) => G[g].map((_, i) => i).filter((i) => alive(g, i));
  const bodyOf = (/** @type {number} */ step) => {
    const l = L[step], t = text.slice(l.start, l.end);
    return l.userId ? t.slice(l.userId.length + 1) : t;
  };
  const pair = (/** @type {number} */ step, /** @type {number} */ i, /** @type {number} */ j) => {
    /** @type {PairChange} */
    const c = pairs.get(`${step} ${i} ${j}`) ?? {};
    if (!alive(step, i) || !alive(step + 1, j) || c.drop) return null;
    return { body: c.body ?? bodyOf(step), reverse: Boolean(c.reverse) };
  };

  const blocks = L.map((_, step) => {
    const S = indexes(step), E = indexes(step + 1);
    const every = S.flatMap((i) => E.map((j) => pair(step, i, j)));
    const first = every[0];
    if (first && every.every((p) => p && !p.reverse && p.body === first.body)) {
      return { whole: true, rows: [{ starts: S, segs: [{ ends: E, body: first.body, reverse: false }] }] };
    }
    /** @typedef {{ ends: number[], body: string, reverse: boolean }} Seg a connector from one start to some ends */
    /** @type {{ starts: number[], segs: Seg[] }[]} */
    const rows = [];
    const plain = (/** @type {Seg[]} */ segs) => segs.length === 1 && !segs[0].reverse;
    for (const i of S) {
      /** @type {Seg[]} */
      const segs = [];
      for (const j of E) {
        const p = pair(step, i, j);
        if (!p) continue;
        const last = segs.at(-1);
        if (last && !last.reverse && !p.reverse && last.body === p.body) last.ends.push(j);
        else segs.push({ ends: [j], body: p.body, reverse: p.reverse });
      }
      if (!segs.length) continue;
      const prev = rows.at(-1);
      if (prev && plain(prev.segs) && plain(segs) && prev.segs[0].body === segs[0].body
        && prev.segs[0].ends.join() === segs[0].ends.join()) prev.starts.push(i);
      else rows.push({ starts: [i], segs });
    }
    return { whole: false, rows };
  });

  /** @type {Set<string>} */
  const covered = new Set();
  blocks.forEach((b, step) => b.rows.forEach((r) => {
    for (const i of r.starts) covered.add(`${step} ${i}`);
    for (const seg of r.segs) for (const j of seg.ends) covered.add(`${step + 1} ${j}`);
  }));
  const ref = (/** @type {number} */ g, /** @type {number} */ i) => text.slice(G[g][i].start, G[g][i].end);
  const loose = G.map((_, g) => indexes(g).filter((i) => !covered.has(`${g} ${i}`))
    .filter((i) => ref(g, i) !== G[g][i].id || !stays(G[g][i].id)));

  /** @type {Set<string>} */
  const written = new Set();
  /** @type {string[]} */
  const ids = [];
  const group = (/** @type {number} */ g, /** @type {number[]} */ list) => list.map((i) => {
    ids.push(G[g][i].id);
    if (written.has(`${g} ${i}`)) return G[g][i].id;
    written.add(`${g} ${i}`);
    return ref(g, i);
  }).join(' & ');
  // The edge id (`e1@`) names the last start × first end of its step; it stays on that pair only.
  const link = (/** @type {number} */ step, /** @type {number[]} */ starts, /** @type {{ ends: number[], body: string }} */ seg) => {
    const named = L[step].userId && starts.at(-1) === G[step].length - 1 && seg.ends[0] === 0;
    return (named ? L[step].userId + '@' : '') + seg.body;
  };

  /** @type {string[]} */
  const parts = [];
  /** @type {{ text: string } | null} */
  let chain = null;
  const flush = () => { if (chain) parts.push(chain.text); chain = null; };
  for (let g = 0; g < G.length; g++) {
    if (loose[g].length) { flush(); parts.push(group(g, loose[g])); }
    if (g === L.length) break;
    const b = blocks[g];
    if (b.whole) {
      const { starts, segs: [seg] } = b.rows[0];
      if (!chain) chain = { text: group(g, starts) };
      chain.text += ` ${link(g, starts, seg)} ${group(g + 1, seg.ends)}`;
    } else {
      flush();
      for (const { starts, segs } of b.rows) {
        for (const seg of segs) {
          parts.push(seg.reverse
            ? `${group(g + 1, seg.ends)} ${link(g, starts, seg)} ${group(g, starts)}`
            : `${group(g, starts)} ${link(g, starts, seg)} ${group(g + 1, seg.ends)}`);
        }
      }
    }
  }
  flush();
  return parts.map((t) => ({ text: t, ids }));
}

/**
 * Apply statement replacements ({ s, parts }), last first. A statement alone on its line has its parts on lines of
 * their own, at its indentation; one that shares its line is joined with `; `. No parts removes the statement, and
 * its line when nothing else is left on it.
 */
function apply(/** @type {string} */ text, /** @type {Change[]} */ changes) {
  const lineAt = (/** @type {string} */ t, /** @type {number} */ at) => {
    const start = t.lastIndexOf('\n', at - 1) + 1;
    const nl = t.indexOf('\n', at);
    return { start, end: nl < 0 ? t.length : nl + 1 };
  };
  const dropLine = (/** @type {string} */ t, /** @type {number} */ at) => {
    const { start, end } = lineAt(t, at);
    // The last line, with no newline of its own: take the one before it instead, so the file still ends as it did.
    if (end === t.length && !t.endsWith('\n') && start > 0) return t.slice(0, start - 1);
    return t.slice(0, start) + t.slice(end);
  };
  let out = text;
  for (const { s, parts } of [...changes].sort((a, b) => b.s.start - a.s.start)) {
    if (parts.length) {
      const indent = indentOf(out.slice(lineAt(out, s.start).start, s.start));
      out = out.slice(0, s.start) + parts.map((p) => p.text).join(s.alone ? '\n' + indent : '; ') + out.slice(s.end);
    } else if (s.alone) {
      out = dropLine(out, s.start);
    } else {
      let from = s.start, to = s.end;
      while (/[ \t]/.test(out[to] ?? '')) to++;
      if (out[to] === ';') { to++; while (/[ \t]/.test(out[to] ?? '')) to++; } else {
        while (from > 0 && /[ \t]/.test(out[from - 1])) from--;
        if (out[from - 1] === ';') from--;
      }
      out = out.slice(0, from) + out.slice(to);
      const { start, end } = lineAt(out, Math.min(from, out.length));
      if (!out.slice(start, end).trim()) out = dropLine(out, start);
    }
  }
  return out;
}

/**
 * The connector at `i`, or null.
 * @returns {Link | null}
 */
function connector(/** @type {string} */ line, /** @type {string} */ m, /** @type {number} */ i, /** @type {number} */ end) {
  const start = i;
  /** @type {string | null} */
  let userId = null;
  const named = m.slice(i, end).match(new RegExp(`^(${ID})@`, 'u'));
  if (named) { userId = named[1]; i += named[0].length; }
  const rest = m.slice(i, end);
  const plain = rest.match(LINK);
  if (plain) {
    i += plain[0].length;
    /** @type {Label | null} */
    let label = null;
    const pipe = line.slice(i).match(/^\s*\|/);
    if (pipe) {
      const from = i + pipe[0].length;
      const close = pipeEnd(line, from - 1);
      label = { text: line.slice(from, close - 1), start: from, end: close - 1 };
      i = close;
    }
    return { start, end: i, arrow: plain[0], label, userId };
  }
  const open = rest.match(OPENER);
  if (!open) return null;
  const closer = CLOSERS[/** @type {'-' | '=' | '.'} */ (open[0].at(-1))];
  for (let k = i + open[0].length; k < end; k++) {
    closer.lastIndex = k;
    const c = closer.exec(m);
    if (!c || c.index + c[0].length > end) continue;
    // The space before a closer must be real: a quoted label is blank in the mask too.
    if (line.slice(k, k + c[0].length - c[0].trimStart().length).trim()) continue;
    const textStart = i + open[0].length, raw = line.slice(textStart, k);
    const lead = raw.length - raw.trimStart().length;
    /** @type {Label} */
    const label = { text: raw.trim(), start: textStart + lead, end: textStart + lead + raw.trim().length, form: 'text' };
    const tail = c[0].trimStart();
    const arrow = open[0].slice(0, -2) + (tail[0] === '.' ? '-' : '') + tail;
    return { start, end: k + c[0].length, arrow, label, userId };
  }
  return null;
}

/** The subgraph id behind an SVG cluster element's id: `<render id>-<subgraph id>`. */
export function subgraphIdFromSvgId(/** @type {string} */ svgId, /** @type {string} */ renderId) {
  return svgId.startsWith(renderId + '-') ? svgId.slice(renderId.length + 1) : null;
}

/** The Mermaid node id behind an SVG node element's id: `<render id>-flowchart-<node id>-<n>`. */
export function nodeIdFromSvgId(/** @type {string} */ svgId, /** @type {string} */ renderId) {
  const prefix = `${renderId}-flowchart-`;
  if (!svgId.startsWith(prefix)) return null;
  const m = svgId.slice(prefix.length).match(/^(.+)-\d+$/);
  return m ? m[1] : null;
}
