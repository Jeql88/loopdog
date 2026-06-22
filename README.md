# loopdog

> **Status: published.** On [public npm](https://www.npmjs.com/package/loopdog) and
> [GitHub](https://github.com/Jeql88/loopdog) under MIT — `npx loopdog` works on a clean
> machine. Cross-platform, including native Windows (no WSL or git-bash required).

Drop a [Matt-Pocock-style](https://www.aihero.dev/) AI-engineering **workflow** into any
repo: a guided pipeline that turns a rough idea into well-specified, demoable slices of
work — then implements them.

## What it does — the smart zone is the product

`loopdog` packages a complete AI-engineering pipeline so any Claude Code user can adopt it
with one command:

```
grill → PRD → slice into issues → implement → review → deepen
```

The guiding principle is **automate the dumb zone, keep the smart zone manual but
guided**. An AI reasons well in a fresh/short context (the *smart zone*) and degrades as
the window fills (the *dumb zone*).

**loopdog's core value is the smart zone** — the high-judgment stages where thinking
happens: grilling a plan until it holds (`/grilling`), distilling it into a PRD
(`/to-prd`), slicing it into vertical tracer-bullet issues (`/to-issues`), and reviewing
the result (`/review`). Each runs human-guided and conversational, in fresh context. This
is where the leverage is: bounded human attention turned into a deep, well-specified
backlog. Most of the work is the thinking, and that's exactly what these skills structure.

Implementation — the dumb zone — is the *last* step, and how you run it is a tradeoff
(see [the benchmark](#implementation--run-it-where-it-pays), below). loopdog ships an
autonomous executor for it, but a well-sliced backlog can also just be handed to a single
Claude Code session. The skills are the product; the executor is one option.

## The smart-zone skills

These are the heart of loopdog. They run *inside* Claude Code as slash-commands after
`loopdog init` installs them:

| Skill | What it does |
|---|---|
| `/configure-workflow` | One-time setup interview (issue tracker, triage labels, domain-doc layout); surgically merges the result into your `CLAUDE.md`. |
| `/grilling` | Interrogates a plan until it holds — surfaces unstated assumptions, edge cases, and contradictions before any code is written. |
| `/to-prd` | Distils a grilled plan into a Product Requirements Document — the destination that captures intent. |
| `/to-issues` | Slices a PRD into independent, demoable **vertical tracer-bullet** issues with explicit dependencies. |
| `/review` | Reviews changes on two axes — Standards (does it follow the repo's documented conventions) and Spec (does it match what the issue/PRD asked). |

## Commands (the CLI)

| Command | What it does |
|---|---|
| `loopdog init` | Deterministically copies the workflow payload (skills, `WORKFLOW.md`, `CONVENTIONS.md`, `docs/agents/` seeds, `loopdog.json`, a stub `CLAUDE.md`) into your repo. **Write-if-absent — never overwrites your files.** Prints a write/skip summary and points you at `/configure-workflow`. |
| `loopdog run` | *(Dumb-zone executor.)* One iteration: gather open issues + recent commits + the ralph prompt, spawn Claude Code headless to implement exactly one `ready-for-agent` slice, then stop. |
| `loopdog loop` | *(Dumb-zone executor.)* Repeat `run` — each in **fresh context** — until no ready slices remain, bounded by a `maxIterations` backstop. Best for **deep** backlogs; see the cost note below. |

## Intended usage

The value is the first four steps — do those carefully and you have a backlog any
implementer (human, single Claude session, or `loopdog loop`) can clear.

```bash
# In a fresh git repo:
npx loopdog init            # install the workflow payload + skills
# open Claude Code, then run the smart-zone skills:
#   /configure-workflow  →  /grilling  →  /to-prd  →  /to-issues
# you now have well-specified ready-for-agent slices under .scratch/<feature>/issues/

# Then implement. Either:
npx loopdog loop            # autonomous executor — best on a deep backlog
# …or just hand the sliced issues to one Claude Code session (cheaper on small backlogs).
```

`run`/`loop` require the [`claude` CLI](https://docs.claude.com/en/docs/claude-code) on
your `PATH` — `loopdog` is a workflow wrapper around Claude Code, not a replacement for
it. Issues are read from local markdown under `.scratch/*/issues/`; a slice is finished
by moving its file to `done/`.

## Configuration — `loopdog.json`

Written by `init` at your repo root, read by both the CLI and the skills. All guardrails
default to ON so a newcomer's first run is fully guided.

```jsonc
{
  "guardrails": {
    "nextStepHints": true,   // skills print "Next: /clear, then run /<skill>"
    "contextHygiene": true   // skills print /clear reminders + teach smart/dumb zone
  },
  "loop": {
    "maxIterations": 50,      // AFK backstop
    "permissionMode": "auto"  // passed to claude; refuses destructive/irreversible actions
  }
}
```

## Implementation — run it where it pays

`loopdog run`/`loop` spawn a **fresh `claude --print` process per slice** — no long-lived
context that degrades. That's a deliberate tradeoff, and a benchmark settles when it's the
right one. We ran the same 3-slice backlog three ways and measured token cost (objective,
lifted from `stream-json` `result` events):

| Path | Cost (3 slices) | Note |
|---|---|---|
| one Claude session iterating the issues | **~$0.31** | cheapest here |
| one plain session, plan-then-implement | ~$0.32 | |
| `loopdog loop` (fresh process per slice) | **~$0.62** | ~2× — re-pays the harness prefix each slice |

**The honest read:** on a *small* backlog, a single Claude session is cheaper, because it
pays Claude Code's large fixed harness overhead (~200K tokens: system prompt, tool
schemas, `CLAUDE.md`, skills) **once and keeps it warm**, while `loopdog loop` re-pays it
on every fresh process. loopdog's per-slice cost is *flat regardless of backlog depth*, so
it only wins **past a crossover point** — where a single session's ever-growing carried
transcript finally exceeds loopdog's repeated-harness cost. On 3 trivial slices we're well
below that crossover.

So: **use the smart-zone skills always; reach for `loopdog loop` for deep backlogs**
(many slices, where bounded-per-slice context and flat cost matter), and just hand a small
backlog to one Claude session.

**What keeps `loopdog loop` from being ruinous when you do use it:** Anthropic's
cross-process prompt cache is reused across the fresh processes (measured cache-read was
~83–96% of cached tokens), and Sonnet-by-default is a flat discount on top. This is
*fragile* — if cache-read drops (a slice misses the ~5-min TTL, a mid-loop model switch, a
harness change), the per-slice bill jumps. So every `loopdog loop` run prints a
**cache-health verdict** at the end — a plain-English line stating whether the
cross-iteration cache was healthy, partial, or cold — so a silent caching regression
surfaces as words, not a quietly larger bill.

## Development

```bash
npm install
npm test         # node:test via tsx
npm run build    # tsc -> dist/
```

Repo layout:

- `src/` — the CLI source. All command logic reaches the outside world through a single
  injected **environment port** (`src/env.ts`): filesystem ops, `spawn`, and cwd.
  Production wires it to real `fs` / `child_process`; tests inject fakes. This one seam
  is how every slice is built test-first.
- `templates/` — the single source of truth for the `init` payload (exactly what gets
  copied into a user's repo).
- `test/` — tests, including a real-temp-dir fixture (for `init`) and an in-memory fake
  env with a fake-`claude` spawner (for `run`/`loop`).

## License

MIT — see [`LICENSE`](LICENSE).
