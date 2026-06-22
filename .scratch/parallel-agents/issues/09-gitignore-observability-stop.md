# 09 — `.loopdog/` gitignored by `init`; `status.json` + per-agent logs; graceful stop

> Status: ready-for-agent

## Parent

`.scratch/parallel-agents/PRD.md`

## What to build

The operational band: make loopdog's scaffolding never-committed, observable while running,
and stoppable cleanly. ("Hidden" mode refers to git footprint, **not** process visibility —
a running parallel loop is always observable.)

- **Gitignore:** `init` adds `.loopdog/` to the target repo's `.gitignore` so all
  operational scaffolding (run logs, `status.json`, and — in `review` mode — worktree dirs)
  is never committed, in **both** trace modes. `init` must remain write-if-absent and must
  not clobber an existing `.gitignore` (append the entry if missing).
- **Observation:** while a parallel run is in flight, the orchestrator maintains a
  `status.json` (which agent holds which slice, wave number, pass/fail) and streams each
  agent's stdout/stderr to per-agent **log files**, all under the gitignored scaffolding
  dir.
- **Graceful stop:** a stop sentinel the orchestrator checks **between waves** lets the
  user stop a running parallel loop at the next wave boundary, without corrupting in-flight
  agent work. No mid-agent kill in v2.

The precise `status.json` shape is a low-risk implementation choice (PRD: sensible default).
Drive observation/stop through the `Env` seam (files written via the port, sentinel read
via the port).

## Acceptance criteria

- [ ] `init` ensures `.loopdog/` is in the repo's `.gitignore` (added if absent, existing `.gitignore` not clobbered)
- [ ] A running parallel loop maintains a `status.json` (slice-per-agent, wave number, pass/fail) under the gitignored scaffolding dir
- [ ] Each agent's stdout/stderr is captured to a per-agent log file under the scaffolding dir
- [ ] A stop sentinel checked at the wave boundary ends the run gracefully after the current wave — no mid-agent kill
- [ ] Observation and stop are exercised through `makeFakeEnv` (files and sentinel via the port) — no real filesystem races

## Blocked by

- `.scratch/parallel-agents/issues/03-orchestrator-skeleton.md`
