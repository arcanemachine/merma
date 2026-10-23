// Every case from gen-cases.mjs through Mermaid in the page (checks/README.md). It runs longer than pw-repl's 15 s
// limit on one eval, so it starts in the background and leaves its result in window.__check: { cases, fails }.
() => {
  window.__check = null;
  (async () => {
    const mermaid = (await import('https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs')).default;
    const dir = new URLSearchParams(location.search).get('f').replace(/[^/]+$/, '');
    const cases = await (await fetch('/source?f=' + encodeURIComponent(dir + '_cases.json.mmd'))).json();
    const db = async (text) => (await mermaid.mermaidAPI.getDiagramFromText(text)).db;
    /*
     * Which subgraph each node and subgraph is in. An id-less subgraph's `subGraph<k>` is renumbered when subgraphs
     * are added, so it goes by its title; `rename` maps a subgraph given an id to that id.
     */
    const membership = (d, rename = {}) => {
      const sgs = d.getSubGraphs?.() || [];
      const titles = new Map(sgs.map((sg) => [sg.id, sg.title]));
      const name = (id) => rename[id] ?? (/^subGraph\d+$/.test(id) && titles.has(id) ? `"${titles.get(id)}"` : id);
      const out = {};
      for (const sg of sgs) for (const n of sg.nodes) out[name(n)] = name(sg.id);
      return { out, name };
    };
    /* A subgraph's title as drawn. */
    const drawnTitle = async (text, id) => {
      const { svg } = await mermaid.render('parse-check-' + k++, text);
      const doc = new DOMParser().parseFromString(svg, 'text/html');
      return doc.querySelector(`g.cluster[id$="-${id}"] .cluster-label`)?.textContent.trim() ?? null;
    };
    /* The label text each edge is drawn with, in edge order. */
    let k = 0;
    const drawnLabels = async (text) => {
      const { svg } = await mermaid.render('parse-check-' + k++, text);
      const doc = new DOMParser().parseFromString(svg, 'text/html');
      return [...doc.querySelectorAll('path[data-edge="true"]')].map((p) => doc.querySelector(`g.edgeLabel [data-id="${p.dataset.id}"]`)?.textContent.trim() ?? '');
    };
    const fails = [];
    for (const c of cases) {
      try {
        await mermaid.parse(c.out);
        if (c.kind === 'relabel') continue;
        const before = await db(c.src), after = await db(c.out);
        const { out: was, name } = membership(before, c.renamed ? { [c.renamed.from]: c.renamed.to } : {});
        const { out: now } = membership(after);
        for (const [node, sg] of Object.entries(was)) if (node !== c.gone && now[node] !== sg) fails.push(`${c.name}: ${node} moved ${sg} -> ${now[node]}`);
        if (c.into && now[c.into.id] !== name(c.into.subgraph)) fails.push(`${c.name}: ${c.into.id} is in ${now[c.into.id]}, expected ${name(c.into.subgraph)}`);
        if (c.title) {
          const got = await drawnTitle(c.out, c.title.id);
          const expected = await drawnTitle(`flowchart LR\n  subgraph x [${c.title.text}]\n    a\n  end\n`, 'x');
          if (got !== expected) fails.push(`${c.name}: title drawn as ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
        }
        if (c.kind === 'diagram-title') {
          const { svg } = await mermaid.render('parse-check-' + k++, c.out);
          const got = new DOMParser().parseFromString(svg, 'text/html').querySelector('.flowchartTitleText')?.textContent ?? null;
          if (got !== c.diagramTitle) fails.push(`${c.name}: title drawn as ${JSON.stringify(got)}`);
          continue;
        }
        if (c.kind === 'shape') {
          /* The node has the shape asked for, its label and its classes; every other node is as it was. */
          const want = await Promise.all(c.shape.refs.map(async (r) => (await db(r)).getVertices().get('X')?.type));
          const now = after.getVertices();
          for (const [id, v] of before.getVertices()) {
            const w = now.get(id);
            const types = id === c.shape.id ? want : [v.type];
            if (!types.includes(w?.type) || w?.text !== v.text || String(w?.classes) !== String(v.classes)) {
              fails.push(`${c.name}: ${id} is ${w?.type} ${JSON.stringify(w?.text)} ${w?.classes}, expected ${types} ${JSON.stringify(v.text)} ${v.classes}`);
            }
          }
          continue;
        }
        if (c.kind !== 'delete' && c.kind !== 'change') continue;
        /* A subgraph named in an edge is a vertex too, until the edge goes: it is the subgraph, not a node. */
        const vertices = after.getVertices(), blocks = new Set(before.getSubGraphs().map((sg) => sg.id));
        for (const node of before.getVertices().keys()) if (node !== c.gone && !blocks.has(node) && !vertices.has(node)) fails.push(`${c.name}: ${node} lost`);
        const old = before.getEdges(), left = after.getEdges();
        if (c.kind === 'change') {
          /* Every edge in its place with its linkStyle style; the changed one turned around if asked, the others as they were. */
          if (left.length !== old.length) fails.push(`${c.name}: ${left.length} edges, expected ${old.length}`);
          old.forEach((a, n) => {
            const b = left[n];
            const [from, to] = n === c.at && c.swap ? [a.end, a.start] : [a.start, a.end];
            const w = c.want ?? {};
            const same = n === c.at
              ? (!w.type || (b?.type === w.type && b?.stroke === w.stroke))
              : a.type === b?.type && a.stroke === b?.stroke && a.text === b?.text;
            if (!b || b.start !== from || b.end !== to || !same || JSON.stringify(a.style) !== JSON.stringify(b.style)) {
              fails.push(`${c.name}: edge ${n} is ${b?.start}->${b?.end}, expected ${from}->${to} as before`);
            }
          });
          /* The changed edge's label as drawn: the one asked for (drawn alone for reference), none, or the one it had. */
          const w = c.want ?? {};
          if (w.label !== undefined || w.sameLabel) {
            const now = (await drawnLabels(c.out))[c.at];
            const expected = w.label === null ? '' : w.label !== undefined
              ? (await drawnLabels(`flowchart LR\n  A -->|${w.label}| B\n`))[0]
              : (await drawnLabels(c.src))[c.at];
            if (now !== expected) fails.push(`${c.name}: label drawn as ${JSON.stringify(now)}, expected ${JSON.stringify(expected)}`);
          }
          continue;
        }
        if (left.length !== c.keep.length) fails.push(`${c.name}: ${left.length} edges, expected ${c.keep.length}`);
        c.keep.forEach((k, n) => {
          const a = old[k], b = left[n];
          if (!b || a.start !== b.start || a.end !== b.end || JSON.stringify(a.style) !== JSON.stringify(b.style)) {
            fails.push(`${c.name}: edge ${n} is ${b?.start}->${b?.end} ${JSON.stringify(b?.style)}, expected ${a.start}->${a.end} ${JSON.stringify(a.style)}`);
          }
        });
      } catch (e) { fails.push(`${c.name}: ${String(e.message || e).split('\n')[0]}`); }
    }
    return { cases: cases.length, fails };
  })().then((r) => { window.__check = r; }, (e) => { window.__check = { error: String(e.message || e) }; });
  return 'started';
}
