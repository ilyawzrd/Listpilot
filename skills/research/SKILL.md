---
name: research
description: Use when the user wants recommendations for places to eat, drink, get coffee, bakeries, etc. in a city researched (tourist traps and viral TikTok places filtered out, Reddit and Telegram checked; in English or Russian) and put on a Google Maps saved list. Writes a structured research file, opens a review page (checkboxes, editable notes), then hands the result to maps-lists:import.
argument-hint: <what> in <where> ["List name"] [--quick] [--yes] [--lang ru]
effort: medium
---

# Research → places file → Google Maps list

The optional first step in front of `maps-lists:import`. By default the research runs through the
`deep-research` skill (parallel research agents, like desktop Research mode). You then filter the
result into `research/<slug>.json` and open the review page, where the user ticks places and edits
notes. The page writes the places file, which you hand to `maps-lists:import`. Apply resolves it and
passes it to `maps-lists:run` for the Chrome part. Nothing is written to Maps until the user picks Apply there.

## Data folder

`maps-lists` (on your Bash PATH while the plugin is enabled) runs the executor with
`~/.maps-lists/` as its working folder (`MAPS_LISTS_HOME` overrides it; `maps-lists home` prints
it). Every relative data path in this skill (`research/`, `artifacts/`, `plan.json`,
`.gmaps-state.json`) lives there, and `maps-lists` resolves them there itself. When you Read or
Write one of those files with your own tools, use the full path (`~/.maps-lists/plan.json`).
Pass data files by these relative names. Pass anything else (the user's `.md`, a queries file in
your scratchpad) as an absolute path.

## Input

`$ARGUMENTS`, e.g. `bakeries in Lisbon "Lisbon Bakeries" --yes`:

- **What:** one or more categories (eat, drink, coffee, bakeries, natural wine, brunch…).
- **Where:** a city or neighbourhood. If it's missing, ask with `AskUserQuestion`. Ask nothing else.
- **Optional list name** (quoted): otherwise make one up, short and at most 40 characters
  (`MAX_LIST_NAME` in `${CLAUDE_PLUGIN_ROOT}/src/plan.ts`), e.g. "Lisbon Bakeries" or "Tokyo Eat & Drink".
- **Optional `--quick`** (or "quick", "fast" in the request): skip deep research and do one
  research pass yourself (step 1b). Faster and cheaper, but it finds fewer places.
- **Optional `--yes`:** passed through to `maps-lists:import`.
- **Optional `--lang ru`:** the user works in Russian (see "Language" below). Without it, use
  the language the user writes in (Russian request → Russian; anything else → English).
- Anything else (budget, vegetarian, near a hotel, open late) is a constraint for the research.

## Language

With `--lang ru` (or a Russian request), everything the user sees is in Russian: your messages and
questions, and in the research JSON `"lang": "ru"` plus Russian `section`, `note`, `details` and
the text of each `reason`. These stay as they are, because code and the next skill read them:
`area: "all branches"` (the review page shows it as «все филиалы»), the reason prefixes `trap:`,
`viral:`, `closed:`, `thin evidence:`, place names as the sources write them, and the file slug
(ASCII, transliterated: `research/moskva-pekarni-20261019.json`). Brief `deep-research` in English
or Russian, but ask for the report's notes and details in Russian. Pass `--lang ru` to
`maps-lists:import`. The language is the user's, not the city's: a Russian speaker's Lisbon list gets
Russian notes; the sources follow the city (below).

## Sources

Every research pass covers these, per category:

- **Local press and guides:** city food publications, local food bloggers, Eater /
  The Infatuation / Time Out where they exist, Michelin Bib Gourmand. Local-language sources
  count (search in the local language too).
