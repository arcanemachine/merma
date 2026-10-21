// Mermaid's own node, edge and subgraph ids for every flowchart fixture (checks/README.md): { nodes, edges, subgraphs,
// fails }.
async () => {
  const mermaid = (await import('https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs')).default;
  const dir = new URLSearchParams(location.search).get('f').replace(/[^/]+$/, '');
  const fixtures = await (await fetch('/source?f=' + encodeURIComponent(dir + '_fixtures.json.mmd'))).json();
  const nodes = {}, edges = {}, subgraphs = {}, fails = [];
  let k = 0;
  for (const [name, text] of Object.entries(fixtures)) {
    const db = (await mermaid.mermaidAPI.getDiagramFromText(text)).db;
    subgraphs[name] = db.getSubGraphs().map((sg) => sg.id).sort();
    nodes[name] = [...db.getVertices().keys()].filter((id) => !subgraphs[name].includes(id)).sort();
    const { svg } = await mermaid.render('fixture-ids-' + k++, text);
    const drawn = [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('path[data-edge="true"]')]
      .map((p) => p.dataset.id);
    edges[name] = db.getEdges().map((e) => e.id);
    if (drawn.join() !== edges[name].join()) fails.push(`${name}: drawn in another order: ${drawn.join(' ')}`);
  }
  return { nodes, edges, subgraphs, fails };
}
