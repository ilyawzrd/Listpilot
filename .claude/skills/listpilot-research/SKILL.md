---
name: listpilot-research
description: Use when the user wants recommendations for places to eat, drink, get coffee, bakeries, etc. in a city researched (tourist traps and viral TikTok places filtered out, Reddit checked) and put on a Google Maps saved list. Writes a structured research file, opens a review page (checkboxes, editable notes), then hands the result to listpilot-apply.
argument-hint: <what> in <where> ["List name"] [--quick] [--yes]
effort: medium
---

# Research → places file → Google Maps list

The optional first step in front of `listpilot-apply`. By default the research runs through the
`deep-research` skill (parallel research agents, like desktop Research mode). You then filter the
result into `research/<slug>.json` and open the review page, where the user ticks places and edits
notes. The page writes the places file, which you hand to `listpilot-apply`. Apply resolves it and
passes it to `listpilot-run` for the Chrome part. Nothing is written to Maps until the user picks Apply there.

## Input

`$ARGUMENTS`, e.g. `bakeries in Lisbon "Lisbon Bakeries" --yes`:

- **What:** one or more categories (eat, drink, coffee, bakeries, natural wine, brunch…).
- **Where:** a city or neighbourhood. If it's missing, ask with `AskUserQuestion`. Ask nothing else.
- **Optional list name** (quoted): otherwise make one up, short and at most 40 characters
  (`MAX_LIST_NAME` in `src/plan.ts`), e.g. "Lisbon Bakeries" or "Tokyo Eat & Drink".
- **Optional `--quick`** (or "quick", "fast" in the request): skip deep research and do one
  research pass yourself (step 1b). Faster and cheaper, but it finds fewer places.
- **Optional `--yes`:** passed through to `listpilot-apply`.
- Anything else (budget, vegetarian, near a hotel, open late) is a constraint for the research.

## Flow

1. **Research (deep, the default).** Invoke the `deep-research` skill (listed as
   `anthropic-skills:deep-research`) and pass a self-contained brief, because its agents don't see
   this conversation:
   - The request: categories, city or neighbourhood, constraints, and any personal context the user
     gave (e.g. car-free, working from cafés).
   - The angles to cover: local press and guides (including local-language ones); Reddit (its
     agents can't load Reddit either, so `site:reddit.com` search snippets and articles that quote
     threads); places that are viral on TikTok or Instagram, or tourist traps; closures, moves and
     ownership changes in the current and previous year.
   - The output needed: for each recommended place, its name, the area or street that pins it
     down, why it's recommended, what to order or when to go, caveats and source links. Also a
     separate list of places to skip, with reasons (trap, viral, closed), and a sources list.
   - The criteria from step 2 below, so its report already flags what step 2 will drop.

   Let it ask its own follow-up questions and finish. It writes the report to `reports/<title>.md`,
   with notes in `research_notes/<title>/`, both gitignored. Read the report, then continue
   with step 2. **If `deep-research` isn't in the skill list** (or there's no Agent tool to start
   agents with), say so in one line and do step 1b instead.

   **1b. Research (quick, with `--quick` or as the fallback).** Send searches in parallel (`WebSearch` standard mode; extended only when a
   result is thin or looks out of date), then `WebFetch` the best articles. Prefer sources from the
   current and previous year. Cover, per category:
   - **Local press and guides:** city food publications, local food bloggers, Eater /
     The Infatuation / Time Out where they exist, Michelin Bib Gourmand. Local-language sources
     count (search in the local language too).
   - **Reddit, from search snippets:** `site:reddit.com <city> <category>`, local subreddit
     first (r/lisbon, r/portugal), then r/travel, r/solotravel, r/<country>travel. Vary angles:
     "locals", "hidden gem", "avoid", "overrated", "tourist trap", "went downhill", this year.
     Try `WebFetch` on an old.reddit.com thread URL once. Reddit usually blocks it, and if it does,
     work from the snippets and don't try again. Upvotes, "I live here" and specificity
     (dish, street, price) raise a comment's weight.
