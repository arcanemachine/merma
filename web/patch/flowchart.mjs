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
            statement: { start: s.start, end: s.end }, step,
          });
        }
      }
    });
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

/**
 * The diagram body's statements in text order, split at line ends and `;`: { start, end, line, alone, keyword,
 * groups, links, complete }. `alone`: the only statement on its line. `keyword`: `style`, `class`, `linkStyle`… for a
 * statement that is not about nodes, else null. A node statement is node groups (refs { id, start, end }, joined by
 * `&`) joined by `links` (connectors); `complete` says all of it was read.
 */
function statements(text) {
  const ls = lines(text);
  const header = headerIndex(ls);
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
function readStatement(line, m, st, end, offset, n) {
  const s = { start: offset + st, end: offset + end, line: n, keyword: null, groups: [], links: [], complete: false };
  const keyword = m.slice(st, end).match(NOT_A_STATEMENT);
  if (keyword) { s.keyword = keyword[1]; return s; }
  let i = st;
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
  const first = group();
  if (!first.length) return s;
  s.groups.push(first);
  while (i < end) {
    const link = connector(line, m, i, end);
    if (!link) return s;
    i = link.end;
    const next = group();
    if (!next.length) return s;
    const at = (span) => span && { ...span, start: offset + span.start, end: offset + span.end };
    s.links.push({ ...at(link), label: at(link.label) });
    s.groups.push(next);
  }
  s.complete = true;
  return s;
}

// --- deleting -------------------------------------------------------------------------------------------------

/**
 * Delete the edge Mermaid drew as `svgId`. Its statement is rewritten without it (a chain is split there; in an `&`
 * group, one statement per start node keeps every other edge in place), `linkStyle` numbers after it move down by
 * one, and its `id@{ … }` line goes if it had an edge id. Its two nodes stay, with their shapes and subgraphs.
 */
export function deleteEdge(text, svgId) {
  const all = edges(text);
  const e = all.find((x) => x.svgId === svgId);
  if (!e) throw new Error('That edge is not in the file.');
  const s = statements(text).find((x) => x.start === e.statement.start);
  const i = s.groups[e.step].findIndex((r) => r.start === e.fromRef.start);
  const j = s.groups[e.step + 1].findIndex((r) => r.start === e.toRef.start);
  return { text: remove(text, [e], { drop: new Set([`${e.step} ${i} ${j}`]), at: s.start }) };
}

/**
 * Delete node `id`: from every statement (its edges with it, a chain split where it was, an `&` group without it),
 * its `style` and `click` lines, and its name in `class` lines. `linkStyle` numbers follow the edges that are left.
 * Its neighbours stay, with their shapes and subgraphs. Returns { text, edges }: how many edges went with it.
 */
export function deleteNode(text, id) {
  assertNode(text, id);
  const gone = edges(text).filter((e) => e.from === id || e.to === id);
  return { text: remove(text, gone, { gone: id }), edges: gone.length };
}

/**
 * The text without edges `removed`: either the pairs `drop` (`"step i j"`) of the statement starting at `at`, or
 * every edge of node `gone`. Checks the result: the other edges in the same order, and every other node still there.
 */
function remove(text, removed, { drop = new Set(), at = -1, gone = null }) {
  const all = statements(text);
  const changes = [];
  const touched = all.filter((s) => s.start === at || (gone && !s.keyword && s.groups.flat().some((r) => r.id === gone)));
  for (const s of touched) {
    if (!s.complete) throw new Error(`Line ${s.line + 1} is not one this editor can change; edit it in the file.`);
  }

  // A node left out of a rewritten statement is kept as a bare statement if dropping it would lose it, or lose its
  // place: when no other statement in the same subgraph (at the top level: anywhere) still names it.
  const scopeOf = (s) => subgraphsAt(text, s.line).at(-1)?.start ?? null;
  const named = (s) => new Set(s.groups.flat().map((r) => r.id));
  const elsewhere = all.filter((s) => !s.keyword && !touched.includes(s)).map((s) => ({ scope: scopeOf(s), ids: named(s) }));
  for (const s of touched) {
    const scope = scopeOf(s);
    const stays = (nodeId) => elsewhere.some((o) => o.ids.has(nodeId) && (scope === null || o.scope === scope));
    const parts = rewrite(text, s, { drop: s.start === at ? drop : new Set(), gone, stays });
    changes.push({ s, parts });
    elsewhere.push({ scope, ids: new Set(parts.flatMap((p) => p.ids)) });
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
      const names = m ? m[2].split(',') : [];
      if (!names.includes(gone)) continue;
      const left = names.filter((x) => x !== gone);
      changes.push({ s, parts: left.length ? [{ text: m[1] + left.join(',') + body.slice(m[0].length) }] : [] });
    } else if (!s.keyword && !s.links.length && s.groups.length === 1 && s.groups[0].length === 1) {
      const [ref] = s.groups[0];
      if (userIds.has(ref.id) && text.startsWith(ref.id + '@{', ref.start)) changes.push({ s, parts: [] });
    }
  }

  const out = apply(text, changes);
  const sig = (e) => [e.from, e.to, e.arrow, e.label?.text ?? ''].join(' ');
  const want = edges(text).filter((e) => !indexes.has(e.index)).map(sig);
  const nodes = (t) => new Set(statements(t).flatMap((s) => s.groups.flat().map((r) => r.id)));
  const after = nodes(out);
  // No test reaches this: it catches a bug in rewrite(), not an input. An edge's `e1@{ … }` line reads as a node
  // statement; it goes with its edge.
  const lost = [...nodes(text)].some((n) => n !== gone && !userIds.has(n) && !after.has(n));
  if (edges(out).map(sig).join('\n') !== want.join('\n') || lost) {
    throw new Error('This edit could not be made safely; nothing was changed.');
  }
  return out;
}

