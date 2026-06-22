# 03 — All three paths run on the same backlog

> Status: ready-for-agent

## Parent

`.scratch/dumb-zone-benchmark/PRD.md`

## What to build

Teach the harness to drive **all three implementation paths** on the one identical,
fixed backlog from slice 01, each producing the same complete metrics record shape from
slice 02. This is what makes the comparison apples-to-apples.

The three paths:

1. **Plain session** — one continuous Claude Code session, plan mode then implement,
   working the whole backlog in a single growing context. The honest baseline.
2. **loopdog AFK (current)** — fresh `claude --print` process per slice (already wired in
   slice 01 via `afk.sh`); context = ralph + one issue + recent commits.
3. **One-session self-loop** — the smart zone unchanged, but a single persistent Claude
   session iterates the ready issue files itself (reading issues, not carrying full
   transcripts) until none remain.

Each path is a **scripted, re-runnable entrypoint** (alongside `afk.sh`/`once.sh`), so
all three are reproducible the same way and the driving overhead does not contaminate the
token numbers being measured. The same fixed backlog is used unchanged for all three.

This slice does not score quality yet (slice 04) and does not change any loopdog
behaviour — the plain-session and self-loop paths spawn `claude` appropriately; they do
not modify the serial loop or orchestrator.

## Acceptance criteria

- [ ] All three paths (plain session, loopdog AFK, one-session self-loop) run on the same fixed backlog unchanged
- [ ] Each path is driven by a scripted, re-runnable entrypoint — not improvised per run
- [ ] Each path produces the complete metrics record shape defined in slice 02 (per-path and per-slice)
- [ ] The one-session self-loop reads issue files rather than carrying full transcripts, and stops when no ready issues remain
- [ ] No path is silently skipped; the harness fails loudly if any path produces no record
- [ ] No change to the serial loop, parallel orchestrator, model selection, or cost capture
- [ ] Full test suite passes; the change is committed

## Blocked by

- `.scratch/dumb-zone-benchmark/issues/02-metrics-record-shape.md`
