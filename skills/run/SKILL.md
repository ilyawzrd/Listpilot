---
name: run
description: Use when a validated plan.json is ready (usually handed over by maps-lists:import) and the user wants it dry-run or applied to Google Maps through their Chrome, or wants the last run's report. Runs the executor and reports; makes no judgment calls.
argument-hint: [plan.json] [--yes] [--account <email>] [--report] [--lang <tag>]
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
- **`--yes`:** after a dry run, apply without asking again.
- **`--account <email>`:** add it to every `maps-lists dry` / `maps-lists apply` command.
- **`--lang <tag>`:** the conversation language. Talk to the user in it and use it for every
  question and the report; Russian strings are given below, translate the English ones for any other
  language. Without it, use the language the user writes in. **Never pass this
  `--lang` to `maps-lists dry` / `maps-lists apply`:** their own `--lang` is the Maps UI language and
  stays at its default (`auto`).
- **`--report`:** skip to step 4. Read the last `artifacts/report.json` and report it (e.g. after
  the user ran the command in their own terminal).

## Flow

1. **Show the summary.** Print `artifacts/plan-summary.md` (written by `maps-lists:import`) to the
   user as is. If it's missing, read the plan and print the list name and the number of places instead.
   Then ask with `AskUserQuestion` (header `Mode`), in this order:
   - **Apply (Recommended)**, for new and existing lists alike: creates or updates the list, saves
     places, appends notes, then hard-reloads and verifies. `apply` checks each place's own
     Save-dialog checkbox, skips closed and unresolved places, and never saves a place twice.
     Nothing is ever deleted, but a wrong place has to be removed by hand.
   - **Dry run:** optional. Opens every place in Chrome and reads its Save dialog to show what's
     new and what's already in the list. Writes nothing.
   - **Stop:** leaves the plan for later.

   In Russian: header `Режим`; **Применить (рекомендуется)** / **Пробный прогон** / **Стоп**, with
   the descriptions above translated.
