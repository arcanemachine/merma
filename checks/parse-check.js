async () => {
  const mermaid = (await import('https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs')).default;
  const dir = new URLSearchParams(location.search).get('f').replace(/[^/]+$/, '');
  const cases = await (await fetch('/source?f=' + encodeURIComponent(dir + '_cases.json.mmd'))).json();
  const membership = async (text) => {
    const d = await mermaid.mermaidAPI.getDiagramFromText(text);
    const out = {};
    for (const sg of d.db.getSubGraphs?.() || []) for (const n of sg.nodes) out[n] = sg.id;
    return out;
  };
  const fails = [];
  for (const c of cases) {
    try {
      await mermaid.parse(c.out);
      if (c.kind !== 'relabel') {
        const before = await membership(c.src), after = await membership(c.out);
        for (const [node, sg] of Object.entries(before)) if (after[node] !== sg) fails.push(`${c.name}: ${node} moved ${sg} -> ${after[node]}`);
      }
    } catch (e) { fails.push(`${c.name}: ${String(e.message || e).split('\n')[0]}`); }
  }
  return { cases: cases.length, fails };
}
