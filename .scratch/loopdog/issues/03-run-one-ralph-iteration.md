# 03 — `run`: one ralph iteration with a fake spawner

> Status: ready-for-agent

## Parent

`.scratch/loopdog/PRD.md`

## What to build

`npx loopdog run` — exactly one iteration of the ralph loop, so each unit of autonomous
work is small, reviewed, and committed.

Flow:

1. **Guard `claude` is on PATH** before doing anything. If absent, print install
   guidance and exit non-zero (clear, early failure).
2. **Gather context**: open issues from `.scratch/*/issues/*.md` **excluding `done/`** +
   recent `git log` + the ralph prompt. Assemble into the agent prompt.
3. **Spawn once**: `claude --print --permission-mode auto "<prompt>"` (permission mode
   comes from config; default `auto` so it works unattended while still refusing
   destructive/irreversible actions).
4. **Detect the stop signal**: inspect output for `NO READY ISSUES`.

The ralph prompt instructs the agent to pick the lowest-numbered `ready-for-agent` slice,
implement it with `/tdd`, run the suite, `/review` it, commit referencing the issue, set
`Status: done`, and **move the file to `done/`**. Ambiguous issues get `Status: needs-info`
and are **skipped, not guessed** (prevents wrong code on under-specified work).

**Context-hygiene property (important):** finished work must never re-enter context.
`run` excludes `done/` when gathering issues, and the prompt archives completed slices to
`done/`. This is the mechanism that stops a finished/archived slice from tainting future
iterations — assert it explicitly.

## Acceptance criteria

- [ ] `run` exits non-zero with install guidance when `claude` is not on PATH (guard runs first)
- [ ] Open issues are gathered from `.scratch/*/issues/*.md` and files under `done/` are **excluded**
- [ ] Recent `git log` and the ralph prompt are included in the assembled agent prompt
- [ ] Exactly one `claude --print --permission-mode <mode>` spawn occurs per `run`
- [ ] The `NO READY ISSUES` stop signal is detected from agent output
- [ ] The ralph prompt instructs: pick lowest-numbered ready slice → `/tdd` → run suite → `/review` → commit → `Status: done` + move to `done/`; ambiguous → `needs-info` + skip
- [ ] Tested with the fake spawner: prompt assembly (incl. `done/` exclusion), single-spawn, and stop-detection — no live Claude invoked

## Blocked by

- `.scratch/loopdog/issues/01-scaffold-and-test-seam.md`
