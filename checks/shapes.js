// Every shape in web/shapes.mjs drawn by Mermaid, and every picker icon drawn by the browser (checks/README.md):
// Mermaid 12.2.0 parses a shape name it lacks but fails to draw it, and an icon can be cut off by its frame. Returns
// the failures; [] passes.
async () => {
  const mermaid = (await import('https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs')).default;
  const { NODE_SHAPES } = await import('/shapes.mjs');
  const { ARROW_TYPES } = await import('/arrow-types.mjs');
  const fails = [];
  let k = 0;
  for (const { key } of NODE_SHAPES) {
    try {
      const { svg } = await mermaid.render('shapes-check-' + k++, `flowchart TD\n  A@{ shape: ${key}, label: "x" }\n`);
      if (!new DOMParser().parseFromString(svg, 'text/html').querySelector('g.node')) fails.push(`${key}: no node drawn`);
    } catch (e) { fails.push(`${key}: ${String(e.message || e).split('\n')[0]}`); }
  }
  const box = document.createElement('div');
  document.body.append(box);
  for (const { name, icon } of [...ARROW_TYPES, ...NODE_SHAPES]) {
    box.innerHTML = icon();
    const svg = box.querySelector('svg');
    const b = svg.getBBox(), w = svg.viewBox.baseVal.width, h = svg.viewBox.baseVal.height;
    if (!(b.width > 0 || b.height > 0)) fails.push(`${name}: the icon draws nothing`);
    else if (b.x < 0 || b.y < 0 || b.x + b.width > w || b.y + b.height > h) fails.push(`${name}: the icon runs outside its frame`);
  }
  box.remove();
  return fails;
}
