# PRD: loopdog

> Status: ready-for-agent
> Feature slug: `loopdog`
> Synthesised from the grilling session of 2026-06-21. The PRD is the destination —
> everything before it sharpened intent; `/to-issues` will slice this into tracer bullets.

## Problem Statement

I have built a personal AI-engineering workflow (the Matt-Pocock-style loop:
grill → PRD → slice → AFK implement → review → deepen) and it works well **in this one
repo**. But every part of it — the skills, `WORKFLOW.md`, the configuration docs, the
autonomous "ralph" loop — is wired into this repository by hand. Anyone else (or
future-me, starting a new project) who wants to use this workflow has no way to get it.
There is no single command that drops the workflow into a fresh repo, configures it,
and runs the autonomous loop.

On top of that, the autonomous loop currently lives in two bash scripts
(`once.sh` / `afk.sh`). I work on Windows, and so do many potential adopters, so a
POSIX-shell-only loop is a broken end-to-end experience for a large slice of the
audience.

Finally, the workflow embodies a core idea — **the smart zone vs the dumb zone** (an AI
reasons well early in a context window and degrades as the window fills) — but that idea
is currently *emergent* (it falls out of "fresh context per loop iteration" and
"archive when done") rather than *taught* and *enforced*. A newcomer adopting the
workflow would not learn it, and nothing guides them to clear context between
high-judgment steps or tells them which skill to run next.

## Solution

A personal, open-source **Node/TypeScript CLI called `loopdog`**, published to public
npm under the MIT licence, that packages the entire workflow so any Claude Code user
can adopt it with one command.

`loopdog` exposes three commands:

- **`npx loopdog init`** — the *dumb zone*: deterministically copies the workflow
  payload (skills, `WORKFLOW.md`, `CONVENTIONS.md`, `docs/agents/` seeds, `loopdog.json`,
  and a stub `CLAUDE.md`) into the user's repo. Write-if-absent, never destructive.
  Prints a summary and hands off to the configuration skill.
- **`npx loopdog run`** — one iteration of the ralph loop: gather open issues + recent
  commits + the ralph prompt, spawn Claude Code headless to implement exactly one
  `ready-for-agent` slice, then stop.
- **`npx loopdog loop`** — the AFK loop: repeat `run` (each in **fresh context** — the
  smart zone) until no ready issues remain, bounded by guardrails.

It ships a companion skill, **`/configure-workflow`** (renamed from
`setup-matt-pocock-skills`), which runs *inside* Claude Code to perform the smart-zone
configuration interview (issue tracker, triage labels, domain-doc layout) and merge the
results into `CLAUDE.md`.

