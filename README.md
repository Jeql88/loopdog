# loopdog

> **Status: published.** All three commands (`init`, `run`, `loop`) are implemented and
> tested. `loopdog` is on [public npm](https://www.npmjs.com/package/loopdog) and the
> source is on [GitHub](https://github.com/Jeql88/loopdog) under MIT — so `npx loopdog`
> works on a clean machine.

Drop a [Matt-Pocock-style](https://www.aihero.dev/) AI-engineering workflow into any
repo and run its autonomous implementation loop — cross-platform, including native
Windows (no WSL or git-bash required).

## What it does

`loopdog` packages a complete AI-engineering loop so any Claude Code user can adopt it
with one command:

```
grill → PRD → slice into issues → AFK implement → review → deepen
```

The guiding principle is **automate the dumb zone, keep the smart zone manual but
guided**. An AI reasons well in a fresh/short context (the *smart zone*) and degrades as
the window fills (the *dumb zone*). So the high-judgment stages — grilling, writing the
PRD, slicing, review — stay human-run and conversational, each in fresh context. Only
well-specified implementation is automated, one slice at a time, each in a fresh Claude
process.

## Commands

| Command | What it does |
|---|---|
| `loopdog init` | Deterministically copies the workflow payload (skills, `WORKFLOW.md`, `CONVENTIONS.md`, `docs/agents/` seeds, `loopdog.json`, a stub `CLAUDE.md`) into your repo. **Write-if-absent — never overwrites your files.** Prints a write/skip summary and points you at `/configure-workflow`. |
| `loopdog run` | One iteration of the ralph loop: gather open issues + recent commits + the ralph prompt, spawn Claude Code headless to implement exactly one `ready-for-agent` slice, then stop. |
| `loopdog loop` | Repeat `run` — each in **fresh context** — until no ready slices remain, bounded by a `maxIterations` backstop. |

A companion skill, **`/configure-workflow`**, runs *inside* Claude Code to do the
smart-zone configuration interview (issue tracker, triage labels, domain-doc layout) and
surgically merges the result into your `CLAUDE.md`.

## Intended usage (once published)

```bash
# In a fresh git repo:
npx loopdog init            # install the workflow payload
# open Claude Code, then:  /configure-workflow
# hand-write one ready-for-agent issue under .scratch/<feature>/issues/
npx loopdog run             # Claude implements it, tests pass, commits, archives it
npx loopdog loop            # leave it AFK to clear the whole ready backlog
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

## Token cost — why it's cheap (and what breaks that)

loopdog spawns a **fresh `claude --print` process per slice** — no long-lived context
that degrades. The reason that is affordable rather than ruinous is one thing:
**Anthropic's cross-process prompt cache is reused across those fresh processes.**

On a validated two-slice loop (real repo, real issues, end-to-end), cache-read was ~83%
of all cached tokens. Claude Code's fixed harness overhead — system prompt, tool schemas,
`CLAUDE.md`, skills — is roughly 200K tokens per slice, but because ~83% of that serves
as cache-*read* (priced at ~0.1× input) rather than cache-*write* (full price), each
slice cost ~$0.20 and the two-slice loop totalled ~$0.40.

Two levers make this work:

1. **Cross-process cache reuse.** Each slice completes in ~35 seconds — well inside the
   ~5-minute cache TTL — so the next process inherits a warm cache. The cacheable-prefix
   ordering (deterministic issue selection, prompt structure, trimmed commit history) keeps
   the shared prefix stable across iterations so the cache actually hits.
2. **Sonnet by default.** The `loop` command runs Claude Sonnet, a flat discount on top of
   cache savings. (You can override via `loopdog.json` if a slice needs a different model.)

**This is fragile.** The cache is the *only* reason loopdog is cheap. The day cache-read
drops — a slow slice that misses the TTL, a mid-loop model switch, a harness change that
invalidates the prefix — the per-slice bill jumps roughly 10×. That is why every
`loopdog loop` run prints a **cache-health verdict** at the end: a plain-English line
stating whether the cross-iteration cache was healthy, partial, or cold. A silent caching
regression surfaces as words, not a quietly larger bill.

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

MIT (see slice 11 — `LICENSE` lands at publish time).
