#!/usr/bin/env bash
# benchmark.sh — run the dumb-zone benchmark on the loopdog-afk path.
#
# Creates a fresh throwaway repo in a temp directory, plants the fixed backlog
# (FIXED_BACKLOG from src/benchmark.ts), then drives the loopdog AFK path
# through one full run and prints the metrics record.
#
# Re-runnable: each invocation gets a clean temp dir so results are not
# contaminated by a prior run's partial state. Pass an explicit directory to
# reuse an already-initialised repo:
#
#   ./benchmark.sh /tmp/my-bench-repo
#
set -euo pipefail
LOOPDOG="$(cd "$(dirname "$0")" && pwd)"
TSX="$LOOPDOG/node_modules/.bin/tsx"

if [ ! -x "$TSX" ]; then
  echo "benchmark: tsx not found at $TSX" >&2
  echo "  Run 'npm install' in the loopdog project first." >&2
  exit 1
fi

if [ "${1:-}" != "" ]; then
  WORK="$1"
else
  WORK="$(mktemp -d)"
fi

echo "benchmark: throwaway repo → $WORK"
"$TSX" "$LOOPDOG/src/benchmark.ts" "$WORK"
