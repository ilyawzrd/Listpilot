#!/usr/bin/env bash
# Starts a SEPARATE Chrome profile with CDP on localhost:9222.
#
# Why a separate profile: since Chrome 136, --remote-debugging-port is ignored for the default
# profile (a security change), and keeping your everyday Chrome off an open debug port is safer
# anyway. Sign into Google once in the window this opens; the profile remembers it.
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="${GMAPS_PROFILE:-$HOME/.gmaps-automation-profile}"
PORT="${CDP_PORT:-9222}"

mkdir -p "$PROFILE"
exec "$CHROME" \
  --remote-debugging-port="$PORT" \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir="$PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  "https://www.google.com/maps?hl=en"
