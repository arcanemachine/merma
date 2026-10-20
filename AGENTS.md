# Agent Instructions — merma

`README.md` says what merma is, how to run it, and where each part lives. Read it first.

If there is a local agent file (e.g. `AGENTS.LOCAL.md`) next to this file, read it too. It adds to the rules here,
and where the two differ, the local file wins.

## Contributing

- **No runtime dependencies.** The server uses Node's standard library; the page uses the browser and Mermaid from
  the CDN, at the version pinned in `web/viewer.mjs`. Dev tools (ESLint) are fine.
- **Each module has one job** (`README.md` → Layout). The viewer knows nothing about files or editing, the source
  knows nothing about rendering, and the text edits know nothing about the DOM. `web/main.mjs` is the only place they
  meet.
- **The `.mmd` file is the only source of truth.** An edit changes only the bytes it must, and nothing the page adds
  (positions, state) is ever written into the file or beside it.
- **Tests ship with the code, in the same commit.** `npm test` runs `test/*.test.mjs` with Node's own runner.
- **No bullshit tests.** A test exists to fail when the behaviour it names breaks:
  - it checks what its name and comments say, no less (an assertion that cannot fail is worse than none);
  - it exercises real code, not a mock standing in for the thing under test, and not constants or the language;
  - for a new test, break the code on purpose once and watch the test fail, then put the code back;
  - logic with no DOM goes in a module Node can test (`web/patch/`, `web/history.mjs`), rather than untested in the
    page.
- **Check the page in a browser** after changing anything under `web/`; the unit tests do not cover it. After a
  change to `web/patch/`, run the browser parse check too (`checks/README.md`).
- Say why in a comment when a reader new to the code could not work it out; nothing more.
- Conventional commits (`feat:`, `fix:`, `docs:`…), one commit per feature.

## Checks

- `prek install` once per clone: the pre-commit hook runs end-of-file and whitespace fixes, JSON and merge-conflict
  checks, and ESLint on the staged files (`prek.toml`). It does not run the tests.
- `npm run lint` and `npm test` before calling work done; `npm publish` runs both first (`prepublishOnly`).
