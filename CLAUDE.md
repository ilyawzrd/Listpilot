# listpilot

Deterministic executor for Google Maps saved lists. It takes a `plan.json` (lists → places with
notes) and applies it through Playwright attached to Chrome over CDP. It creates the list, saves
places and writes notes, then hard-reloads and diffs the result against the plan.

Division of labour: the model does the judgment work (parse a source, ask for list names, resolve
each place to a `/maps/place/` URL, flag ambiguous ones). This executor only clicks, and it does so
the same way every time. Three project skills form the chain, split by how much judgment each
needs: `listpilot-research` (optional: deep research by default, web + Reddit snippets →
`research/<slug>.json` → review page → a places file; session model, Opus or Sonnet via `start.sh`),
`listpilot-apply` (`model: sonnet`: document → resolved `plan.json`), and `listpilot-run`
(`model: haiku`: runs `dry`/`apply` and reports). All three run at `effort: medium`. Each hands off to the next in the same turn. A skill's `model:` lasts
for the rest of that turn only, so a new user prompt goes back to the session model.

## Layout

- `src/plan.ts`: zod schema for `plan.json` (`version: 1`, `lists[].{name, emoji?, ordered, places[].{name, url?|query?, note?}}`)
- `src/selectors.ts`: **every** Maps UI hook. Roles, aria-labels and names only, never CSS classes. Per-language name tables (`TEXT.en`, `TEXT.es`), picked by `setLocale`
- `src/maps.ts`: page operations: openPlace, isInList, saveToList, createListWithPlace, openList, readList, writeNote, setListIcon, hardReload
- `src/run.ts`: orchestration. `apply` opens each place once, resolving and saving it in the same visit, then does icon + notes in one list-view pass, then hard reload and verify. `--dry-run` resolves everything and reads each place's Save-dialog checkbox (exact for chain branches). Writes `artifacts/report.json`, exit code 2 on verify failure
- `src/probe.ts`: read-only calibration that dumps ARIA snapshots (incl. the New-list form peek, `aria-2b-new-list-form.yaml`) and `rows.json` to `artifacts/`
- `src/resolve.ts`: `npm run resolve`. Chrome-free place lookup (see "Resolving places without Chrome"); prints candidates, writes `artifacts/resolve.json`
- `src/review.ts`: `npm run review -- research/<slug>.json`. `ResearchSchema` (zod; sample `examples/research.example.json`) + a review page served on 127.0.0.1 with a random token: checkbox + editable note per place, details on click, filtered-out places collapsed and unticked. Continue writes `<slug>.places.md` and the choices back into the JSON. Exit 0 submitted · 1 invalid · 2 cancelled · 3 still waiting (`--wait`, re-run with `--resume`: same port/token, page reconnects) · 4 no heartbeat (`--idle`). `--check` validates only
- `src/clean.ts`: `npm run clean [-- --dry-run]`. Removes `artifacts/*`, every untracked `plan*.json` (incl. `plan.retry.json`, dated backups, custom names), everything in `research/` except `*.places.md`, `reports/`, `research_notes/`. In `.gmaps-state.json` it drops only entries that can't match again (name > 40 chars, or `zz-*` test lists). Keeps git-tracked files and real list entries. `listpilot-run` calls it after a fully verified apply only
- `start.sh`: `npm start`. Preflight (claude, node ≥18, node_modules, Chrome), then mode: **research** (lists the 5 questions with examples; what incl. preferences / where / list name ≤40, `"` stripped / depth / model; soft check moves a place typed into What to Where) → `claude --model <opus|sonnet> --effort medium "/listpilot-research …"`, or **.md file** (path resolved against the caller's cwd, optional list name) → `claude --model sonnet --effort medium "/listpilot-apply …"`. User input travels as one argv element
- `src/connect.ts`: `--cdp auto` (reads `DevToolsActivePort`), `http://…` discovery, or `ws://…`
- `.claude/skills/listpilot-research/SKILL.md`: optional first step. "Bakeries in Lisbon" → the `deep-research` skill (or one quick pass with `--quick`) → filtered research (no tourist traps or viral places) → `research/<slug>-<date>.json` → review page (`npm run review`) → `.places.md` → apply
- `.claude/skills/listpilot-apply/SKILL.md`: Sonnet. A `.md` file of places → resolved `plan.json` + `artifacts/plan-summary.md` → run. Sample input: `examples/places.example.md`
- `.claude/skills/listpilot-run/SKILL.md`: Haiku. Shows the summary, asks Apply (recommended, new or existing list) / Dry run, checks Chrome, runs, reports from `report.json`, cleans up after a verified apply. `--report` only reads the last report
- `README.md` is for non-technical users (setup, `./start.sh`, troubleshooting). Commands, flags and internals go in `docs/advanced.md`

## Commands

```bash
npm start                                                                # start.sh: research or .md → review → Maps
npm run resolve -- queries.txt | --query '<name city>'                  # no Chrome: candidates + /maps/place/ URLs
npm run review -- research/<slug>.json [--resume] [--no-open] | --check  # review page → research/<slug>.places.md
npm run clean [-- --dry-run]                                             # keep only research/*.places.md + state
npm run probe -- '<maps place url>' '<existing list name>' --cdp auto   # read-only
npm run dry   -- plan.json --cdp auto                                    # resolves + reads, writes nothing
npm run apply -- plan.json --cdp auto                                    # writes, then verifies
npm run chrome                                                           # dedicated Chrome profile on 9222
npm run typecheck
npm test                                                                 # pure logic: parseRows, title matching, plan schema, review page + server, clean
```

## Connecting to Chrome

- **Main Chrome** with the `chrome://inspect/#remote-debugging` toggle on (port 9222). In this mode
  `/json/version` returns **404**, which is expected. Connect with `--cdp auto`, which reads the
  WebSocket path from `~/Library/Application Support/Google/Chrome/DevToolsActivePort`.
  - On macOS, reading that file needs **Full Disk Access** for the terminal. Without it the read
    fails with `EPERM` (TCC).
  - Chrome shows an **Allow** dialog on every new CDP connection, so the first action of each run
    waits for the user to click it.
- **Dedicated profile**: `npm run chrome` starts one on 9222 with normal HTTP discovery. Drop `--cdp auto`.
- **Account guard** (optional): `--account you@gmail.com` or `GMAPS_ACCOUNT` makes `dry`/`apply` stop
  before anything else if the signed-in account (`button "Google Account: <Name> (<email>)"`) doesn't match.
  The error never prints the account it found.
- **zsh: always single-quote Maps URLs.** Inside double quotes, `!4m6!3m5…` triggers history expansion.
- Node + npm, not pnpm. Maps UI language: `--lang auto` (default) opens Maps without `hl` and reads
  `<html lang>` (follows the account). `es*` → `TEXT.es` with that exact tag as `hl`; anything else → `TEXT.en`
  with `hl=en`. `TEXT.es` was probed and passed an apply under `hl=es`
  (Oct 2026). Still unseen: closed-place text, "Guardado (N)", sign-in link. The emoji picker stays English.

## How the Maps UI behaves (from probe snapshots, Oct 2026)

- Place page: the place's own `main "<name>"` holds `h1` and `region "Actions for <name>" > button`
  `"Save" | "Saved" | "Saved (N)"` (N = number of lists it's in). A place URL copied from a list also
  opens that list in a **second** `main` with its own `h1`, so `placeTitle` is scoped to the place's main.
  A closed place shows "Permanently closed" there; `openPlace` treats it as unresolved.
- Save dialog: `menu "Save in your lists" > menuitemradio "<List> Private · 7 places" [checked]`,
  plus `button "New list"`. All lists render at once. List names always carry a subtitle (`Private|Shared|Public`).
  **A just-created list is missing from this menu for a while** (seen missing at +10 s), so
  `saveToList` reloads and retries for up to ~1 min.
- New list form: `dialog "New list" > textbox "List name"` (prefilled "Untitled list") + `button "Create"`.
  The dialog comes first in the DOM, so always scope to it (a page-wide `.last()` hit the place's Save button).
- Navigation: `search > button "Menu"` → `menu "Settings" > menuitem "Saved"` → `main "Your places"`
  → `button "<List> Private · N places"`. Right after a page load Maps ignores the Menu click, so
  `openSavedPanel` waits and clicks again until the menu opens.
- List view: `main` (unnamed) with `heading [level=1] "<List>"`, then **flat rows**:
  `button "<title> 4.7 stars …"` (first `text:` child = title), followed by `button "Add note"` or
  `textbox "Note"` (holds the note). A closed place's row has no children: `button "<title> Permanently closed"`.
  Rows are parsed from the panel's **ARIA snapshot** (`parseRows`), and note controls are reached
  through role locators. The DOM has hidden "Note" buttons that aren't clickable. A `button "Delete"`
  appears on hover. **Never click it.**
- The list **lazy-loads** as you scroll, slowly after a hard reload. `readRows` only stops after
  several scrolls in a row bring nothing new. Loaded rows stay rendered, so `writeNote` only scrolls
  the whole list when its row isn't loaded yet.
- Notes: click "Add note", then re-read **without scrolling** (scrolling blurs the empty box and it
  closes), fill, then `locator.blur()`. Saving on blur is verified. **Not Tab:** it focuses the next row,
  which selects it, and a selected row's card covers its own "Add note" button (clicks get intercepted).
- Icon: a list without an icon has header `button "Choose icon"`. One with an icon has `button "Edit icon"`
  → `menu > menuitemradio "Choose icon" | "Clear icon"` (**never Clear**). Either way you get
  `dialog "Emoji characters palette"` with every emoji as `option "<emoji>"`, all rendered at once.
- **Display order is most-recently-modified first:** saving a place *or editing its note* moves its
  row to the top (verified Oct 2026). It only matters with `ordered: true` (off by default); `apply`
  then saves the plan backwards and writes notes backwards too, so rank 1 ends up on top.
- `.gmaps-state.json` (gitignored) records every list the executor created or opened. A recorded list
  is never created again, even if the Save menu doesn't show it yet.

## Gotchas

- Reading `DevToolsActivePort` needs Full Disk Access for whatever started `claude`. Started from a
  terminal that has it, `claude '/listpilot-apply <file.md> "<List>"'` runs the whole flow itself.
  The VS Code extension gets `EPERM`, so there the user runs `dry`/`apply` in their terminal and
  Claude reads `artifacts/` afterwards.
- Every failure leaves `artifacts/<ts>-fail-<step>.png` **and** `.yaml` (ARIA snapshot). Read the
  yaml first, because it has exact accessible names. Snapshots contain the account name/email, so
  don't paste them anywhere.
- One tab doing ~70 Maps place loads gets its renderer killed ("Page crashed"), and reloads don't
  free the memory. `run.ts` opens a fresh tab every 25 places, before the list-view pass, and
  right after a crash (the crashed place gets one more try).
- Never write named helper functions inside `page.evaluate`: tsx wraps them in `__name()`, which
  doesn't exist in the page. (The executor no longer uses `evaluate` for rows.)
- Resolving places without Chrome: Google's `/maps/search/?api=1&query=…` page links a
  `/search?tbm=map…` data URL that a plain `fetch` can read. It gives candidate names, addresses and
  feature ids (`0x…:0x…`), which go into `https://www.google.com/maps/place/<name>/data=!4m2!3m1!1s<id>`.

## Rules

- Never delete places or lists, and never change sharing. The executor has no code path for either; keep it that way.
- Notes are appended (` · `), never overwritten.
- Ambiguous `query` places become **unresolved**. Never guess a match.
- **Chains: add every location**, unless the document points to a specific one. Each branch is its
  own plan entry with its own address, and all branches get the same note. The executor handles
  same-name rows: it doesn't skip by name (each place's Save-dialog checkbox decides), pairs the
  k-th entry with the k-th same-name row for notes and verify, and drops entries that resolve to
  the same place id. "Same name" means exact title first (`titleGroup`), falling back to `sameTitle`
  prefix matching, so "Septime" and "Septime La Cave" never share a group.
- `dry` is optional. Apply is the recommended choice for new and existing lists: it checks each
  place's Save-dialog checkbox, skips closed/unresolved places, and never saves twice. Dry run
  shows what's new first. Writes can't be undone.
- List names are capped at 40 characters (`MAX_LIST_NAME` in `plan.ts`): Maps cuts longer ones,
  and the executor then can't find the list it created.
  Use throwaway lists for testing writes.
- Keep all selectors in `selectors.ts`. When Maps changes, re-probe and diff the snapshots rather than guessing.
- Don't print or commit the contents of `DevToolsActivePort`. It grants control of the signed-in browser.
