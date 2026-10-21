// An axe-core scan of what the page shows now (checks/README.md, "Accessibility"). With no selector it scans the page
// without the diagram; with '#stage' it scans only the diagram, which is Mermaid's markup, not merma's.
// Returns [rule, impact, count, first targets] for each violation.
async (only) => {
  if (!window.axe) {
    await new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/axe-core@4.14.0/axe.min.js';
      s.onload = ok;
      s.onerror = fail;
      document.head.append(s);
    });
  }
  const context = only ?? { exclude: [['#stage']] };
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  const result = await window.axe.run(context, { runOnly: tags });
  return JSON.stringify(result.violations.map((v) => [v.id, v.impact, v.nodes.length, v.nodes.slice(0, 3).map((n) => n.target.join(' '))]));
}
