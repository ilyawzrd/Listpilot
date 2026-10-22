---
name: research
description: Use whenever the user asks for places in a city or neighbourhood (bakeries, coffee, restaurants, bars, brunch, natural wine…), however briefly ("bakeries in Lisbon", "coffee in Gràcia, quick, list zz-x", "where to eat in Tokyo"), and always when they name a list or mention saving, Maps or a list. Researches local favourites and still-good classics (tourist traps, viral TikTok places and closed places filtered out; local press, Reddit and Telegram checked; any language), opens a review page, then saves to a Google Maps list via maps-lists:import. Never answer such a request from memory: places close and move, so they must be researched. "Quick" means a quick research pass, not a quick reply.
argument-hint: <what> in <where> ["List name"] [--quick|--deep] [--opus|--sonnet] [--more-gems|--gems] [--yes] [--lang <tag>]
effort: medium
---

# Research → places file → Google Maps list

The optional first step in front of `maps-lists:import`. By default the research runs through the
`deep-research` skill (parallel research agents, like desktop Research mode). You then filter the
result into `research/<slug>.json` and open the review page, where the user ticks places and edits
notes. The page writes the places file, which you hand to `maps-lists:import`. Import resolves it and
passes it to `maps-lists:run` for the Chrome part. Nothing is written to Maps until the user picks Save to Maps there.

## Data folder

`maps-lists` (on your Bash PATH while the plugin is enabled) runs the executor with
`~/.maps-lists/` as its working folder (`MAPS_LISTS_HOME` overrides it; `maps-lists home` prints
it). Every relative data path in this skill (`research/`, `artifacts/`, `plan.json`,
`.gmaps-state.json`) lives there, and `maps-lists` resolves them there itself. When you Read or
Write one of those files with your own tools, use the full path (`~/.maps-lists/plan.json`).
Pass data files by these relative names. Pass anything else (the user's `.md`, a queries file in
your scratchpad) as an absolute path.