/**
 * Statement `s` rewritten without the pairs in `drop` and without node `gone`, as a list of statements ({ text, ids })
 * to write in its place. Edges keep their order: a step whose surviving pairs are still a whole product stays one
 * connector (and chains on); any other step is written one statement per start node, in order, with that start's
 * surviving ends. A node written more than once keeps its shape and label at its first appearance only.
 */
function rewrite(text, s, { drop, gone, stays }) {
  const G = s.groups, L = s.links;
  const alive = (g, i) => G[g][i].id !== gone;
  const kept = (step, i, j) => alive(step, i) && alive(step + 1, j) && !drop.has(`${step} ${i} ${j}`);
  const indexes = (g) => G[g].map((_, i) => i).filter((i) => alive(g, i));

  const blocks = L.map((_, step) => {
    const S = indexes(step), E = indexes(step + 1);
    if (S.length && E.length && S.every((i) => E.every((j) => kept(step, i, j)))) {
      return { whole: true, rows: [{ starts: S, ends: E }] };
    }
    const rows = [];
    for (const i of S) {
      const ends = E.filter((j) => kept(step, i, j));
      if (!ends.length) continue;
      const last = rows.at(-1);
      if (last && last.ends.join() === ends.join()) last.starts.push(i);
      else rows.push({ starts: [i], ends });
    }
    return { whole: false, rows };
  });

  const covered = new Set();
  blocks.forEach((b, step) => b.rows.forEach((r) => {
    for (const i of r.starts) covered.add(`${step} ${i}`);
    for (const j of r.ends) covered.add(`${step + 1} ${j}`);
  }));
  const ref = (g, i) => text.slice(G[g][i].start, G[g][i].end);
  const loose = G.map((_, g) => indexes(g).filter((i) => !covered.has(`${g} ${i}`))
    .filter((i) => ref(g, i) !== G[g][i].id || !stays(G[g][i].id)));

  const written = new Set();
  const ids = [];
  const group = (g, list) => list.map((i) => {
    ids.push(G[g][i].id);
    if (written.has(`${g} ${i}`)) return G[g][i].id;
    written.add(`${g} ${i}`);
    return ref(g, i);
  }).join(' & ');
  // The edge id (`e1@`) names the last start × first end of its step; it stays only where that pair still is.
  const link = (step, row) => {
    const l = L[step], t = text.slice(l.start, l.end);
    const named = row.starts.at(-1) === G[step].length - 1 && row.ends[0] === 0;
    return l.userId && !named ? t.slice(l.userId.length + 1) : t;
  };

  const parts = [];
  let chain = null;
  const flush = () => { if (chain) parts.push(chain.text); chain = null; };
  for (let g = 0; g < G.length; g++) {
    if (loose[g].length) { flush(); parts.push(group(g, loose[g])); }
    if (g === L.length) break;
    const b = blocks[g];
    if (b.whole) {
      const [row] = b.rows;
      if (!chain) chain = { text: group(g, row.starts) };
      chain.text += ` ${link(g, row)} ${group(g + 1, row.ends)}`;
    } else {
      flush();
      for (const row of b.rows) parts.push(`${group(g, row.starts)} ${link(g, row)} ${group(g + 1, row.ends)}`);
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
function apply(text, changes) {
  const lineAt = (t, at) => {
    const start = t.lastIndexOf('\n', at - 1) + 1;
    const nl = t.indexOf('\n', at);
    return { start, end: nl < 0 ? t.length : nl + 1 };
  };
  const dropLine = (t, at) => {
    const { start, end } = lineAt(t, at);
    // The last line, with no newline of its own: take the one before it instead, so the file still ends as it did.
    if (end === t.length && !t.endsWith('\n') && start > 0) return t.slice(0, start - 1);
    return t.slice(0, start) + t.slice(end);
  };
  let out = text;
  for (const { s, parts } of [...changes].sort((a, b) => b.s.start - a.s.start)) {
    if (parts.length) {
      const indent = out.slice(lineAt(out, s.start).start, s.start).match(/^[ \t]*/)[0];
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
