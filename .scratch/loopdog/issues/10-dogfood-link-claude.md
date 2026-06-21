# 10 — Dogfood: source this repo's `.claude` from `templates/`

> Status: ready-for-agent

## Parent

`.scratch/loopdog/PRD.md`

## What to build

Make the product repo **dogfood the workflow** by sourcing its own `.claude` from the
`templates/` payload, so the author always uses the **real shipped artifact** and the
two never drift ("files we ship to users" and "files that configure our repo" stay
identical for the bundle).

Per the PRD layout: `templates/` is the single source of truth for the `init` payload.
This slice ensures the repo's active `.claude` skill bundle is the same artifact that
`init` delivers, rather than a hand-maintained parallel copy.

## Acceptance criteria

- [ ] The repo's active `.claude` workflow bundle resolves from `templates/` (link or equivalent single-source mechanism), not a separate copy
- [ ] Editing the payload in `templates/` is reflected in the repo's own workflow with no second edit
- [ ] The mechanism works on the author's platform (Windows) and does not break `init`'s copy of the payload for end users

## Blocked by

- `.scratch/loopdog/issues/02-init-copies-payload.md`