If a `maps-lists` command fails with `NODE_MISSING`, Node.js 18+ is missing or too old. If the
message mentions Homebrew, ask with `AskUserQuestion` (header `Node.js`): **Install it now** (run
`brew install node` with Bash, `timeout: 600000`, then retry the command) / **I'll install it
myself** (link https://nodejs.org and stop). Without Homebrew, give the link and stop.

## Input

`$ARGUMENTS`, e.g. `bakeries in Lisbon "Lisbon Bakeries" --yes`:

- **What:** one or more categories (eat, drink, coffee, bakeries, natural wine, brunch…).
- **Where:** a city or neighbourhood. If it's missing, ask with `AskUserQuestion`. Beyond that, ask
  only step 0's depth and model.
- **Optional list name** (quoted): otherwise make one up, short and at most 40 characters
  (`MAX_LIST_NAME` in `${CLAUDE_PLUGIN_ROOT}/src/plan.ts`), e.g. "Lisbon Bakeries" or "Tokyo Eat & Drink".
- **Depth, optional:** `--quick` (or "quick", "fast" in the request) does one research pass
  yourself (step 1b); `--deep` (or "deep", "thorough") runs `deep-research` (step 1). Not given →
  step 0 asks.
- **Model, optional:** `--opus` / `--sonnet` (or "with Opus", "on Sonnet" in the request). Not
  given → step 0 asks.
- **Balance of classics and lesser-known places, optional.** Three settings; read the request
  for which one the user means:
  - **Mix** (default, nothing said): local finds plus the classics locals still rate.
  - **`--more-gems`** ("include hidden gems", "also underrated spots", "more lesser-known
    places", «и неочевидные места тоже», «побольше локальных»): the user wants gems *added*, not
    classics removed. Keep classics, at most about 3 per category (the clearest must-sees), and dig
    harder for lesser-known places (step 1).
  - **`--gems`** ("hidden gems only", "no famous places", "skip the classics", «только
    неочевидные», «без известных мест»): leave the classics out (step 2).

  "Hidden gems" with no "only"/"also" is ambiguous: add a third question to step 0's card,
  header `Classics` (`Классика`): **Mix in the classics (Recommended)** / **Only lesser-known
  places** (in Russian **Вместе с классикой (рекомендуется)** / **Только неочевидные**), where
  "mix" means `--more-gems`.
- **Optional `--yes`:** passed through to `maps-lists:import`.
- **Optional `--lang <tag>`:** see "Language" below. Without it, use the language the user writes
  in, whatever it is.
- Anything else (budget, vegetarian, near a hotel, open late) is a constraint for the research.

## Language

The conversation language is `--lang <tag>` if given, otherwise the language the user writes in,
whatever it is (Spanish, Catalan, German, Japanese…). Everything the user sees is in it: your
messages and questions, and in the research JSON `"lang": "<tag>"` plus `section`, `note`,
`details` and the text of each `reason`. Strings in this skill are given in English, some with a
Russian version as a worked example; in any other language, translate them yourself. These stay as
they are, because code and the next skill read them:
`area: "all branches"` (the review page shows it as «все филиалы»), the reason prefixes `trap:`,
`viral:`, `closed:`, `thin evidence:`, `classic:`, place names as the sources write them, and the file slug
(ASCII, transliterated: `research/moskva-pekarni-20261019.json`). Brief `deep-research` in English
or the user's language, but ask for the report's notes and details in the user's language. Pass
`--lang <tag>` to `maps-lists:import` for anything but English. The language is the user's, not the
city's: a Russian speaker's Lisbon list gets Russian notes, a Catalan speaker's Tokyo list Catalan
ones; the sources follow the city (below).

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

0. **Depth and model.** Research is the expensive step, so the user picks both before it starts.
   Skip whichever the arguments or the request already settle (a model the user names counts even
   if it's the one you're on). Ask the rest in one `AskUserQuestion` call, one question each:
   - Header `Depth` (`Глубина`): **Deep (Recommended)**: several research agents in parallel,
     5–10 min, about 15–25 places, uses noticeably more of the user's usage / **Quick**: one pass,
     1–2 min, about 8–12 places, much cheaper. (In Russian: **Глубоко (рекомендуется)** / **Быстро**,
     descriptions translated.)
   - Header `Model` (`Модель`): the model you are running on first, labelled `(current)`
     (`(текущая)`), then the other two of Opus, Sonnet and Haiku that apply. No option is marked
     Recommended. Descriptions, the same whichever is current:
     - **Opus:** best judgment on which sources to trust and what to filter out; costs more and
       uses limits faster.
     - **Sonnet:** good results, cheaper and faster.
     - **Haiku** (only when it's current): cheapest and fastest, weakest at judging sources.

   Never give prices: they depend on the user's plan. If the chosen model is the one you're
   running on, start step 1 straight away. Otherwise you can't switch it yourself: say in one
   line «Type `/model <opus|sonnet>`, then say **continue**» (in Russian: «Введите
   `/model <opus|sonnet>` и напишите **продолжить**») and stop. When the user says continue, carry
   on from step 1 with everything already collected; ask nothing again.
1. **Research (deep).** Invoke the `deep-research` skill (listed as
   `anthropic-skills:deep-research`) and pass a self-contained brief, because its agents don't see
   this conversation:
   - The request: categories, city or neighbourhood, constraints, and any personal context the user
     gave (e.g. car-free, working from cafés).
   - The angles to cover: everything in "Sources" above, written out in the brief (its agents
     don't see this file): local press and guides (including local-language ones); Reddit (its
     agents can't load Reddit either, so `site:reddit.com` search snippets and articles that quote
     threads); Telegram channels via `t.me/s/<channel>`; for a Russian-speaking city, the Russian
     sources; the city's famous names for the category (the institutions every guide lists),
     each with what locals and local press say about it *now*; places that are viral on TikTok or
     Instagram, or tourist traps; closures, moves and ownership changes in the current and
     previous year.
   - Not to leave a place out for being famous or busy: report every well-known candidate with
     the evidence for and against, and let step 2 decide.
   - With `--more-gems` or `--gems`: spend most of the effort on lesser-known places: searches
     for "underrated", "hidden gem", "locals only", "new opening", the local-language
     equivalents, and neighbourhoods away from the centre; Telegram and local bloggers over
     big guides.
   - The language for the report's notes and details (the user's language).
   - The output needed: for each recommended place, its name, the area or street that pins it
     down, why it's recommended, what to order or when to go, caveats and source links. Also a
     separate list of places to skip, with reasons (trap, viral, closed), the famous names with
     their current local verdict, and a sources list.
   - The criteria from step 2 below, so its report already flags what step 2 will drop.

   Tell it to write the report to `~/.maps-lists/reports/<title>.md` and its notes to
   `~/.maps-lists/research_notes/<title>/`, so they stay out of the user's folder and
   `maps-lists clean` removes them later. Let it ask its own follow-up questions and finish. Read the report, then continue
   with step 2. **If `deep-research` isn't in the skill list** (or there's no Agent tool to start
   agents with), say so in one line and do step 1b instead.

   **1b. Research (quick, with `--quick` or as the fallback).** Send searches in parallel (`WebSearch` standard mode; extended only when a
   result is thin or looks out of date), then `WebFetch` the best articles and Telegram previews.
   Prefer sources from the current and previous year. Cover everything in "Sources" above, and
   search the city's famous names for the category on purpose ("best <category> <city>", the
   classics every guide lists) with what locals say about them now. With `--more-gems` or
   `--gems`, add the lesser-known searches from step 1's brief.
