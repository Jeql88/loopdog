#!/usr/bin/env bash
# afk.sh — the Ralph loop. Runs once.sh repeatedly until no ready issues remain.
# "Ralph" = a dumb outer loop around a smart inner agent. Each pass starts with
# fresh context, so finished (archived) issues never bloat the prompt.
set -uo pipefail
cd "$(dirname "$0")"

MAX_ITERATIONS="${MAX_ITERATIONS:-50}"   # safety backstop
i=0

while [ "$i" -lt "$MAX_ITERATIONS" ]; do
  i=$((i + 1))
  echo "===== Ralph iteration $i ====="

  OUTPUT="$(bash once.sh 2>&1)"
  echo "$OUTPUT"

  if echo "$OUTPUT" | grep -qE "NO READY ISSUES|No issues found"; then
    echo "===== Ralph: nothing left to do. Stopping. ====="
    break
  fi
done

echo "Ran $i iteration(s)."
