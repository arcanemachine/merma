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
  const fails = [];
  for (const c of cases) {
    try {
      await mermaid.parse(c.out);
      if (c.kind === 'relabel') continue;
      const before = await db(c.src), after = await db(c.out);
      const was = membership(before), now = membership(after);
      for (const [node, sg] of Object.entries(was)) if (node !== c.gone && now[node] !== sg) fails.push(`${c.name}: ${node} moved ${sg} -> ${now[node]}`);
      if (c.kind !== 'delete') continue;
      const vertices = after.getVertices();
      for (const node of before.getVertices().keys()) if (node !== c.gone && !vertices.has(node)) fails.push(`${c.name}: ${node} lost`);
      const old = before.getEdges(), left = after.getEdges();
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
