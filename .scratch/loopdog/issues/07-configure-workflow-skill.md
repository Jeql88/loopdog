# 07 — `/configure-workflow` skill: rename + interview + surgical `CLAUDE.md` merge

> Status: ready-for-agent

## Parent

`.scratch/loopdog/PRD.md`

## What to build

The companion skill that runs **inside Claude Code** to perform the smart-zone
configuration interview — the counterpart to `init`'s dumb-zone file delivery.

- **Rename** `setup-matt-pocock-skills` → `/configure-workflow` (de-couples from a person
  and disambiguates from the CLI's `init`). Update all cross-references in the bundle.
- **Interview** the user about: issue tracker, triage labels, and domain-doc layout.
- **Write** the resulting `docs/agents/*.md` files.
- **Surgically merge** only the `## Agent skills` block into `CLAUDE.md` — updating that
  section in place if it exists, creating it if not, and **never overwriting surrounding
  sections** or the user's own notes.

This is the one file needing intelligence (`CLAUDE.md`), which the CLI deliberately defers
here. Add the skill to the `templates/` payload so `init` ships it.

## Acceptance criteria

- [ ] The skill is named `/configure-workflow`; the old `setup-matt-pocock-skills` name is gone and all cross-references updated
- [ ] Running it interviews the user about issue tracker, triage labels, and domain-doc layout
- [ ] It writes the appropriate `docs/agents/*.md` files from the interview
- [ ] It merges only the `## Agent skills` section into `CLAUDE.md`, preserving all other sections; creates the section if absent
- [ ] The skill is present in `templates/` so `init` delivers it as part of the bundle

## Blocked by

- `.scratch/loopdog/issues/02-init-copies-payload.md`
