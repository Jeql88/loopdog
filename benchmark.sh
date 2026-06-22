#!/usr/bin/env bash
# benchmark.sh — run the dumb-zone benchmark across all three paths.
#
# For each path (loopdog-afk, plain-session, one-session-self-loop) it creates
# its OWN fresh copy of the identical fixed backlog (FIXED_BACKLOG from
# src/benchmark.ts) in a subdirectory, runs that path end-to-end, then prints
# the combined report: per-path token metrics, the quality record, the
# token/quality winners, the crossover note, and the honesty caveats.
#
# NOTE: this spawns REAL `claude` processes (3 paths × the backlog) and costs
# real tokens. Run it in your own terminal, not headless.
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
