# listpilot: advanced usage

The [README](../README.md) covers the everyday flow. This page has the details: how it works, the
ways of connecting to Chrome, running steps by hand, flags, and development.

## How it works

1. **Research** (optional): Claude researches local press, guides and Reddit, filters out tourist traps,
   viral spots and closed places, and opens a **review page**. There you tick places and edit notes.
2. **Resolve**: Claude looks each place up on Google Maps and writes a `plan.json`.
3. **Apply**: a deterministic executor (Playwright attached to your Chrome over CDP) creates or updates
   the list, saves places, writes notes, then hard-reloads and checks the list against the plan.

Claude does the judgment work; the executor only clicks, the same way every time.

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
only prepare the plan and hand you the `npm run` command to paste into a terminal.

One command, inside this repo:

```bash
claude '/listpilot-apply path/to/places.md "LA Eats"'          # list name is optional
claude '/listpilot-apply path/to/places.md "LA Eats" --yes'    # don't ask again after the dry run
claude '/listpilot-research bakeries in Lisbon "Lisbon Bakeries"'  # research first, then the same flow
```

You can also just ask in plain words instead of using the slash command.

**From an .md file.** Claude turns the file into `plan.json` (see
[`examples/places.example.md`](../examples/places.example.md)), looks up each place on Maps
(`npm run resolve`) and flags anything ambiguous. Then it asks whether to **apply** (writes) or do a
**dry run** (reads only), runs it in your Chrome and reports.

- **Apply is recommended for new and existing lists.** It checks each place's own Save-dialog
  checkbox and never saves a place twice. For a new list it shows the resolved places first.
- **Dry run** is there if you want to see what's new first. It writes nothing.
- After a dry run it asks before applying, unless you passed `--yes`.
- Without a name, the list is named after the file's title. Names can be at most 40 characters
  (Maps cuts longer ones), so a longer title is shortened.
- If Chrome's remote debugging toggle is off, Claude offers to open `chrome://inspect/#remote-debugging`.
  You switch it on and say continue; Chrome doesn't let a program flip it.

**Research first.** `/listpilot-research <what> in <where>` runs the `deep-research`
skill (parallel research agents, similar to desktop Research mode; takes minutes). It covers local
press, guides and Reddit (from search snippets, since Reddit blocks direct fetches). Add `--quick`
for a single faster pass that finds fewer places. It then drops tourist traps,
viral TikTok spots and closed places, and keeps places with at least two independent sources. It
writes the result to `research/<slug>.json` (gitignored; schema in `src/review.ts`, sample in
[`examples/research.example.json`](../examples/research.example.json)). It opens the review page with
`npm run review -- research/<slug>.json`, which serves it on 127.0.0.1 only while you review. Your
choices become `research/<slug>.places.md`, which goes into `/listpilot-apply`.

In `./start.sh`, if What looks like it includes a place ("bakeries in Lisbon"), it offers to move the
place to Where.

### Models and effort

Everything runs at **medium** effort.

| Step | Model |
|---|---|
| Research (`listpilot-research`) | Opus or Sonnet, chosen in `start.sh` (otherwise your session model) |
| Parse + look up places (`listpilot-apply`) | Sonnet |
| Chrome part (`listpilot-run`) | Haiku: runs the executor, asks fixed questions, reports |

If you finish a run in your own terminal, `/listpilot-run --report` reads the result on Haiku.

### Cleanup

After a fully verified apply, `npm run clean` runs by itself. It removes `artifacts/`,
every untracked `plan*.json`, everything in `research/` except the `.places.md` files, and
deep-research's `reports/` and `research_notes/`. What stays is each
list's final places file, which you can re-run with `/listpilot-apply`, plus git-tracked files and the
real lists in `.gmaps-state.json`. Run `npm run clean -- --dry-run` to see what it would remove.

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
```

To look up places on their own, without Chrome:

```bash
npm run resolve -- --query "Langer's Deli Los Angeles"   # candidates with name, address and Maps URL
npm run resolve -- queries.txt                           # one query per line; full results in artifacts/resolve.json
```

A tab that loads about 70 Maps places gets its renderer killed ("Page crashed"), so `apply` opens
a fresh tab every 25 places.

The `--` passes the arguments through to the script. Extra flags go after it too, e.g.
`npm run apply -- plan.json --cdp auto`.

Flags:
- `--cdp <url>`: default `http://127.0.0.1:9222`. Use `auto` for Option A.
- `--state <file>`: default `.gmaps-state.json`.
- `--account <email>`: stop if Chrome is signed in to a different account.
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
