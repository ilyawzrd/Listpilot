# listpilot

Applies a `plan.json` to Google Maps saved lists through Playwright attached to Chrome over CDP:
creates lists (with emoji), saves places (ranked only if `ordered: true`), writes per-place notes, then hard-reloads
and diffs the list against the plan.

Claude does the judgment work (parse the source, ask for list names, resolve each place to a Maps
URL). This executor does the clicking, deterministically.

## Setup (once)

**Option A: your main Chrome (Chrome 144+).** Open `chrome://inspect/#remote-debugging` and turn
it on. Skip `npm run chrome`. Chrome asks you to **Allow** each connection, and shows an
"automated test software" banner while one is attached. Turn the toggle off when you're done.
Add `--cdp auto` to every command in this mode. It searches the usual Chrome, Chrome Beta/Canary,
Brave, Edge and Arc folders for `DevToolsActivePort`. Set `GMAPS_CHROME_DIR` if yours is elsewhere.

> **zsh:** put Maps URLs in **single quotes**. Inside double quotes, zsh expands the `!` in
> `data=!4m6!3m5…` into commands from your shell history.

**Option B: a dedicated profile.**

```bash
npm install
npm run chrome            # opens a dedicated Chrome profile on 127.0.0.1:9222
```

Sign into Google in that window. The profile keeps the session, so you only do this once.

## Calibrate selectors (once, and whenever Maps changes)

Most selectors in `src/selectors.ts` are verified against live snapshots (see `CLAUDE.md`).
Re-run the probe whenever Maps changes:

```bash
npm run probe -- 'https://www.google.com/maps/place/<any place>' '<an existing list name>' --cdp auto
```

This is read-only. It writes ARIA snapshots and screenshots to `artifacts/`. If something
doesn't match, send the `aria-*.yaml` files to Claude and it'll fix `selectors.ts`.

## Run

```bash
npm run dry -- plan.json     # resolves places + reads the current list, writes nothing
npm run apply -- plan.json   # does it, then verifies after a hard reload
```

The `--` passes the arguments through to the script. Extra flags go after it too, e.g.
`npm run apply -- plan.json --list-order oldest-first`.

Flags: `--cdp <url>` (default `http://127.0.0.1:9222`), `--list-order newest-first|oldest-first`
(how Maps displays lists; flip it if verify reports order drift), `--state <file>`.

Output: a console summary plus `artifacts/report.json`. The exit code is `2` if verification
found missing places or notes.

## Guarantees

- Never deletes places or lists, never touches sharing.
- Idempotent: places already in the list are skipped, and existing notes are appended to with
  ` · `, never overwritten.
- Ambiguous `query` places are reported as **unresolved**, never guessed.
- Order is ignored by default. With `ordered: true`, ranking is exact only for lists the executor
  creates; existing lists keep their current order.
