#!/usr/bin/env bash
# One command from question to Google Maps list. Asks what you want (research, or an .md file you
# already have), checks the setup, then opens Claude Code on the matching skill.
#
#   ./start.sh        (or: npm start)
set -euo pipefail
ORIG_PWD=$PWD # relative .md paths are relative to where you ran this, not to the repo
cd "$(dirname "$0")"

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

# ── helpers ──────────────────────────────────────────────────────────────────
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
    echo "  That's ${#list} characters; Maps allows 40. Try a shorter one."
    def=""
  done
}

next_steps() { # next_steps <research|md>
  echo
  echo "${bold}What happens next${off}"
  local n=1
  if [[ $1 == research ]]; then
    echo "  $((n++)). Claude researches \"${what}\" in ${where}$([[ -n "$quick" ]] && echo " (quick pass)" || echo " (several minutes)")."
    echo "  $((n++)). A review page opens in your browser: untick places, edit notes, press Continue."
  else
    echo "  $((n++)). Claude reads ${md_path##*/} and picks out the places and their notes."
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
cat <<EOF

${bold}listpilot${off}: put places on a Google Maps list, with notes.

  1) Research places for me   ${dim}(Claude searches local press, guides and Reddit)${off}
  2) Use an .md file I already have   ${dim}(a research report, a chat answer, a list)${off}

EOF
mode=""
while [[ "$mode" != 1 && "$mode" != 2 ]]; do
  read -r -p "Choose 1 or 2 ${dim}[1]${off}: " mode || exit 1
  mode=${mode:-1}
done

# ── 2) existing .md ──────────────────────────────────────────────────────────
if [[ $mode == 2 ]]; then
  cat <<EOF

${bold}You'll answer 2 questions:${off}
  1. Path to the .md file.          ${dim}e.g. ~/Downloads/lisbon.md (you can drag the file into this window)${off}
  2. List name, optional.           ${dim}e.g. Lisbon Eats. Enter uses the file's title. Max 40 characters;${off}
                                    ${dim}an existing name updates that list.${off}

EOF
  while :; do
    ask "1/2 Path to the .md file" md_path
    md_path=${md_path%"${md_path##*[![:space:]]}"}                   # trailing spaces from drag and drop
    [[ $md_path == \'*\' || $md_path == \"*\" ]] && md_path=${md_path:1:${#md_path}-2}
    md_path=${md_path//\\ / }                                         # Finder's escaped spaces
    md_path=${md_path/#\~/$HOME}
    [[ $md_path == /* ]] || md_path="$ORIG_PWD/$md_path"
    if [[ ! -f "$md_path" ]]; then echo "  No file at $md_path"; continue; fi
    if [[ $md_path != *.md ]]; then echo "  That's not an .md file."; continue; fi
    break
  done
  ask_list "2/2 List name (Enter = the file's title)" "" optional
  next_steps md
  exec claude --model sonnet --effort medium "/listpilot-apply \"${md_path}\"${list:+ \"$list\"}"
fi

# ── 1) research ──────────────────────────────────────────────────────────────
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
ask "1/5 What (kind of place + preferences, no city) ${dim}[e.g. natural wine bars with food, open late]${off}" what

# Soft check: "bakeries in Lisbon" or "lunch spots, Gràcia" probably carries the place.
where_guess=""
if [[ $what =~ ^(.*[^[:space:]])[[:space:]]+in[[:space:]]+([[:upper:]].*)$ ]] ||
   [[ $what =~ ^(.*[^[:space:],]),[[:space:]]*([[:upper:]][^,]*)$ ]]; then
  what_part=${BASH_REMATCH[1]}; place_part=${BASH_REMATCH[2]} # the next [[ ]] resets BASH_REMATCH
  read -r -p "  That looks like it includes a place. Put \"${place_part}\" under Where instead? ${dim}[Y/n]${off} " yn || exit 1
  if [[ $yn != [nN]* ]]; then where_guess=$place_part; what=$what_part; fi
fi

ask "2/5 Where (city, or neighbourhood + city) ${dim}[e.g. Gràcia, Barcelona]${off}" where "$where_guess"

# Default name: the first part of Where + the first few words of What (before any comma).
what_short=$(printf '%s' "${what%%,*}" | awk '{ for (i = 1; i <= NF && i <= 4; i++) printf "%s%s", (i > 1 ? " " : ""), $i }')
ask_list "3/5 Google Maps list name (new or existing)" "${where%%,*} ${what_short}"

read -r -p "4/5 Depth: deep (several minutes, more places) or quick? ${dim}[deep]${off} " depth || exit 1
quick=""; [[ $depth == [qQ]* ]] && quick=" --quick"

read -r -p "5/5 Model: opus (best research) or sonnet (cheaper)? ${dim}[opus]${off} " model || exit 1
[[ $model == [sS]* ]] && model=sonnet || model=opus

next_steps research
# One argv element: the shell doesn't re-parse expanded user input, so quotes or $ in answers are inert.
exec claude --model "$model" --effort medium "/listpilot-research ${what} in ${where}. \"${list}\"${quick}"
