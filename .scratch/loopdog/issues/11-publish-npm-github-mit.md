# 11 — Publish to public npm + public GitHub under MIT

> Status: ready-for-human

## Comments

Gated to `ready-for-human` (2026-06-21): publishing needs the author's npm
login and a GitHub repo/credentials — it cannot run unattended. The local-only
parts (MIT LICENSE, `npm pack` tarball verification) can be done by an agent, but
the actual npm publish + public GitHub push are human steps. Resume when the
author is ready to publish.

## Parent

`.scratch/loopdog/PRD.md`

## What to build

Make `loopdog` installable by anyone: `npx loopdog` works on a clean machine with no
prior install.

- `package.json` `files` ships `dist/` + `templates/` (so the payload travels with the
  package).
- MIT licence file at the repo root.
- Source published to a **public GitHub** repo.
- Published to **public npm**. (Package name: `loopdog`; if unavailable at publish time,
  fall back to a personal scope or near-name — resolved at build time, does not change
  this slice's intent.)

This is a **personal** project — no Nuvho branding, scope, or brand guidelines apply.

## Acceptance criteria

- [ ] `package.json` `files` includes `dist/` and `templates/`
- [ ] An MIT `LICENSE` file is present at the repo root
- [ ] The package builds and a packed tarball contains `dist/` + `templates/` (verify with `npm pack`)
- [ ] `npx loopdog init` works from the packed/published package on a clean checkout (no source-tree assumptions)
- [ ] Source is on a public GitHub repo under MIT

## Blocked by

- `.scratch/loopdog/issues/02-init-copies-payload.md`
- `.scratch/loopdog/issues/03-run-one-ralph-iteration.md`
- `.scratch/loopdog/issues/04-loop-until-dry.md`