2. **Filter.** For each candidate, note who recommends it and any pushback. The test is quality,
   not fame: being famous, busy or in every guide is never on its own a reason to drop a place.
   - **Tourist trap** → drop: its reputation is better than what it serves. On or next to a top
     landmark with picture menus or touts; locals or Reddit or Telegram say "avoid", "overrated",
     "tourist trap", "went downhill"; praise comes mostly from one-time visitors. Long lines
     alone aren't a sign of a trap.
   - **Classic** → keep: famous, and locals or local press still recommend it on its merits now
     ("still the best morning bun", "worth the line on a weekday"). Start its `details` with
     `Classic.` (translated: `Классика.`, `Clàssic.`) and say frankly what to expect (lines, prices, the one
     thing worth ordering, when to go). Its `note` carries the practical part ("Go before 9 or
     on a weekday"). With `--more-gems`, keep at most about 3 classics per category and put the
     rest in `excluded[]` with reason `classic: <why it's famous>`; with `--gems`, put all of
     them there. Either way the user can tick them back in.
   - **Viral / TikTok** → drop: described mainly as "TikTok famous", "viral", "Instagrammable";
     the hype is one photogenic item; people queue for the photo. Keep it only if locals still
     recommend it on its own merits, and then say so in its `details`.
   - **Closed** (permanently or "closed since…") → drop.
   - **Keep** places with at least two independent sources, or one strong local one (a resident on
     Reddit, local press, a local Telegram author who isn't paid for the post). One listicle alone
     is not enough.
   - Aim for about 10–25 places per category. A tight list beats an exhaustive one.
   - **No silent drops.** Every candidate the research surfaced, above all the well-known ones,
     ends up in `places[]` or in `excluded[]` with its reason. Before step 3, check the city's
     famous names for the category against both lists, and add any that's missing.
3. **Write the research file** `research/<slug>-<YYYYMMDD>.json` in the data folder, with the slug from
   city + category, e.g. `research/lisbon-bakeries-20261018.json` (always ASCII). Schema:
   `ResearchSchema` in `${CLAUDE_PLUGIN_ROOT}/src/review.ts`; samples: `${CLAUDE_PLUGIN_ROOT}/examples/research.example.json`,
   `${CLAUDE_PLUGIN_ROOT}/examples/research.example.ru.json`.
   - `lang`: the conversation language's tag (`ru`, `es`, `ca`…); leave it out for English. It
     sets the review page's language. English and Russian have built-in labels. For any other
     language also add `ui` with the page's labels translated: `hint`, `filtered`, `details`
     ("Details ▾"), `hide` ("Hide ▴"), `placeholder`, `keep`, `noteFor`, `cancel`, `allBranches`,
     `nothing`, `reconnecting`, `sending`, `sent`, `cancelled`, `close`, and `go`: the Continue
     button per plural category of the language, with `{n}` for the count, e.g.
     `{"one": "Continua amb {n} lloc →", "other": "Continua amb {n} llocs →"}` (use the categories
     the language has: `one`, `few`, `many`, `other`…). The English wording of each is the `en`
     table in `${CLAUDE_PLUGIN_ROOT}/src/review.ts`; anything left out shows in English.
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
     (`trap: …`, `viral: …`, `closed: …`, `thin evidence: …`, or `classic: …` with `--gems`, one
     line). Leave `note` empty.
   - Say once, in a `details` or a `reason`, when Reddit or Telegram evidence comes only from
     search snippets.

   Validate with `maps-lists review --check <json>` and fix any reported field.
4. **Review.** Tell the user what the research found, as Markdown in the conversation language:

   > ## 🔎 Lisbon Bakeries · 18 places
   >
   > | Category | Kept | Classics | Filtered out |
   > |---|:-:|:-:|:-:|
   > | Bakeries | 11 | 2 | 4 |
   > | Coffee | 7 | 1 | 2 |
   >
   > **Filtered out:** 3 tourist traps, 2 viral, 1 closed (you can tick them back in)
   > 🌐 A review page is opening in your browser: untick places, edit notes, press **Continue**.

   Leave out the Classics column with `--gems`. Then run
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
   `research/<slug>-<YYYYMMDD>.places.md "<List name>"`, plus `--yes` and `--lang <tag>` if they
   were given. Import resolves
   every place, previews it, and asks before anything is saved.

## Rules

- Keep internals out of replies: no commands, file names, backups, validation results or exit
  codes. The user sees the summaries, the questions and anything they need to act on.
- Never invent a place. Every entry in the JSON has a source. After deep research, take places
  only from its report, never from memory.
- Don't write the `.places.md` yourself; the review page writes it from the user's choices.
- Don't resolve places or touch Chrome here. That's `maps-lists:import` and `maps-lists:run`.
- All of `maps-lists:import`'s rules still apply (never delete, never guess a match, 40-char list names).