- **Reddit, from search snippets:** `site:reddit.com <city> <category>`, local subreddit
  first (r/lisbon, r/portugal), then r/travel, r/solotravel, r/<country>travel. Vary angles:
  "locals", "hidden gem", "avoid", "overrated", "tourist trap", "went downhill", this year.
  Try `WebFetch` on an old.reddit.com thread URL once. Reddit usually blocks it, and if it does,
  work from the snippets and don't try again. Upvotes, "I live here" and specificity
  (dish, street, price) raise a comment's weight.
- **Telegram channels**, for every city: find local food and city channels with
  `site:t.me <city> <category>` (and the same in the local language), then read recent posts
  through the public web preview `https://t.me/s/<channel>` with `WebFetch` (no login). If a
  preview won't load, work from the snippets and don't retry it. A local author with a track
  record counts like local press; a channel that's mostly paid posts («реклама», `#ad`, promo
  codes, "partner") counts as thin evidence. Telegram weighs most where it's the main local food
  medium (Russian-speaking cities and the rest of the CIS, Israel, Iran…) and least where Reddit
  and local press are rich.
- **Russian-speaking cities** (Russia, Belarus, Kazakhstan, Kyrgyzstan, Georgia and Armenia for
  their Russian-language scenes…), whatever the user's language: search in Russian first. Add
  Russian-language food media and guides (Afisha Daily, The Village, Restoclub, regional city
  media, «Гастрономическая карта России», Michelin where present), Yandex Maps and 2GIS review
  snippets (weigh like Reddit comments: detailed local reviews count, star averages alone don't),
  and Telegram as a primary source. Reddit (r/moscow, r/russia, r/AskARussian, r/Kazakhstan…) is
  secondary there. Same filter rules, in Russian too: «туристическое место», «переоценено»,
  «испортилось», «хайповое», «из тиктока».

## Flow

1. **Research (deep, the default).** Invoke the `deep-research` skill (listed as
   `anthropic-skills:deep-research`) and pass a self-contained brief, because its agents don't see
   this conversation:
   - The request: categories, city or neighbourhood, constraints, and any personal context the user
     gave (e.g. car-free, working from cafés).
   - The angles to cover: everything in "Sources" above, written out in the brief (its agents
     don't see this file): local press and guides (including local-language ones); Reddit (its
     agents can't load Reddit either, so `site:reddit.com` search snippets and articles that quote
     threads); Telegram channels via `t.me/s/<channel>`; for a Russian-speaking city, the Russian
     sources; places that are viral on TikTok or Instagram, or tourist traps; closures, moves and
     ownership changes in the current and previous year.
   - The language for the report's notes and details (Russian with `--lang ru`).
   - The output needed: for each recommended place, its name, the area or street that pins it
     down, why it's recommended, what to order or when to go, caveats and source links. Also a
     separate list of places to skip, with reasons (trap, viral, closed), and a sources list.
   - The criteria from step 2 below, so its report already flags what step 2 will drop.

   Tell it to write the report to `~/.maps-lists/reports/<title>.md` and its notes to
   `~/.maps-lists/research_notes/<title>/`, so they stay out of the user's folder and
   `maps-lists clean` removes them later. Let it ask its own follow-up questions and finish. Read the report, then continue
   with step 2. **If `deep-research` isn't in the skill list** (or there's no Agent tool to start
   agents with), say so in one line and do step 1b instead.

   **1b. Research (quick, with `--quick` or as the fallback).** Send searches in parallel (`WebSearch` standard mode; extended only when a
   result is thin or looks out of date), then `WebFetch` the best articles and Telegram previews.
   Prefer sources from the current and previous year. Cover everything in "Sources" above.
