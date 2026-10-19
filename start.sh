#!/usr/bin/env bash
# One command from question to Google Maps list. Asks the language (English or Russian) and what you
# want (research, or an .md file you already have), checks the setup, then opens Claude Code on the
# matching skill.
#
#   ./start.sh        (or: npm start)
set -euo pipefail
ORIG_PWD=$PWD # relative .md paths are relative to where you ran this, not to the repo
cd "$(dirname "$0")"
# Cyrillic answers: ${#list} counts letters and [[:upper:]] matches "Москва" only in a UTF-8 locale.
[[ "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" == *[Uu][Tt][Ff]* ]] || export LC_ALL=C.UTF-8

bold=$'\e[1m'; dim=$'\e[2m'; red=$'\e[31m'; yellow=$'\e[33m'; off=$'\e[0m'
fail() { printf '%s✗ %s%s\n  %s\n' "$red" "$1" "$off" "$2" >&2; exit 1; }
warn() { printf '%s! %s%s\n' "$yellow" "$1" "$off"; }

# ── preflight ────────────────────────────────────────────────────────────────
command -v claude >/dev/null ||
  fail "Claude Code isn't installed (no 'claude' on PATH)." \
       "Install it from https://claude.com/claude-code, run 'claude' once to log in, then rerun ./start.sh."
command -v node >/dev/null ||
  fail "Node.js isn't installed." "Install Node 18 or newer from https://nodejs.org, then rerun ./start.sh."
node_major=$(node -p 'process.versions.node.split(".")[0]')
(( node_major >= 18 )) ||
  fail "Node $(node -v) is too old." "Install Node 18 or newer from https://nodejs.org, then rerun ./start.sh."
if [[ ! -d node_modules ]]; then
  echo "Installing dependencies (first run)…"
  npm install --silent || fail "npm install failed." "Run 'npm install' here and fix the error it shows."
fi
[[ "$(uname)" == Darwin ]] || warn "Made for macOS. Elsewhere, open the review page link yourself; Chrome setup differs."
[[ "$(uname)" != Darwin || -d "/Applications/Google Chrome.app" ]] ||
  warn "Google Chrome not found in /Applications. The Maps step drives Chrome, so install it before then."

# ── language ─────────────────────────────────────────────────────────────────
cat <<EOF

${bold}listpilot${off}
  1) English
  2) Русский

EOF
ui=""
while [[ "$ui" != 1 && "$ui" != 2 ]]; do
  read -r -p "Language / Язык ${dim}[1]${off}: " ui || exit 1
  ui=${ui:-1}
done
[[ $ui == 2 ]] && ui=ru || ui=en
lang_arg=""; [[ $ui == ru ]] && lang_arg=" --lang ru"

# ── helpers ──────────────────────────────────────────────────────────────────
t() { # t <english> <russian>: the string for the chosen language
  if [[ $ui == ru ]]; then printf '%s' "$2"; else printf '%s' "$1"; fi
}

ask() { # ask <prompt> <var> [default]: repeats until non-empty
  local answer=""
  while [[ -z "$answer" ]]; do
    read -r -p "$1${3:+ ${dim}[$3]${off}}: " answer || exit 1
    answer=${answer:-${3:-}}
  done
  printf -v "$2" '%s' "$answer"
}

