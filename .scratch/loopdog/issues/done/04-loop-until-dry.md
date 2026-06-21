# 04 — `loop`: repeat `run` until dry, bounded

> Status: done

## Parent

`.scratch/loopdog/PRD.md`

## What to build

`npx loopdog loop` — the AFK loop. Repeat `run` until no `ready-for-agent` issues remain
(the `NO READY ISSUES` stop signal) or the `maxIterations` backstop is reached.

The defining property: **each iteration is a fresh `claude` process = fresh context = the
smart zone.** Finished/archived work from a prior iteration never degrades the agent's
judgment on the next slice. The backstop ensures a misbehaving loop cannot run unbounded.

`loop` honours `loop.maxIterations` and `loop.permissionMode` from `loopdog.json` (read
via slice 06's config loader) so the loop can be tuned without command-line flags every
time.

## Acceptance criteria

- [ ] `loop` repeatedly invokes the `run` iteration until the `NO READY ISSUES` stop signal appears
- [ ] Each iteration spawns a fresh `claude` process (fresh context per iteration)
- [ ] `loop` stops at `maxIterations` even if the stop signal never appears
- [ ] `loop` reads `maxIterations` and `permissionMode` from `loopdog.json`
- [ ] Tested with the fake spawner: iteration count to stop-signal, and the `maxIterations` backstop firing — no live Claude invoked

## Blocked by

- `.scratch/loopdog/issues/03-run-one-ralph-iteration.md`
