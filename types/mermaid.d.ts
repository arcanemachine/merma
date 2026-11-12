// Mermaid as the page loads it, from the CDN (web/viewer.mjs): only what the page uses. The module name is the import's
// URL, version included, so a change to the pinned version changes it here too.

declare module 'https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs' {
  const mermaid: {
    initialize(config: object): void;
    render(id: string, text: string, svgContainingElement?: Element): Promise<{ svg: string }>;
    parse(text: string): Promise<unknown>;
    mermaidAPI: {
      // Mermaid's own defaults, a section per diagram type: viewer.mjs reads which types have a theme of their own.
      defaultConfig: Record<string, unknown>;
      // Not in Mermaid's documented API: viewer.mjs reads a flowchart's subgraphs and links from it.
      getDiagramFromText(text: string): Promise<{
        db: {
          getSubGraphs?(): { id: string, title: string, nodes: string[], metadata?: { view?: string } }[],
          getVertices?(): Map<string, { id: string, link?: string }>,
        },
      }>;
    };
  };
  export default mermaid;
}
