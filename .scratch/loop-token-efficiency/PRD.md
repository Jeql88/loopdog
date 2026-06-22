# PRD — Token-efficient AFK runs (run/loop)

> Status: ready-for-agent

## Problem Statement

When I leave `loopdog run` / `loopdog loop` working through my established backlog
overnight, it burns through far more tokens (and dollars) than the work seems to
warrant. I tested it on a real repo and watched it exhaust its budget — one
iteration spent its entire turn just rediscovering that an issue was already
implemented. I want the autonomous loop to be **cheap enough to use day-by-day**
for clearing a ready backlog, without giving up the thing that makes it work:
fresh context per slice.

The waste is structural, not incidental. Each iteration spawns a brand-new
headless `claude` that (a) re-ingests the whole prompt, (b) re-discovers the
codebase from scratch, and (c) creates a fresh prompt cache it can never reuse —
because the process is thrown away between slices and the prompt cache has a
~5-minute TTL. A trivial run measured ~19K cache-*creation* tokens with
cache-*read* at zero, and a real dollar cost on a near-no-op turn. Multiply that
across a 9-issue backlog and the loop is paying the full cold-start tax nine
times over. On top of that, every iteration runs on Opus and is handed **all**
ready issues even though it implements only one.

## Solution

Make each cold start dramatically cheaper **without ever sacrificing per-slice
context hygiene** (fresh process per slice stays sacred — it is loopdog's reason
to exist). Five changes stack:

1. **Measure first.** Before/while optimizing, surface what each iteration
   actually costs — tokens in/out, cache creation vs read, and dollar cost —
   pulled for free from the stream-json `result` event loopdog already receives.
   A loop prints a per-iteration line and an end-of-loop summary, so I can see
   where the tokens go and whether the other changes are working.

2. **Cacheable prompt order.** Restructure the per-iteration prompt so the large
   static part (ralph instructions, then the single issue) comes first and the
   volatile part (recent commits) comes last. Consecutive iterations that fire
   within the cache TTL then pay cache-*read* rates (~10% of input price) on the
   shared prefix instead of full cache-*creation*.

3. **Deterministic one-issue selection.** loopdog picks the lowest-numbered
   `ready-for-agent` issue itself and sends **only that one issue** in the
   prompt, instead of dumping all ready issues and letting the agent choose.
   Smaller prompt, identical cacheable prefix across iterations, and no more
   "rediscover an already-done issue" waste.

4. **Commits relocated + trimmed.** The `git log` block moves to the very end of
   the prompt and shrinks to a handful of recent commits, so the part that
   changes every iteration can't bust the cacheable prefix.

5. **Model-to-zone.** The AFK dumb-zone path (`run`/`loop`, TDD implementation)
   defaults to a cheaper model (Sonnet); the human smart-zone work stays on Opus.
   A per-run override lets me bump a hard feature back up to Opus.

The result: a stable cheaper model + a cacheable static prefix + a one-issue
prompt is far cheaper per completed slice than today's Opus / cold-start /
all-issues run — while each slice still starts in a clean, fresh context.

## User Stories

1. As a developer running loopdog AFK, I want each iteration to report its token usage and dollar cost, so that I can see what the loop actually costs me.
2. As a developer, I want an end-of-loop summary of total tokens and cost across all iterations, so that I can judge whether a backlog run was worth it.
3. As a developer, I want per-iteration cost broken into input, output, cache-creation, and cache-read tokens, so that I can tell whether caching is actually working.
4. As a developer, I want the cost reporting to come from data the loop already receives, so that measuring doesn't itself add token cost.
5. As a developer, I want the static part of each iteration's prompt to be byte-identical across iterations, so that the prompt cache can be reused between slices.
6. As a developer, I want consecutive iterations within the cache window to pay cache-read rates on the shared prefix, so that the loop stops paying the full cold-start tax every slice.
7. As a developer, I want loopdog to pick the single next ready issue itself, so that the agent isn't handed nine issues to implement one.
8. As a developer, I want only the selected issue's text in the prompt, so that the prompt is smaller and the cacheable prefix stays identical.
9. As a developer, I want loopdog to select the lowest-numbered `ready-for-agent` issue, so that issues are worked in a predictable order.
10. As a developer, I want issues that aren't `ready-for-agent` (needs-info, done, etc.) excluded from selection, so that the loop never picks up blocked or finished work.
11. As a developer, I want an issue an agent couldn't complete (flipped to `needs-info`) to be skipped on the next selection, so that the loop doesn't re-attempt the same blocked slice forever.
12. As a developer, I want the loop to stop cleanly when no `ready-for-agent` issue remains, so that an empty backlog ends the run instead of inventing work.
13. As a developer, I want recent commits placed at the end of the prompt, so that the changing commit list doesn't invalidate the cacheable prefix.
14. As a developer, I want the commit list trimmed to a small number of recent commits, so that the volatile tail of the prompt is as small as possible.
15. As a developer running the AFK loop, I want it to default to a cheaper model (Sonnet) for implementation, so that clearing a backlog is affordable day-to-day.
16. As a developer, I want to override the implementation model per run, so that I can bump a hard feature up to Opus when Sonnet's output would be poor.
17. As a developer, I want the chosen model to stay stable across a whole loop run, so that the prompt cache (which is model-scoped) is actually reused between iterations.
18. As a developer, I want the model configurable in `loopdog.json`, so that my default is recorded and doesn't need re-specifying each run.
19. As a developer, I want the smart-zone interactive skills to stay on Opus, so that high-judgment work (grilling, PRD, slicing, review) keeps its quality.
20. As a cost-conscious developer, I want to compare cost-per-*completed*-slice (not per-iteration) across models, so that a cheaper model that thrashes doesn't masquerade as a saving.
21. As a developer, I want a malformed or absent config to fall back to safe defaults, so that an unattended loop never bricks on a bad `loopdog.json`.
22. As a developer, I want each slice to still run in a fresh `claude` process, so that finished-plan context never bleeds into the next slice's reasoning.
23. As a developer, I want the cost/selection/model behavior to be driven through the same single environment seam, so that it's all testable without a live agent.
24. As a developer, I want the stop-signal detection to keep working regardless of output format, so that the loop still knows when the backlog is empty.
25. As a developer, I want existing run/loop behavior (live streamed output, summaries, Windows spawn, remote-tracker gate) to keep working unchanged, so that the efficiency work is additive, not a regression.

