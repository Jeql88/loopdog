# PRD: parallel-agents

> Status: ready-for-agent
> Feature slug: `parallel-agents`
> Synthesised from the grilling session of 2026-06-21 (issue 13). Extends the loopdog
> v1 PRD (`.scratch/loopdog/PRD.md`) — this is **new scope beyond v1 (a v2 feature)**.
> `/to-issues` will slice this into tracer bullets.

## Problem Statement

I run loopdog's AFK loop to chew through a backlog of `ready-for-agent` slices. Today
the loop is strictly **serial**: it spawns one headless `claude` process, waits for it
to finish a single slice and exit, then spawns the next — one after another, all in my
one working tree. When I have a backlog of slices that don't depend on each other, this
wastes wall-clock time: five independent slices run back-to-back when they could run at
once. I want the loop to work several independent slices **simultaneously** and then
combine the results, so a big independent backlog finishes in a fraction of the time.

Two further worries are mine, not the tool's:

- **Collisions.** If several agents edit the same working tree at once they clobber each
  other (interleaved commits, half-staged files). I need them isolated.
- **Git footprint.** Sometimes I want the parallel work to land as real, reviewable git
  branches (traceability, code review). Other times — a client repo, a shared trunk, a
  "just hand me the diffs" mood — I want loopdog to leave **no trace** in the repo's git
  history at all until I explicitly choose to apply its work.

## Solution

A **`--parallel N` flag on the existing `loop` command** that turns the serial AFK loop
into an N-wide one, with loopdog itself acting as the **orchestrator** (the conductor):
loopdog's own code launches up to N independent headless `claude` processes at once, each
isolated in its **own git worktree** (a separate working folder that shares the repo's
git history), each implementing a different unblocked slice in a fresh, solo context.
When a batch ("wave") finishes, loopdog combines the agents' work back together, then
starts the next wave, until no unblocked slices remain.

This is deliberately **not** a lead-Claude-with-sub-agents model. Each parallel agent is
the same fresh, solo, headless `claude --print` run that the serial loop already uses —
just N of them at once. Coordination lives in loopdog's Node code, outside the agents, so
every agent stays in the **smart zone** (sharp in a fresh, short context) and never
accumulates the coordination context that would drag a lead agent into the **dumb zone**.

A **trace mode** setting decides what footprint the finished work leaves:

- **`review` (default):** agents commit on persistent `loopdog/slice-NN` branches that
  merge back into a single `loopdog-integration` branch. Never touches `main`, never
  pushes. Full reviewable git history; promoting to a real branch is always a deliberate
  human `git merge`.
- **`hidden`:** worktrees live **outside** the repo tree; finished slices are exported as
  patch files into a gitignored `.loopdog/patches/`, and all `loopdog/*` refs and
  worktrees are torn down. **Zero autonomous git footprint.** loopdog prints the
  `git apply …` lines; the human lands them by hand.

loopdog's operational scaffolding (run logs, status, worktree dirs) is **always**
gitignored, in both modes — `init` adds `.loopdog/` to `.gitignore`.

## User Stories

