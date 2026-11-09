---
name: merma
description: Show a Mermaid diagram file (.mmd) to the user live in the browser with merma, where they can read it and edit it by pointing and clicking while you edit the same file as text. Use when you write or change a Mermaid diagram the user should see, or when the user wants to work on a diagram with you.
allowed-tools: Bash(merma:*)
---

# merma

<!-- merma skill stamp -->

merma shows a `.mmd` file in the browser and redraws it within a second whenever the file changes, whoever
saved it. The user can also edit the diagram in the page, by pointing, clicking and pressing keys. Each edit
in the page is written into the file as a small text change. The file stays plain Mermaid, and it is the only
source of truth: the page keeps nothing of its own in it or beside it.

`merma` below is the command merma installs (`npm install -g` or `npm link` from a clone). Without it,
use `node <clone>/bin/merma.js` in its place, in that same form for every command.

## Is this skill current?

The line under this file's title names the merma this skill came from and a hash of its text: in
`(skill 1a2b3c4d)`, the hash is `1a2b3c4d`. Compare it with the hash in the same line printed by the merma
you are using:

- if you start merma yourself, the one `merma skill | head` prints;
- if you use a merma that is already running, the one its own script prints. Its `/health` names the
  script (`ok pid=<pid> script=<path>`), so run `node <path> skill | head`.

The same hash is the same skill: say nothing. When they differ, tell the user once, in passing, that this
saved skill differs from the merma in use, and offer to update it. Update it only when the user asks: save
what `merma skill` prints over this file, with this file's Custom rules section in place of the new one.

## Show a diagram

1. Write the diagram to a `.mmd` file. merma serves `.mmd` files and nothing else.
2. Use a merma that is already running, if one serves the file. A merma started with `merma serve
   [port] [host]` (default port 63762) serves every `.mmd` file under the folders in its `MERMA_ROOTS`.
   `curl -s http://localhost:<port>/health` answers `ok pid=…` when one is there, and `curl -s -o /dev/null
   -w '%{http_code}' 'http://localhost:<port>/source?f=<path>'` answers 200 when it serves the file, and 403
   when the file is outside its folders. The page is `http://localhost:<port>/?f=<path>`. In both, `<path>`
   is the file's absolute path, percent-encoded (as `encodeURIComponent` does; its slashes may stay), so
   that a space, `&`, `#`, `+` or `%` in it survives.
3. If none serves the file, start one for it, in the background, with its output in a log you can read:
   `MERMA_IDLE=1800 merma <file.mmd> [port] > <log> 2>&1 &`. It serves only that file, and prints the
   page's address (`http://localhost:<port>/?f=…`, encoded) in the log once it is listening: wait for that
   line (a short loop with a timeout), then read it, since its port is a free one unless you give one. If
   merma exits before it, the last line starting `merma:` says why (no such file, a port held by something
   else, a setting it refuses). Given a port, it first checks that port, and if a merma there
   already serves the file it prints that merma's address and starts nothing. `MERMA_IDLE=1800` stops it on its
   own half an hour after the last request, if it is left behind; merma runs until stopped otherwise. To
   serve a folder instead, start `merma serve` the same way, with `MERMA_ROOTS` set to it.
4. Give the user the page's address.

Add `&part=<subgraph id>` (encoded the same way) to open the page fitted to one subgraph, the rest still drawn
around it: for a link into a big diagram. The subgraph needs an id in the file (`subgraph pay [Payment]`).

`?f=` takes the file's absolute path as the server sees it. When merma runs in a container,
`MERMA_PATH_MAP=<server prefix>=<host prefix>` makes the page show the host's path, but `?f=` still takes
the server's.

## Work on it together

- The page redraws whenever the file changes, so the user sees each save of yours at once.
- Before each edit of your own, read the file again: the user may have changed it in the page.
- Each time you write the file, keep a copy of what you wrote, in a temporary folder of your own. When the
  user says they are done, diff the file against that copy to see what they changed, then update the copy,
  so that the next diff shows only what is new. The user tells you in the chat; the page has no way to tell you.
- An edit in the page is saved only over the version the page last read. If you saved meanwhile, the page
  refuses the edit and shows your version, so neither side overwrites the other.

## Write diagrams merma can edit

merma is a tool for working with Mermaid diagrams, so a diagram for it is plain Mermaid. Use Mermaid's own
syntax and features as far as they go, and add no markers, comments or metadata for merma.

- The page edits flowcharts (`flowchart` or `graph`); it shows other diagram types without editing them.
- Give nodes plain ids of letters, digits and `_` (`charge[Charge card]`), and give each subgraph one
  (`subgraph pay [Payment]`). A subgraph written with only a quoted title (`subgraph "Order log"`) has no
  id: Mermaid names it by its place among the subgraphs, a name that changes as subgraphs come and go, so
  an edge or a `@{ view }` line in the file cannot rely on it.
- To link a node to another diagram, add Mermaid's `click charge href "payment.mmd"` on a line of its
  own, the path read from this file's folder (`payment.mmd?part=pay` opens it fitted to its "pay"
  subgraph). The user follows it with L, in the same page, and comes back with the browser's Back. The
  other file must be one the server serves (`MERMA_ROOTS`). A web or `vscode://` address works too, and
  opens outside the page.
- To have a subgraph start collapsed, drawn as one box, add Mermaid's `pay@{ view: collapsed }` on a line
  of its own after the subgraph's `end`. The user can expand it in the page without changing the file.
- Mermaid refuses a diagram with more than 500 edges or 50,000 characters of code, leaving out comments
  and frontmatter. For bigger generated diagrams, start merma with `MERMA_MAX_EDGES` and
  `MERMA_MAX_TEXT` set higher. A diagram cannot raise them itself, and big ones are slow to draw. A merma
  that is already running keeps the limits it was started with: when its page says the diagram is over
  one, start one of your own with them set (step 3, with no port).

## Settings

All from the environment, read when merma starts:

- `MERMA_ROOTS`: for `serve`, the folders whose `.mmd` files may be served, comma-separated (default
  `/tmp/mermaid-diagrams/`).
- `MERMA_IDLE`: seconds with no requests before merma exits (unset or 0: it runs until stopped).
- `MERMA_PATH_MAP`: `server=host` path prefixes, comma-separated, to show the host's path in the page.
- `MERMA_MAX_EDGES`, `MERMA_MAX_TEXT`: Mermaid's size limits, above.
- `MERMA_HOSTS`: host names the page may be opened under besides localhost, comma-separated. The page's
  address works from the machine merma runs on. For a browser on another machine, `merma serve` must be
  bound to an address it can reach, and do that only when the user asks: there is no login, so anyone who
  can reach the machine can then read and edit the served diagrams. Bound to one address (`merma serve
  <port> 192.168.1.20`), merma answers to it. Bound to every address (`0.0.0.0`), it answers only to
  localhost and the names in `MERMA_HOSTS`, so the name the user opens the page by goes there; any other
  is refused (403).
- `BROWSER`: for `merma <file>`, a command to open the page with.

## Clean up

Stop every merma you started once the user has finished with the diagram, by the pid its `/health`
reports (`kill <pid>`), never by a pattern, which can match other people's processes. Stopping it ends the
page, so while the user may still want to look, leave it running and tell them it stops on its own
(`MERMA_IDLE`). Leave a merma you did not start running.

## Custom rules

No custom rules have been added yet.