## Implementation Decisions

All behavior reaches the outside world through the **single existing `Env` port**
(`src/env.ts`) — the one seam the codebase is already built and tested on. No new
seam is introduced. The work modifies four modules behind that seam.

### Issue selection moves into loopdog (deterministic)

- loopdog selects the **lowest-numbered `ready-for-agent` issue** itself, in
  deterministic code, and sends **only that issue** to the agent. Selection
  reuses the existing file-gathering/sorting logic (issue files are already
  discovered, sorted, and filtered by the `Status: ready-for-agent` line,
  excluding the `done/` archive).
- The agent no longer chooses which issue to work — it is handed exactly one.
- **Skip-ambiguous is preserved** by status, not by agent discretion: an agent
  that can't complete a slice flips its `Status:` to `needs-info`; loopdog's
  selector already excludes non-`ready-for-agent` files, so the next selection
  skips it.
- When no `ready-for-agent` issue exists, the loop emits the existing stop
  signal and stops.

### Prompt re-ordering for cache reuse

- Per-iteration prompt order becomes: **static prefix first** (ralph
  instructions, then the single selected issue), **volatile tail last** (recent
  commits). This inverts today's order, where the changing commit list sits in
  the middle and busts the cache for everything after it.
- The static prefix must be byte-identical across iterations for cache reuse to
  land; the only thing that legitimately varies between iterations is which
  single issue is selected (and, naturally, the trailing commits).

### Commit context relocated + trimmed

- The recent-commits block moves to the **end** of the prompt.
- The commit count is **trimmed** (from the current 20 to roughly 5). Commits
  are kept (not dropped) to preserve a modest "what just happened" hygiene
  signal; whether they can be dropped entirely is deferred to measurement.

### Model selection by zone

- The AFK loop (`run`/`loop`) passes a `--model <id>` argument to the spawned
  `claude`, defaulting to **Sonnet** (the dumb-zone, cost-sensitive path).
- The model is read from config and is **stable for the entire loop run** — it
  must not change between iterations, because the prompt cache is model-scoped
  and a mid-loop model switch would invalidate it.
- A **per-run override** lets the operator bump to Opus for a hard feature
  (recorded in `loopdog.json` and/or a CLI override; the config field is the
  durable record).
- Smart-zone interactive skills are unaffected and remain on Opus.

### Cost measurement from stream-json

