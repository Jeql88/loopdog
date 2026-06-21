#!/usr/bin/env bash
# once.sh — run a single Ralph iteration.
# Gathers open issues + recent commits + the Ralph prompt, then hands them to
# Claude Code in headless mode to implement exactly one ready slice.
set -euo pipefail
cd "$(dirname "$0")"

# Collect only ready-for-agent issues. The glob .scratch/*/issues/*.md does not
# descend into issues/done/ (bash * does not cross /), so archived issues are
# already excluded; we additionally filter to Status: ready-for-agent so that
# needs-info / ready-for-human / needs-triage issues never enter the agent's
# context and bleed into its reasoning.
READY_FILES="$(grep -lE '^[> ]*Status:[[:space:]]*ready-for-agent' .scratch/*/issues/*.md 2>/dev/null || true)"
if [ -z "$READY_FILES" ]; then
  echo "NO READY ISSUES"
  exit 0
fi
ISSUES="$(cat $READY_FILES 2>/dev/null || true)"

COMMITS="$(git log --oneline -20 2>/dev/null || echo 'no commits yet')"
PROMPT="$(cat ralph/prompt.md)"

FULL="$(cat <<EOF
$PROMPT

## Recent commits

$COMMITS

## Open issues

$ISSUES
EOF
)"

# Headless, non-interactive. --permission-mode auto lets it work AFK while still
# refusing destructive/irreversible actions.
claude --print --permission-mode auto "$FULL"
