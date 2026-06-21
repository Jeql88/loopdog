# 13 — Hidden mode + simultaneous agents with merge

> Status: ready-for-human

## Parent

`.scratch/loopdog/PRD.md` (extends it — this is new scope beyond v1)

## What to build

A way to run **multiple loopdog agents simultaneously** in a **hidden/background mode**,
then **merge their results** back together. Today `loop` runs strictly one headless
`claude` iteration at a time (one slice, fresh context, then the next). This feature would
let several agents work in parallel — each presumably on a different ready slice or a
different branch/worktree — and then reconcile their outputs into one coherent result.

Captured 2026-06-21 during the slice 07–10 batch as an out-of-band feature request. It is
**not** part of the loopdog v1 PRD and should be designed properly before building.

## Open questions (resolve via /grill-me → /to-prd before implementing)

- **Isolation:** do parallel agents each get their own git worktree/branch to avoid
  clobbering each other's working tree? (Likely yes — concurrent edits to one tree
  conflict.)
- **Slice assignment:** how are ready slices partitioned across agents? Lowest-N each?
  Dependency-aware (respect `Blocked by`)?
- **"Hidden mode":** background processes with no attached TTY? How is progress surfaced
  and how does the user intervene?
- **Merge:** auto-merge branches? Sequential cherry-pick? A review gate before merge?
  What happens on conflicts?
- **Smart-zone tension:** the PRD deliberately rejected auto-chaining the smart zone;
  confirm parallel *dumb-zone* implementation does not violate that principle.
- **Backstop/cost:** N concurrent headless agents multiply token spend — what bounds it?

## Acceptance criteria

- [ ] (To be defined during design — do not implement until grilled + PRD'd.)

## Blocked by

- Proper design (grill + PRD). Not blocked by code; blocked by decisions.
