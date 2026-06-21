# CLAUDE.md

This repo follows Matt Pocock's AI engineering workflow. See `WORKFLOW.md` for the
end-to-end loop and which skill runs at each stage.

## Agent skills

### Issue tracker

Issues and PRDs live as local markdown under `.scratch/<feature-slug>/` — no GitHub
issues are created. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage state is the `Status:` line at the top of each issue file. Only
`ready-for-agent` issues are picked up by the autonomous Ralph loop. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: one `CONTEXT.md` + `docs/adr/` at the root, created lazily by
`/domain-modeling`. See `docs/agents/domain.md`.

## Codebase design principles

Design **deep modules**: a lot of behaviour behind a small interface, placed at a
clean seam, tested through that interface. (Full vocabulary in the
`codebase-design` skill.)

- **Deep > shallow.** A deep module hides real complexity behind a narrow interface.
  Avoid proliferating shallow modules — many tiny wrappers are hard to test and hard
  to navigate.
- **Test through seams.** Prefer the highest existing seam. The fewer seams across
  the codebase, the better — the ideal is one. Build so the codebase is easy to test;
  good seams give tight feedback loops.
- **Demoable slices.** Every issue should be a vertical, end-to-end tracer bullet —
  independently demoable, not a horizontal layer.

## Done means archived

When an issue is implemented and reviewed, set `Status: done` and move it to
`.scratch/<feature>/issues/done/`. Finished plans must not influence future outputs.
