# 04 — Worktree-per-agent isolation + git-repo hard requirement

> Status: done

## Parent

`.scratch/parallel-agents/PRD.md`

## What to build

Give each parallel agent its own isolated workspace so concurrent agents never clobber a
shared working tree.

- Before running an agent, the orchestrator creates a **`git worktree`** (a separate
  working folder sharing the repo's `.git`) on its own `loopdog/slice-NN` branch, runs the
  agent with that worktree as its `cwd` (using the slice-01 widening), and removes the
  worktree afterward.
- All git choreography — `git worktree add`, `git worktree remove` — goes through the
  **existing `spawn`**. No new port method, no separate git-abstraction module.
- Parallel mode **hard-requires a git repository**: if the target is not a git repo, it
  must fail **early** with a clear message, before spawning any agent. (Serial `loop` keeps
  working in any directory — this requirement is parallel-only.)

Merge/rebase of these branches is slice 06; here the branches just get created, worked in,
and the worktrees torn down. Drive it all with canned `git`/`claude` spawn results.

## Acceptance criteria

- [ ] Each agent runs in its own `git worktree` on a `loopdog/slice-NN` branch, with the agent's `cwd` set to that worktree (asserted via recorded spawn `cwd`)
- [ ] Worktree create and remove both go through the existing `spawn` — no new port method or git module added
- [ ] Parallel mode fails early with a clear, actionable message when the target is not a git repository, before any agent spawns
- [ ] Serial `loop` still runs in a non-git directory unchanged
- [ ] All worktree/branch choreography is asserted through `makeFakeEnv` with canned git results — no live git

## Blocked by

- `.scratch/parallel-agents/issues/03-orchestrator-skeleton.md`
