---
name: listpilot-apply
description: Use when the user wants places from a .md file (a research report, a chat answer, a list of recommendations) added to a Google Maps saved list, or an existing list updated, with notes. Builds plan.json and applies it with this repo's deterministic executor.
argument-hint: <file.md> ["List name"] [--yes]
---

# Markdown → Google Maps list

You do the judgment work. The executor (`npm run dry` / `npm run apply`) only clicks.

## Input

`$ARGUMENTS`, e.g. `~/Downloads/la.md "LA Eats" --yes`:

- **First token:** path to a `.md` file with places (headings, bullets or free text). See
  `examples/places.example.md`. If it's missing, ask for it.
- **Optional list name** (quoted or the remaining words): overrides the file's title.
- **Optional `--yes`:** after a dry run, go on to apply without asking again.

The whole flow runs in this session, including the Chrome steps. That needs a session started
from a terminal with Full Disk Access (see step 6).

## Flow

1. **Parse the file** into places. Text attached to a place (the rest of its bullet or
   paragraph) becomes its `note`, trimmed to one or two short sentences. Order doesn't matter:
   leave `ordered` out (it defaults to false) unless the user asks for a ranked list.
   **Note style** (Maps shows notes in a narrow mobile sheet):
   - Plain text only: no `**bold**`, headings or links. Maps shows markdown as literal characters.
   - Don't repeat the place name, city or address. The row already shows them.
   - Concrete, usable info only: what to order, when to go, book ahead, closing day. No filler
     like "great atmosphere" or "authentic".
   - One or two sentences by default, never more than about six.
   - No source markers or rank numbers unless the user asked for a ranked list.
2. **List name.** Use the name from the arguments if given. Otherwise use the file's
   top-level title, or ask the user if there is none. Ask for an emoji only if the user
   mentioned one. **At most 40 characters:** Maps cuts longer names, and the executor then
   can't find the list it just created. A longer title gets shortened to its core
   ("Where to Eat & Drink in Los Angeles (October 2026)" → "LA Eat & Drink (Oct 2026)");
   say what you picked. A longer name from the arguments: ask for a shorter one.
3. **Resolve every place to a `/maps/place/` URL** and put it in `url`. Use `query` only when
   the search will land on one unambiguous place. Anything ambiguous goes in a list for the
   user. Never guess a match. Resolve without Chrome: write one query per line
   (`<name> <area> <city>`) to a file in your scratchpad and run
   `npm run resolve -- <that file>`. It prints name | address | feature id per query, and
   `artifacts/resolve.json` has the ready `/maps/place/` URL for each candidate. Re-query
   single places with `npm run resolve -- --query "<name> <street> <city>"`.
   - **Chains: add every location.** If a place has several branches and the document doesn't
     single out one ("this address", a street address, "the award-winning one"), add one entry
     per branch in the relevant city, each with its own address `query` or URL. If the
     document names specific addresses, add exactly those (e.g. two addresses → two entries).
     Give all branches of one chain the **same note**, because the list view shows them with
     the same name and can't tell them apart. A search that returns several results for a name
     is often a chain: find its branch addresses, don't drop it.
4. **Write `plan.json`** in the repo root (it is gitignored). If one already exists, copy it
   to `plan.<YYYYMMDD-HHMM>.json` first (also gitignored). The schema is in `src/plan.ts` and a
   sample is in `examples/plan.example.json`. Validate it with
   `npx tsx -e "import {PlanSchema} from './src/plan.ts'; import fs from 'fs'; PlanSchema.parse(JSON.parse(fs.readFileSync('plan.json','utf8')))"`.
