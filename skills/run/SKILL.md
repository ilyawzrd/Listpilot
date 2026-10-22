---
name: run
description: Use when a validated plan.json is ready (usually handed over by maps-lists:import) and the user wants it saved to Google Maps through their Chrome, or wants the last run's report. Runs the executor and reports; makes no judgment calls.
argument-hint: [plan.json] [--apply|--yes] [--account <email>] [--report] [--lang <tag>]
model: haiku
effort: medium
---

# Run plan.json against Google Maps

This skill only runs commands, asks fixed questions and reports. The places were already chosen
and resolved by `maps-lists:import`. Don't change the plan beyond what step 4 says, don't re-resolve
places, and don't guess. When something looks wrong, report it and stop.

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

`$ARGUMENTS`:

- **Plan path:** defaults to `plan.json` in the data folder.
- **`--apply`** (or `--yes`): save without asking: the user named the places themselves (a direct
  add from `maps-lists:import`) or said not to ask. Show the summary, skip step 1's question.
- **`--account <email>`:** add it to the `maps-lists apply` command.
- **`--lang <tag>`:** the conversation language. Talk to the user in it and use it for every
  question and the report; Russian strings are given below, translate the English ones for any other
  language. Without it, use the language the user writes in. **Never pass this
  `--lang` to `maps-lists apply`:** its own `--lang` is the Maps UI language and
  stays at its default (`auto`).
- **`--report`:** skip to step 4. Read the last `artifacts/report.json` and report it (e.g. after
  the user ran the command in their own terminal).

## Flow

1. **Show the summary.** Print `artifacts/plan-summary.md` (written by `maps-lists:import`) to the
   user as is. If it's missing, read the plan and print the list name and the number of places instead.
   With `--apply` or `--yes`, go straight to step 2. Otherwise ask with `AskUserQuestion` (header
   `Save`, in Russian `Сохранить`):
   - **Save to Maps (Recommended)**: creates or updates the list, saves the places, appends
     notes, then reloads and checks everything arrived. Places already in the list are skipped,
     closed ones too; nothing is ever deleted or overwritten. (In Russian: **Сохранить в Карты
     (рекомендуется)**.)
   - **Stop**: the plan stays for later (`/maps-lists:run`). (In Russian: **Стоп**.)

   Don't offer a dry run. Only if the user asks for one ("dry run", "just check, don't save"),
   run `maps-lists dry` instead of `apply` in step 3: it opens every place and reads whether it's
   already in the list, writing nothing; report it with the same layout, headed `Dry run` and
   "Would add".

   In Russian: header `Режим`; **Применить (рекомендуется)** / **Пробный прогон** / **Стоп**, with
   the descriptions above translated.
