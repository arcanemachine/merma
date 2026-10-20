// A point on an edge's line that nothing else covers, as "X Y" in page coordinates, for clicking the edge in a
// browser check or UAT: `pw-repl send eval --file=checks/edge-point.js 'path[data-page-only][data-page-edge="<id>"]'`.
// "none" when every point is covered (by a node, usually).
(path) => {
  const length = path.getTotalLength(), m = path.getScreenCTM();
  for (let f = 0.1; f < 0.9; f += 0.05) {
    const p = path.getPointAtLength(length * f);
    const x = p.x * m.a + p.y * m.c + m.e, y = p.x * m.b + p.y * m.d + m.f;
    if (document.elementFromPoint(x, y) === path) return `${Math.round(x)} ${Math.round(y)}`;
  }
  return 'none';
}