5. **Choose a mode.** First tell the user, in a few lines: the list name, whether it's new or
   already exists (it exists if `.gmaps-state.json` has it, or if the user says so), the
   number of places and chain branches, and the unresolved places with what was found for
   each. For a **new** list, also show every resolved place as `Maps name — address`
   (compact, one per line, grouped as in the document). That is the preview: a dry run of a
   new list adds nothing to it. Then ask with `AskUserQuestion`, putting the recommended
   option first:
   - **Apply:** creates or updates the list, saves places, appends notes, then hard-reloads
     and verifies. Writes can't be undone (nothing is ever deleted, but a wrong place must be
     removed by hand). **Recommended for a new list.** `apply` skips closed and unresolved
     places on its own and never saves a place twice, so a dry run first only costs time
     (~3 s per place).
   - **Dry run:** opens every place in your Chrome and reads its Save dialog. Writes nothing.
     Shows what would be added, what's already in the list, and what's closed or unresolved.
     **Recommended for an existing list**, where it shows what's new before it gets mixed in
     with places the user already saved.
   **Before running, check that Chrome's remote debugging is on** (skip if the user uses a
   dedicated profile, i.e. no `--cdp auto`). Chrome writes `DevToolsActivePort` only while the
   toggle at `chrome://inspect/#remote-debugging` is on, so run
   `ls "$HOME/Library/Application Support/Google/Chrome/DevToolsActivePort" 2>&1` (never `cat`
   it: it grants control of the browser). Read only the error text:
   - Path printed: the toggle is on, go on.
   - `No such file or directory`: it's off. Ask with `AskUserQuestion`: **Open the settings
     page** (runs `open -a "Google Chrome" "chrome://inspect/#remote-debugging"`; the user turns
     the toggle on, then says continue; re-check the file once) / **It's already on** (go on
     anyway, e.g. a Chrome in another folder) / **Cancel**.
   - `Operation not permitted`: this terminal has no Full Disk Access, so the file can't be
     checked. Don't open anything. Go on; step 6's `EPERM` handling covers it.
   Chrome never lets a program flip the toggle itself, so the user always does that click.
6. **Run it yourself** from the repo root with Bash:
   `npm run dry -- plan.json --cdp auto` or `npm run apply -- plan.json --cdp auto`, plus
   `--account <email>` if the user asked for the account guard. Use a 600000 ms timeout. Tell
   the user just before to click **Allow** in Chrome. Expect roughly 5–10 s per place.
   - **`EPERM` on `DevToolsActivePort`:** this terminal (or the VS Code extension) has no
     Full Disk Access. Say so and give the exact command for the user to run in a terminal
     that has it, then continue from step 7 once they say it's done.
7. **Report** from `artifacts/report.json`: added / already there / notes / unresolved /
   failed, and `verify` after apply. Exit code 2 means verification found missing places or
   notes. For a failure, read the matching `artifacts/*-fail-*.yaml` (never paste it: it
   contains the account email).
   - **After a dry run:** remove places reported as permanently closed from `plan.json` and
     say which. If several places failed with "Page crashed", say the Chrome tab crashed (not
     the places) and keep them in the plan. Then, unless `--yes` was given, ask with
     `AskUserQuestion`: **Apply now** / **Stop** (Stop leaves `plan.json` for a later
     `npm run apply`). With `--yes`, run apply straight away.
   - **After apply:** list anything missing from `verify` and offer to retry just those
     (a plan with only those places; already-saved ones are skipped anyway).

## New list vs. update

If a list with that name already exists, this is an **update**: each place's own Save-dialog
checkbox decides whether it's already in the list (so chain branches are checked one by one),
new places are added, and new notes are appended (` · `, never overwritten).
Tell the user two limits up front:

- Places removed from the `.md` are **not** removed from Maps.
- With `ordered: true`, ranking is exact only for a list the executor creates. In an existing
  list, new places are ranked among themselves and existing ones keep their position.

## Rules

- Never delete places or lists, never change sharing. The executor has no code path for
  either.
- Ambiguous places become **unresolved**. Never guess.
- Never run `apply` without the user choosing it (step 5 or 7) or passing `--yes`. `apply`
  doesn't need a dry run first (it checks each place itself), but nothing it writes can be
  undone.
- `--yes` only skips the question after a dry run. The mode question in step 5 is always asked. Use a throwaway list (e.g. `zz-executor-test`) when testing writes.
- Single-quote Maps URLs in zsh (`!` triggers history expansion in double quotes).
- Chrome shows an **Allow** dialog on each new CDP connection. Tell the user to expect it.
- If the user has several Google accounts in Chrome, suggest `--account <their email>` (or
  `GMAPS_ACCOUNT`). The run then stops before writing anything if Chrome is on the wrong account.
- Selectors live only in `src/selectors.ts`. If Maps changed, re-run `npm run probe`.
