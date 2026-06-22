# 03 — Orchestrator skeleton: `loop --parallel N` runs a one-slice wave

> Status: done

## Parent

`.scratch/parallel-agents/PRD.md`

## What to build

The thinnest end-to-end tracer bullet for the whole feature: a `--parallel N` flag on the
existing `loop` command that routes into a **new orchestrator module** (a sibling to the
serial loop), which spawns headless `claude --print` agents itself and returns when done.

Keep this slice minimal — prove the wiring, not the cleverness:

- `loop --parallel N` parses, loads the `parallel` config (from slice 02), and dispatches
  into the orchestrator instead of the serial loop. `loop` with no flag is **completely
  unchanged** — same engine, same per-agent `NO READY ISSUES` stop, same exit codes.
- The orchestrator runs **one wave** of up to N agents, each a fresh solo `claude --print`
  run (the same kind the serial loop already spawns), and resolves.
- loopdog is the orchestrator: its own Node code launches the agents. This is **not** a
  lead-Claude-with-sub-agents model — the agents never learn about each other.

Real frontier computation, worktree isolation, and merge land in slices 04–06; here a wave
may simply pick the lowest-N ready slices and run them with no isolation yet. The point is
that `--parallel` reaches a distinct orchestrator code path, driven entirely through the
`Env` seam with canned `claude` results, with the serial path provably untouched.

## Acceptance criteria

- [ ] `loop --parallel N` parses N and routes into the orchestrator module; `loop` with no flag still runs the serial loop unchanged (asserted side-by-side)
- [ ] The orchestrator spawns up to N concurrent `claude --print` agents in one wave, driven through the injected `Env`, asserted via recorded spawn calls — no live Claude
- [ ] Each agent is a fresh solo headless run (its prompt carries no awareness of the other agents)
- [ ] Serial `loop`'s `NO READY ISSUES` stop signal and exit codes are unchanged
- [ ] Tests drive the orchestrator entirely through `makeFakeEnv` with canned spawn results

## Blocked by

- `.scratch/parallel-agents/issues/01-spawn-cwd-widening.md`
- `.scratch/parallel-agents/issues/02-parallel-config-block.md`
