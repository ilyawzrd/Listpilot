---
name: listpilot-run
description: Use when a validated plan.json is ready (usually handed over by listpilot-apply) and the user wants it dry-run or applied to Google Maps through their Chrome, or wants the last run's report. Runs the executor and reports; makes no judgment calls.
argument-hint: [plan.json] [--yes] [--account <email>] [--report] [--lang ru]
model: haiku
effort: medium
---

# Run plan.json against Google Maps

This skill only runs commands, asks fixed questions and reports. The places were already chosen
and resolved by `listpilot-apply`. Don't change the plan beyond what step 4 says, don't re-resolve
places, and don't guess. When something looks wrong, report it and stop.

## Input

`$ARGUMENTS`:

- **Plan path:** defaults to `plan.json` in the repo root.
- **`--yes`:** after a dry run, apply without asking again.
- **`--account <email>`:** add it to every `npm run dry` / `npm run apply` command.
- **`--lang ru`:** talk to the user in Russian and use the Russian strings given below for every
  question and the report. Without it, use the language the user writes in. **Never pass this
  `--lang` to `npm run dry` / `npm run apply`:** their own `--lang` is the Maps UI language and
  stays at its default (`auto`).
- **`--report`:** skip to step 4. Read the last `artifacts/report.json` and report it (e.g. after
  the user ran the command in their own terminal).

## Flow

1. **Show the summary.** Print `artifacts/plan-summary.md` (written by `listpilot-apply`) to the
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
   (`npm run chrome`, no `--cdp auto`). Run exactly
   `ls "$HOME/Library/Application Support/Google/Chrome/DevToolsActivePort" 2>&1`. Never `cat`
   this file, because it grants control of the browser. Read only the result:
   - **A path is printed:** go on.
   - **`No such file or directory`:** the toggle is off. Ask with `AskUserQuestion` (header `Chrome`):
     **Open the settings page** (run `open -a "Google Chrome" "chrome://inspect/#remote-debugging"`,
     wait for the user to turn the toggle on and say continue, then check once more) /
     **It's already on** (go on) / **Cancel** (stop). In Russian: header `Chrome`;
     **Открыть настройки** / **Уже включено** / **Отмена**.
   - **`Operation not permitted`:** no Full Disk Access. Go on; step 3 handles it.
3. **Run.** Tell the user to click **Allow** in Chrome when it asks (in Russian: «Когда Chrome
   спросит, нажмите **Allow** (Разрешить)»; the button may be in Chrome's own language). Then run from the repo root with Bash,
   with `timeout: 600000`:
   - Dry run: `npm run dry -- plan.json --cdp auto`
   - Apply: `npm run apply -- plan.json --cdp auto`

   Use the plan path given in place of `plan.json`, and add `--account <email>` if it was given.
   Expect about 5–10 s per place.
   - **`EPERM` on `DevToolsActivePort`:** this terminal (or VS Code) has no Full Disk Access.
     Say so and give the user the exact command to run in a terminal that has it. Tell them that
     once it's done, `/listpilot-run --report` reads the result. Stop.
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
   In Russian, the same template with these labels:
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
     `npm run apply`). In Russian: header `Дальше`; **Применить сейчас** / **Стоп**. With `--yes`, go straight to step 3 with Apply.
   - **After apply:** list whatever `verify` found missing and offer to retry just those, with a
     plan containing only those places (`plan.retry.json`, same list name; places already saved
     are skipped anyway).
   - **Clean up only after a fully verified apply** (`verify.ok` for every list): run
     `npm run -s clean` and add its last line to the report ("Cleaned 14 items; kept
     research/….places.md"). Never clean after a dry run or a failed apply: the retry and the
     failure artifacts need those files. End those reports with "Run `npm run clean` when you're
     done." (in Russian: «Когда закончите, запустите `npm run clean`.»)

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
- Selectors live only in `src/selectors.ts`. If a run fails because Maps changed, say so and
  suggest `npm run probe`. Don't try to fix it here.
