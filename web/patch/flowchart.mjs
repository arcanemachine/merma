// Small text edits to a Mermaid flowchart, for the live page's edit menu. Each function takes the file's text and
// returns new text that differs only where the edit must: comments, directives, frontmatter, spacing and every other
// line stay byte-for-byte as they were. Plain functions with no DOM, so Node can test them.
//
// The rule every edit keeps: no edit puts an edge before an existing one. `linkStyle N` styles the Nth edge in the
// file, so an edge inserted earlier would silently restyle every edge after it. New edges are appended at the end.

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
function pipeEnd(line, at) {
  const q = line[at + 1] === '"' ? line.indexOf('"', at + 2) : at;
  const end = line.indexOf('|', q < 0 ? at + 1 : q + 1);
  return end < 0 ? line.length : end + 1;
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
 * entity codes, so the node shows exactly what was typed. A line break becomes `<br>`, the one tag left as markup:
 * it is how Mermaid breaks a label's line.
 */
export function quoteLabel(label) {
  const codes = { '#': '#35;', '"': '#quot;', '<': '#lt;', '>': '#gt;', '&': '#amp;' };
  return '"' + label.split(/\r?\n/).map((part) => part.replace(/[#"<>&]/g, (c) => codes[c])).join('<br>') + '"';
}

/** The first of `n1`, `n2`, … that appears nowhere in the text, labels and comments included. */
export function freeId(text) {
  for (let k = 1; ; k++) {
    const id = 'n' + k;
    if (!new RegExp(String.raw`(?<![\p{L}\p{N}_])${id}(?![\p{L}\p{N}_])`, 'u').test(text)) return id;
  }
}

/** Insert a line after line `n`, with the indentation of line `n` (or `indent`). */
function insertAfter(text, n, body, indent = null) {
  const ls = lines(text);
  const ref = ls[n];
  indent ??= ref.match(/^[ \t]*/)[0];
  const newline = ref.endsWith('\n') ? '' : '\n';
  ls.splice(n + 1, 0, newline + indent + body + (newline ? '' : '\n'));
  return ls.join('');
}

/** Append a line after the last line with content, indented like the header's first statement. */
function appendLine(text, body) {
  return insertAfter(text, lastContentLine(text), body, statementIndent(text));
}

/** The indentation of the first statement after the header, used for lines appended at the top level. */
function statementIndent(text) {
  const ls = lines(text);
  for (let k = headerIndex(ls) + 1; k < ls.length; k++) if (ls[k].trim()) return ls[k].match(/^[ \t]*/)[0];
  return '  ';
}

/** Index of the last line with any content. */
function lastContentLine(text) {
  const ls = lines(text);
  for (let n = ls.length - 1; n >= 0; n--) if (ls[n].trim()) return n;
  return -1;
}

/**
 * The subgraphs open at line `n`, innermost last: [{ id, start, end }] with the lines of `subgraph` and its `end`.
 * A subgraph is named by its first word (`subgraph pay [Payment]` is `pay`); a quoted title has no usable id.
 */
function subgraphsAt(text, n) {
  const ls = lines(text);
  const open = [];
  let found = null;
  for (let k = headerIndex(ls) + 1; k < ls.length; k++) {
    const m = mask(ls[k]);
    const start = m.match(/^\s*subgraph\s+([\p{L}\p{N}_]+)?/u);
    if (start) open.push({ id: start[1] ?? null, start: k, end: null });
    else if (/^\s*end\s*;?\s*$/.test(m) && open.length) {
      const closed = open.pop();
      closed.end = k;
    }
    if (k === n) found = [...open];
  }
  return found ?? [];
}

/** The `subgraph` block whose id is `id`: { start, end } lines, or null. */
function subgraphBlock(text, id) {
  const ls = lines(text);
  for (let k = headerIndex(ls) + 1; k < ls.length; k++) {
    const m = mask(ls[k]).match(/^\s*subgraph\s+([\p{L}\p{N}_]+)/u);
    if (m && m[1] === id) {
      const inner = subgraphsAt(text, k).at(-1);
      return inner && inner.id === id ? inner : null;
    }
  }
  return null;
}

/**
 * Add a new node connected from `fromId`. No edit ever puts an edge in the middle of the file: `linkStyle` colours
 * edges by their position, so an edge inserted earlier would recolour every edge after it. So the edge is appended
 * at the end, outside any subgraph (an edge there moves nobody). When `fromId`'s last statement is inside a subgraph,
 * the new node is declared after that line, so it joins the same subgraph. Returns { text, id }.
 */
export function addConnected(text, fromId, label = 'New node') {
  assertNode(text, fromId);
  const id = freeId(text);
  const node = `${id}[${quoteLabel(label)}]`;
  // Placed by the node's last statement, not its last mention: `class`, `style` and `click` lines usually sit at the
  // bottom of the file, outside every subgraph.
  const ls = lines(text);
  const all = mentions(text, fromId);
  const last = (all.filter(({ line }) => !NOT_A_STATEMENT.test(ls[line])).at(-1) ?? all.at(-1)).line;
  if (!subgraphsAt(text, last).length) return { text: appendLine(text, `${fromId} --> ${node}`), id };
  const declared = insertAfter(text, last, node);
  return { text: appendLine(declared, `${fromId} --> ${id}`), id };
}

/**
 * Add a new node with no edges: inside subgraph `subgraph` (before its `end`) when given, else at the end of the
 * file. Returns { text, id }.
 */
export function addNode(text, { subgraph = null, label = 'New node' } = {}) {
  const id = freeId(text);
  const node = `${id}[${quoteLabel(label)}]`;
  if (!subgraph) return { text: appendLine(text, node), id };
  const block = subgraphBlock(text, subgraph);
  if (!block) throw new Error(`Subgraph ${subgraph} is not in the file.`);
  const ls = lines(text);
  // Indented like the subgraph's own lines: the line above `end`, or one step deeper than `end` for an empty one.
  const above = block.end - 1 > block.start ? ls[block.end - 1] : null;
  const indent = above ? above.match(/^[ \t]*/)[0] : ls[block.end].match(/^[ \t]*/)[0] + '  ';
  ls.splice(block.end, 0, indent + node + '\n');
  return { text: ls.join(''), id };
}

/**
 * Connect two existing nodes: `a --> b`, appended after the last line of the file. That is at the top level, outside
 * any subgraph, so neither node changes subgraph.
 */
export function connect(text, a, b) {
  assertNode(text, a);
  assertNode(text, b);
  return { text: appendLine(text, `${a} --> ${b}`) };
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

// Connectors, as Mermaid 12.2.0's lexer reads them. A link: optional head (`<`, `o`, `x`), then a solid, thick, dotted
// or invisible body, then an optional tail. A text-form opener (`--`, `==`, `-.` with a head) starts a label that runs
// to the next closer: `A -- yes --> B` is `A -->|yes| B`.
const LINK = /^[xo<]?(?:-{2,}[-xo>]|={2,}[=xo>]|-?\.+-[xo>]?|~{3,})/;
const OPENER = /^[xo<]?(?:--|==|-\.)/;
const CLOSERS = { '-': /\s*-{2,}[-xo>]/y, '=': /\s*={2,}[=xo>]/y, '.': /\s*\.+-[xo>]?/y };
const ID_AT = new RegExp(`^${ID}`, 'u');

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
 * drew before relying on it. Not a flowchart: [].
 */
export function edges(text) {
  if (!isFlowchart(text)) return [];
  const ls = lines(text);
  const header = headerIndex(ls);
  const found = [];
  let offset = 0;
  for (let n = 0; n < ls.length; offset += ls[n].length, n++) {
    if (n <= header) continue;
    const line = ls[n], m = mask(line);
    for (const part of m.matchAll(/[^;\n]+/g)) {
      // Trimmed on the line itself: in the mask, a shape at the end of the statement is blank.
      const st = part.index + part[0].search(/\S|$/);
      let end = part.index + part[0].length;
      while (end > st && /\s/.test(line[end - 1])) end--;
      if (st < end) statementEdges(line, m, st, end, offset, found);
    }
  }
  const pairs = new Map(), taken = new Set();
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
export function edgeBySvgId(text, svgId) {
  return edges(text).find((e) => e.svgId === svgId) ?? null;
}

/** Read one statement (`m.slice(st, end)`): node groups joined by connectors. Pushes its edges onto `out`. */
function statementEdges(line, m, st, end, offset, out) {
  let i = st, step = 0;
  const skip = () => { while (i < end && /\s/.test(m[i])) i++; };
  const group = () => {
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
  let starts = group();
  while (starts.length && i < end) {
    const link = connector(line, m, i, end);
    if (!link) return;
    i = link.end;
    const ends = group();
    if (!ends.length) return;
    for (const a of starts) {
      for (const b of ends) {
        const named = a === starts.at(-1) && b === ends[0];
        out.push({
          from: a.id, to: b.id, userId: named ? link.userId : null,
          link: { start: offset + link.start, end: offset + link.end }, arrow: link.arrow,
          label: link.label && { ...link.label, start: offset + link.label.start, end: offset + link.label.end },
          fromRef: { start: a.start, end: a.end }, toRef: { start: b.start, end: b.end },
          statement: { start: offset + st, end: offset + end }, step,
        });
      }
    }
    starts = ends;
    step++;
  }
}

/** The connector at `i`: { start, end, arrow, label, userId }, or null. */
function connector(line, m, i, end) {
  const start = i;
  let userId = null;
  const named = m.slice(i, end).match(new RegExp(`^(${ID})@`, 'u'));
  if (named) { userId = named[1]; i += named[0].length; }
  const rest = m.slice(i, end);
  const plain = rest.match(LINK);
  if (plain) {
    i += plain[0].length;
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
  const closer = CLOSERS[open[0].at(-1)];
  for (let k = i + open[0].length; k < end; k++) {
    closer.lastIndex = k;
    const c = closer.exec(m);
    if (!c || c.index + c[0].length > end) continue;
    const textStart = i + open[0].length, raw = line.slice(textStart, k);
    const lead = raw.length - raw.trimStart().length;
    const label = { text: raw.trim(), start: textStart + lead, end: textStart + lead + raw.trim().length };
    const tail = c[0].trimStart();
    const arrow = open[0].slice(0, -2) + (tail[0] === '.' ? '-' : '') + tail;
    return { start, end: k + c[0].length, arrow, label, userId };
  }
  return null;
}

/** The subgraph id behind an SVG cluster element's id: `<render id>-<subgraph id>`. */
export function subgraphIdFromSvgId(svgId, renderId) {
  return svgId.startsWith(renderId + '-') ? svgId.slice(renderId.length + 1) : null;
}

/** The Mermaid node id behind an SVG node element's id: `<render id>-flowchart-<node id>-<n>`. */
export function nodeIdFromSvgId(svgId, renderId) {
  const prefix = `${renderId}-flowchart-`;
  if (!svgId.startsWith(prefix)) return null;
  const m = svgId.slice(prefix.length).match(/^(.+)-\d+$/);
  return m ? m[1] : null;
}
