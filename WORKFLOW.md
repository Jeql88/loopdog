# AI Engineering Workflow (Matt Pocock style)

The loop, in order. **The PRD is the destination** — everything before it sharpens
intent; everything after it executes that intent.

| # | Stage | Command | Mode | What happens |
|---|-------|---------|------|--------------|
| 1 | Grill | `/grill-me` | human | Relentless interview that walks every branch of the design tree until decisions are resolved. Clear context if not needed before starting. |
| 2 | Write PRD | `/to-prd` | human | Synthesises the grilling conversation into a PRD at `.scratch/<feature>/PRD.md`. No new interview — just synthesis. **This is the destination.** |
| 3 | Slice into issues | `/to-issues` | human | Breaks the PRD into independently-grabbable **vertical slices** (tracer bullets) under `.scratch/<feature>/issues/`. Each slice is demoable end-to-end. |
| 4 | Implement (TDD) | `/implement` + `/tdd` | AFK (ralph) | Implements ready slices test-first at pre-agreed seams. Run via `afk.sh` for unattended runs. |
| 5 | Code review | `/review` | human | Two-axis review (Standards + Spec) of the diff since a fixed point. |
| 6 | Deepen modules | `/improve-codebase-architecture` | human | Finds opportunities to deepen modules and improve the architecture. |

Supporting skill (auto-invoked by others): `codebase-design` — the deep-module
vocabulary used whenever code is designed or restructured.

## The Ralph loop (AFK implementation)

- `ralph/prompt.md` — the per-iteration instructions for the autonomous agent.
- `once.sh` — runs a single iteration: `cat .scratch/*/issues/*.md` + `git log` +
  the prompt → one ready slice implemented, reviewed, committed, archived.
- `afk.sh` — loops `once.sh` until no `ready-for-agent` issues remain.

Run unattended:

```bash
bash afk.sh
```

## Push vs pull

- **Push** — instructions you push into the model up front via `CLAUDE.md`
  (issue-tracker location, triage labels, deep-module principles).
- **Pull** — context the agent pulls on demand: skills it invokes, `CONTEXT.md`,
  ADRs under `docs/adr/`. Keep `CLAUDE.md` lean; let the agent pull the rest.

## Smart zone vs dumb zone

- **Smart zone** — grilling, PRD, slicing, review: high-judgement, human-in-loop.
- **Dumb zone** — mechanical implementation of a well-specified slice: AFK via ralph.

## Keeping finished plans out of context

When a slice is done, set `Status: done` and move it to
`.scratch/<feature>/issues/done/`. The Ralph loop only reads non-archived issues,
so completed plans never negatively influence future outputs.
