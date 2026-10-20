async () => {
  const mermaid = (await import('https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs')).default;
  const dir = new URLSearchParams(location.search).get('f').replace(/[^/]+$/, '');
  const cases = await (await fetch('/source?f=' + encodeURIComponent(dir + '_cases.json.mmd'))).json();
  const db = async (text) => (await mermaid.mermaidAPI.getDiagramFromText(text)).db;
  const membership = (d) => {
    const out = {};
    for (const sg of d.getSubGraphs?.() || []) for (const n of sg.nodes) out[n] = sg.id;
    return out;
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
      const was = membership(before), now = membership(after);
      for (const [node, sg] of Object.entries(was)) if (node !== c.gone && now[node] !== sg) fails.push(`${c.name}: ${node} moved ${sg} -> ${now[node]}`);
      if (c.kind !== 'delete' && c.kind !== 'change') continue;
      const vertices = after.getVertices();
      for (const node of before.getVertices().keys()) if (node !== c.gone && !vertices.has(node)) fails.push(`${c.name}: ${node} lost`);
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
}