The product makes the **smart/dumb-zone** principle first-class: it is taught explicitly
in `WORKFLOW.md` and `CLAUDE.md`, and the workflow skills actively guide the user to
keep work in the smart zone via **next-step footers** ("Next: `/clear`, then run
`/to-prd`") and **context-hygiene reminders** ("clear context before the next step").
These guardrails are configurable via `loopdog.json` and default to ON.

The division of labour is the heart of the design: **automate the dumb zone, keep the
smart zone manual but guided.** The high-judgment stages (grill, PRD, slicing, review)
stay human-run — they are conversations that only work with a human present, and
auto-chaining them would force them into one bloated context, defeating the smart-zone
principle. Only well-specified implementation (the dumb zone) is automated, via `loop`.

## User Stories

1. As a Claude Code user, I want to run a single `npx loopdog init` in my repo, so that the whole AI-engineering workflow is installed without manual file copying.
2. As an adopter, I want `init` to never overwrite my existing files, so that I can run it safely in a repo that already has a `CLAUDE.md` or other config.
3. As an adopter, I want `init` to report exactly which files it wrote and which it skipped, so that I know the resulting state of my repo.
4. As an adopter with an existing `CLAUDE.md`, I want `init` to leave it untouched, so that my own project notes are never clobbered.
5. As an adopter, I want `init` to print a clear "next step" message, so that I know to run `/configure-workflow` next.
6. As an adopter, I want the full curated skill set installed as a coherent bundle, so that the skills' cross-references all resolve and nothing is half-installed.
7. As a Windows user, I want the autonomous loop to run natively (no WSL or git-bash), so that I get the full workflow on my platform.
8. As an adopter, I want `/configure-workflow` to interview me about my issue tracker, triage labels, and domain-doc layout, so that the workflow is wired to how I actually work.
9. As an adopter, I want `/configure-workflow` to merge only the `## Agent skills` section into my `CLAUDE.md`, so that the rest of my file is preserved.
10. As a developer shaping a feature, I want to run `/grill-me` to stress-test my plan, so that decisions are resolved before any code is written.
11. As a developer, I want `/to-prd` to synthesise my grilling conversation into a PRD, so that intent is captured in one durable document.
12. As a developer, I want `/to-issues` to slice my PRD into independently-demoable vertical tracer bullets, so that each unit of work is end-to-end and gripping for the loop.
13. As a developer, I want each workflow skill to tell me which skill to run next, so that I can follow the workflow without memorising it.
14. As a developer, I want each smart-zone skill to remind me to clear context before the next step, so that every high-judgment stage starts in the smart zone.
15. As a developer, I want `WORKFLOW.md` and `CLAUDE.md` to teach the smart-zone vs dumb-zone concept explicitly, so that I understand *why* the workflow is shaped this way.
16. As a developer, I want `run` to verify the `claude` CLI is on my PATH before doing anything, so that I get a clear, early failure instead of a confusing one.
17. As a developer, I want `run` to implement exactly one ready slice per invocation, so that each unit of autonomous work is small, reviewed, and committed.
18. As a developer, I want `run` to gather open issues, recent commits, and the ralph prompt into the agent's context, so that the agent has what it needs and nothing stale.
19. As a developer, I want `loop` to keep running iterations until no `ready-for-agent` issues remain, so that I can leave it AFK and return to completed work.
20. As a developer, I want each `loop` iteration to start with fresh context, so that finished/archived work never degrades the agent's judgment on the next slice.
21. As a developer, I want `loop` bounded by a max-iterations backstop, so that a misbehaving loop cannot run unbounded.
22. As a developer, I want `loop` to run Claude in `--permission-mode auto`, so that it can work unattended while still refusing destructive/irreversible actions.
23. As a developer, I want the loop to read issues from local markdown under `.scratch/*/issues/`, so that finished slices are archived simply by moving files.
24. As a developer who configured a remote tracker, I want AFK looping to be clearly gated with an explanatory message, so that I am not surprised when `loop` declines to run.
25. As a developer, I want a `CONVENTIONS.md` that `/tdd` and `/review` read, so that my coding standards are pushed into every autonomously-implemented slice.
26. As a developer, I want guardrails (next-step hints, context-hygiene reminders) toggleable via `loopdog.json`, so that I can quiet them once I know the workflow.
27. As a newcomer, I want all guardrails enabled by default, so that my first experience is fully guided.
28. As a developer, I want `loop` to honour the `maxIterations` and `permissionMode` settings from `loopdog.json`, so that I can tune the loop without command-line flags every time.
29. As an adopter, I want `loopdog` published to public npm, so that `npx loopdog` works on a clean machine with no prior install.
30. As a contributor, I want the source public on GitHub under MIT, so that I can read, fork, and adopt it freely.
31. As the author, I want the product repo to keep the CLI source separate from the template payload, so that "files that configure our repo" never get confused with "files we ship to users".
32. As the author, I want this repo to dogfood the workflow by linking its own `.claude` from the template payload, so that I use the real shipped artifact and it never drifts.
33. As the author, I want one clean test seam, so that every slice can be TDD'd through the top with tight feedback loops.
34. As a developer, I want to verify the whole product on a throwaway repo (init → configure → write a ready issue → run → autonomous commit), so that I know the end-to-end loop genuinely works.
35. As an adopter, I want a slice flagged `needs-info` by the loop to be skipped rather than guessed at, so that ambiguous work waits for my decision instead of producing wrong code.

## Implementation Decisions

**Product shape**
- `loopdog` is a Node + TypeScript CLI, distributed on **public npm**, MIT-licensed,
  source on a **public GitHub** repo. It is a **personal** project — no Nuvho branding,
  scope, or brand guidelines apply.
- Package/command name: `loopdog`. If unavailable on npm at publish time, fall back to a
  personal scope or near-name; resolve at build time (does not affect this PRD).
- Three commands only in v1: **`init`**, **`run`**, **`loop`**. No `update`, `doctor`,
  or `list` in v1.

**The init/configure seam (push vs pull)**
- `init` is the **dumb zone**: deterministic file delivery. It detects the repo, copies
  the payload, and hands off. No judgment, no interview.
- `/configure-workflow` (renamed from `setup-matt-pocock-skills`) is the **smart zone**:
  the configuration interview, run inside Claude Code. It writes `docs/agents/*.md` and
  surgically merges the `## Agent skills` block into `CLAUDE.md` (updating in place if it
  exists, never overwriting surrounding sections).
- The CLI never performs a smart merge; the one file needing intelligence (`CLAUDE.md`)
  is deferred to `/configure-workflow`.

**`init` payload and conflict behaviour**
- Payload = the full curated skill bundle as-is (`grilling` + the `-me` wrappers,
  `to-prd`, `to-issues`, `tdd`, `implement`, `review`, `improve-codebase-architecture`,
  `codebase-design`, `configure-workflow`) + `WORKFLOW.md` + `CONVENTIONS.md` +
  `docs/agents/` seed templates + `loopdog.json` + a stub `CLAUDE.md`.
- **No bash scripts** are shipped — the loop is a Node subcommand.
- **Write-if-absent**: only files that do not already exist are written; existing files
  are skipped and reported. An existing `CLAUDE.md` is never touched.
- `init` prints a write/skip summary and a next-step handoff message pointing at
  `/configure-workflow`.

**The ralph loop (ported to Node)**
- `once.sh` / `afk.sh` are retired. Their logic moves into the CLI as `run` and `loop`,
  making the loop cross-platform (resolves the Windows problem).
- `run` logic: guard that `claude` is on PATH (else print install guidance, exit
  non-zero) → gather open issues (`.scratch/*/issues/*.md`, excluding `done/`) + recent
  `git log` + the ralph prompt → spawn `claude --print --permission-mode auto "<prompt>"`
  → inspect output for the `NO READY ISSUES` stop signal.
- `loop` logic: repeat `run` until the stop signal appears or `maxIterations` is reached.
  Each iteration is a **fresh Claude process = fresh context = the smart zone**.
- The agent is instructed (via the ralph prompt) to pick the lowest-numbered
  `ready-for-agent` slice, implement it with `/tdd`, run the suite, `/review` it, commit
  referencing the issue, set `Status: done`, and move the file to `done/`. Ambiguous
  issues get `Status: needs-info` and are skipped, not guessed.

**Dependency posture**
- Hard dependency on the `claude` CLI. No agent-backend abstraction (rejected as
  premature generalisation / shallow indirection). Guard and fail early.

**Issue source**
- v1 `run`/`loop` support **local-markdown issues only**. If a remote tracker
  (GitHub/GitLab) was configured, AFK looping is gated with a clear explanatory message;
  the interactive skills still function. (Implication: `init`/`configure` should steer
  users toward local markdown if they want AFK.)

**Smart/dumb-zone as a first-class, taught concept**
- Correct definition: an AI is **smart** in a fresh/short context and **dumb** as the
  context window fills. The workflow keeps work in the smart zone via fresh-context loop
  iterations, archive-when-done, and `/clear` rituals between human steps.
- This is taught explicitly in `WORKFLOW.md` and `CLAUDE.md`, not left emergent.
- **Next-step footers**: every workflow skill ends with a "Next: `/clear`, then run
  `/<skill>`" pointer, turning the manual chain into a guided rail.
- **Context-hygiene reminders**: smart-zone skills print a `/clear` reminder on finish.
- Smart zone is **manual but guided**; only the dumb zone is automated. No auto-chaining
  command (e.g. no `loopdog craft`) — chaining would bloat one context and fight the
  principle.

**`loopdog.json` (guardrail + loop config)**
- Written by `init` at the repo root. Read by both the CLI and the skills.
- Controls, all guardrails defaulting to ON:

```jsonc
{
  "guardrails": {
    "nextStepHints": true,   // skills print "Next: /clear, then run /<skill>"
    "contextHygiene": true   // skills print /clear reminders + teach smart/dumb zone
  },
  "loop": {
    "maxIterations": 50,      // AFK backstop
    "permissionMode": "auto"  // passed to claude
  }
}
```

- CLI side reads `loop.*`. Skill side: each prompt-driven skill reads `loopdog.json` and
  honours `nextStepHints` / `contextHygiene` before printing footers/reminders.

**Coding-standards automation**
- A `CONVENTIONS.md` is shipped and read by `/tdd` and `/review`, so standards are pushed
  into every slice automatically.

**Product-repo layout (deep modules, one seam)**
- `src/` — the CLI source. `templates/` — the **single source of truth** for the `init`
  payload (exactly what gets copied to users). `test/` — tests.
- The product repo dogfoods by linking its own `.claude` from `templates/`, so it always
  exercises the real shipped artifact and the two never drift.
- `package.json` `files` ships `dist/` + `templates/`.

## Testing Decisions

- **What makes a good test here:** test external, observable behaviour through the
  command handlers — *not* internal helpers. For `init`, that means "given a repo state,
  the right files end up on disk and the right summary is printed." For `run`/`loop`,
  that means "given a set of issues and a (fake) agent response, the right agent prompt
  is assembled, the right number of iterations run, and the stop condition is honoured."
- **One seam (matches the codebase-design ideal of a single seam):** an **injected
  environment port** exposing filesystem operations, a `spawn(cmd, args)` function, and
  the current working directory. All command logic takes this port. Production wires it
  to the real fs / real `child_process` / real cwd; tests inject fakes.
- **Modules tested:**
  - `init` — driven end-to-end against a **real temp directory** (real fs), asserting
    the actual files written and the skip/report behaviour for pre-existing files.
  - `run` / `loop` — driven with a **fake `claude` spawner** that returns canned output,
    so the loop's prompt-assembly, iteration count, `maxIterations` backstop, and
    `NO READY ISSUES` stop-detection are all tested **without invoking a live Claude**.
- **Prior art:** none yet in this repo (greenfield CLI). Establish the temp-dir +
  fake-spawner pattern in the first slice so later slices reuse it. Each slice is built
  test-first (red → green → refactor) per `/tdd`.
- **No end-to-end-with-live-claude tests in CI** — slow, flaky, token-costly. The live
  end-to-end run is the manual v1 acceptance demo (below), not an automated test.

## Out of Scope

Deferred to v2 or later (architecture should leave room, but do not build):

- **Docker / sandcastle AFK sandbox** — running loop iterations in a container so the
  agent cannot touch the host. The headline v2 feature. The `run` spawn boundary is the
  designed insertion point for a future `--sandbox` flag; do not implement the sandbox
  itself in v1. (`--permission-mode auto` already refuses destructive actions, so v1 is
  not unsafe without it.)
- **`update` / sync mechanism** — v1 is vendored / install-once; files become the user's
  to edit. No 3-way merge, no version tracking.
- **`doctor` command** — beyond the inline `claude`-on-PATH guard in `run`.
- **`list` command / dashboard** — showing installed skills or issue statuses.
- **Remote-tracker AFK** — `run`/`loop` against GitHub/GitLab issues. Local markdown only.
- **Agent-backend abstraction** — `loopdog` assumes Claude Code; no pluggable runner.
- **À-la-carte skill selection in `init`** — the bundle is delivered whole.
- **Auto-chaining the smart-zone stages** (a `craft`-style wizard) — rejected; the smart
  zone stays manual but guided.
- **Symlink-to-global install model** — rejected in favour of vendored copies.

## Further Notes

- **Acceptance demo (defines v1 "done"):** on a fresh git repo on a clean machine —
  `npx loopdog init` → open Claude Code → `/configure-workflow` (choose local markdown)
  → hand-write one trivial `ready-for-agent` issue under `.scratch/` → `npx loopdog run`
  → observe Claude implement it, tests pass, it commits, and the issue moves to `done/`.
  If that full chain works, the product is real.
- **Naming history:** the configuration skill was renamed `setup-matt-pocock-skills` →
  `/configure-workflow` to de-couple from a person and to disambiguate from the CLI's
  `init` (file-copy) vs the skill's configuration interview.
- **Open, low-risk items (sensible defaults, decide at implementation):** npm name
  availability for `loopdog` (fallback ready); CLI arg-parsing library
  (commander / yargs / clipanion) — does not affect this PRD.
- **Guiding principle throughout:** automate the dumb zone, keep the smart zone manual
  but guided; every stage runs in fresh context so the grill does not pollute the PRD,
  the PRD does not pollute the slicing, and each loop iteration starts clean.
