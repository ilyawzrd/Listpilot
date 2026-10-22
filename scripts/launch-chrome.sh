#!/usr/bin/env bash
# Starts a SEPARATE Chrome profile with CDP on localhost:9333. Not 9222: the chrome://inspect toggle
# in your main Chrome takes 127.0.0.1:9222, and a second Chrome on that port only gets [::1] and is
# unreachable at 127.0.0.1.
#
# Why a separate profile: since Chrome 136, --remote-debugging-port is ignored for the default
# profile (a security change), and keeping your everyday Chrome off an open debug port is safer
# anyway. Sign into Google once in the window this opens; the profile remembers it.
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="${GMAPS_PROFILE:-$HOME/.gmaps-automation-profile}"
PORT="${CDP_PORT:-9333}"

if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/json/version"; then
  # Closing its last window doesn't quit Chrome on macOS: open a window again if none is left.
  if ! curl -sf --max-time 2 "http://127.0.0.1:$PORT/json/list" | grep -q '"type": *"page"'; then
    curl -sf -o /dev/null --max-time 5 -X PUT "http://127.0.0.1:$PORT/json/new?https://www.google.com/maps"
    echo "The maps-lists Chrome window was running with no window open; opened one."
  else
    echo "The maps-lists Chrome window is already running on port $PORT."
  fi
  exit 0
fi

# A new profile is signed out, and Maps only shows a small "Sign in" button: open Google's
# sign-in page first, which lands on Maps afterwards.
URL="https://www.google.com/maps?hl=en"
[[ -d "$PROFILE" ]] || URL="https://accounts.google.com/ServiceLogin?continue=$URL"
mkdir -p "$PROFILE"
exec "$CHROME" \
  --remote-debugging-port="$PORT" \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir="$PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  "$URL"
