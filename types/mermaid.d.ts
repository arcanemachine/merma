// Mermaid as the page loads it, from the CDN (web/viewer.mjs): only what the page uses. The module name is the import's
// URL, version included, so a change to the pinned version changes it here too.

declare module 'https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs' {
  const mermaid: {
    initialize(config: object): void;
    render(id: string, text: string): Promise<{ svg: string }>;
    parse(text: string): Promise<unknown>;
  };
  export default mermaid;
}
