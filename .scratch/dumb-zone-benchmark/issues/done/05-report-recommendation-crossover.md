# 05 — Report table, recommendation, and crossover point

> Status: done

## Parent

`.scratch/dumb-zone-benchmark/PRD.md`

## What to build

Assemble the benchmark's final deliverable: a **results table** combining the token
metrics (slice 02/03) and the quality scores (slice 04) for all three paths, plus a
**clear recommendation** that names which path wins on tokens, which wins on quality, and
**at what backlog size each wins** — i.e. report *where the crossover is*, not just a
single winner.

The crossover hypothesis to confirm or kill: a plain continuous session uses *fewer*
tokens than loopdog for small backlogs (it pays the harness prefix once and keeps it
warm), and loopdog only wins past the backlog size where the session's carried transcript
exceeds loopdog's repeated-harness cost. The report should state where that point falls
given the measured run.

The report must carry two pieces of honest framing in its own output:

- **Objective vs. biased:** token metrics are objective; quality scoring is done by the
  same model family that wrote the code, so the quality verdict is reported *with that
  caveat* and the mechanical criteria are auditable.
- **Quality levers deferred:** `CONTEXT.md` (module map + invariants + ADR index in the
  cacheable prefix) and the optional pre-commit self-review gate are designed in the PRD
  but **not built** here — they are the next PRD, applied to whichever path this
  benchmark picks.

The winning path becomes the recommendation for loopdog's dumb-zone implementation shape.
The validated facts and decision rationale are recorded durably in the PRD's Further
Notes (already present) so future work does not re-litigate "is loopdog worth it."

## Acceptance criteria

- [ ] The harness emits a results table combining token metrics and quality scores for all three paths
- [ ] The output states which path wins on tokens, which on quality, and at what backlog size each wins (the crossover point), not just one winner
- [ ] The report includes the scoring-bias caveat (tokens objective; quality scored by the same model family, criteria auditable)
- [ ] The report notes the `CONTEXT.md` + self-review-gate quality levers are deferred to a follow-up PRD informed by this result
- [ ] The harness is re-runnable on the same backlog so a future loopdog change can be re-measured against the same baseline
- [ ] Unit tests assert the report's shape (every path present with both metrics and quality, plus the recommendation/crossover fields), via the fake env
- [ ] Full test suite passes; the change is committed

## Blocked by

- `.scratch/dumb-zone-benchmark/issues/04-mechanical-quality-scoring.md`
