# 08 — `hidden` trace mode: out-of-tree worktrees, patch export, teardown

> Status: done

## Parent

`.scratch/parallel-agents/PRD.md`

## What to build

The second trace mode (`parallel.trace: "hidden"`), for when the finished work must leave
**zero autonomous git footprint** in the repo until the human explicitly applies it.

- Worktrees are created **outside the repo tree** (e.g. a per-repo dir under the user's
  home or OS temp) so no `loopdog/*` working folders sit inside the project.
- Finished slices are exported as **patch files** (via `git format-patch` / `git diff`
  through the existing `spawn`) into a **gitignored `.loopdog/patches/`**.
- When done, loopdog **tears down all its branches and worktrees** so no `loopdog/*` refs
  survive in the repo's object store — zero trace.
- loopdog **prints the `git apply …` lines** for the parked patches so the human can land
  the work by hand. No new `loopdog apply` command lands them in v2 (explicitly out of
  scope — keeps the v1 3-command contract intact).

Exact out-of-tree location and `format-patch`-vs-`diff` are low-risk implementation
choices (PRD: sensible default, decide at implementation). Drive with canned git results.

## Acceptance criteria

- [ ] In `hidden` mode, worktrees are created outside the repo tree (asserted via the `cwd`/path of the recorded `git worktree add`)
- [ ] Finished slices are exported as patch files into the gitignored `.loopdog/patches/`
- [ ] On completion, all `loopdog/*` branches and worktrees are torn down — no such refs remain (asserted via recorded teardown spawns)
- [ ] loopdog prints the `git apply …` line(s) for the parked patches
- [ ] No `loopdog apply` command is added; the v1 command surface is unchanged
- [ ] All patch-export and teardown choreography goes through the existing `spawn`, asserted via `makeFakeEnv`

## Blocked by

- `.scratch/parallel-agents/issues/06-ordered-merge-with-rebase.md`
