# 11 — Publish to public npm + public GitHub under MIT

> Status: ready-for-human

## Comments

Gated to `ready-for-human` (2026-06-21): publishing needs the author's npm
login and a GitHub repo/credentials — it cannot run unattended.

Local-only prep DONE (2026-06-21):
- [x] MIT `LICENSE` at repo root (copyright "Josh Edward Lui").
- [x] `package.json` `files` ships `dist/` + `templates/` (+ `ralph/`, needed by `run`);
  added a `prepublishOnly: npm run build` hook; neutralised the description.
- [x] Tarball verified with `npm pack --dry-run` — contains dist/ + templates/ + ralph/
  + LICENSE + README, and excludes src/test/.scratch.
- [x] Verified `npx loopdog init` works from the PACKED, INSTALLED tarball in a clean
  repo (25 files delivered, exit 0) — no source-tree assumptions. (AC 26-29 met.)

REMAINING — human steps (do not automate):
- [ ] Bump `version` from 0.0.0 to a real release (e.g. 0.1.0).
- [ ] Confirm npm name `loopdog` is available (fall back to a scope/near-name if not).
- [ ] `npm publish` to public npm (needs `npm login`).
- [ ] Create the public GitHub repo and push (AC 30).

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
