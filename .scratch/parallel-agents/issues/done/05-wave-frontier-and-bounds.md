# 05 — Dependency-aware wave frontier + concurrency cap + stop decision

> Status: done

## Parent

`.scratch/parallel-agents/PRD.md`

## What to build

Turn the single-wave skeleton into the real **dependency-aware wave scheduler**, with the
orchestrator owning the stop decision and the cost bounds.

- **Frontier:** before each wave, compute the frontier — every `ready-for-agent` slice
  whose `Blocked by` references are all `done`. Parse `Blocked by` into a dependency graph
  from the existing issue markdown (the same files the serial loop reads). Slices with an
  unsatisfied blocker are **not** dispatched.
- **Waves:** assign up to `maxAgents` frontier slices to a wave, run the wave to
  completion, then recompute the frontier and repeat — so a slice becomes eligible as soon
  as its blockers reach `done`.
- **Concurrency cap:** never run more than `parallel.maxAgents` (default 3) agents/worktrees
  at once. The frontier width naturally bounds a wave to the number of currently-unblocked
  slices.
- **Stop decision is the orchestrator's:** the run ends when the frontier is empty. The
  per-agent `NO READY ISSUES` signal is **serial-only and ignored in parallel mode** — the
  orchestrator decides done even when an agent has no slice to work.
- **Backstop:** `maxIterations` caps **total** agent spawns across the whole parallel run
  (not per-agent), so a misbehaving run cannot spawn unbounded agents.

The wave-level barrier (a long slice stalls its wave) is accepted for v2; a shared work
queue is explicitly out of scope.

## Acceptance criteria

- [ ] The frontier is recomputed each wave; only slices whose `Blocked by` are all `done` are dispatched (a blocked slice waits until its blocker reaches `done`, then becomes eligible)
- [ ] No more than `maxAgents` agents run concurrently in any wave (asserted via overlap in recorded spawns)
- [ ] The run stops when the frontier is empty — the orchestrator's decision, not a per-agent signal
- [ ] The serial loop's per-agent `NO READY ISSUES` stop is untouched and is ignored in parallel mode
- [ ] Total agent spawns across the whole run never exceed `maxIterations` (asserted with a seeded backlog larger than the cap)

## Blocked by

- `.scratch/parallel-agents/issues/03-orchestrator-skeleton.md`
