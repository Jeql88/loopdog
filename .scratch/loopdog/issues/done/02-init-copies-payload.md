# 02 — `init` copies the template payload (write-if-absent) + reports

> Status: done

## Parent

`.scratch/loopdog/PRD.md`

## What to build

`npx loopdog init` — the **dumb zone**: deterministic file delivery, no judgment, no
interview. It copies the payload from `templates/` into the user's repo, then hands off
to the configuration skill.

Behaviour:

- **Write-if-absent**: only files that do not already exist are written; existing files
  are skipped, never overwritten. An existing `CLAUDE.md` is left completely untouched.
- The full curated bundle is delivered as a coherent whole (skills cross-reference each
  other, so nothing is half-installed).
- Prints a **write/skip summary** reporting exactly which files were written and which
  were skipped.
- Prints a clear **next-step handoff** pointing the user at `/configure-workflow`.

The CLI never performs a smart merge — the one file needing intelligence (`CLAUDE.md`)
is deferred to `/configure-workflow` (slice 07).

Payload note (per PRD + user decision): the payload grows across slices. This slice can
land with a minimal `templates/` tree and the copy/report logic; slices 07–10 add their
files into `templates/` as they land. The copy logic must be payload-agnostic — it
copies whatever is in `templates/`.

## Acceptance criteria

- [ ] `npx loopdog init` copies every file present in `templates/` into the target repo, preserving structure
- [ ] A file that already exists in the target repo is skipped, not overwritten
- [ ] An existing `CLAUDE.md` is never modified
- [ ] `init` prints a summary listing files written and files skipped
- [ ] `init` prints a next-step message pointing at `/configure-workflow`
- [ ] Tested end-to-end against a real temp directory: assert files on disk + skip/report behaviour for pre-existing files (including a pre-existing `CLAUDE.md`)

## Blocked by

- `.scratch/loopdog/issues/01-scaffold-and-test-seam.md`
