# 06 — Ordered batch merge with pre-merge rebase (`review` mode)

> Status: ready-for-agent

## Parent

`.scratch/parallel-agents/PRD.md`

## What to build

When a wave finishes, combine the agents' branches back together — the `review`-mode
(default) integration path.

- Each completed `loopdog/slice-NN` branch merges back **sequentially in slice-number
  order** with `git merge --no-ff` into a single **`loopdog-integration`** branch, so
  integration is deterministic and ordered.
- **Pre-merge rebase:** before merging a branch, rebase it onto the current integration
  tip. Most apparent "conflicts" are mere textual drift from a sibling slice touching
  nearby lines; the rebase auto-resolves them, preserving the throughput win.
- `review` mode **never touches `main` and never pushes** — promoting parallel work to a
  real branch is always a deliberate human `git merge`, done by hand after review.
- All of `git rebase`, `git merge --no-ff` go through the **existing `spawn`**. No new port
  method, no git-abstraction module.

True semantic conflicts (a rebase/merge that cannot auto-resolve) are handled in slice 07;
here, assume canned-clean rebases/merges. Drive everything with canned git results.

## Acceptance criteria

- [ ] After a wave, clean branches merge into `loopdog-integration` in **slice-number order** with `git merge --no-ff` (asserted via recorded spawn order)
- [ ] Each branch is rebased onto the current integration tip before it is merged
- [ ] `main` is never checked out, merged into, or pushed (no such spawn is ever recorded)
- [ ] Rebase/merge choreography goes through the existing `spawn` — no new port method
- [ ] A canned textual-drift case auto-resolves via the rebase and still merges cleanly

## Blocked by

- `.scratch/parallel-agents/issues/04-worktree-isolation.md`
- `.scratch/parallel-agents/issues/05-wave-frontier-and-bounds.md`
