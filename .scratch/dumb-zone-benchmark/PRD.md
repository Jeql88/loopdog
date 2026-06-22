# PRD: Dumb-zone benchmark — measure which implementation path loopdog should use

> Status: ready-for-agent
> Feature slug: `dumb-zone-benchmark`
> Synthesised from the grilling session of 2026-06-22. The PRD is the destination —
> everything before it sharpened intent; `/to-issues` will slice this into tracer bullets.

## Problem Statement

loopdog exists to make AI engineering faster **and** cheaper than the obvious
alternative — just chatting in one Claude Code session with plan mode. The grilling
session that produced this PRD started from a direct question: *is loopdog actually
more effective and efficient than a plain session?* — narrowed by the author to two
axes: **output quality** and **token efficiency**.

The session exposed a hole the whole project rests on: **every efficiency and quality
claim about loopdog has been argued, never measured against the alternative.** The
cache-health work measured the *loopdog path* (~200K tokens/slice, ~83% cache-read,
~$0.20/slice). But nobody has ever run the *baseline* — the same backlog implemented in
one continuous plan-mode session — so the comparative claim ("loopdog is more
efficient") is unproven in the direction the author wants it. The reasoning even
suggests loopdog likely *loses* on tokens for small backlogs (1–5 slices), because a
continuous session pays the large fixed harness prefix **once and keeps it warm**, while
loopdog re-pays it on every fresh `claude --print` process and survives only on the
cache-read discount. loopdog's real token win is *flat cost regardless of backlog depth*,
which should only beat a continuous session **past a crossover point** where the
session's ever-growing carried transcript exceeds loopdog's repeated-harness cost.

On quality, the session found loopdog's ceiling is structurally *lower* than an
attentive plain session, for a concrete, verified reason: a fresh slice agent's entire
context is `ralph prompt + one issue file + last 5 commits`
([`assemblePrompt`](../../src/run.ts), confirmed in source). There is **no `CONTEXT.md`
and no ADRs** in the repo — the "pull" layer of loopdog's own push/pull design is
empty — so each agent is blind to decisions made in earlier slices. It can reinvent an
existing module, violate an unstated convention, or contradict a settled decision,
because it was never told any of them.

During the session the author surfaced a **third implementation shape** that neither the
plain-session nor the current loopdog design covers, and which may dominate both:
keep the interactive smart zone (grill → to-prd → to-issues), but have **one persistent
Claude Code session run the ralph loop itself** over the issue files — bounded context
(it reads issues rather than carrying full transcripts) *with* preserved cross-slice
judgment (it stays alive, so slice 14 still remembers the decision from slice 3).

The real problem this PRD solves is therefore **not** "improve loopdog's quality" — it
is "**measure the three implementation paths on one shared backlog and let the data
decide loopdog's dumb-zone shape**," so that any subsequent quality fix
(`CONTEXT.md`, a self-review gate) is applied to the path the numbers actually favour
instead of to an assumption.

## Solution

Build a **reproducible head-to-head benchmark** that implements one fixed backlog three
ways and reports objective metrics, executed by Claude (not hand-run by the author), so
the result is a measurement rather than an anecdote.

**The three paths under test:**

1. **Plain session** — one continuous Claude Code session, plan mode then implement,
   working the whole backlog in a single growing context. The honest baseline.
2. **loopdog AFK (current)** — `afk.sh` / `once.sh`: a fresh `claude --print` process
   per slice, context = ralph + one issue + recent commits.
3. **One-session self-loop** — the smart zone unchanged, but a single persistent Claude
   session iterates the ready issues itself (reading issue files, not carrying full
   transcripts) until none remain.

**The metrics, fixed in advance** (so nothing is graded after the fact):

- **Token efficiency (objective):** total input / output / cache-creation / cache-read
  tokens, total `total_cost_usd`, and cache-read share — pulled from the `stream-json`
  `result` events exactly as [`parseCost`](../../src/run.ts) already does. Reported
  per-path and per-slice.
- **Quality (mechanical, pre-defined):** for each path, per slice — (a) does the slice's
  own spec/tests pass; (b) does it violate any stated invariant (deep-modules, single
  `Env` seam, cacheable-prefix ordering, model-resolved-once, never delete others'
  files); (c) does it duplicate an existing module/helper rather than reuse a seam;
  (d) does it contradict a prior slice's decision. Each is a yes/no the harness can
  check or that is auditable from the diff — **not** a subjective grade.

**Who runs it:** Claude executes the benchmark end-to-end and reports the table. The
harness is scripted and re-runnable on the same backlog and environment, so the result
can be reproduced rather than trusted.

**What the result feeds:** the winning dumb-zone shape becomes the recommendation for
loopdog's implementation stage. Only *then* are the known-good, cost-safe quality levers
applied to that shape:

- a **`CONTEXT.md`** slotted into the cacheable prefix (static → served at cache-read
  price after iteration 1; carries the module map + enforced invariants + an ADR index
  so a fresh agent pulls durable judgment without carrying any prior transcript);
- optionally a **pre-commit self-review gate** (the agent re-reads its diff against
  `CONTEXT.md` and fixes violations before committing).

These quality levers are **deliberately deferred until after the measurement**, because
if the benchmark shows a path whose quality already matches the plain session, the gate
is wasted tokens; if it shows a quality gap, `CONTEXT.md` + gate is exactly the fix and
the benchmark is the before/after baseline that proves it closed the gap.

## User Stories

1. As the author, I want the three implementation paths run on one identical backlog, so that the comparison is apples-to-apples rather than anecdote-vs-anecdote.
2. As the author, I want Claude to execute the benchmark, not me, so that the numbers are produced consistently and are not a one-off I ran by hand.
3. As a cost-conscious developer, I want total tokens and cache-read share reported per path, so that I can see whether loopdog actually uses fewer tokens than a plain session — and at what backlog size the answer flips.
4. As a developer, I want the token metrics pulled from the same `result`-event data loopdog already captures, so that measurement adds no new plumbing and is trustworthy.
5. As the author, I want quality scored against criteria defined *before* the run (spec passes / invariant violations / duplicated modules / contradicted decisions), so that scoring is mechanical and auditable, not graded-after-the-fact by the same model that wrote the code.
6. As the author, I want the one-session-self-loop path measured as a first-class option, so that the third shape I surfaced is tested, not assumed worse or better.
7. As the author, I want the benchmark harness to be re-runnable on the same backlog, so that a future change to loopdog can be re-measured against the same baseline.
8. As the author, I want the benchmark to report a clear recommendation (which path wins on tokens, which on quality, and at what backlog size each wins), so that loopdog's dumb-zone shape is chosen from data.
9. As a maintainer, I want the `CONTEXT.md` + self-review-gate quality work explicitly deferred until after the measurement, so that we don't spend tokens fixing a gap we haven't confirmed exists.
10. As the author, I want the benchmark to honestly note where measurement is objective (tokens) versus where the scorer has bias (Claude grading its own quality), so that the result is not oversold.
11. As the author, I want the validated facts and the decision rationale from this session recorded durably in the PRD, so that future me does not re-litigate "is loopdog worth it" without the experiment.

## Implementation Decisions

**This is a benchmark + a decision, not a loopdog feature change.** The deliverable is a
reproducible harness, a results table, and a recommendation. It does not modify the
serial loop, the parallel orchestrator, model selection, or the cost capture — it
*uses* the existing cost capture as its measurement instrument.

**Fixed backlog.** Pick a small, real, multi-slice backlog (candidate: a fresh
throwaway repo with 3–5 independent slices, mirroring the cache-health validation run so
the loopdog numbers are comparable to the already-measured ~$0.20/slice). The same
backlog is used unchanged for all three paths. The backlog definition is part of the
harness so the run is reproducible.

**Claude runs all three paths.** loopdog AFK via `afk.sh`. Plain session and
self-loop are driven by Claude spawning `claude` appropriately (plan-then-implement in
one context; single persistent context iterating issues). Token/cost numbers come from
the `stream-json` `result` events for every path, so the three are measured on the same
instrument.

**Quality scoring is mechanical and pre-registered.** The four checks (spec passes /
invariant violation / module duplication / contradicted decision) are defined in the
harness *before* running and applied identically to all three paths' diffs. Where a
check needs judgment, the criterion is written down so the author can audit the call.

**Deferred (explicitly): the quality levers.** `CONTEXT.md` (module map + invariants +
ADR index, placed in the cacheable prefix) and the optional pre-commit self-review gate
are designed in this PRD but **not built** until the benchmark says which path to apply
them to. They are cost-safe (static prefix → cache-read priced) but pointless to build
before the measurement.

## Testing Decisions

**What makes a good test here:** the benchmark's own outputs must be deterministic in
*shape* even though token counts vary run-to-run. Assert the harness produces, for each
of the three paths, a complete metrics record (all token categories + cost + cache-read
share) and a complete quality record (all four checks scored) — i.e. no path is
silently skipped and no metric is silently dropped. The token-parsing reuse is already
covered by the existing `parseCost` tests; the new harness is tested for *coverage and
shape of its report*, not for specific token magnitudes.

**Module tested:** the benchmark harness, through the same `Env` seam the rest of
loopdog uses, with a fake env feeding canned `stream-json` `result` events so the
report-assembly and quality-scoring logic are unit-testable without spawning real
agents. A single live smoke run (real `claude`, the fixed backlog) validates the harness
end-to-end, mirroring how the cache-health work was validated by one real two-slice run.

**Prior art:** the cache-health validation run is the template — a real loop on a
throwaway repo, numbers lifted from `result` events. This PRD generalises that from
"measure loopdog" to "measure loopdog *against two alternatives* on the same backlog."

## Out of Scope

- **Building `CONTEXT.md` or the self-review gate.** Designed here, deferred until the
  benchmark picks the path. (They are the *next* PRD, informed by this one's result.)
- **Changing the serial loop, parallel orchestrator, model selection, or cost capture.**
  The benchmark uses these as-is; it does not modify them.
- **A statistically rigorous multi-trial study.** v1 is one fixed backlog run per path
  (plus the canned-event unit tests), enough to expose a clear winner or a clear
  crossover; repeated-trial variance analysis is later work.
- **Grading quality subjectively.** Only the pre-registered mechanical checks count; a
  nuanced "this code is more elegant" judgment is explicitly excluded to avoid
  self-grading bias.
- **Benchmarking parallel mode.** The three paths are serial-comparable; parallel mode
  trades tokens for wall-clock (per the parallel-agents PRD) and is a different axis.

## Further Notes

- **Validated facts carried in from prior sessions:** loopdog's loop works end-to-end;
  the cross-process prompt cache *is* reused (~83% cache-read); a slice moves ~200K
  mostly-harness tokens at ~$0.20 only because of that cache-read discount; harness
  overhead dominates everything loopdog controls. These are the loopdog-path numbers the
  benchmark compares the other two paths against.
- **The crossover hypothesis (to be confirmed or killed by the benchmark):** a plain
  continuous session uses *fewer* tokens than loopdog for small backlogs (it pays the
  harness prefix once), and loopdog only wins past the backlog size where the session's
  carried transcript exceeds loopdog's repeated-harness cost. The benchmark should report
  *where* that crossover is, not just a single winner.
- **The third path is the interesting one:** the one-session self-loop may capture
  loopdog's bounded cost *and* a plain session's cross-slice judgment simultaneously —
  the design's core tension (bounded context vs. preserved judgment) may have a third
  resolution nobody had named before this session.
- **Honest framing recorded:** loopdog is not inherently "a better way to write code" —
  it is a batch executor for code already thought-through in the smart zone. Its
  uncontested win is *bounded human attention across a deep backlog*; the token and
  quality wins are conditional and are exactly what this benchmark exists to test.
- **Scoring-bias caveat:** token metrics are objective; quality scoring is performed by
  the same family of model that wrote the code, so the quality verdict is reported with
  that caveat and the mechanical criteria are auditable by the author.
