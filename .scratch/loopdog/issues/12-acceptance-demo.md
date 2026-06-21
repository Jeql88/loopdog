# 12 — Live end-to-end acceptance demo (defines v1 "done")

> Status: ready-for-human

## Parent

`.scratch/loopdog/PRD.md`

## What to build

The manual, live end-to-end run that defines v1 "done". This is **not** an automated CI
test (live-Claude runs are slow, flaky, and token-costly — the PRD explicitly excludes
them from CI). It is a human-run acceptance demo.

On a **fresh git repo on a clean machine**:

1. `npx loopdog init`
2. Open Claude Code → `/configure-workflow` (choose local markdown)
3. Hand-write one trivial `ready-for-agent` issue under `.scratch/`
4. `npx loopdog run`
5. Observe Claude implement it, tests pass, it commits, and the issue **moves to `done/`**

If that full chain works, the product is real.

Marked `ready-for-human` (not `ready-for-agent`) because it requires a live Claude
session and human observation on a clean machine — the autonomous loop cannot self-verify
this.

## Acceptance criteria

- [ ] On a fresh repo + clean machine, `npx loopdog init` delivers the payload
- [ ] `/configure-workflow` completes with local-markdown selected
- [ ] A hand-written trivial `ready-for-agent` issue is picked up by `npx loopdog run`
- [ ] Claude implements the issue, the test suite passes, and a commit referencing the issue is created
- [ ] The completed issue is moved to `done/` (confirming finished work is archived out of future context)

## Blocked by

- `.scratch/loopdog/issues/02-init-copies-payload.md`
- `.scratch/loopdog/issues/03-run-one-ralph-iteration.md`
- `.scratch/loopdog/issues/04-loop-until-dry.md`
- `.scratch/loopdog/issues/05-remote-tracker-afk-gate.md`
- `.scratch/loopdog/issues/06-loopdog-json-config.md`
- `.scratch/loopdog/issues/07-configure-workflow-skill.md`
- `.scratch/loopdog/issues/08-smart-dumb-zone-first-class.md`
- `.scratch/loopdog/issues/09-conventions-md.md`
- `.scratch/loopdog/issues/10-dogfood-link-claude.md`
- `.scratch/loopdog/issues/11-publish-npm-github-mit.md`
