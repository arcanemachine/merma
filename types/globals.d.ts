// What the page's types need that JSDoc cannot declare. Type-checking only: this folder does not ship.

declare global {
  interface Window {
    // Hooks for checks and tests (web/main.mjs).
    merma: object;
  }

  // User-Agent Client Hints, not yet in TypeScript's DOM types; Chromium has them.
  interface Navigator {
    userAgentData?: { platform: string };
  }
}

export {};