2. **Filter.** For each candidate, note who recommends it and any pushback.
   - **Tourist trap** → drop: on or next to a top landmark with picture menus or touts; locals or
     Reddit say "avoid", "overrated", "tourist trap", "went downhill"; praise comes mostly from
     one-time visitors.
   - **Viral / TikTok** → drop: described mainly as "TikTok famous", "viral", "Instagrammable";
     the hype is one photogenic item; people queue for the photo. Keep it only if locals still
     recommend it on its own merits, and then say so in its `details`.
   - **Closed** (permanently or "closed since…") → drop.
   - **Keep** places with at least two independent sources, or one strong local one (a resident on
     Reddit, local press). One listicle alone is not enough.
   - Aim for about 10–25 places per category. A tight list beats an exhaustive one.
3. **Write the research file** `research/<slug>-<YYYYMMDD>.json` (gitignored), with the slug from
   city + category, e.g. `research/lisbon-bakeries-20261018.json`. Schema: `ResearchSchema` in
   `src/review.ts`; sample: `examples/research.example.json`.
   - `list`: the list name (40 characters max).
   - `places[]`: one entry per pick, in the order to show them:
     - `section`: the category ("Coffee", "Bakeries").
     - `name`.
     - `area`: the neighbourhood or street that pins the place down, or `all branches` for a chain
       when no source singles out one branch.
     - `note`: the text that goes to Maps. Use the **note style** of `listpilot-apply`: plain
       text, no name, city or address, only concrete info (what to order, when to go, book ahead,
       closing day), one or two sentences, no sources or ranks.
     - `details`: what the user reads on the review page. Why it's in, who recommends it, what to
       order, caveats (lines, prices, laptop rules, hours). Two to four sentences of plain text;
       `[text](url)` links are fine. Blank lines separate paragraphs.
     - `sources`: `[{title, url}]`, the links behind the pick.
   - `excluded[]`: what step 2 dropped, each with the same fields plus `reason`
     (`trap: …`, `viral: …`, `closed: …` or `thin evidence: …`, one line). Leave `note` empty.
   - Say once, in a `details` or a `reason`, when Reddit evidence comes only from search snippets.

   Validate with `npm run -s review -- --check <json>` and fix any reported field.
4. **Review.** Tell the user in 2–3 lines how many places per category, how many were filtered out
   and why, and that a page is opening in their browser. Then run
   `npm run review -- <json>` with Bash, `timeout: 600000`. It serves the page on 127.0.0.1 and
   waits. The user unticks places, edits notes, can tick filtered-out ones back in, and presses
   **Continue**. Act on the exit code:
   - `0`: the page wrote `research/<slug>-<YYYYMMDD>.places.md` and printed a summary
     ("Kept 11 of 13 …"). Repeat the summary in one line and go to step 5.
   - `3`: the page is still open (a command can't run longer than 10 minutes). Run
     `npm run review -- <json> --resume` straight away, without saying anything, as often as
     needed. The page keeps its state and reconnects.
   - `2` (cancelled in the page) or `4` (tab closed): ask with `AskUserQuestion` (header `Review`):
     **Reopen the page** (run step 4 again without `--resume`) / **Stop** (the JSON stays;
     `npm run review -- <json>` reopens it later).
   - `1`: the JSON is invalid. Fix it and run again.
5. **Hand off.** Invoke the `listpilot-apply` skill with
   `research/<slug>-<YYYYMMDD>.places.md "<List name>"`, plus `--yes` if it was given. Apply resolves
   every place, previews it, and asks Apply / Dry run before anything is written.

## Rules

- Never invent a place. Every entry in the JSON has a source. After deep research, take places
  only from its report, never from memory.
- Don't write the `.places.md` yourself; the review page writes it from the user's choices.
- Don't resolve places or touch Chrome here. That's `listpilot-apply` and `listpilot-run`.
- All of `listpilot-apply`'s rules still apply (never delete, never guess a match, 40-char list names).
