# Agent Instructions — merma

`README.md` says what merma is, how to run it, and where each part lives. Read it first.

If there is a local agent file (e.g. `AGENTS.LOCAL.md`) next to this file, read it too. It adds to the rules here,
and where the two differ, the local file wins.

## Contributing

- **No dependencies.** The server uses Node's standard library; the page uses the browser and Mermaid from the CDN,
  at the pinned version in `web/viewer.mjs`.
- **Each module has one job** (`README.md` → Layout). The viewer knows nothing about files and the source knows
  nothing about rendering; `web/main.mjs` is the only place they meet.
- **Tests ship with the code, in the same commit.** `npm test` runs `test/*.test.mjs` with Node's own runner.
- **Check the page in a browser** after changing anything under `web/`; the unit tests do not cover it.
- Say why in a comment when a reader new to the code could not work it out; nothing more.
- Conventional commits (`feat:`, `fix:`, `docs:`…), one commit per feature.
