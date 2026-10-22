# maps-lists: advanced usage

The [README](../README.md) covers the everyday flow. This page has the details: how it works, the
ways of connecting to Chrome, running steps by hand, flags, and development.

## How it works

1. **Research** (optional): Claude researches local press, guides, Telegram and Reddit, filters out tourist traps,
   viral spots and closed places, and opens a **review page**. There you tick places and edit notes.
2. **Resolve**: Claude looks each place up on Google Maps and writes a `plan.json`.
3. **Apply**: a deterministic executor (Playwright attached to your Chrome over CDP) creates or updates
   the list, saves places, writes notes, then hard-reloads and checks the list against the plan.

Claude does the judgment work; the executor only clicks, the same way every time.

## The plugin

This repo is a Claude Code plugin (`.claude-plugin/plugin.json`) and its own marketplace
(`.claude-plugin/marketplace.json`):

```
/plugin marketplace add ilyawzrd/maps-lists
/plugin install maps-lists@maps-lists
```

| Skill | What it does | Model |
|---|---|---|
| `/maps-lists:start` | asks research or .md file, then the few questions each needs | session |
| `/maps-lists:research` | research → filter → review page → places file | session |
| `/maps-lists:import` | .md file → review page → resolved `plan.json` | Sonnet |
| `/maps-lists:run` | Apply / Dry run in your Chrome, report, cleanup | Haiku |

