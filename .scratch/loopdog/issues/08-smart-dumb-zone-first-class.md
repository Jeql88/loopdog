# 08 — Smart/dumb-zone made first-class: docs + skill footers/reminders

> Status: ready-for-agent

## Parent

`.scratch/loopdog/PRD.md`

## What to build

Make the **smart zone vs dumb zone** principle a taught, enforced, first-class concept
instead of an emergent side-effect. (Correct definition: an AI is **smart** in a
fresh/short context and **dumb** as the context window fills.)

Three parts:

- **Teach it explicitly** in `WORKFLOW.md` and the stub `CLAUDE.md`: what the smart/dumb
  zones are, and why the workflow is shaped around fresh-context loop iterations,
  archive-when-done, and `/clear` rituals between human steps.
- **Next-step footers**: every workflow skill ends with a "Next: `/clear`, then run
  `/<skill>`" pointer, turning the manual chain into a guided rail.
- **Context-hygiene reminders**: smart-zone skills print a `/clear` reminder on finish.

Both footer behaviours are **gated on the guardrail flags** from `loopdog.json`
(`nextStepHints` / `contextHygiene`, slice 06) so the user can quiet them once fluent.
The smart zone stays **manual but guided** — no auto-chaining command. Updated docs and
skills go into the `templates/` payload.

## Acceptance criteria

- [ ] `WORKFLOW.md` and the stub `CLAUDE.md` teach the smart/dumb-zone concept explicitly, including the rationale for fresh context per step
- [ ] Each workflow skill ends with a next-step footer ("Next: `/clear`, then run `/<skill>`") naming the correct following skill
- [ ] Smart-zone skills print a `/clear` context-hygiene reminder on finish
- [ ] Footers and reminders respect `guardrails.nextStepHints` / `guardrails.contextHygiene` from `loopdog.json`
- [ ] Updated `WORKFLOW.md`, `CLAUDE.md` stub, and skills are in the `templates/` payload

## Blocked by

- `.scratch/loopdog/issues/06-loopdog-json-config.md`
