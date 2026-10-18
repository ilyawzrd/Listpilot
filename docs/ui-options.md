# UI options (parked)

**Status:** parked, October 2026. For now listpilot stays a tool: Claude and the
`listpilot-apply` skill turn a `.md` file into `plan.json`, then you run `dry` and `apply` from
the terminal. This note records what was considered, so it doesn't have to be worked out again.

The idea: drag and drop a `.md` file, see a preview, check that every place is real, confirm,
and watch it edit Google Maps.

## Why not a hosted app (e.g. Vercel)

- **A server can't reach your browser.** The executor attaches to your own Chrome over CDP
  (`localhost:9222`). A hosted server can't connect to that, and a normal web page can't control
  a Google Maps tab, because browsers block cross-origin control.
- **The workaround is unsafe.** The only alternative is a browser on the server, signed into your
  Google account. That means storing a Google session on someone else's machine, which is a big
  security risk, and Google is quick to flag it as bot traffic.
- **There is no API for saved lists.** Google offers no official way to write to Saved lists.
  Clicking the UI in your own signed-in browser is the only way to write.
- **Parsing needs an LLM.** Turning a free-form report into places and notes is judgment work.
  Inside Claude Code, Claude does it. A standalone app would need its own Claude API key and
  would pay per file.

## "Check places are real first" already exists

That's the dry run. `dryRunList` in `src/run.ts` calls `openPlace` in `src/maps.ts` for
every place, and accepts it only if the search lands on a single `/maps/place/` page with a
matching name. Nothing is written. On a real 70-place report it resolved 62 and flagged 8.
Any UI would only need to display this.

## Options if this is revisited

| Option | What you get | Effort |
|---|---|---|
| **Local web UI** (`npm run ui` → localhost) | Drag and drop, a found/unresolved preview from the dry run, a Confirm button and live progress, all in your own Chrome | Medium |
| **Chrome extension** | Shareable, no terminal, edits the Maps tab directly | Large: rewrite the executor as content scripts instead of Playwright, plus an LLM API for parsing |

### Sketch of the local web UI (the recommended next step)

- A small Node server in this repo that reuses the executor as it is:
  - upload `.md` → parse → `plan.json`
  - `dry` → stream the result for each place
  - `apply` → stream progress, then the final `report.json`
- One page: a drop zone, then a preview table (place, Maps title, note, found or unresolved),
  then a manual URL fix for unresolved rows, then Confirm.
- Parsing: either call the Claude API (needs a key), or keep Claude Code producing `plan.json`
  and have the UI start at "load plan.json".
- `runList` in `src/run.ts` needs to emit progress events instead of only printing with
  `console.log`.
- The rules in `CLAUDE.md` still apply: never delete, only append notes, never guess unresolved
  places, always dry run before apply.
- Start the server from your own terminal. Claude Code's shell can't read
  `DevToolsActivePort` and fails with `EPERM`.
