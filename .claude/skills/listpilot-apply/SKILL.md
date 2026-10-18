---
name: listpilot-apply
description: Use when the user wants places from a .md file (a research report, a chat answer, a list of recommendations) added to a Google Maps saved list, or an existing list updated, with notes. Builds plan.json and applies it with this repo's deterministic executor.
---

# Markdown → Google Maps list

You do the judgment work. The executor (`npm run dry` / `npm run apply`) only clicks.

## Input

A path to a `.md` file with places: headings, bullets or free text. See `examples/places.example.md`.

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
2. **List name.** Use the file's top-level title if it has one, otherwise ask the user. Ask
   for an emoji only if the user mentioned one.
3. **Resolve every place to a `/maps/place/` URL** and put it in `url`. Use `query` only when
   the search will land on one unambiguous place. Anything ambiguous goes in a list for the
   user. Never guess a match. To find URLs without Chrome, use the `/search?tbm=map` fetch
   described under "Resolving places without Chrome" in `CLAUDE.md`.
   - **Chains: add every location.** If a place has several branches and the document doesn't
     single out one ("this address", a street address, "the award-winning one"), add one entry
     per branch in the relevant city, each with its own address `query` or URL. If the
     document names specific addresses, add exactly those (e.g. two addresses → two entries).
     Give all branches of one chain the **same note**, because the list view shows them with
     the same name and can't tell them apart. A search that returns several results for a name
     is often a chain: find its branch addresses, don't drop it.
4. **Write `plan.json`** in the repo root (it is gitignored). The schema is in `src/plan.ts`
   and a sample is in `examples/plan.example.json`.
5. **Dry run:** `npm run dry -- plan.json --cdp auto`. Show the user what would be added, what
   is already in the list, and what is unresolved. Wait for a go-ahead.
6. **Apply:** `npm run apply -- plan.json --cdp auto`. Report the summary and
   `artifacts/report.json`. Exit code 2 means verification found missing places or notes.

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
- Run `dry` before `apply` and wait for a go-ahead. `apply` doesn't need it (it checks each
  place itself), but nothing it writes can be undone, so the user should see the plan first.
  Skip it only if the user asks. Use a throwaway list (e.g. `zz-executor-test`) when testing writes.
- Single-quote Maps URLs in zsh (`!` triggers history expansion in double quotes).
- Chrome shows an **Allow** dialog on each new CDP connection. Tell the user to expect it.
- If the user has several Google accounts in Chrome, suggest `--account <their email>` (or
  `GMAPS_ACCOUNT`). The run then stops before writing anything if Chrome is on the wrong account.
- Selectors live only in `src/selectors.ts`. If Maps changed, re-run `npm run probe`.