# Maps cuts list names over 40 characters (MAX_LIST_NAME in src/plan.ts), and the executor then
# can't find the list it created. Double quotes would break the skill's "List name" argument.
ask_list() { # ask_list <prompt> [default] [optional]: sets $list
  local def=${2:-}
  (( ${#def} <= 40 )) || def=""
  while :; do
    if [[ -n "${3:-}" ]]; then
      read -r -p "$1${def:+ ${dim}[$def]${off}}: " list || exit 1
      list=${list:-$def}
    else
      ask "$1" list "$def"
    fi
    list=${list//\"/}
    (( ${#list} <= 40 )) && return
    t "  That's ${#list} characters; Maps allows 40. Try a shorter one." \
      "  Длина ${#list}, а Google Карты допускают до 40 символов. Попробуйте короче."
    echo
    def=""
  done
}

next_steps() { # next_steps <research|md>
  echo
  local n=1
  if [[ $ui == ru ]]; then
    echo "${bold}Что дальше${off}"
    if [[ $1 == research ]]; then
      echo "  $((n++)). Claude ищет «${what}» (${where})$([[ -n "$quick" ]] && echo ", быстрый проход" || echo ", несколько минут")."
      echo "  $((n++)). В браузере откроется страница проверки: снимите лишние галочки, поправьте заметки, нажмите «Продолжить»."
    else
      echo "  $((n++)). Claude читает ${md_path##*/} и выбирает места и заметки к ним."
      echo "  $((n++)). В браузере откроется страница проверки: снимите лишние галочки, поправьте заметки, нажмите «Продолжить»."
    fi
    echo "  $((n++)). Claude находит каждое место в Google Картах и показывает, что нашёл."
    echo "  $((n++)). Шаг с Картами: Claude проверяет, включена ли удалённая отладка Chrome. Если нет, Claude"
    echo "     откроет chrome://inspect/#remote-debugging: включите переключатель и скажите Claude продолжать."
    echo "     Затем Chrome спросит разрешение на подключение: нажмите ${bold}Allow${off} (Разрешить)."
    echo "  $((n++)). Вы выбираете «Применить» или «Пробный прогон». До этого в ${list:+«${list}»}${list:-список} ничего не записывается."
    echo "  ${dim}Запускайте из терминала с полным доступом к диску (Full Disk Access), чтобы Claude мог подключиться к Chrome.${off}"
    echo
    read -r -p "Нажмите Enter, чтобы начать (Ctrl-C — отмена)… " _ || exit 1
    return
  fi
  echo "${bold}What happens next${off}"
  if [[ $1 == research ]]; then
    echo "  $((n++)). Claude researches \"${what}\" in ${where}$([[ -n "$quick" ]] && echo " (quick pass)" || echo " (several minutes)")."
    echo "  $((n++)). A review page opens in your browser: untick places, edit notes, press Continue."
  else
    echo "  $((n++)). Claude reads ${md_path##*/} and picks out the places and their notes."
    echo "  $((n++)). A review page opens in your browser: untick places, edit notes, press Continue."
  fi
  echo "  $((n++)). Claude looks each place up on Google Maps and shows what it found."
  echo "  $((n++)). Maps step: Claude checks that Chrome's remote debugging is on. If it's off, Claude opens"
  echo "     chrome://inspect/#remote-debugging for you: switch the toggle on and tell Claude to continue."
  echo "     Chrome then asks to allow the connection: click ${bold}Allow${off}."
  echo "  $((n++)). You choose Apply or Dry run. Nothing is written to ${list:+\"$list\"}${list:-the list} before that."
  echo "  ${dim}Run this from a terminal with Full Disk Access, so Claude can connect to Chrome.${off}"
  echo
  read -r -p "Press Enter to start (Ctrl-C to cancel)… " _ || exit 1
}

# ── mode ─────────────────────────────────────────────────────────────────────
if [[ $ui == ru ]]; then
  cat <<EOF

${bold}listpilot${off}: места в список Google Карт, с заметками.

  1) Найти места для меня       ${dim}(Claude ищет в местной прессе, гидах, Telegram и Reddit)${off}
  2) Взять мой .md-файл         ${dim}(отчёт, ответ из чата, список)${off}

EOF
else
  cat <<EOF

${bold}listpilot${off}: put places on a Google Maps list, with notes.

  1) Research places for me   ${dim}(Claude searches local press, guides, Telegram and Reddit)${off}
  2) Use an .md file I already have   ${dim}(a research report, a chat answer, a list)${off}

EOF
fi
mode=""
while [[ "$mode" != 1 && "$mode" != 2 ]]; do
  read -r -p "$(t "Choose 1 or 2" "Выберите 1 или 2") ${dim}[1]${off}: " mode || exit 1
  mode=${mode:-1}
done

# ── 2) existing .md ──────────────────────────────────────────────────────────
if [[ $mode == 2 ]]; then
  if [[ $ui == ru ]]; then
    cat <<EOF

${bold}Будет 2 вопроса:${off}
  1. Путь к .md-файлу.               ${dim}напр. ~/Downloads/lisbon.md (можно перетащить файл в это окно)${off}
  2. Название списка, необязательно. ${dim}напр. Еда Лиссабона. Enter — заголовок файла. До 40 символов;${off}
                                     ${dim}существующее название обновит этот список.${off}

EOF
  else
    cat <<EOF

${bold}You'll answer 2 questions:${off}
  1. Path to the .md file.          ${dim}e.g. ~/Downloads/lisbon.md (you can drag the file into this window)${off}
  2. List name, optional.           ${dim}e.g. Lisbon Eats. Enter uses the file's title. Max 40 characters;${off}
                                    ${dim}an existing name updates that list.${off}

EOF
  fi
  while :; do
    ask "$(t "1/2 Path to the .md file" "1/2 Путь к .md-файлу")" md_path
    md_path=${md_path%"${md_path##*[![:space:]]}"}                   # trailing spaces from drag and drop
    [[ $md_path == \'*\' || $md_path == \"*\" ]] && md_path=${md_path:1:${#md_path}-2}
    md_path=${md_path//\\ / }                                         # Finder's escaped spaces
    md_path=${md_path/#\~/$HOME}
    [[ $md_path == /* ]] || md_path="$ORIG_PWD/$md_path"
    if [[ ! -f "$md_path" ]]; then echo "  $(t "No file at" "Нет файла:") $md_path"; continue; fi
    if [[ $md_path != *.md ]]; then echo "  $(t "That's not an .md file." "Это не .md-файл.")"; continue; fi
    break
  done
  ask_list "$(t "2/2 List name (Enter = the file's title)" "2/2 Название списка (Enter — заголовок файла)")" "" optional
  next_steps md
  exec claude --model sonnet --effort medium "/listpilot-apply \"${md_path}\"${list:+ \"$list\"}${lang_arg}"
fi

# ── 1) research ──────────────────────────────────────────────────────────────
if [[ $ui == ru ]]; then
  cat <<EOF

${bold}Будет 5 вопросов:${off}
  1. Что: тип заведения и всё, что для вас важно, но без города.
       ${dim}напр. натуральные винные бары с едой, допоздна${off}
       ${dim}      недорогие вегетарианские обеды, где едят местные, до €15${off}
  2. Где: город или район + город.               ${dim}напр. Лиссабон · Патриаршие, Москва${off}
  3. Название списка в Google Картах: новый      ${dim}напр. Пекарни Лиссабона (до 40 символов;${off}
     или существующий.                           ${dim}существующее название обновит этот список)${off}
  4. Глубина: глубоко (несколько минут, больше мест) или быстро.
  5. Модель: opus (лучший поиск) или sonnet (дешевле).
  ${dim}Туристические ловушки, вирусные места из TikTok и закрытые места отсеиваются в любом случае.${off}

EOF
else
  cat <<EOF

${bold}You'll answer 5 questions:${off}
  1. What: the kind of place, plus anything that matters to you, but no city.
       ${dim}e.g. natural wine bars with food, open late${off}
       ${dim}     cheap vegetarian lunch spots locals use, under €15${off}
  2. Where: city, or neighbourhood + city.        ${dim}e.g. Lisbon · Gràcia, Barcelona${off}
  3. List name: the Google Maps list to create    ${dim}e.g. Lisbon Bakeries (max 40 characters;${off}
     or add to.                                   ${dim}an existing name updates that list)${off}
  4. Depth: deep (several minutes, more places) or quick.
  5. Model: opus (best research) or sonnet (cheaper).
  ${dim}Tourist traps, viral TikTok spots and closed places are filtered out either way.${off}

EOF
fi
ask "$(t "1/5 What (kind of place + preferences, no city) ${dim}[e.g. natural wine bars with food, open late]${off}" \
         "1/5 Что (тип заведения + пожелания, без города) ${dim}[напр. натуральные винные бары с едой, допоздна]${off}")" what

# Soft check: "bakeries in Lisbon", "пекарни в Лиссабоне" or "lunch spots, Gràcia" probably carries the place.
where_guess=""
if [[ $what =~ ^(.*[^[:space:]])[[:space:]]+in[[:space:]]+([[:upper:]].*)$ ]] ||
   [[ $what =~ ^(.*[^[:space:]])[[:space:]]+(в|во)[[:space:]]+([[:upper:]].*)$ ]] ||
   [[ $what =~ ^(.*[^[:space:],]),[[:space:]]*([[:upper:]][^,]*)$ ]]; then
  # The next [[ ]] resets BASH_REMATCH; the в|во group shifts the place to index 3.
  what_part=${BASH_REMATCH[1]}; place_part=${BASH_REMATCH[${#BASH_REMATCH[@]}-1]}
  read -r -p "  $(t "That looks like it includes a place. Put \"${place_part}\" under Where instead?" \
                   "Похоже, тут есть место. Перенести «${place_part}» в вопрос «Где»?") ${dim}$(t "[Y/n]" "[Д/н]")${off} " yn || exit 1
  if [[ $yn != [nNнН]* ]]; then where_guess=$place_part; what=$what_part; fi
fi

ask "$(t "2/5 Where (city, or neighbourhood + city) ${dim}[e.g. Gràcia, Barcelona]${off}" \
         "2/5 Где (город или район + город) ${dim}[напр. Патриаршие, Москва]${off}")" where "$where_guess"

# Default name: the first part of Where + the first few words of What (before any comma).
what_short=$(printf '%s' "${what%%,*}" | awk '{ for (i = 1; i <= NF && i <= 4; i++) printf "%s%s", (i > 1 ? " " : ""), $i }')
ask_list "$(t "3/5 Google Maps list name (new or existing)" "3/5 Название списка в Google Картах (новый или существующий)")" \
  "${where%%,*} ${what_short}"

# English letters work in both languages; Russian ones too (б = быстро, с = sonnet).
read -r -p "$(t "4/5 Depth: deep (several minutes, more places) or quick?" \
                "4/5 Глубина: глубоко/deep (несколько минут, больше мест) или быстро/quick?") ${dim}$(t "[deep]" "[глубоко]")${off} " depth || exit 1
quick=""; [[ $depth == [qQбБ]* ]] && quick=" --quick"

read -r -p "$(t "5/5 Model: opus (best research) or sonnet (cheaper)?" \
                "5/5 Модель: opus (лучший поиск) или sonnet (дешевле)?") ${dim}[opus]${off} " model || exit 1
[[ $model == [sSсС]* ]] && model=sonnet || model=opus

next_steps research
# One argv element: the shell doesn't re-parse expanded user input, so quotes or $ in answers are inert.
exec claude --model "$model" --effort medium \
  "/listpilot-research ${what} $(t in в) ${where}. \"${list}\"${quick}${lang_arg}"
