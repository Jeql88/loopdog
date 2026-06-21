# 09 — `CONVENTIONS.md` read by `/tdd` and `/review`

> Status: ready-for-agent

## Parent

`.scratch/loopdog/PRD.md`

## What to build

Ship a `CONVENTIONS.md` (coding standards) in the `init` payload and wire the `/tdd` and
`/review` skills to read it, so the user's coding standards are pushed into every
autonomously-implemented slice automatically rather than re-stated each time.

## Acceptance criteria

- [ ] A `CONVENTIONS.md` template is in `templates/` and gets written by `init`
- [ ] `/tdd` reads `CONVENTIONS.md` and applies its standards when implementing
- [ ] `/review` reads `CONVENTIONS.md` and reviews against its standards
- [ ] The updated `/tdd` and `/review` skills are in the `templates/` payload

## Blocked by

- `.scratch/loopdog/issues/02-init-copies-payload.md`