The skills call `bin/maps-lists` (on Claude's Bash PATH while the plugin is enabled). It runs
`src/` with **`~/.maps-lists/`** as its working folder (`MAPS_LISTS_HOME` overrides it), so
`research/`, `artifacts/`, `plan.json` and `.gmaps-state.json` land there wherever Claude was
started. Relative file arguments are made absolute first, and on first run it installs
`node_modules` if Claude Code hasn't. Subcommands: `dry`, `apply`, `resolve`, `review`, `clean`,
`probe`, `check-plan`, `chrome`, `home`. Outside Claude, call it by its full path.

`npm run …` inside a clone still works on the clone itself (data in the repo folder), which is
handy for development. `./start.sh` loads the clone as the plugin (`claude --plugin-dir`), so it
uses `~/.maps-lists` like an installed copy.

**Coming from listpilot?** Copy your state and places files over once, so lists you already made
aren't created again:

```bash
mkdir -p ~/.maps-lists/research
cp .gmaps-state.json ~/.maps-lists/ && cp research/*.places.md ~/.maps-lists/research/
```

### Releasing

Users only get an update when `version` in `.claude-plugin/plugin.json` goes up. Commits without a
bump don't reach them. To release: bump `version` (and `package.json` to match), commit, push to
`master`. Users with auto-update on (`/plugin` → Marketplaces → maps-lists → Enable auto-update;
off by default for marketplaces outside Anthropic's) get it within a few minutes of their next
session and it loads on the next start or `/reload-plugins`. Others run
`/plugin marketplace update maps-lists`.

Test a working copy without installing it: `claude --plugin-dir /path/to/maps-lists`.

## Connecting to Chrome

```bash
npm install       # ./start.sh also does this on first run
```

**Option A: your main Chrome (Chrome 144+).** Open `chrome://inspect/#remote-debugging` and turn
it on. Chrome asks you to **Allow** each connection, and shows an "automated test software"
banner while one is attached. Turn the toggle off when you're done.
Add `--cdp auto` to every command in this mode. It searches the usual Chrome, Chrome Beta/Canary,
Brave, Edge and Arc folders for `DevToolsActivePort`. Set `GMAPS_CHROME_DIR` if yours is elsewhere.

- **macOS:** give your terminal app **Full Disk Access** (System Settings → Privacy & Security),
  and run `claude` and `npm run …` from that terminal. Without it, reading `DevToolsActivePort`
  fails with `EPERM`, and editor extensions (VS Code) can't get it at all.
- `403 Forbidden … Connection rejected` means the Allow dialog wasn't approved. Bring Chrome to
  the front, re-run, and click **Allow**.

> **zsh:** put Maps URLs in **single quotes**. Inside double quotes, zsh expands the `!` in
> `data=!4m6!3m5…` into commands from your shell history.

**Option B: a dedicated profile.**

```bash
npm run chrome            # opens a dedicated Chrome profile on 127.0.0.1:9222
```

Sign into Google in that window. The profile keeps the session, so you only do this once.
Leave `--cdp auto` off in this mode.

**Signed in to several Google accounts?** Add `--account you@gmail.com` (or
`export GMAPS_ACCOUNT=you@gmail.com`). `dry` and `apply` then stop before writing anything if
Chrome is on a different account.

## Running Claude directly

**Run it from a terminal, not from an editor extension.** Started from a terminal that has Full Disk
Access (needed for `--cdp auto`), Claude runs the whole flow itself: file in, list out.
The VS Code extension can't read Chrome's `DevToolsActivePort` file (`EPERM`), so there Claude can
only prepare the plan and hand you the `maps-lists` command to paste into a terminal.

One command, from any folder:

```bash
claude '/maps-lists:import path/to/places.md "LA Eats"'          # list name is optional
claude '/maps-lists:import path/to/places.md "LA Eats" --yes'    # don't ask again after the dry run
claude '/maps-lists:research bakeries in Lisbon "Lisbon Bakeries"'  # research first, then the same flow
```

You can also just ask in plain words instead of using the slash command.

**From an .md file.** Claude reads the places and notes from the file (see
[`examples/places.example.md`](../examples/places.example.md)) and opens the same review page as
research does (`research/<slug>.json` → `research/<slug>.places.md`; skipped for a `*.places.md`,
which was already reviewed). Then it turns your choices into `plan.json`, looks up each place on Maps
(`maps-lists resolve`) and flags anything ambiguous. Then it asks whether to **apply** (writes) or do a
**dry run** (reads only), runs it in your Chrome and reports.

- **Apply is recommended for new and existing lists.** It checks each place's own Save-dialog
  checkbox and never saves a place twice. For a new list it shows the resolved places first.
- **Dry run** is there if you want to see what's new first. It writes nothing.
- After a dry run it asks before applying, unless you passed `--yes`.
- Without a name, the list is named after the file's title. Names can be at most 40 characters
  (Maps cuts longer ones), so a longer title is shortened.
- If Chrome's remote debugging toggle is off, Claude offers to open `chrome://inspect/#remote-debugging`.
  You switch it on and say continue; Chrome doesn't let a program flip it.

**Research first.** `/maps-lists:research <what> in <where>` runs the `deep-research`
skill (parallel research agents, similar to desktop Research mode; takes minutes). It covers local
press, guides, Reddit (from search snippets, since Reddit blocks direct fetches) and Telegram
channels (through their public `t.me/s/<channel>` preview). In Russian-speaking cities it searches in
Russian first and adds Russian food media, Yandex Maps / 2GIS review snippets and Telegram as a
primary source. Add `--quick`
for a single faster pass that finds fewer places. It then drops tourist traps,
viral TikTok spots and closed places, and keeps places with at least two independent sources. It
writes the result to `research/<slug>.json` (schema in `src/review.ts`, sample in
[`examples/research.example.json`](../examples/research.example.json)). It opens the review page with
`maps-lists review research/<slug>.json`, which serves it on 127.0.0.1 only while you review. Your
choices become `research/<slug>.places.md`, which goes into `/maps-lists:import`.

In `./start.sh`, if What looks like it includes a place ("bakeries in Lisbon", «пекарни в
Лиссабоне»), it offers to move the place to Where.

### Russian

Write in Russian and the skills switch to Russian on their own; there's no language question.
`./start.sh` still asks (English / Русский), and you can force it with `--lang ru`:
`claude '/maps-lists:research пекарни в Лиссабоне "Пекарни Лиссабона" --lang ru'`. Then:

- Claude asks and reports in Russian, and the research writes Russian notes and details.
- The research file gets `"lang": "ru"`, so the review page is in Russian (sample:
  [`examples/research.example.ru.json`](../examples/research.example.ru.json)). Machine tokens stay
  English: `area: "all branches"` (shown as «все филиалы») and the `trap:`/`viral:`/`closed:`/`thin
  evidence:` reason prefixes.
- `maps-lists:import` keeps notes in the source file's language and resolves with `--lang ru`.
- This `--lang` is only the conversation language. The executor's own `--lang` (Maps UI, below) stays
  `auto` and follows the Google account.

Without the flag, each skill answers in the language you write in.

### Models and effort

Everything runs at **medium** effort.

| Step | Model |
|---|---|
| Research (`maps-lists:research`) | your session model (`start.sh` lets you pick Opus or Sonnet) |
| Parse + look up places (`maps-lists:import`) | Sonnet |
| Chrome part (`maps-lists:run`) | Haiku: runs the executor, asks fixed questions, reports |

If you finish a run in your own terminal, `/maps-lists:run --report` reads the result on Haiku.

### Cleanup

After a fully verified apply, `maps-lists clean` runs by itself (in `~/.maps-lists`). It removes `artifacts/`,
every untracked `plan*.json`, everything in `research/` except the `.places.md` files, and
deep-research's `reports/` and `research_notes/`. What stays is each
list's final places file, which you can re-run with `/maps-lists:import`, plus git-tracked files and the
real lists in `.gmaps-state.json`. Run `npm run clean -- --dry-run` to see what it would remove.

Sessions you close midway never reach that step, so `./start.sh` also runs
`maps-lists clean --older-than 7` on launch: it removes the same leftovers, but only ones untouched
for 7 days, and leaves `.gmaps-state.json` alone. Anything newer stays, so an unreviewed research
file or a failed apply can still be picked up.

## Commands

```bash
npm run dry -- plan.json     # optional preview: resolves every place, checks if it's already in the list, writes nothing
npm run apply -- plan.json   # saves places and notes, then verifies after a hard reload
```

The dry run is optional. `apply` checks each place on its own before saving, so it's safe to run
directly on new and existing lists, and it skips closed and unresolved places by itself. Use a dry
run if you want to see what's new in an existing list first. The executor never deletes anything,
so a wrong place has to be removed by hand.

Other commands:

```bash
npm run review -- research/<slug>.json   # reopen the review page for a research result
npm run clean -- --dry-run               # show what cleanup would remove (drop --dry-run to remove it)
npm run clean -- --older-than 7          # only leftovers untouched for 7+ days (what start.sh runs)
```

To look up places on their own, without Chrome:

```bash
npm run resolve -- --query "Langer's Deli Los Angeles"   # candidates with name, address and Maps URL
npm run resolve -- queries.txt                           # one query per line; full results in artifacts/resolve.json
npm run resolve -- queries.txt --lang ru                 # names and addresses in Russian (default: en)
```

A tab that loads about 70 Maps places gets its renderer killed ("Page crashed"), so `apply` opens
a fresh tab every 25 places.

The `--` passes the arguments through to the script. Extra flags go after it too, e.g.
`npm run apply -- plan.json --cdp auto`.

Flags:
- `--cdp <url>`: default `http://127.0.0.1:9222`. Use `auto` for Option A.
- `--state <file>`: default `.gmaps-state.json`.
- `--account <email>`: stop if Chrome is signed in to a different account.
- `--lang auto|en|es|ru`: Maps UI language. `auto` (default) opens Maps without `hl` and reads
  `<html lang>`, which follows the Google account's language. Spanish and Russian keep the exact
  tag (`es`, `es-419`, `ru`) as `hl`; anything else forces `hl=en`. `report.json` records it as `mapsLanguage`.
- `--list-order newest-first|oldest-first`: you shouldn't need this. Maps shows the most recently
  modified place first, and editing a note counts as a change; `apply` already accounts for that.

Output: a console summary plus `artifacts/report.json`. The exit code is `2` if verification
found missing places or notes. Failures also leave a screenshot and an ARIA snapshot in
`artifacts/`. The snapshots include your Google account name and email, so don't share them publicly.

### State file

`.gmaps-state.json` remembers every list the executor created or opened, and a list recorded
there is never created again. This stops a slow-to-appear new list from being created twice.
If you delete a list in Maps, also remove its entry from this file before reusing the name.

## Calibrate selectors (whenever Maps changes)

The selectors in `src/selectors.ts` match live snapshots (see `CLAUDE.md`), and the write actions
have run end to end with verification passing. If Maps changes its UI, re-run the probe:

```bash
npm run probe -- 'https://www.google.com/maps/place/<any place>' '<an existing list name>' --cdp auto
```

This is read-only. It writes ARIA snapshots and screenshots to `artifacts/`. If something
doesn't match, send the `aria-*.yaml` files to Claude and it'll fix `selectors.ts`.

Each UI language has its own table (`TEXT.en`, `TEXT.es`, `TEXT.ru`) in `selectors.ts`. To calibrate
Spanish or Russian, run the probe with an account in that language (or add `--lang es` / `--lang ru`).

## Guarantees

- Never deletes places or lists, never touches sharing.
- Idempotent: places already in the list are skipped, and existing notes are appended to with
  ` · `, never overwritten.
- Ambiguous `query` places are reported as **unresolved**, never guessed.
- Order is ignored by default. With `ordered: true`, ranking is exact only for lists the executor
  creates; existing lists keep their current order.

## Development

```bash
npm run typecheck
npm test          # list-row parsing, title matching, plan schema, place lookup parsing, review page + server, cleanup
```
