---
name: lists
description: Use when the user asks which Google Maps lists maps-lists has made for them, wants to see the places (and notes) in one of those lists, asks where its files are, or wants a list's places file to share. Reads the saved places files and list links; never touches Chrome or Maps.
argument-hint: [list name or city]
model: haiku
effort: medium
---

# Your lists

Read-only. Shows what the plugin saved: the lists it made, their Google Maps links, and the
places and notes the user kept on the review page. Changes made by hand in Google Maps aren't in
these files, so say so whenever you show places.

## Data folder

Everything is in `~/.maps-lists/` (`maps-lists home` prints it; `MAPS_LISTS_HOME` overrides it).
Each list's places are in `research/*.places.md` there: `# ` is the list name, `## ` sections,
and each bullet is `- **Name** (area): note`. Read those files with the Read tool, using the full
path.

## Language

Reply in the language the user writes in. Place names and notes stay as the files have them.

## Flow

1. Run `maps-lists lists` with Bash. It prints a JSON array, newest first:
   `{name, url?, files: [{path, date?, places}], places}`. `url` is the list's Google Maps link;
   `files` are its places files, oldest first.
   Write replies as Markdown (headings, tables, bold), never inside a code block.
2. **No list named in `$ARGUMENTS` or the request** ("what lists have I made?"): a heading
   `## 🗺️ Your lists (N)`, then a table, newest first, with columns List (bold name), Places,
   Updated (date of the last file, e.g. `19 Oct`), and Maps (`📍 [Open](<url>)`); translate the
   labels. A list with no files: "—" for places and
   "places not recorded" in a footnote. Empty array: say no lists have been made yet, and that
   asking for places in a city (or `/maps-lists:start`) makes one.
3. **A list named** ("show my San Francisco list", "what bakeries did I save in Barcelona"):
   match it against the names, case-insensitively and loosely (a city or a word of the name). Several
   matches: ask with `AskUserQuestion` (header `List`, in Russian `Список`), one option per match.
   Then Read each of its files, oldest first, and show, as Markdown:

   > ## 🗺️ San Francisco · 14 places
   > 📍 [Open in Google Maps](<url>) · updated 19 Oct
   >
   > ### Bakeries
   > - **Arsicault Bakery** · all branches
   >   Butter croissant, baked all morning. Go on a weekday before 9.
   > - **Tartine** · Mission
   >   Morning bun; go before 9 or on a weekday.
   >
   > ### Coffee
   > - …
   >
   > *Places saved through maps-lists; changes made by hand in Maps aren't shown.*

   - One `###` per `## ` section of the files; each place as a bullet with the bold name and the
     area after ` · `, and its note on the next line (indented two spaces). A place with no note
     is one line.
   - With two or more files, merge sections of the same name and drop a place that repeats (same
     name and area), keeping the later note.
   - Translate the fixed words (places, updated, the closing line); names and notes stay as they are.
   A list with no files: give the Maps link and say its places weren't recorded (it was made
   before places files were kept).
4. **Follow-ups**, when the user asks:
   - "Where are the files?" / "open the folder": open `~/.maps-lists/research` in the file
     manager (the folder starts with a dot, so it's hidden otherwise) and give the path: `open
     ~/.maps-lists/research` on macOS, `xdg-open ~/.maps-lists/research` on Linux, `explorer.exe
     "$(cygpath -w ~/.maps-lists/research)"` on Windows.
   - Share or export: `cp` the list's places file(s) to `~/Downloads/` (on Linux without one, the home folder) (keep the file name) and
     give the path.
   - Add places to the list: hand off to `maps-lists:research` (`<what> in <where> "<List name>"`)
     or `maps-lists:import` (`<file.md> "<List name>"`), plus `--lang <tag>` for anything but English. The existing
     list is updated, nothing is removed.
   - Put the list's places in Maps again (e.g. after deleting some by hand): hand off to
     `maps-lists:import` with the list's latest places file and its name.

## Rules

- Never edit or delete files in the data folder, and never touch Chrome or Maps from this skill.
- Don't list `zz-*` test lists (`maps-lists lists` already leaves them out).
