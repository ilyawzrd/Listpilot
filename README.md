# listpilot

Applies a `plan.json` to Google Maps saved lists through Playwright attached to Chrome over CDP:
creates lists (with emoji), saves places (ranked only if `ordered: true`), writes per-place notes, then hard-reloads
and diffs the list against the plan.

Claude does the judgment work (parse the source, ask for list names, resolve each place to a Maps
URL). This executor does the clicking, deterministically.

## Setup (once)

```bash
npm install
```

Then connect to Chrome in one of two ways.

**Option A: your main Chrome (Chrome 144+).** Open `chrome://inspect/#remote-debugging` and turn
it on. Chrome asks you to **Allow** each connection, and shows an "automated test software"
banner while one is attached. Turn the toggle off when you're done.
Add `--cdp auto` to every command in this mode. It searches the usual Chrome, Chrome Beta/Canary,
Brave, Edge and Arc folders for `DevToolsActivePort`. Set `GMAPS_CHROME_DIR` if yours is elsewhere.

- **macOS:** give your terminal app **Full Disk Access** (System Settings → Privacy & Security).
  Without it, reading `DevToolsActivePort` fails with `EPERM`.
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

## Using it with Claude

In Claude Code, inside this repo:

```
/listpilot-apply path/to/places.md
```

You can also just ask in plain words. Claude turns the markdown file into `plan.json`, looks up
each place on Maps, flags anything ambiguous, shows you a dry run, and applies after your go-ahead.
It names the list after the file's title unless you give a name. See `examples/places.example.md`.

## Run

```bash
npm run dry -- plan.json     # optional preview: resolves every place, checks if it's already in the list, writes nothing
npm run apply -- plan.json   # saves places and notes, then verifies after a hard reload
```

The dry run is optional. `apply` checks each place on its own before saving, so it's safe to run
directly. Use `dry` to see what will happen first. That's worth doing on a list you care about,
because the executor never deletes anything, so a wrong place has to be removed by hand.

The `--` passes the arguments through to the script. Extra flags go after it too, e.g.
`npm run apply -- plan.json --cdp auto`.

Flags:
- `--cdp <url>`: default `http://127.0.0.1:9222`. Use `auto` for Option A.
- `--state <file>`: default `.gmaps-state.json`.
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
npm test          # pure logic: list-row parsing, title matching, plan schema
```
