# 05 — Remote-tracker AFK gate

> Status: done

## Parent

`.scratch/loopdog/PRD.md`

## What to build

v1 `run`/`loop` support **local-markdown issues only**. If the user has configured a
remote tracker (GitHub/GitLab), AFK looping must be **gated with a clear, explanatory
message** rather than running against an unsupported source — so the user is not
surprised when `loop` declines.

The interactive skills still function for remote-tracker users; only the autonomous
`run`/`loop` AFK path is gated.

## Acceptance criteria

- [ ] When a remote tracker is configured, `run` and `loop` decline to run AFK and print a clear message explaining that v1 supports local-markdown issues only
- [ ] When local-markdown issues are configured (the default), `run`/`loop` proceed normally
- [ ] The gate is verifiable in a test (configured-remote → declines with message; local → proceeds)

## Blocked by

- `.scratch/loopdog/issues/03-run-one-ralph-iteration.md`