2. **Check Chrome's remote debugging.** Skip this if the user runs a dedicated profile
   (`maps-lists chrome`, no `--cdp auto`). Run exactly
   `ls "$HOME/Library/Application Support/Google/Chrome/DevToolsActivePort" 2>&1`. Never `cat`
   this file, because it grants control of the browser. Read only the result:
   - **A path is printed:** go on.
   - **`No such file or directory`:** the toggle is off. Ask with `AskUserQuestion` (header `Chrome`):
     **Open the settings page** (run `open -a "Google Chrome" "chrome://inspect/#remote-debugging"`,
     wait for the user to turn the toggle on and say continue, then check once more) /
     **It's already on** (go on) / **Cancel** (stop). In Russian: header `Chrome`;
     **Открыть настройки** / **Уже включено** / **Отмена**.
   - **`Operation not permitted`:** the app Claude runs in has no Full Disk Access, which
     `--cdp auto` needs to read that file. macOS has no permission prompt for it, so walk the user
     through it. Find the app with `echo "$TERM_PROGRAM"` (`Apple_Terminal` → Terminal,
     `iTerm.app` → iTerm, `ghostty` → Ghostty, `WarpTerminal` → Warp, `vscode` → VS Code: tell
     them to use the Terminal app instead, since editors can't get it). Ask with `AskUserQuestion`
     (header `Access`, in Russian `Доступ`):
     - **Open System Settings** (`Открыть настройки`): run
       `open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"`, then
       say: switch on <app> in the list (+ to add it if it's missing); macOS then offers
       **Quit & Reopen**. After reopening, start `claude` and type `/maps-lists:run`: the plan is
       saved and it picks up here (in Russian: «включите <app> в списке (если его нет, добавьте
       через +); macOS предложит **Quit & Reopen**. Затем запустите `claude` и введите
       `/maps-lists:run`: план сохранён, продолжим отсюда»). Stop.
     - **Use a separate Chrome window** (`Отдельное окно Chrome`): no Full Disk Access needed, but
       the user signs into Google there once. Run `maps-lists chrome` with Bash
       (`run_in_background: true`), ask them to sign in and say continue, then go to step 3
       without `--cdp auto`.
     - **Cancel** (`Отмена`): stop; the plan stays for `/maps-lists:run`.
3. **Run.** Tell the user to click **Allow** in Chrome when it asks (in Russian: «Когда Chrome
   спросит, нажмите **Allow** (Разрешить)»; the button may be in Chrome's own language). Then run with Bash,
   with `timeout: 600000`:
   - Dry run: `maps-lists dry plan.json --cdp auto`
   - Apply: `maps-lists apply plan.json --cdp auto`

   Use the plan path given in place of `plan.json`, and add `--account <email>` if it was given.
   Expect about 5–10 s per place.
   - **`EPERM` on `DevToolsActivePort`:** no Full Disk Access after all. Offer step 2's
     `Operation not permitted` options, or give the user the exact command to run in a terminal that has it, with the full
     path, since `maps-lists` is only on PATH inside Claude: `"${CLAUDE_PLUGIN_ROOT}/bin/maps-lists" apply plan.json --cdp auto`. Tell them that
     once it's done, `/maps-lists:run --report` reads the result. Stop.
4. **Report** from `artifacts/report.json`. It's an array with one entry per list. Use this
   template per list, leaving out empty lines:
   ```
   <Dry run | Apply> — <list>  (created: yes/no)
   Added: N                     (dry run: would add N)   ← added
   Already in list: N                                     ← alreadyPresent
   Notes written: N                                       ← notesWritten
   Unresolved: N — <name: reason>                         ← unresolved (closed places are here too)
   Failed: N — <name: reason>                             ← failed
   Verify: ok | missing <names> | notes missing <names>   ← verify (apply only)
   Warnings: <warnings>
   ```
   In another language, the same template with translated labels; in Russian:
   ```
   <Пробный прогон | Применение> — <list>  (создан: да/нет)
   Добавлено: N                 (пробный прогон: будет добавлено N)
   Уже в списке: N
   Заметок записано: N
   Не найдено: N — <name: reason>
   Ошибки: N — <name: reason>
   Проверка: ок | нет мест <names> | нет заметок <names>
   Предупреждения: <warnings>
   ```
   Place names stay as the report has them; translate the reasons and warnings.
   Exit code 2 means verification found missing places or notes. For a failure, read the
   matching `artifacts/*-fail-*.yaml` to give the reason in a few words. Never paste the yaml:
   it contains the account email.
   - **After a dry run:** remove the places reported as permanently closed from the plan and say
     which ones. If several places failed with "Page crashed", say the Chrome tab crashed (not the
     places) and keep them in the plan. Then, unless `--yes` was given, ask with `AskUserQuestion`
     (header `Next`): **Apply now** / **Stop** (Stop leaves the plan for a later
     `maps-lists apply`). In Russian: header `Дальше`; **Применить сейчас** / **Стоп**. With `--yes`, go straight to step 3 with Apply.
   - **After apply:** list whatever `verify` found missing and offer to retry just those, with a
     plan containing only those places (`plan.retry.json`, same list name; places already saved
     are skipped anyway).
   - **Clean up only after a fully verified apply** (`verify.ok` for every list): run
     `maps-lists clean` and add its last line to the report ("Cleaned 14 items; kept
     research/….places.md"). Never clean after a dry run or a failed apply: the retry and the
     failure artifacts need those files. End those reports with "Run `maps-lists clean` when you're
     done." (in Russian: «Когда закончите, запустите `maps-lists clean`.»)

## New list vs. update

For an update (the list already exists), each place's own Save-dialog checkbox decides whether it's
already in the list, new places are added, and new notes are appended (` · `, never overwritten).
Places removed from the source file are **not** removed from Maps. With `ordered: true`, ranking is
exact only for a list the executor creates.

## Rules

- Never run `apply` unless the user picked Apply (step 1 or 4) or passed `--yes`, and `--yes` only
  skips the question after a dry run. Step 1's question is always asked.
- Never delete places or lists and never change sharing. The executor has no code path for either.
- Single-quote Maps URLs in zsh (`!` triggers history expansion inside double quotes).
- Never print the contents of `DevToolsActivePort` and never paste `artifacts/*.yaml`.
- Selectors live only in `${CLAUDE_PLUGIN_ROOT}/src/selectors.ts`. If a run fails because Maps changed, say so and
  suggest `maps-lists probe`. Don't try to fix it here.
