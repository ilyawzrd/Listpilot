---
name: listpilot-apply
description: Use when the user wants places from a .md file (a research report, a chat answer, a list of recommendations, or a listpilot-research places file) added to a Google Maps saved list, or an existing list updated, with notes. Opens the review page (checkboxes, editable notes) for a file that wasn't reviewed yet, builds plan.json, then hands it to listpilot-run to apply with this repo's deterministic executor.
argument-hint: <file.md> ["List name"] [--yes] [--account <email>] [--lang ru]
model: sonnet
effort: medium
---

# Markdown → Google Maps list

You do the judgment work: parse, let the user review the places on the review page, resolve,
build `plan.json`. Then `listpilot-run` (on a smaller
model) runs the executor (`npm run dry` / `npm run apply`), which only clicks.

## Input

`$ARGUMENTS`, e.g. `~/Downloads/la.md "LA Eats" --yes`:

- **First token:** path to a `.md` file with places (headings, bullets or free text). See
  `examples/places.example.md`. If it's missing, ask for it.
- **Optional list name** (quoted or the remaining words): overrides the file's title.
- **Optional `--yes`:** after a dry run, go on to apply without asking again (passed to `listpilot-run`).
- **Optional `--account <email>`:** the account guard (passed to `listpilot-run`).
- **Optional `--lang ru`:** the user works in Russian. Without it, use the language the user
  writes in. In Russian, your messages, questions and `artifacts/plan-summary.md` are in Russian,
  `npm run resolve` gets `--lang ru` (Russian names and addresses for the summary), and
  `listpilot-run` gets `--lang ru`. Notes keep the language of the source file in either case:
  never translate them.

The whole flow runs in this session, including the Chrome steps in `listpilot-run`. Those need a
session started from a terminal with Full Disk Access.

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
   **A `*.places.md` from `listpilot-research`** is already in this shape: `# ` is the list name,
   `## ` sections are categories, and each bullet is `**Name** (area): note`. Use its notes as
   written, put the `(area)` into the resolve query, and treat `(all branches)` as a chain
   (step 4: add every location).
2. **List name.** Use the name from the arguments if given. Otherwise use the file's
   top-level title, or ask the user if there is none. Ask for an emoji only if the user
   mentioned one. **At most 40 characters:** Maps cuts longer names, and the executor then
   can't find the list it just created. A longer title gets shortened to its core
   ("Where to Eat & Drink in Los Angeles (October 2026)" → "LA Eat & Drink (Oct 2026)";
   «Куда сходить поесть и выпить в Санкт-Петербурге (октябрь 2026)» → «Еда и бары СПб (окт 2026)»);
   say what you picked. A longer name from the arguments: ask for a shorter one.
