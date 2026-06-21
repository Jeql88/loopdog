# 10 — Dogfood: source this repo's `.claude` from `templates/`

> Status: done

## Comments

Implemented ahead of slices 07-09 (2026-06-21) so the single source of truth
existed before those slices edited the bundle — otherwise 07-09 would have had
to edit `.claude/` and copy into `templates/`, reintroducing the very drift this
slice removes. Mechanism: the skill bundle now lives at `templates/.claude/skills`
(committed), and `.claude/skills` is a Windows directory junction to it
(`mklink /J`), gitignored so it stays platform-local. End users are unaffected —
`init` copies the real files from `templates/`. Verified: init delivers all 10
skills to a fresh repo; editing `templates/.claude/skills` reflects in `.claude`
with no second edit.

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
