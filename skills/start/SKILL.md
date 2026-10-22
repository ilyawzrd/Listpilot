---
name: start
description: Use when the user starts maps-lists without saying what they want, or asks how to put places on a Google Maps list. Asks whether to research places or use a .md file they already have, gathers the few answers each needs, then hands off to maps-lists:research or maps-lists:import.
argument-hint: [anything the user already said]
effort: medium
---

# Start: research or a .md file → Google Maps list

The plugin's front door, the same flow as the repo's `start.sh` menu. It asks only what the next
skill needs, then invokes it. It doesn't research, resolve or touch Chrome itself.

## Language

Don't ask for a language. Use the language of the user's message (`$ARGUMENTS`, or what they
wrote before invoking this). Russian → every question and message in Russian, and pass `--lang ru`
to the next skill. Anything else → English, no `--lang`. With no text at all, write the first
question in English with a Russian line under it, and continue in the language of the answer.
This is only the conversation language. The Maps UI language is detected by the executor from
the signed-in account, so never ask about it.

## Flow

1. **Skip what's already known.** If `$ARGUMENTS` already says what and where ("bakeries in
   Lisbon"), go to step 3 with those answers filled in. If it names a `.md` file, go to step 2b.
2. **Mode.** Ask with `AskUserQuestion` (header `Mode`, in Russian `Режим`):
   - **Research places for me** (Claude searches local press, guides, Telegram and Reddit) /
     **Найти места для меня** (Claude ищет в местной прессе, гидах, Telegram и Reddit)
   - **Use a .md file I have** (a research report, a chat answer, a list) /
     **Взять мой .md-файл** (отчёт, ответ из чата, список)

   **2b. A .md file.** Ask in plain text for the path (`~/Downloads/lisbon.md`; they can drag the
   file into the terminal). Strip quotes and trailing spaces, expand `~`, check it exists and
   ends in `.md`, and ask again if not. Then ask for a list name (optional: the file's title is
   used otherwise; at most 40 characters; an existing name updates that list). Invoke
   `maps-lists:import` with `"<absolute path>" ["<List name>"]` plus `--lang ru` in Russian.
3. **Research.** Ask what's still missing, in one message, as plain text:
   1. **What:** the kind of place and anything that matters, no city
      (e.g. "natural wine bars with food, open late" / «натуральные винные бары с едой, допоздна»).
      If the answer carries a place ("bakeries in Lisbon"), move that part to Where and say so.
   2. **Where:** city, or neighbourhood + city.
   3. **List name:** new or existing, at most 40 characters. Suggest `<Where> <first words of What>`
      (e.g. "Lisbon Bakeries"). Remove any `"`.

   Then ask the depth with `AskUserQuestion` (header `Depth`, in Russian `Глубина`):
   **Deep (Recommended)**, several minutes and more places / **Quick**, one pass and fewer places
   (in Russian **Глубоко (рекомендуется)** / **Быстро**). Tourist traps, viral TikTok spots and
   closed places are filtered out either way.
4. **What happens next.** Before handing off, tell the user in a few lines:
   - Research (or reading the file) comes first, then a review page opens in their browser:
     untick places, edit notes, press Continue.
   - Claude looks each place up on Google Maps and shows what it found.
   - The Maps step needs Chrome's remote debugging switched on
     (`chrome://inspect/#remote-debugging`; Claude opens it if needed) and an **Allow** click in
     Chrome. Claude Code must have been started from a terminal with Full Disk Access.
   - Nothing is written to the list before they choose Apply or Dry run.
5. **Hand off** in the same turn: invoke `maps-lists:research` with
   `<what> in <where> "<List name>"` (in Russian `<what> в <where> "<List name>"`), plus `--quick`
   and `--lang ru` when they apply.

## Rules

- List names are at most 40 characters: Maps cuts longer ones and the executor can't find the list.
- Ask nothing beyond the questions above. The next skills ask their own.