3. **Review page.** Skip this step for a `*.places.md`: it comes from `listpilot-research` and was
   already reviewed on this page. Every other file goes through it.
   - Write `research/<slug>-<YYYYMMDD>.json`, with the slug from the file's basename (ASCII only,
     e.g. `research/la-eats-20261019.json`). The schema is `ResearchSchema` in `src/review.ts`
     (sample: `examples/research.example.json`), filled from step 1:
     - `lang`: `"ru"` with `--lang ru`, otherwise leave it out. It sets the page's language.
     - `list`: the name from step 2.
     - `places[]`, in the file's order: `section` (the file's heading for it, or `""`), `name`,
       `area` (the street or neighbourhood the file gives, `all branches` for a chain the file
       doesn't pin to one branch, or `""`), `note` (in note style), `details` (the place's own text
       from the file when it says more than the note, otherwise `""`). Leave out `sources` and
       `excluded`.
   - Validate with `npm run -s review -- --check <json>` and fix any reported field.
   - Tell the user in one line that a page is opening in their browser to untick places and edit
     notes. Then run `npm run review -- <json>` with Bash, `timeout: 600000`, and act on the exit code:
     - `0`: the page wrote `research/<slug>-<YYYYMMDD>.places.md` and printed a summary
       ("Kept 11 of 13 …"). Repeat it in one line. From here on, work from that `.places.md`
       (its places and notes as written, `(area)` and `(all branches)` as in step 1), not from the
       original file.
     - `3`: the page is still open (a command can't run longer than 10 minutes). Run
       `npm run review -- <json> --resume` straight away, without saying anything, as often as
       needed. The page keeps its state and reconnects.
     - `2` (cancelled in the page) or `4` (tab closed): ask with `AskUserQuestion` (header
       `Review`, in Russian `Проверка`): **Reopen the page** (run it again without `--resume`) /
       **Stop** (in Russian **Открыть снова** / **Стоп**).
     - `1`: the JSON is invalid. Fix it and run again.
4. **Resolve every place to a `/maps/place/` URL** and put it in `url`. Use `query` only when
   the search will land on one unambiguous place. Anything ambiguous goes in a list for the
   user. Never guess a match. Resolve without Chrome: write one query per line
   (`<name> <area> <city>`) to a file in your scratchpad and run
   `npm run resolve -- <that file>` (add `--lang ru` in Russian). It prints name | address | feature id per query, and
   `artifacts/resolve.json` has the ready `/maps/place/` URL for each candidate. Re-query
   single places with `npm run resolve -- --query "<name> <street> <city>"`.
   - **Chains: add every location.** If a place has several branches and the document doesn't
     single out one ("this address", a street address, "the award-winning one"), add one entry
     per branch in the relevant city, each with its own address `query` or URL. If the
     document names specific addresses, add exactly those (e.g. two addresses → two entries).
     Give all branches of one chain the **same note**, because the list view shows them with
     the same name and can't tell them apart. A search that returns several results for a name
     is often a chain: find its branch addresses, don't drop it.
5. **Write `plan.json`** in the repo root (it is gitignored). If one already exists, copy it
   to `plan.<YYYYMMDD-HHMM>.json` first (also gitignored). The schema is in `src/plan.ts` and a
   sample is in `examples/plan.example.json`. Validate it with
   `npx tsx -e "import {PlanSchema} from './src/plan.ts'; import fs from 'fs'; PlanSchema.parse(JSON.parse(fs.readFileSync('plan.json','utf8')))"`.
6. **Write the handoff** to `artifacts/plan-summary.md`, a few plain lines that
   `listpilot-run` shows as is: the list name, whether it's new or already exists (it exists if
   `.gmaps-state.json` has it, or if the user says so), the number of places and chain branches,
   and each unresolved place with what was found for it. For a **new** list, also list every
   resolved place as `Maps name — address` (compact, one per line, grouped as in the document).
   That's the preview, since a dry run of a new list adds nothing. For an **update**, add the
   two limits from "New list vs. update" below. In Russian, write the whole summary in Russian
   («Список: … (новый)», «Мест: 12, из них филиалов сети: 3», «Не найдено: …»).
7. **Hand off to `listpilot-run`.** Invoke the `listpilot-run` skill with the plan path, plus
   `--yes`, `--account <email>` and `--lang ru` if they were given. It runs on a smaller model and does the
   rest: the Apply / Dry run question, Chrome checks, the run and the report.

## New list vs. update

If a list with that name already exists, this is an **update**: each place's own Save-dialog
checkbox decides whether it's already in the list (so chain branches are checked one by one),
new places are added, and new notes are appended (` · `, never overwritten). The summary
states two limits:

- Places removed from the `.md` are **not** removed from Maps.
- With `ordered: true`, ranking is exact only for a list the executor creates. In an existing
  list, new places are ranked among themselves and existing ones keep their position.

## Rules

- Never delete places or lists, never change sharing. The executor has no code path for
  either.
- Ambiguous places become **unresolved**. Never guess.
- Don't write the `.places.md` yourself; the review page writes it from the user's choices.
- Never run `npm run dry` / `npm run apply` from this skill. That's `listpilot-run`'s job, and it
  always asks Apply / Dry run first. Use a throwaway list (e.g. `zz-executor-test`) when testing writes.
- Single-quote Maps URLs in zsh (`!` triggers history expansion in double quotes).
- If the user has several Google accounts in Chrome, suggest `--account <their email>` (or
  `GMAPS_ACCOUNT`). The run then stops before writing anything if Chrome is on the wrong account.
- Selectors live only in `src/selectors.ts`. If Maps changed, re-run `npm run probe`.
