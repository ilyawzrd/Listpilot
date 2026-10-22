#!/usr/bin/env bash
# Runs the hooks module's tests (hooks/*.test.tsx: Clawd above the prompt) with `claude plugin test`.
# That command runs every *.test.ts under the folder it's given, and src/*.test.ts are node:test
# files it can't load, so it gets a copy of just the manifest, hooks/ and types/.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/.claude-plugin"
cp "$ROOT/.claude-plugin/plugin.json" "$TMP/.claude-plugin/"
cp -R "$ROOT/hooks" "$ROOT/types" "$TMP/"
claude plugin test "$TMP"
