# 01 — Fixed backlog + harness skeleton (one path end-to-end)

> Status: done

## Parent

`.scratch/dumb-zone-benchmark/PRD.md`

## What to build

The reproducible foundation of the benchmark, as a thin end-to-end tracer bullet:
a committed **fixed backlog** plus a **harness** that can run exactly one path
(loopdog AFK via the existing `afk.sh`), capture that run's token data, and print a
single-path metrics record. This proves the measurement instrument works before any
comparison is added.

- **Fixed backlog:** a small, real, multi-slice backlog (3–5 independent slices) on a
  throwaway repo, mirroring the cache-health validation run so the loopdog numbers are
  comparable to the already-measured ~$0.20/slice. The backlog definition lives inside
  the harness (committed), so the whole run is reproducible — not hand-assembled per run.
- **Harness skeleton:** drives one path (loopdog AFK), reads the `stream-json` `result`
  events that the run already emits, and produces one metrics record for that path.
- **Reuse the existing cost instrument.** Token numbers come from the same `result`-event
  parsing loopdog already does (`parseCost` in `src/run.ts`); do not add new token
  plumbing. `parseCost` is currently un-exported — export it (or reach it through the
  existing `Env` seam) rather than duplicating the parse logic.
- **Scripted path entrypoint.** The path is driven by a re-runnable script (alongside
  `afk.sh`/`once.sh`), not improvised at run time, so the run is reproducible and the
  driving overhead does not contaminate the very token numbers being measured.

This slice is a benchmark deliverable, not a loopdog feature change: it must not modify
the serial loop, the parallel orchestrator, model selection, or the cost capture — it
*uses* the cost capture as its instrument.

## Acceptance criteria

- [ ] A fixed, committed backlog of 3–5 independent slices exists inside the harness and is reused unchanged on every run (reproducible, not hand-assembled)
- [ ] The harness runs the loopdog AFK path end-to-end on that backlog via a scripted, re-runnable entrypoint
- [ ] The harness captures token data from the `stream-json` `result` events and emits a single-path metrics record
- [ ] Token parsing reuses the existing `parseCost`/cost-capture path in `src/run.ts` (exported or reached via the `Env` seam) — no duplicated or new token plumbing
- [ ] The harness is exercised through the existing `Env` seam so its logic is testable with a fake env (no live agent required for the unit path)
- [ ] No change to the serial loop, parallel orchestrator, model selection, or cost capture
- [ ] Full test suite passes; the change is committed

## Blocked by

- None — can start immediately