1. As a developer with a backlog of independent slices, I want `loop --parallel N` to work up to N slices at once, so that an independent backlog finishes in a fraction of the wall-clock time.
2. As a developer, I want loopdog itself to orchestrate the parallel agents (not a lead Claude with sub-agents), so that each agent stays a fresh, solo, headless run and the smart-zone principle is preserved.
3. As a developer, I want each parallel agent to run in its own git worktree on its own branch, so that concurrent agents never clobber each other's working tree.
4. As a developer, I want parallel mode to require a git repository, so that worktree isolation is always available and I get a clear early failure if it is not.
5. As a developer, I want loopdog to dispatch only slices whose `Blocked by` dependencies are all `done`, so that an agent never builds on a tree missing its prerequisite slice.
6. As a developer, I want slices dispatched in waves (a batch of unblocked slices, then merge, then recompute the frontier), so that newly-unblocked slices become eligible as their blockers complete.
7. As a developer, I want concurrency capped by a configurable `maxAgents` (default 3), so that I bound how many headless agents — and how much token spend — run at once.
8. As a developer, I want the total number of agent spawns across a whole parallel run still bounded by `maxIterations`, so that a misbehaving run cannot spawn unbounded agents.
9. As a developer, I want the orchestrator (not the individual agents) to decide when the run is done — when the unblocked frontier is empty — so that the stop decision is correct even when an agent has no slice to work.
10. As a developer running the serial loop, I want the existing per-agent `NO READY ISSUES` stop signal to keep working unchanged, so that non-parallel behaviour is untouched.
11. As a developer in `review` mode, I want agents to commit on persistent `loopdog/slice-NN` branches that merge into a single `loopdog-integration` branch, so that I have a reviewable git history of what each agent did.
12. As a developer in `review` mode, I want loopdog to never touch `main` and never push, so that promoting parallel work to my real branch is always a deliberate human action.
13. As a developer in `hidden` mode, I want worktrees to live outside the repo tree and finished work exported as patch files into a gitignored directory, so that loopdog leaves zero trace in the repo's git history until I apply it.
14. As a developer in `hidden` mode, I want loopdog to tear down all its branches and worktrees when done, so that no `loopdog/*` refs survive in the repo's object store.
15. As a developer in `hidden` mode, I want loopdog to print the `git apply …` lines for the parked patches, so that I can land the work by hand without a new CLI command.
16. As a developer, I want loopdog's operational scaffolding (logs, status, worktree dirs) always gitignored in both modes, so that operational noise is never committed regardless of trace mode.
17. As a developer, I want a clean batch merge: each completed branch merged back in slice-number order, so that integration is deterministic and ordered.
18. As a developer, I want loopdog to rebase each branch onto the current integration tip before merging it, so that mere textual drift between sibling slices auto-resolves instead of stalling the run.
19. As a developer, I want a true semantic conflict (one a rebase cannot auto-resolve) to park that one branch and mark its slice `needs-info` with the conflicting paths noted, so that an ambiguous merge waits for my decision instead of being guessed at.
20. As a developer, I want a parked merge conflict not to block the other slices' merges, so that one hard slice does not stall the whole batch.
21. As a developer, I want merge conflicts to reuse the existing `needs-info` triage state rather than a new label, so that there is no new triage vocabulary to learn or maintain.
22. As a developer, I want to observe a running parallel loop via a `status.json` and per-agent log files under the gitignored scaffolding directory, so that I can see which agent holds which slice and how each wave is progressing.
23. As a developer, I want to stop a running parallel loop gracefully at the next wave boundary, so that I can intervene without corrupting in-flight agent work.
24. As a developer, I want `--parallel` to be a flag on `loop` rather than a separate command, so that the CLI keeps a small surface and parallel mode shares the loop's engine and stop conditions.
25. As a developer, I want the `parallel` config block to be absent from the v1 `init` output, so that adopting loopdog v1 is not complicated by a feature that ships later.
26. As a developer, I want parallel mode driven through the same injected `Env` port the rest of the CLI uses, so that the whole feature is testable through one seam with no live Claude and no live git.
27. As a maintainer, I want the orchestrator's git choreography (worktree create/remove, rebase, merge, abort, format-patch) to go through the existing `spawn`, so that no new port method or git-abstraction module is introduced.

## Implementation Decisions

**Command surface**
- Parallel mode is a **flag on `loop`**: `loop --parallel N`. No new top-level command
  (no `swarm`). It shares `loop`'s engine, stop conditions, and `maxIterations` backstop.
- Serial `loop` (no flag) is **completely unchanged**, including its per-agent
  `NO READY ISSUES` stop signal.

**Architecture — loopdog as orchestrator**
- loopdog's Node code is the conductor. It launches up to N independent headless
  `claude --print` processes concurrently, each a fresh solo context implementing one
  slice. The agents do not know about each other; loopdog coordinates from outside.
- Rejected: a lead-Claude-with-sub-agents model — it would accumulate coordination
  context in one session (dumb-zone drift) and make external cost-bounding hard.
- A new orchestrator module (sibling to the serial loop) holds the wave scheduler. The
  serial path stays as-is; `--parallel` routes into the orchestrator.