2. **Filter.** For each candidate, note who recommends it and any pushback.
   - **Tourist trap** → drop: on or next to a top landmark with picture menus or touts; locals or
     Reddit or Telegram say "avoid", "overrated", "tourist trap", "went downhill"; praise comes mostly from
     one-time visitors.
   - **Viral / TikTok** → drop: described mainly as "TikTok famous", "viral", "Instagrammable";
     the hype is one photogenic item; people queue for the photo. Keep it only if locals still
     recommend it on its own merits, and then say so in its `details`.
   - **Closed** (permanently or "closed since…") → drop.
   - **Keep** places with at least two independent sources, or one strong local one (a resident on
     Reddit, local press, a local Telegram author who isn't paid for the post). One listicle alone
     is not enough.
   - Aim for about 10–25 places per category. A tight list beats an exhaustive one.
3. **Write the research file** `research/<slug>-<YYYYMMDD>.json` in the data folder, with the slug from
   city + category, e.g. `research/lisbon-bakeries-20261018.json` (always ASCII). Schema:
   `ResearchSchema` in `${CLAUDE_PLUGIN_ROOT}/src/review.ts`; samples: `${CLAUDE_PLUGIN_ROOT}/examples/research.example.json`,
   `${CLAUDE_PLUGIN_ROOT}/examples/research.example.ru.json`.
   - `lang`: `"ru"` with `--lang ru`, otherwise leave it out (defaults to `"en"`). It sets the
     review page's language.
   - `list`: the list name (40 characters max).
   - `places[]`: one entry per pick, in the order to show them:
     - `section`: the category ("Coffee", "Bakeries").
     - `name`.
     - `area`: the neighbourhood or street that pins the place down, or `all branches` for a chain
       when no source singles out one branch.
     - `note`: the text that goes to Maps. Use the **note style** of `maps-lists:import`: plain
       text, no name, city or address, only concrete info (what to order, when to go, book ahead,
       closing day), one or two sentences, no sources or ranks.
     - `details`: what the user reads on the review page. Why it's in, who recommends it, what to
       order, caveats (lines, prices, laptop rules, hours). Two to four sentences of plain text;
       `[text](url)` links are fine. Blank lines separate paragraphs.
     - `sources`: `[{title, url}]`, the links behind the pick.
   - `excluded[]`: what step 2 dropped, each with the same fields plus `reason`
     (`trap: …`, `viral: …`, `closed: …` or `thin evidence: …`, one line). Leave `note` empty.
   - Say once, in a `details` or a `reason`, when Reddit or Telegram evidence comes only from
     search snippets.

   Validate with `maps-lists review --check <json>` and fix any reported field.
4. **Review.** Tell the user in 2–3 lines how many places per category, how many were filtered out
   and why, and that a page is opening in their browser. Then run
   `maps-lists review <json>` with Bash, `timeout: 600000`. It serves the page on 127.0.0.1 and
   waits. The user unticks places, edits notes, can tick filtered-out ones back in, and presses
   **Continue**. Act on the exit code:
   - `0`: the page wrote `research/<slug>-<YYYYMMDD>.places.md` and printed a summary
     ("Kept 11 of 13 …"). Repeat the summary in one line and go to step 5.
   - `3`: the page is still open (a command can't run longer than 10 minutes). Run
     `maps-lists review <json> --resume` straight away, without saying anything, as often as
     needed. The page keeps its state and reconnects.
   - `2` (cancelled in the page) or `4` (tab closed): ask with `AskUserQuestion` (header `Review`):
     **Reopen the page** (run step 4 again without `--resume`) / **Stop** (the JSON stays;
     `maps-lists review <json>` reopens it later).
   - `1`: the JSON is invalid. Fix it and run again.
5. **Hand off.** Invoke the `maps-lists:import` skill with
   `research/<slug>-<YYYYMMDD>.places.md "<List name>"`, plus `--yes` and `--lang ru` if they
   were given. Apply resolves
   every place, previews it, and asks Apply / Dry run before anything is written.

## Rules

- Never invent a place. Every entry in the JSON has a source. After deep research, take places
  only from its report, never from memory.
- Don't write the `.places.md` yourself; the review page writes it from the user's choices.
- Don't resolve places or touch Chrome here. That's `maps-lists:import` and `maps-lists:run`.
- All of `maps-lists:import`'s rules still apply (never delete, never guess a match, 40-char list names).
