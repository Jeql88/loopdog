# The loopdog workflow

An AI-engineering loop you run mostly by hand, with one autonomous stage:

```
grill → PRD → slice into issues → implement → review → deepen
```

| # | Stage | Command | Mode | What happens |
|---|-------|---------|------|--------------|
| 1 | Grill | `/grill-me` | human | Relentless interview that walks every branch of the design tree until decisions are resolved. |
| 2 | Write PRD | `/to-prd` | human | Synthesises the grilling into a PRD at `.scratch/<feature>/PRD.md`. **This is the destination.** |
| 3 | Slice into issues | `/to-issues` | human | Breaks the PRD into independently-grabbable **vertical slices** (tracer bullets). |
| 4 | Implement (TDD) | `loopdog run` / `loop` **or** one session | AFK | Implements ready slices test-first at pre-agreed seams. `loopdog loop` spawns a fresh agent per slice — best for **deep** backlogs; for a small backlog, handing the sliced issues to a single Claude session is cheaper (loopdog's flat per-slice harness cost only wins past a crossover). |
| 5 | Code review | `/review` | human | Two-axis review (Standards + Spec) of the diff since a fixed point. |
| 6 | Deepen modules | `/improve-codebase-architecture` | human | Finds opportunities to deepen modules and improve the architecture. |

## The smart zone vs the dumb zone — the idea the whole workflow is shaped around

An AI is **smart in a fresh, short context and dumb as the context window fills**.
Early in a conversation it reasons sharply; as the window accumulates half-finished
work, abandoned approaches, and stale plans, its judgment degrades. That decline is the
single most important force this workflow is built to fight.

Everything here keeps work in the **smart zone**:

- **Fresh context per loop iteration.** `loopdog loop` spawns a *new* `claude` process for
  each slice. Finished, archived work from a prior iteration never re-enters the next
  iteration's context, so judgment on slice N+1 is as sharp as it was on slice 1.
- **Archive when done.** A finished issue is set to `Status: done` and moved to
  `issues/done/`. The loop never reads `done/`, so completed plans can't pollute future
  outputs.
- **`/clear` rituals between human steps.** The high-judgment stages (grill, PRD, slicing,
  review) are *conversations*. Run each in a fresh context — clear between them — so the
  grilling doesn't pollute the PRD, the PRD doesn't pollute the slicing, and so on.

## Smart zone vs dumb zone: what's automated, what isn't

- **Smart zone — manual but guided.** Grilling, PRD, slicing, and review are
  high-judgement and only work with a human present. They are **not** auto-chained:
  forcing them into one running context would bloat it and defeat the whole principle.
  The skills *guide* you to the next step instead (see footers below).
- **Dumb zone — automated.** Mechanical implementation of a well-specified slice is the
  one thing `loopdog run`/`loop` does for you, unattended.

## Guided rails

Workflow skills end with a **next-step footer** ("Next: `/clear`, then run `/<skill>`")
and smart-zone skills print a **context-hygiene reminder** to `/clear` before the next
step. Both are on by default and configurable in `loopdog.json`:

```jsonc
{ "guardrails": { "nextStepHints": true, "contextHygiene": true } }
```

Set either to `false` once you know the workflow and want the prompts to quieten.
