# 02 — Deterministic one-issue selection

> Status: ready-for-agent

## Parent

`.scratch/loop-token-efficiency/PRD.md`

## What to build

Move issue selection into loopdog itself, in deterministic code. Instead of dumping
**all** `ready-for-agent` issues into the prompt and letting the agent choose, loopdog
picks the **lowest-numbered** `ready-for-agent` issue and sends **only that one** to the
spawned `claude`. This kills the "spend a whole turn rediscovering an already-done issue"
waste and shrinks the prompt to a single issue.

Reuse the existing discovery already in `run.ts`: issue files are found, sorted, and
filtered by the `Status: ready-for-agent` line, with the `done/` archive excluded
(`findIssueFiles` / `gatherReadyIssues`). Selection picks the first file in that sorted,
filtered set rather than concatenating them all.

Skip-ambiguous is preserved **by status, not by agent discretion**: an agent that can't
complete a slice flips its `Status:` to `needs-info`; the selector already excludes
non-`ready-for-agent` files, so the next selection skips it and picks the following ready
issue. When no `ready-for-agent` issue remains, the existing stop signal
(`STOP_SIGNAL = "NO READY ISSUES"`) is emitted and the loop stops cleanly. Stop-signal
detection scans the raw captured stdout, so it stays unaffected by this change.

## Acceptance criteria

- [ ] Given several `ready-for-agent` issues, the `stdin` handed to the spawned `claude` contains exactly the lowest-numbered ready issue and **not** the others
- [ ] Issues whose `Status:` is not `ready-for-agent` (needs-info, needs-triage, done, etc.) are never selected
- [ ] Archived work under any `issues/done/` directory never appears in the prompt
- [ ] Flipping a previously-selected issue to `needs-info` causes the next selection to pick the following ready issue
- [ ] With no `ready-for-agent` issue anywhere, the loop emits the stop signal and stops (does not invent work)
- [ ] Each slice still runs in a fresh `claude` process — selection adds no cross-slice state
- [ ] Tested through `runRun` / `runLoop` with the fake `Env`, asserting on the recorded spawn `stdin`: lowest-numbered-only selection, skip-by-status, and empty-backlog → stop signal

## Blocked by

- None — can start immediately
