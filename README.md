# loopdog

> **Status: feature-complete, not yet published.** All three commands (`init`, `run`,
> `loop`) are implemented and tested, and the package installs and runs from a packed
> tarball. It is **not yet on public npm**, so `npx loopdog` won't work until the author
> publishes it (and pushes the source to GitHub). Until then, install from a local clone.

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

| Command | Zone | What it does |
|---|---|---|
| `loopdog init` | dumb | Deterministically copies the workflow payload (skills, `WORKFLOW.md`, `CONVENTIONS.md`, `docs/agents/` seeds, `loopdog.json`, a stub `CLAUDE.md`) into your repo. **Write-if-absent — never overwrites your files.** Prints a write/skip summary and points you at `/configure-workflow`. |
| `loopdog run` | dumb | One iteration of the ralph loop: gather open issues + recent commits + the ralph prompt, spawn Claude Code headless to implement exactly one `ready-for-agent` slice, then stop. |
| `loopdog loop` | dumb | Repeat `run` — each in **fresh context** — until no ready slices remain, bounded by a `maxIterations` backstop. |

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
