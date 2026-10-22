# Agent Instructions — merma

`README.md` says what merma is, how to run it, and where each part lives. Read it first.

If there is a local agent file (e.g. `AGENTS.LOCAL.md`) next to this file, read it too. It adds to the rules here,
and where the two differ, the local file wins.

## Words

`GLOSSARY.md` holds the words merma uses. Use them as written there, in the page, the docs, the code and messages
about the work; when a new word comes in, add it there in the same commit. Where Mermaid has a word for something
(node, edge, shape, subgraph, title), use Mermaid's word, never one of our own. Menu labels are in sentence case.

`docs/ux.md` holds the rules the page follows, and why. Read it before changing anything the user sees, and update it
in the same commit when a rule changes. `docs/guide.md` says what each control does, and Help in `web/index.html` is a
short subset of it (gestures and keys outside menus): a change to the page updates both in the same commit.

**No sprawl.** Each fact lives in one place: words in `GLOSSARY.md`, UX rules in `docs/ux.md`, what the page does in
`docs/guide.md`, what merma is and how to run it in `README.md`. Each doc says at its top what goes in it; link to it
rather than repeating it, and write down only what someone will read again.

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
  - for a new test, break the code on purpose once and watch the test fail: `checks/mutate.sh <file> <text>
    <replacement>` does it and always puts the file back;
  - logic with no DOM goes in a module Node can test (`web/patch/`, `web/history.mjs`, `web/menu-items.mjs`, `web/place.mjs`), rather than untested in the
    page.
- **Fixtures and examples are generic.** Test files, sample diagrams and examples in docs are written for merma:
  plain names (`A[Start] --> B{OK?}`, `charge --> record`) that show the syntax under test, never copied from, or
  specific to, any other codebase, project or organisation.
- **Check the page in a browser** after changing anything under `web/`; the unit tests do not cover it. Run the
  accessibility scan too: no violations outside the diagram (`checks/README.md`, "Accessibility"). After a change to
  `web/patch/`, run the browser parse check as well.
- Say why in a comment when a reader new to the code could not work it out; nothing more.
- Conventional commits (`feat:`, `fix:`, `docs:`…), one commit per feature.

## Checks

- `prek install` once per clone: the pre-commit hook runs end-of-file and whitespace fixes, JSON and merge-conflict
  checks, and ESLint on the staged files (`prek.toml`). It does not run the tests.
- `npm run lint`, `npm run typecheck` and `npm test` before calling work done; `npm publish` runs all three first
  (`prepublishOnly`). Types are JSDoc in the plain JavaScript, checked by `tsc` with no build step: the page
  (`web/tsconfig.json`) gets the DOM and no Node types, the server and command line (`tsconfig.json`) the reverse.
