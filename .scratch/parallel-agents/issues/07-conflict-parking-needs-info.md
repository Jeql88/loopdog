# 07 — Semantic-conflict parking as `needs-info` (non-blocking)

> Status: ready-for-agent

## Parent

`.scratch/parallel-agents/PRD.md`

## What to build

Handle the merge case the rebase **cannot** auto-resolve: a true semantic conflict.

- When a branch's rebase/merge hits a conflict that cannot auto-resolve, **abort that one
  merge** (`git merge --abort`), leave the branch intact, and mark that slice
  `Status: needs-info`, recording the conflicting paths in the issue body — so an ambiguous
  merge waits for the human's decision instead of being guessed at. No auto-resolution; no
  agent re-spawned to fix it.
- A parked conflict **must not block the other slices' merges** — the remaining clean
  branches still merge in order. One hard slice does not stall the whole batch.
- Conflicts **reuse the existing `needs-info` triage state** — no new triage label/vocabulary
  is introduced.

Drive it with a canned conflicting merge result among otherwise-clean ones, and assert
exactly one slice parks while the rest integrate.

## Acceptance criteria

- [ ] A canned unresolvable conflict causes that branch's merge to abort (`git merge --abort`) with the branch left intact
- [ ] The conflicted slice's file is updated to `Status: needs-info` with the conflicting paths recorded in its body
- [ ] The other (clean) branches in the same batch still merge in slice-number order — the parked slice does not block them
- [ ] No new triage state is introduced — the existing `needs-info` is reused
- [ ] Asserted through `makeFakeEnv` (canned conflict + canned-clean siblings) — no live git

## Blocked by

- `.scratch/parallel-agents/issues/06-ordered-merge-with-rebase.md`