**Isolation — git worktrees**
- One `git worktree` (a separate working folder sharing the repo's `.git`) per agent,
  each on its own `loopdog/slice-NN` branch.
- Parallel mode **hard-requires a git repository**; it must fail early with a clear
  message if the target is not one. (Serial `loop` keeps working in any directory.)
- Containers are explicitly **not** used here — the Docker/sandcastle sandbox remains the
  loopdog v1 PRD's parked v2 feature.

**Slice assignment — dependency-aware waves**
- Before each wave, the orchestrator computes the **frontier**: every `ready-for-agent`
  slice whose `Blocked by` references are all `done`. It parses `Blocked by` into a
  dependency graph from the existing issue markdown.
- It assigns up to `maxAgents` frontier slices to agents, runs that wave to completion,
  merges, then recomputes the frontier and repeats.
- **Stop decision is the orchestrator's:** the run ends when the frontier is empty. The
  per-agent `NO READY ISSUES` signal is serial-only and is ignored in parallel mode.
- Wave-level barrier is accepted for v2: a long slice stalls its wave. A shared work
  queue (idle agents pull the next unblocked slice) is a later refinement, not built now.

**Trace modes** (`parallel.trace`)
- `review` (default): agents commit on persistent `loopdog/slice-NN` branches; clean
  branches merge into a single `loopdog-integration` branch. Never touches `main`, never
  pushes.
- `hidden`: worktrees created **outside** the repo tree (e.g. a per-repo dir under the
  user's home); finished slices exported via `git format-patch`/`git diff` into a
  gitignored `.loopdog/patches/`; all `loopdog/*` refs and worktrees torn down afterward.
  loopdog prints the `git apply …` lines; no new command lands them in v2.
- In **both** modes, `init` adds `.loopdog/` to the target repo's `.gitignore` so the
  operational scaffolding (run logs, `status.json`, worktree dirs in `review` mode) is
  never committed.

**Merge + conflict handling**
- Branches merge back **sequentially in slice-number order** with `git merge --no-ff`.
- **Pre-merge rebase:** before merging a branch, rebase it onto the current integration
  tip. Most apparent "conflicts" are mere textual drift from a sibling slice touching
  nearby lines; the rebase auto-resolves them, preserving the throughput win.
- A **true semantic conflict** (rebase/merge cannot auto-resolve) → abort that one merge,
  leave the branch intact, mark the slice `Status: needs-info` with the conflicting paths
  recorded in the issue body, and continue merging the remaining branches. No
  auto-resolution; no agent re-spawned to fix it. The human resolves parked branches.
- **No new triage state** — conflicts reuse the existing `needs-info`.

**Backstop / cost bounds**
- `maxIterations` caps **total** agent spawns across the whole parallel run (not
  per-agent).
- `parallel.maxAgents` (default 3) caps **concurrent** agents/worktrees per wave.
- The frontier width naturally bounds a wave to the number of currently-unblocked slices.

**Observation + intervention**
- Per-agent stdout/stderr stream to log files, and a `status.json` (which slice each
  agent holds, wave number, pass/fail) is maintained, both under the gitignored
  scaffolding dir. "Hidden" refers to git footprint, **not** process visibility.
- Graceful stop at the **next wave boundary** (a stop sentinel the orchestrator checks
  between waves). No mid-agent kill in v2.

**Seam (one seam, widened — not a new one)**
- The feature is tested and built through the **existing `Env` port**. The single
  widening: add an optional **`cwd`** to the existing `SpawnOptions` bag (alongside
  `stdin`), so the orchestrator can run each agent and each git command in a specific
  worktree directory.
- All git choreography — `git worktree add/remove`, `git rebase`, `git merge --no-ff`,
  `git merge --abort`, `git format-patch` — goes through the existing `spawn`. **No new
  port method and no separate git-abstraction module.**

**Config** (`loopdog.json`, merged like the existing `loop.*` block)
```jsonc
"parallel": {
  "maxAgents": 3,        // concurrent worktrees/agents per wave
  "trace": "review"      // "review" (default) | "hidden"
}
```
- This block is a **v2-era addition**: `init`'s v1 output does not include it; defaults
  apply when it is absent (consistent with `loadConfig`'s existing per-section merge).

## Testing Decisions

- **What makes a good test here:** assert external, observable behaviour through the
  orchestrator's command-level interface — *not* internal scheduler helpers. Given a set
  of issues (with `Blocked by` relationships), a `maxAgents`, a trace mode, and canned
  `claude`/`git` spawn results, assert: the right frontier is computed each wave, no more
  than `maxAgents` agents run concurrently, slices with unsatisfied blockers are not
  dispatched, branches merge in slice-number order, a canned conflict parks exactly one
  slice as `needs-info` without blocking the rest, the stop decision fires on an empty
  frontier, and total spawns never exceed `maxIterations`.
- **One seam:** the existing injected `Env` port, driven by the in-memory `makeFakeEnv`
  fake that records every `spawn` call and serves canned `SpawnResult`s. The orchestrator
  takes the same `Env`. Tests assert against recorded spawn calls (which worktrees
  created, what order merges ran, which branches aborted) and seeded/resulting in-memory
  files (issue `Status:` transitions, `.loopdog/patches/` contents).
- **Modules tested:**
  - The new orchestrator — driven entirely with the fake `Env`: fake `claude` returns
    canned per-slice output, fake `git` returns canned worktree/rebase/merge results
    (including a canned conflict), so wave composition, concurrency cap, dependency
    gating, merge order, conflict parking, trace-mode behaviour, and the empty-frontier
    stop are all tested **without a live Claude or live git**.
  - `loadConfig` — extended to cover the new `parallel` block: defaults applied when
    absent, partial blocks merged, malformed JSON still falls back safely.
  - The `SpawnOptions.cwd` widening — covered both at the fake (recorded per call) and,
    minimally, in the real-env test that the cwd is honoured.
- **Prior art:** `test/loop.test.ts` already cans a sequence of `claude`/`git` spawn
  results to drive the serial loop and asserts iteration count, stop signal, and backstop
  through `makeFakeEnv`. The parallel orchestrator tests extend exactly this pattern to
  concurrent waves. `test/config.test.ts` is the prior art for the `parallel`-block
  config tests. Each slice is built test-first (red → green → refactor) per `/tdd`,
  reading `CONVENTIONS.md`.

## Out of Scope

Deferred to a later version (architecture should leave room, but do not build):

- **`--detach` (background process supervision)** — running the orchestrator detached
  with PID tracking, `--stop` signalling, and log reattachment. Separate concern from the
  parallel/merge engine; the orchestrator runs to completion unattended, and the user can
  background it with the shell (`start /b`, `nohup`). First post-v2 candidate.
- **`loopdog apply` command** — a first-class command to land `hidden`-mode patches
  (wrapping `git apply`/`git am`, knowing patch locations, applying in slice order). v2
  prints the `git apply …` lines instead. Flagged as **likely-needed** and the leading
  next-feature candidate, but not built here (keeps the v1 3-command contract intact).
- **Shared work queue** — idle agents pulling the next unblocked slice mid-wave (vs the
  wave-barrier model). A throughput refinement for when idle agents become a real pain.
- **Mid-agent kill / preemption** — intervention happens only at wave boundaries.
- **Best-of-N / exploration parallelism** — multiple agents attacking the *same* slice
  with a judge selecting a winner. This feature is throughput-only (different slices).
- **Container isolation** — the Docker/sandcastle sandbox remains the loopdog v1 PRD's
  own parked v2 feature; worktrees, not containers, provide isolation here.
- **Auto-resolution of semantic merge conflicts** — conflicts are parked for a human.
- **Pushing or merging to `main`** — promotion to a real branch is always manual.

## Further Notes

- **Acceptance demo (defines this feature's "done"):** on a git repo with a backlog of
  several **independent** `ready-for-agent` slices — `loop --parallel 3` spawns ≤3
  concurrent agents, each in its own worktree/branch; dependency-blocked slices wait until
  their blockers are `done`; clean branches merge into `loopdog-integration` in
  slice-number order; an intentionally-conflicting slice parks as `needs-info` without
  blocking the rest; total spawns never exceed `maxIterations` and concurrency never
  exceeds `maxAgents`. This is a **separate** demo from the loopdog v1 serial acceptance
  demo (issue 12) — the v1 demo stays serial-only.
- **Relationship to v1:** purely additive. `--parallel` is a flag, the `parallel` config
  block is absent from v1 `init`, and serial `loop` is untouched. Nothing here changes the
  loopdog v1 contract.
- **Smart-zone integrity:** parallelism multiplies only the **dumb zone**
  (implementation). Every agent is one fresh solo headless context; no smart-zone stage
  (grill/PRD/slice/review) is auto-chained, and the merge step is mechanical git, not
  judgment. The principle holds.
- **Open, low-risk items (sensible defaults, decide at implementation):** exact
  out-of-tree worktree location for `hidden` mode (e.g. a per-repo-hash dir under the
  user's home or OS temp); the precise `status.json` shape; whether `format-patch` or
  plain `diff` is the better patch export. None affect this PRD.