- loopdog already spawns `claude` with `--output-format stream-json --verbose`
  and parses the streamed JSON lines. The terminal `result` event carries
  `usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
  `cache_read_input_tokens`) and `total_cost_usd`. Capture these — no extra
  request, no estimation.
- After each iteration, surface a per-iteration cost line (tokens broken into
  input / output / cache-creation / cache-read, plus dollar cost). At loop end,
  surface a summary across all iterations.
- Granularity is **per-iteration totals + loop summary** — not a per-phase
  (discovery vs implement vs review) breakdown, which would require instrumenting
  the inner skills and isn't worth the build until the coarse signal proves
  insufficient.

### Config (`loopdog.json` via `loadConfig`)

- Add a model setting for the AFK loop under the existing `loop` config block
  (default Sonnet), read through the existing `loadConfig` with the existing
  malformed/absent → defaults fallback behavior.

### Invariants preserved

- **Fresh process per slice stays sacred.** No warm-session reuse, no carrying
  conversation across slices — only the *cold start itself* is made cheaper.
- Existing behavior is additive-only: live streamed output, run/loop summary
  lines, the Windows stdin+shell spawn, the remote-tracker AFK gate, and
  stop-signal detection all keep working. Stop-signal detection scans the raw
  captured stdout, so it is unaffected by prompt-format or model changes.

## Testing Decisions

A good test here asserts **external behavior at the `Env` seam**, never internal
helper shapes. The codebase already drives `run`/`loop` entirely through a fully
in-memory fake `Env` with a fake-`claude` spawner that records every spawn call
(`cmd`, `args`, `stdin`) and serves canned stream-json results, plus a `writeOut`
/ `write` sink. That is the prior art and the pattern to follow
(see the existing `run`/`loop`/`config` tests).

Tests to write, all through `runRun` / `runLoop` / `loadConfig` with the fake env:

- **One-issue selection:** given several `ready-for-agent` issues plus
  needs-info/done files, the `stdin` handed to the spawned `claude` contains
  exactly the lowest-numbered ready issue and **not** the others; archived
  (`done/`) work never appears.
- **Skip-by-status:** an issue not marked `ready-for-agent` is never selected;
  flipping a previously-selected issue to `needs-info` causes the next selection
  to pick the following ready issue.
- **Empty backlog:** with no ready issue, the loop emits the stop signal and
  stops.
- **Prompt order:** in the assembled `stdin`, the static prefix (ralph + the
  single issue) precedes the commit block, and commits are last.
- **Commit trim:** the commit block reflects the trimmed count, sourced via the
  port's `git log` spawn.
- **Model flag:** the spawned `claude` args include `--model` with the
  configured id (default Sonnet); a per-run override changes it; the model is the
  same across every iteration of a loop.
- **Cost reporting:** given a canned stream-json `result` event with a `usage`
  block and `total_cost_usd`, `writeOut` receives a per-iteration cost line, and
  a multi-iteration loop emits a summary.
- **Config:** the new model field loads from `loopdog.json`, and a
  missing/malformed file falls back to the documented defaults (existing
  `loadConfig` behavior).

Cost-per-completed-slice comparison across models is an **operational
measurement** the developer performs using the new reporting — it is not a unit
test (live-agent runs are slow, flaky, and token-costly and are excluded from CI,
consistent with the project's acceptance-demo policy).

## Out of Scope

- **Warm-session reuse / carrying context across slices.** Explicitly rejected —
  it would violate the sacred fresh-context-per-slice invariant.
- **Per-phase token breakdown** (discovery vs implement vs review vs test).
  Deferred unless per-iteration totals fail to reveal the cost culprit; it would
  require instrumenting the inner skills.
- **A hard token/dollar budget cap that halts the loop.** This PRD measures and
  reduces cost; a spend ceiling is a separate, later concern.
- **Trimming harness overhead** (Claude Code system prompt, tool schemas,
  CLAUDE.md, auto-loaded skills) — partly outside loopdog's control; a secondary,
  opportunistic lever, not part of this PRD.
- **The parallel-agents feature** (`.scratch/parallel-agents/`) — separate work
  with its own PRD.
- **Dropping commits from the prompt entirely** — kept as a measurement-gated
  follow-up, not done blind here.

## Further Notes

- The five levers **stack and are complementary, not competing.** Model choice
  and cache reuse in particular reinforce each other once model is stable per run
  (caches are model-scoped). Sequencing should let measurement (lever 1) land
  early so the other levers can be validated against real cost numbers.
- Verified facts behind the design: a trivial stream-json run reported
  `cache_creation_input_tokens` ≈ 19K with `cache_read_input_tokens` = 0 and a
  real `total_cost_usd`, confirming the cold-start-per-slice cache tax as the
  prime cost driver; the `result` event exposes all the usage/cost fields needed
  for lever 1 at no extra cost.
- Pricing context (per MTok, mid-2026): Opus 4.8 $5/$25, Sonnet 4.6 $3/$15,
  Haiku 4.5 $1/$5; cache read ≈ 0.1× input, cache write 1.25× (5m) / 2× (1h).
  Sonnet is ~40% cheaper than Opus, Haiku ~80% — which is why the dumb-zone
  default drops to Sonnet while Opus stays available as the per-run escape hatch.
- Haiku was considered as the default and set aside: its thrash risk on
  TDD+review means a failed iteration costs a full cold-start for zero progress,
  which can erase the per-token saving. Hence Sonnet as the balanced default,
  measured by cost-per-*completed*-slice.