2. **Check Chrome.** Run `maps-lists check-chrome`. It prints one JSON line,
   `{mode, status, host: {kind, app?, appPath?}, readyBefore?}`. Never look at `DevToolsActivePort`
   yourself (no `ls`, `cat` or any other read): it grants control of the browser, and only
   `check-chrome` and the executor touch it.

   **`mode: "main"`** (the user's own Chrome; the default):
   - **`ready`:** step 3 with `--cdp auto`.
   - **`debugging-off`:** the remote debugging toggle is off, or Chrome isn't running. Ask with
     `AskUserQuestion` (header `Chrome`): **Open the settings page** (run
     `open -a "Google Chrome" "chrome://inspect/#remote-debugging"`, wait for the user to turn the
     toggle on and say continue, then run `check-chrome` again) / **It's already on** (run it again) /
     **Cancel** (stop). In Russian: **Открыть настройки** / **Уже включено** / **Отмена**.
   - **`no-access`:** macOS blocks the file: whatever it holds responsible for Claude's commands has
     no Full Disk Access. macOS has no permission prompt for it. What to offer depends on `host.kind`:
     - **`terminal`** (or `unknown`): ask (header `Access`, in Russian `Доступ`):
       **Open System Settings (Recommended)**: run
       `open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"`, then say:
       switch on **<host.app>** (if it's missing, click +, press Cmd-Shift-G and paste
       `<host.appPath>`), then quit <host.app> completely with Cmd-Q (macOS's **Quit & Reopen** does
       the same), reopen it, start `claude` and type `/maps-lists:run`: the plan is saved and it
       picks up here. A reload or a new tab isn't enough. Stop. /
       **Use a separate Chrome window** (below) / **Cancel** (stop; the plan stays).
     - **`desktop`** (the Claude desktop app's Code tab): macOS checks the Claude Code copy inside
       the app, not "Claude", and that copy's folder changes with every Claude Code update. If
       `readyBefore` is set, say first that Claude Code was updated, so macOS needs the new copy
       added. Ask (header `Chrome`):
       **Separate Chrome window (Recommended)**: sign into Google once, then it keeps working
       through updates (below). /
       **Use my normal Chrome**: run the `open "x-apple.systempreferences:…"` command above, then
       say: click +, press Cmd-Shift-G, paste this path and click Open, then quit Claude with Cmd-Q,
       reopen it, start a new Code session and type `/maps-lists:run`. Give `<host.appPath>` on a
       line of its own so it's easy to copy. Add that this has to be redone after Claude Code
       updates, and that switching on "Claude" in the list isn't enough. Stop. /
       **Run this step from Terminal**: give the full command
       `"${CLAUDE_PLUGIN_ROOT}/bin/maps-lists" apply plan.json --cdp auto` (Terminal needs Full
       Disk Access too) and say `/maps-lists:run --report` reads the result afterwards. Stop. /
       **Cancel**.
     - **`editor`** (VS Code and the like): editors can't get it. Offer **Use a separate Chrome
       window** / **Cancel**, and mention the Terminal app as the other way.

   **Use a separate Chrome window** (when chosen): run `maps-lists check-chrome --set separate`
   (remembered from now on), then `maps-lists chrome` with Bash, `run_in_background: true`. Say a
   new Chrome window opened just for maps-lists and it isn't signed in yet: sign into the Google
   account the list should go to (the first time it opens on Google's sign-in page; otherwise click
   **Sign in** at the top right of Google Maps in that window). This is needed once; the window
   remembers it. Lists show up everywhere as usual. Then say continue. Run `check-chrome` again.

   **`mode: "separate"`** (remembered from an earlier run):
   - **`ready`:** step 3 without `--cdp auto`.
   - **`not-running`:** say you're opening the maps-lists Chrome window, run `maps-lists chrome`
     (`run_in_background: true`), wait a few seconds, and check again; after three tries, report it.
   - If the user asks to use their normal Chrome again, run `maps-lists check-chrome --set main`
     and start step 2 over.
3. **Run.** In main mode, tell the user to click **Allow** in Chrome when it asks (in Russian:
   «Когда Chrome спросит, нажмите **Allow** (Разрешить)»; the button may be in Chrome's own
   language); the separate window doesn't ask. Then run with Bash, with `timeout: 600000`:
   `maps-lists apply plan.json` (+ `--cdp auto` in main mode)

   Use the plan path given in place of `plan.json`, and add `--account <email>` if it was given.
   Expect about 5–10 s per place. In main mode, say once that Chrome opens a tab of its own for this,
   to leave it alone, and that it closes when done (the executor never touches the user's tabs). In
   the separate window it works in the tab that's already open and leaves it on the finished list.
   - **`EPERM` on `DevToolsActivePort`:** run `maps-lists check-chrome` and follow its
     `no-access` branch above.
   - **`NOT_SIGNED_IN`:** nothing was written. The Chrome window it used isn't signed into Google:
     in the separate window, say to click **Sign in** at the top right of Google Maps there and
     sign into the account the list should go to; in main mode, to sign into Chrome's Google Maps.
     When they say continue, run the same command again.
4. **Report** from `artifacts/report.json`. It's an array with one entry per list. Write it as
   Markdown (not inside a code block), one block per list, in this shape, leaving out empty parts:

   > ## ✅ Saved — zz-test · new list
   >
   > | Added | Already in list | Notes written | Not found | Failed |
   > |:-----:|:-----:|:-----:|:-----:|:-----:|
   > | 10 | 0 | 10 | 1 | 0 |
   >
   > **Verify:** ✅ every place and note found after a hard reload
   > **Not found:** El Granjero (no match on Maps)
   > 📍 [Open zz-test in Google Maps](<the list's url from .gmaps-state.json>)

   - Heading icon: ✅ everything verified · ⚠️ verify found something
     missing, or places weren't found · ❌ failed places or the run stopped. Heading text:
     `Saved` (`Сохранено`), the list name, `new list` / `existing list` (`created`).
   - Table columns ← report fields: Added ← `added`, Already in list ←
     `alreadyPresent`, Notes written ← `notesWritten`, Not found ←
     `unresolved` (closed places count here), Failed ← `failed`.
   - Then one bold-labelled line each, only when there's something to say: **Verify:** (apply
     ✅ … or ⚠️ missing `<names>` / notes missing `<names>`), **Not found:** and
     **Failed:** with `name (reason)` comma-separated (a bullet list when more than 5),
     **Warnings:**.
   - 📍 link: the list's `url` in `.gmaps-state.json` in the data folder, when it has one.
   - In another language, translate the labels (in Russian: Сохранено, новый
     список / существующий, Добавлено, Уже в списке, Заметок, Не найдено, Ошибки, Проверка,
     Предупреждения, «Открыть в Google Картах»).
   Place names stay as the report has them; translate the reasons and warnings.
   Exit code 2 means verification found missing places or notes. For a failure, read the
   matching `artifacts/*-fail-*.yaml` to give the reason in a few words. Never paste the yaml:
   it contains the account email.
   - If several places failed with "Page crashed", say the Chrome tab crashed (not the places).
   - List whatever `verify` found missing and offer to retry just those, with a
     plan containing only those places (`plan.retry.json`, same list name; places already saved
     are skipped anyway).
   - **Clean up only after a fully verified apply** (`verify.ok` for every list): run
     `maps-lists clean` and add its last line to the report after 🧹 ("🧹 Cleaned 14 items; kept
     research/….places.md"). Never clean after a dry run or a failed apply: the retry and the
     failure artifacts need those files. End those reports with "Say 'clean up maps-lists' when
     you're done." (in Russian: «Когда закончите, скажите "очисти maps-lists".»)

## New list vs. update

For an update (the list already exists), each place's own Save-dialog checkbox decides whether it's
already in the list, new places are added, and new notes are appended (` · `, never overwritten).
Places removed from the source file are **not** removed from Maps. With `ordered: true`, ranking is
exact only for a list the executor creates.

## Rules

- Never run `apply` unless the user picked Save to Maps in step 1, or `--apply`/`--yes` was
  given. Without them, step 1's question is always asked.
- Never delete places or lists and never change sharing. The executor has no code path for either.
- Single-quote Maps URLs in zsh (`!` triggers history expansion inside double quotes).
- Never print the contents of `DevToolsActivePort` and never paste `artifacts/*.yaml`.
- Selectors live only in `${CLAUDE_PLUGIN_ROOT}/src/selectors.ts`. If a run fails because Maps changed, say so and
  suggest `maps-lists probe`. Don't try to fix it here.
