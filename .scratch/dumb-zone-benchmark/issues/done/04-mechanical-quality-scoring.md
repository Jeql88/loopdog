# 04 — Mechanical, pre-registered quality scoring

> Status: done

## Parent

`.scratch/dumb-zone-benchmark/PRD.md`

## What to build

Score each path's output against **four yes/no quality checks defined in the harness
*before* the run** (pre-registered), applied identically to all three paths' diffs. The
checks are mechanical or auditable-from-the-diff — never a subjective "this is more
elegant" grade — to avoid the model grading its own work on taste.

Per path, per slice:

- **(a) Spec/tests pass** — does the slice's own spec/tests pass?
- **(b) Invariant violation** — does it violate any stated invariant (deep-modules,
  single `Env` seam, cacheable-prefix ordering, model-resolved-once, never delete others'
  files)?
- **(c) Module duplication** — does it reinvent an existing module/helper instead of
  reusing an existing seam?
- **(d) Contradicted decision** — does it contradict a prior slice's decision?

Each check is a yes/no the harness can compute or that is auditable from the diff. Where
a check needs judgment, the criterion is written down so the author can audit the call.
The quality record is asserted **complete** — all four checks scored for every slice of
every path; none silently dropped.

## Acceptance criteria

- [ ] The four checks (spec passes / invariant violation / module duplication / contradicted decision) are defined in the harness before the run and applied identically to all three paths
- [ ] Each check yields a yes/no that is either harness-computed or auditable from the diff — no subjective grade
- [ ] The quality record is complete: all four checks scored per slice for every path, none silently dropped
- [ ] Where a check needs judgment, the written criterion is recorded so the author can audit it
- [ ] Unit tests assert the quality record's shape/coverage (every check present per slice/path), via the fake env
- [ ] Full test suite passes; the change is committed

## Blocked by

- `.scratch/dumb-zone-benchmark/issues/03-three-paths-same-backlog.md`
