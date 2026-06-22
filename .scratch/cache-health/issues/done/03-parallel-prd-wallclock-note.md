# 03 — parallel-agents PRD: parallel mode trades tokens for wall-clock

> Status: done

## Parent

`.scratch/cache-health/PRD.md`

## What to build

Add a note to `.scratch/parallel-agents/PRD.md` stating plainly that **parallel mode
trades tokens for wall-clock**. N concurrent cold starts front-load cache-*write* N×
before any cache-read can land, so parallelism is a wall-clock optimisation that is
token-antithetical to the efficiency work. An adopter reading both the parallel-agents
PRD and the token-efficiency / cache-health PRDs must not come away believing loopdog is
simultaneously the cheapest *and* the parallel-fastest — those are different objectives
in tension.

Prose only — a note added to the existing PRD, not a code or behaviour change, and not a
redesign of parallel mode (reducing the cold-start multiplication is explicitly out of
scope for this PRD).

## Acceptance criteria

- [ ] `.scratch/parallel-agents/PRD.md` contains a note stating that parallel mode trades tokens for wall-clock
- [ ] The note explains the mechanism: N concurrent cold starts front-load cache-write N× before any cache-read lands
- [ ] The note makes clear parallelism is a wall-clock optimisation in tension with the token-efficiency work, not "free speed"
- [ ] Prose only — no change to parallel-mode behaviour or any code
- [ ] The note does not claim to resolve the tension (staggered/warm starts remain future work)

## Blocked by

- None — can start immediately
