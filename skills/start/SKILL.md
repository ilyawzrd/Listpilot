---
name: start
description: Use when the user starts maps-lists without saying what they want, or asks how to put places on a Google Maps list. Asks whether to research places or use a list they already have (a file, a screenshot or pasted text), gathers the few answers each needs, then hands off to maps-lists:research or maps-lists:import.
argument-hint: [anything the user already said]
effort: medium
---

# Start: research or a list you have → Google Maps list

The plugin's front door, the same flow as the repo's `start.sh` menu. It asks only what the next
skill needs, then invokes it. It doesn't research, resolve or touch Chrome itself.

## Language

Don't ask for a language. Use the language of the user's message (`$ARGUMENTS`, or what they
wrote before invoking this), whatever it is: every question and message in that language, and pass
`--lang <tag>` (BCP 47: `ru`, `es`, `ca`, `pt-BR`) to the next skill for anything but English. With
no text at all, write the first question in English, add one line saying they can answer in any
language, and continue in the language of the answer.
This is only the conversation language. The Maps UI language is detected by the executor from
the signed-in account, so never ask about it.

## Flow

1. **Skip what's already known.** If `$ARGUMENTS` already says what and where ("bakeries in
   Lisbon"), go to step 3 with those answers filled in. If it names a file or carries a pasted list, go
   to step 2b with it.
2. **Mode.** Ask with `AskUserQuestion` (header `Mode`, in Russian `Режим`):
   - **Research places for me** (Claude searches local press, guides, Telegram and Reddit) /
     **Найти места для меня** (Claude ищет в местной прессе, гидах, Telegram и Reddit)
   - **Use a list I have** (a file, a screenshot, or text you paste) /
     **Взять мой список** (файл, скриншот или вставленный текст)

   **2b. A list they have.** Ask in plain text for it: drag the file into the terminal
   (`.md`, `.txt`, PDF, Word, a screenshot…) or paste the list. For a path, strip quotes, `\ `
   escapes and trailing spaces, expand `~`, and check it exists; ask again if not. Then ask for a list name (optional: the file's title is
   used otherwise; at most 40 characters; an existing name updates that list). Invoke
   `maps-lists:import` with `"<absolute path>" ["<List name>"]`, or for pasted text with the
   text and the list name, plus `--lang <tag>`.
3. **Research.** Ask what's still missing, in one message, as plain text:
   1. **What:** the kind of place and anything that matters, no city
      (e.g. "natural wine bars with food, open late" / «натуральные винные бары с едой, допоздна»).
      If the answer carries a place ("bakeries in Lisbon"), move that part to Where and say so.
   2. **Where:** city, or neighbourhood + city.
   3. **List name:** new or existing, at most 40 characters. Suggest `<Where> <first words of What>`
      (e.g. "Lisbon Bakeries"). Remove any `"`.

   Don't ask depth or model here: `maps-lists:research` asks both, with their trade-offs, right
   before it starts.
4. **What happens next.** Before handing off, tell the user as a short Markdown block: a
   `### What happens next` heading (translated), then a numbered list, each step starting with an
   icon (🔎 research or 📄 reading the file, 🌐 review page, 📍 looking places up on Maps,
   🔐 Chrome access, ✅ saving), one line each, covering:
   - For research: Claude asks how deep to go and which model to use, then researches. Famous
     places locals still rate stay in as classics; tourist traps, viral spots and closed places
     are filtered out.
   - Research (or reading the file) comes first, then a review page opens in their browser:
     untick places, edit notes, press Continue.
   - Claude looks each place up on Google Maps and shows what it found.
   - The Maps step needs Chrome's remote debugging switched on
     (`chrome://inspect/#remote-debugging`; Claude opens it if needed) and an **Allow** click in
     Chrome, plus Full Disk Access for the terminal on a Mac. Claude walks them through it if needed.
   - Nothing is saved to the list before they choose Save to Maps.
5. **Hand off** in the same turn: invoke `maps-lists:research` with
   `<what> in <where> "<List name>"` (in the user's language: `<what> в <where>`, `<what> en <where>`…), plus
   `--quick`/`--deep`, `--opus`/`--sonnet` and `--more-gems`/`--gems` if the user already said so, and
   `--lang <tag>`.

## Rules

- List names are at most 40 characters: Maps cuts longer ones and the executor can't find the list.
- Ask nothing beyond the questions above. The next skills ask their own.
