#!/usr/bin/env node
/**
 * Dumb-zone benchmark harness — loopdog-afk path.
 *
 * Provides:
 *   - A fixed, committed backlog (FIXED_BACKLOG) of 3 independent slices on a
 *     throwaway Node.js project. Defined as data so every run uses the identical
 *     input — reproducible, not hand-assembled.
 *   - setupBenchmarkRepo(env): writes the backlog + project skeleton into
 *     env.cwd(), initialises a git repo, and makes an initial commit.
 *   - runBenchmarkLoopDogAFK(env, options): drives the loopdog AFK path (one
 *     runRun iteration per ready issue) until the stop signal or maxIterations.
 *     Costs come from RunResult.cost which runRun already fills via parseCost —
 *     no new token plumbing.
 *   - formatPathMetrics(metrics): formats the single-path metrics record.
 *
 * The module is exercised through the Env seam so tests can inject a fake env
 * (no live agent required). For a live run use the CLI entry point at the
 * bottom of this file (invoked by benchmark.sh).
 */
import { argv, exit } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { Env } from "./env.ts";
import { realEnv } from "./env.ts";
import {
  runRun,
  parseCost,
  ZERO_COST,
  HEADLESS_SYSTEM_PROMPT,
  type Cost,
} from "./run.ts";

// ---------------------------------------------------------------------------
// Fixed backlog
// ---------------------------------------------------------------------------

/** One issue file: a filename and its full markdown body. */
export interface SliceDef {
  filename: string;
  content: string;
}

/**
 * The fixed, committed backlog — 3 independent slices on a minimal Node.js
 * utility project (`tinyutils`). Plain ESM, no build step, so the agent's
 * whole budget goes on implementation not tooling setup.
 *
 * Each slice is truly independent: `sum` and `clamp` live in `src/math.js`,
 * `words` lives in `src/text.js`. An agent implementing any one slice does not
 * need to know about the others.
 */
export const FIXED_BACKLOG: readonly SliceDef[] = [
  {
    filename: "01-add-sum.md",
    content: `# 01 — Add \`sum\` utility function

> Status: ready-for-agent

## What to build

Add a \`sum(nums)\` function to \`src/math.js\` (plain ESM, no build step).
Return the arithmetic sum of the array elements; return \`0\` for an empty array.

## Acceptance criteria

- [ ] \`src/math.js\` exports a named \`sum\` function
- [ ] \`test/math.test.js\` covers: \`sum([])\` → \`0\`, \`sum([1, 2, 3])\` → \`6\`
- [ ] \`npm test\` passes
`,
  },
  {
    filename: "02-add-words.md",
    content: `# 02 — Add \`words\` utility function

> Status: ready-for-agent

## What to build

Add a \`words(s)\` function to \`src/text.js\` (plain ESM, no build step).
Split the string on any whitespace and return only non-empty tokens.

## Acceptance criteria

- [ ] \`src/text.js\` exports a named \`words\` function
- [ ] \`test/text.test.js\` covers: empty string → \`[]\`, \`" hello  world "\` → \`["hello", "world"]\`
- [ ] \`npm test\` passes
`,
  },
  {
    filename: "03-add-clamp.md",
    content: `# 03 — Add \`clamp\` utility function

> Status: ready-for-agent

## What to build

Add a \`clamp(value, min, max)\` function to \`src/math.js\` (plain ESM, no build step).
Return \`min\` when \`value < min\`, \`max\` when \`value > max\`, otherwise \`value\`.

## Acceptance criteria

- [ ] \`src/math.js\` exports a named \`clamp\` function
- [ ] \`test/math.test.js\` covers: below-min, above-max, within-range
- [ ] \`npm test\` passes
`,
  },
];

/**
 * Minimal project skeleton committed into the throwaway repo before the agents
 * run. Plain ESM + node --test so there is no build step for the agent to set up.
 */
export const REPO_SKELETON: Readonly<Record<string, string>> = {
  "package.json":
    JSON.stringify(
      {
        name: "tinyutils",
        version: "1.0.0",
        type: "module",
        scripts: { test: "node --test" },
      },
      null,
      2,
    ) + "\n",
  "README.md": "# tinyutils\n\nThrowaway benchmark repo — do not use.\n",
};

// ---------------------------------------------------------------------------
// Repo setup
// ---------------------------------------------------------------------------

/**
 * Initialise a fresh benchmark repo in `env.cwd()`: git init, project skeleton,
 * fixed backlog under `.scratch/bench/issues/`, then an initial commit so
 * `git log` has something to return when the first agent iteration runs.
 *
 * Safe to call on an empty directory. git init is idempotent so re-running on
 * an already-initialised repo is harmless (though the fixed backlog would
 * already be there).
 */
export async function setupBenchmarkRepo(env: Env): Promise<void> {
  const root = env.cwd();

  await env.spawn("git", ["init"]);
  await env.spawn("git", ["config", "user.email", "bench@loopdog"]);
  await env.spawn("git", ["config", "user.name", "loopdog-bench"]);

  // Project skeleton.
  for (const [rel, content] of Object.entries(REPO_SKELETON)) {
    await env.writeFile(`${root}/${rel}`, content);
  }

  // Backlog — the fixed input the AFK agents will work through.
  const issuesDir = `${root}/.scratch/bench/issues`;
  await env.mkdir(issuesDir);
  for (const slice of FIXED_BACKLOG) {
    await env.writeFile(`${issuesDir}/${slice.filename}`, slice.content);
  }

  // Initial commit: gives git log a non-empty output from the very first
  // iteration, keeping the prompt consistent across runs.
  await env.spawn("git", ["add", "-A"]);
  await env.spawn("git", ["commit", "-m", "chore: benchmark scaffolding"]);
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** The three implementation paths the benchmark compares. */
export type BenchPath = "plain-session" | "loopdog-afk" | "one-session-self-loop";

/**
 * cache-read ÷ (cache-read + cache-creation) as a whole-number percent — the
 * direct signal of cross-process cache reuse, the same metric the cache-health
 * verdict uses. Returns 0 when no cached tokens were seen (a single short
 * iteration), so the report degrades gracefully instead of dividing by zero.
 */
export function cacheReadSharePct(cost: Cost): number {
  const cached = cost.cacheReadTokens + cost.cacheCreationTokens;
  if (cached === 0) return 0;
  return Math.round((cost.cacheReadTokens / cached) * 100);
}

/**
 * One slice's measured cost within a path run. The per-slice breakdown the
 * benchmark grades on — so a path that front-loads cache-write on its first
 * slice and reads cheaply thereafter is visible, not hidden in the total.
 */
export interface SliceMetrics {
  /** 1-based position in the run (iteration order). */
  index: number;
  cost: Cost;
  /** cache-read share for this slice alone, whole-number percent. */
  cacheReadShare: number;
}

/**
 * Per-path metrics record produced by one complete run over the fixed backlog.
 * Token numbers come from RunResult.cost, which runRun fills via parseCost — no
 * new token plumbing is added here. Carries BOTH the path total and the
 * per-slice breakdown, so no metric is silently dropped (slice 02 contract).
 */
export interface PathMetrics {
  path: BenchPath;
  /** How many iterations executed. */
  iterations: number;
  /** Why the loop ended. */
  stoppedBy: "stop-signal" | "max-iterations" | "error";
  /** Token usage + dollar cost summed across all iterations. */
  totalCost: Cost;
  /** cache-read share for the whole run, whole-number percent. */
  cacheReadShare: number;
  /** Per-slice breakdown, in iteration order. */
  slices: SliceMetrics[];
}

/** One token line, shared by the path total and each per-slice line. */
function formatCostTokens(c: Cost): string {
  return `in: ${c.inputTokens}  out: ${c.outputTokens}  cache-write: ${c.cacheCreationTokens}  cache-read: ${c.cacheReadTokens}  $${c.costUsd.toFixed(4)}`;
}

/**
 * Format the single-path metrics record as a human-readable string. Includes
 * all token categories, dollar cost, and cache-read share for the path total
 * AND each slice, so nothing is silently dropped from the report.
 */
export function formatPathMetrics(metrics: PathMetrics): string {
  const lines = [
    `=== benchmark: ${metrics.path} ===`,
    `iterations: ${metrics.iterations}  stopped-by: ${metrics.stoppedBy}`,
    `total — ${formatCostTokens(metrics.totalCost)}`,
    `cache-read share: ${metrics.cacheReadShare}%`,
  ];
  for (const s of metrics.slices) {
    lines.push(`  slice ${s.index} — ${formatCostTokens(s.cost)}  (cache-read ${s.cacheReadShare}%)`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// AFK path runner
// ---------------------------------------------------------------------------

export interface BenchmarkRunOptions {
  ralphPrompt: string;
  permissionMode: string;
  model?: string;
  /** Safety backstop; defaults to 20. */
  maxIterations?: number;
}

/**
 * Run the loopdog AFK path on the repo rooted at `env.cwd()`. Calls `runRun`
 * in a loop until the stop signal or `maxIterations`. Per-iteration cost comes
 * straight from `RunResult.cost` (which `runRun` fills via `parseCost`) —
 * no duplicated token plumbing.
 */
export async function runBenchmarkLoopDogAFK(
  env: Env,
  options: BenchmarkRunOptions,
): Promise<PathMetrics> {
  const max = options.maxIterations ?? 20;
  let totalCost: Cost = { ...ZERO_COST };
  let stoppedBy: PathMetrics["stoppedBy"] = "max-iterations";
  const slices: SliceMetrics[] = [];

  while (slices.length < max) {
    const result = await runRun(env, {
      ralphPrompt: options.ralphPrompt,
      permissionMode: options.permissionMode,
      model: options.model,
    });

    // Count this as a measured slice iff the agent actually spawned (did work).
    // A pure stop iteration — loopdog's own selectNextIssue finding nothing —
    // has spawned:false and zero cost; it's the terminator, not a slice.
    if (result.spawned) {
      slices.push({
        index: slices.length + 1,
        cost: result.cost,
        cacheReadShare: cacheReadSharePct(result.cost),
      });
      totalCost = addCost(totalCost, result.cost);
    }

    if (!result.ok) {
      stoppedBy = "error";
      break;
    }
    if (result.stopSignal) {
      stoppedBy = "stop-signal";
      break;
    }
  }

  return {
    path: "loopdog-afk",
    iterations: slices.length,
    stoppedBy,
    totalCost,
    cacheReadShare: cacheReadSharePct(totalCost),
    slices,
  };
}

// ---------------------------------------------------------------------------
// Plain-session and one-session-self-loop paths (slice 03)
// ---------------------------------------------------------------------------

/**
 * Turn budget for a single-context path (plain-session / self-loop). Larger
 * than loopdog's per-slice cap because one invocation works the whole backlog;
 * sized so a small fixed backlog always completes without truncating its cost.
 */
export const SINGLE_CONTEXT_MAX_TURNS = 400;

/**
 * Both the plain-session and self-loop paths work the whole backlog in a SINGLE
 * persistent `claude` invocation (one growing context), so unlike loopdog-afk
 * they produce one `result` event for the entire run rather than one per slice.
 * This drives that single spawn and turns its captured stdout into the same
 * PathMetrics shape — `slices` holds the one measured invocation so the record
 * is structurally identical to the AFK path's (no metric or per-slice entry
 * silently missing). Token numbers come from `parseCost` — no new plumbing.
 *
 * The task prompt differs per path (plain plan-then-implement vs. read-the-
 * issue-files self-loop); the spawn mechanics are shared so neither path's
 * driving overhead contaminates the measured numbers differently.
 */
async function runSingleSpawnPath(
  env: Env,
  path: BenchPath,
  taskPrompt: string,
  options: BenchmarkRunOptions,
): Promise<PathMetrics> {
  const result = await env.spawn(
    "claude",
    [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--append-system-prompt",
      HEADLESS_SYSTEM_PROMPT,
      // A single-context path works the WHOLE backlog in one invocation, so it
      // needs a higher turn budget than one loopdog slice — otherwise it could
      // hit the cap mid-backlog and understate its cost. Generous enough that a
      // small backlog always finishes; still bounded so a stray question can't
      // hang the run.
      "--max-turns",
      String(SINGLE_CONTEXT_MAX_TURNS),
      "--permission-mode",
      options.permissionMode,
      "--model",
      options.model ?? "sonnet",
    ],
    { stdin: taskPrompt, onData: (chunk) => env.write(String(chunk)) },
  );

  const cost = parseCost(result.stdout);
  return {
    path,
    iterations: 1,
    stoppedBy: result.code === 0 ? "stop-signal" : "error",
    totalCost: cost,
    cacheReadShare: cacheReadSharePct(cost),
    slices: [{ index: 1, cost, cacheReadShare: cacheReadSharePct(cost) }],
  };
}

/**
 * Plain-session path: one continuous session, plan mode then implement, working
 * the whole backlog in a single growing context. The honest baseline — it pays
 * the harness prefix once and keeps it warm.
 */
export function runBenchmarkPlainSession(
  env: Env,
  options: BenchmarkRunOptions,
): Promise<PathMetrics> {
  const prompt =
    "You are implementing a backlog of independent slices in ONE continuous " +
    "session. First read every issue under .scratch/bench/issues/, plan the work, " +
    "then implement each slice in turn: write the code and its tests, run `npm " +
    "test`, and commit each slice referencing its issue file. Work the whole " +
    "backlog in this single context. Stop when no ready issues remain.";
  return runSingleSpawnPath(env, "plain-session", prompt, options);
}

/**
 * One-session-self-loop path: a single persistent session iterates the ready
 * issue files itself — reading the issue files rather than carrying full
 * transcripts — until none remain. Bounded context WITH preserved cross-slice
 * judgment (it stays alive, so a late slice still remembers an early decision).
 */
export function runBenchmarkSelfLoop(
  env: Env,
  options: BenchmarkRunOptions,
): Promise<PathMetrics> {
  const prompt =
    "You are running a self-directed implementation loop in ONE session. Repeat: " +
    "(1) list .scratch/bench/issues/, pick the lowest-numbered file whose Status " +
    "is ready-for-agent; if none, stop. (2) Read THAT issue file only, implement " +
    "the slice (code + tests), run `npm test`, commit referencing the issue, and " +
    "set its Status to done. Read issue files each round rather than relying on " +
    "memory of earlier transcripts. Continue until no ready issues remain.";
  return runSingleSpawnPath(env, "one-session-self-loop", prompt, options);
}

function addCost(a: Cost, b: Cost): Cost {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

// ---------------------------------------------------------------------------
// Mechanical quality scoring (slice 04)
// ---------------------------------------------------------------------------

/**
 * The four pre-registered quality checks, defined here BEFORE any run so they
 * are applied identically to all three paths and cannot be reverse-engineered
 * to flatter one path's output. Each is a yes/no that is either harness-
 * computed or auditable from the diff — deliberately NOT a subjective "is this
 * elegant" grade, to avoid the model grading its own taste.
 *
 * `criterion` is the written rule the author audits the call against; it is
 * surfaced in the report so a human can check the harness's verdict.
 */
export const QUALITY_CHECKS = [
  {
    key: "specPasses",
    label: "spec/tests pass",
    criterion:
      "The slice's own tests run green (`npm test` exit 0 for the slice's test file).",
  },
  {
    key: "noInvariantViolation",
    label: "no invariant violation",
    criterion:
      "Honours stated invariants: deep modules, single Env seam, cacheable-prefix " +
      "ordering, model resolved once, never deletes files it did not create.",
  },
  {
    key: "noModuleDuplication",
    label: "no module duplication",
    criterion:
      "Reuses an existing module/helper/seam rather than reinventing one that " +
      "already exists.",
  },
  {
    key: "noContradictedDecision",
    label: "no contradicted decision",
    criterion: "Does not contradict a decision settled by an earlier slice.",
  },
] as const;

export type QualityCheckKey = (typeof QUALITY_CHECKS)[number]["key"];

/** A yes/no verdict for one check on one slice, plus an audit note. */
export interface CheckResult {
  /** true = the desirable outcome (passes / no violation / no dup / no contradiction). */
  pass: boolean;
  /** Short evidence so the author can audit the call from the diff. */
  note: string;
}

/** All four checks scored for one slice of one path. */
export interface SliceQuality {
  index: number;
  checks: Record<QualityCheckKey, CheckResult>;
}

/** Per-path quality record: every slice scored on every check. */
export interface PathQuality {
  path: BenchPath;
  slices: SliceQuality[];
}

/**
 * Score one slice against all four checks. The scorer is supplied by the caller
 * (the live harness wires a diff/test-driven scorer; tests inject a canned one)
 * — but this function GUARANTEES completeness: it always emits a verdict for
 * every registered check, defaulting to a recorded "unscored" fail rather than
 * silently dropping a check the scorer forgot.
 */
export function scoreSlice(
  index: number,
  scorer: (key: QualityCheckKey) => CheckResult | undefined,
): SliceQuality {
  const checks = {} as Record<QualityCheckKey, CheckResult>;
  for (const check of QUALITY_CHECKS) {
    checks[check.key] =
      scorer(check.key) ?? { pass: false, note: "unscored — scorer returned no verdict" };
  }
  return { index, checks };
}

/**
 * Assert a path's quality record is complete: one SliceQuality per slice, each
 * carrying all four checks. Returns the record unchanged so it can be used
 * fluently; throws loudly if any check is missing — completeness is the slice
 * 04 contract and a silent gap would falsely read as "all paths covered".
 */
export function assertQualityComplete(quality: PathQuality, expectedSlices: number): PathQuality {
  if (quality.slices.length !== expectedSlices) {
    throw new Error(
      `quality record for ${quality.path}: expected ${expectedSlices} slices, got ${quality.slices.length}`,
    );
  }
  for (const slice of quality.slices) {
    for (const check of QUALITY_CHECKS) {
      if (!(check.key in slice.checks)) {
        throw new Error(
          `quality record for ${quality.path} slice ${slice.index}: missing check ${check.key}`,
        );
      }
    }
  }
  return quality;
}

// ---------------------------------------------------------------------------
// Report, recommendation, crossover (slice 05)
// ---------------------------------------------------------------------------

/** One path's full result: token metrics + quality, ready for the report. */
export interface PathResult {
  metrics: PathMetrics;
  quality: PathQuality;
}

export interface BenchmarkReport {
  results: PathResult[];
  /** Path with the lowest total dollar cost. */
  tokenWinner: BenchPath;
  /** Path with the most quality checks passed. */
  qualityWinner: BenchPath;
  /**
   * Plain-language crossover note: a continuous session pays the harness prefix
   * once, so it tends to win tokens on SMALL backlogs; loopdog-afk's flat
   * per-slice cost only wins past the backlog size where a session's carried
   * transcript exceeds loopdog's repeated-harness cost. Stated from the measured
   * run, not invented.
   */
  crossover: string;
}

/** Count the passed checks across all slices of a path. */
function qualityScore(q: PathQuality): number {
  return q.slices.reduce(
    (n, s) => n + Object.values(s.checks).filter((c) => c.pass).length,
    0,
  );
}

/**
 * Assemble the benchmark report from each path's metrics + quality. Picks the
 * token winner (lowest total cost) and quality winner (most checks passed), and
 * derives the crossover note from the measured per-slice costs. Throws loudly if
 * any path is missing a metrics or quality record — no path may be silently
 * skipped (the slice 03/04 completeness contract carried into the report).
 */
export function buildReport(results: PathResult[]): BenchmarkReport {
  if (results.length === 0) throw new Error("buildReport: no path results");
  for (const r of results) {
    if (!r.metrics) throw new Error(`buildReport: ${r.quality?.path} missing metrics`);
    if (!r.quality) throw new Error(`buildReport: ${r.metrics?.path} missing quality`);
  }

  const tokenWinner = results.reduce((best, r) =>
    r.metrics.totalCost.costUsd < best.metrics.totalCost.costUsd ? r : best,
  ).metrics.path;

  const qualityWinner = results.reduce((best, r) =>
    qualityScore(r.quality) > qualityScore(best.quality) ? r : best,
  ).metrics.path;

  // Per-slice cost of the loopdog-afk path is flat (fresh harness each slice);
  // the single-spawn paths front-load the prefix once. The crossover is where
  // cumulative single-spawn cost overtakes N × flat-slice cost.
  const afk = results.find((r) => r.metrics.path === "loopdog-afk");
  const flatPerSlice = afk
    ? afk.metrics.totalCost.costUsd / Math.max(1, afk.metrics.iterations)
    : 0;
  const crossover =
    `On this ${afk?.metrics.iterations ?? "?"}-slice run the single-context paths pay the ` +
    `harness prefix once and keep it warm, while loopdog-afk re-pays ~$${flatPerSlice.toFixed(4)}/slice. ` +
    `A continuous session therefore tends to win tokens on small backlogs; loopdog-afk's flat ` +
    `cost only overtakes once a session's carried transcript exceeds the repeated-harness cost. ` +
    `The token winner here (${tokenWinner}) reflects THIS backlog size — re-run with a deeper ` +
    `backlog to locate the crossover.`;

  return { results, tokenWinner, qualityWinner, crossover };
}

/** The two honesty caveats the report must always carry (slice 05 contract). */
export const REPORT_CAVEATS = [
  "SCORING BIAS: token metrics are objective (lifted from stream-json result " +
    "events); quality is scored by the same model family that wrote the code, so " +
    "the quality verdict is reported WITH that caveat — the four mechanical " +
    "criteria are auditable from the diff by a human.",
  "DEFERRED LEVERS: CONTEXT.md (module map + invariants + ADR index in the " +
    "cacheable prefix) and an optional pre-commit self-review gate are designed in " +
    "the PRD but NOT built here. They are the next PRD, applied to whichever path " +
    "this benchmark picks.",
] as const;

/** Render the full report: per-path table, winners, crossover, caveats. */
export function formatReport(report: BenchmarkReport): string {
  const lines = ["===== DUMB-ZONE BENCHMARK REPORT ====="];
  for (const r of report.results) {
    lines.push("", formatPathMetrics(r.metrics));
    const passed = qualityScore(r.quality);
    const total = r.quality.slices.length * QUALITY_CHECKS.length;
    lines.push(`quality: ${passed}/${total} checks passed`);
  }
  lines.push(
    "",
    "----- verdict -----",
    `token winner (lowest $): ${report.tokenWinner}`,
    `quality winner (most checks passed): ${report.qualityWinner}`,
    "",
    `crossover: ${report.crossover}`,
    "",
    "----- caveats -----",
    ...REPORT_CAVEATS.map((c) => `* ${c}`),
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI entry point (invoked by benchmark.sh)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const workDir = argv[2];
  if (!workDir) {
    process.stderr.write(
      "benchmark: usage: tsx src/benchmark.ts <work-dir>\n" +
        "  <work-dir>  an empty directory to use as the throwaway repo\n",
    );
    exit(1);
  }

  // Read the ralph prompt from the package root before chdir-ing away from it.
  const __filename = fileURLToPath(import.meta.url);
  const pkgRoot = join(dirname(__filename), "..");
  const ralphPrompt = await realEnv().readFile(join(pkgRoot, "ralph", "prompt.md"));

  // Each path runs on its OWN fresh copy of the identical backlog, in its own
  // subdirectory, so they are measured apples-to-apples and never see each
  // other's commits. We chdir into each before running it (realEnv reads
  // process.cwd()), set the repo up fresh, then run exactly that path.
  async function runPath(
    name: string,
    runner: (env: Env, o: BenchmarkRunOptions) => Promise<PathMetrics>,
  ): Promise<PathMetrics> {
    const dir = join(workDir!, name);
    await realEnv().mkdir(dir);
    process.chdir(dir);
    const env = realEnv();
    env.writeOut(`benchmark: [${name}] fresh repo in ${dir}`);
    await setupBenchmarkRepo(env);
    env.writeOut(`benchmark: [${name}] running…`);
    return runner(env, { ralphPrompt, permissionMode: "auto" });
  }

  const afk = await runPath("loopdog-afk", runBenchmarkLoopDogAFK);
  const plain = await runPath("plain-session", runBenchmarkPlainSession);
  const self = await runPath("one-session-self-loop", runBenchmarkSelfLoop);

  // Quality scoring is a pre-registered, diff-auditable pass. The live scorer is
  // future work (it needs the per-path diffs); here every slice is scored
  // "unscored" by default so the record is structurally complete and a human can
  // fill the verdicts in from the committed diffs. This keeps the report honest:
  // it never silently claims a quality result it did not actually compute.
  const results: PathResult[] = [afk, plain, self].map((metrics) => ({
    metrics,
    quality: assertQualityComplete(
      {
        path: metrics.path,
        slices: metrics.slices.map((s) => scoreSlice(s.index, () => undefined)),
      },
      metrics.slices.length,
    ),
  }));

  // chdir back to the work root for the final report (each path left us in its
  // own subdir). realEnv().writeOut goes to stdout regardless of cwd.
  process.chdir(workDir);
  realEnv().writeOut(formatReport(buildReport(results)));
}

// Run only when invoked as the binary entry point (not when imported by tests).
if (argv[1] && isEntrypoint(argv[1])) {
  void main();
}

function isEntrypoint(argv1: string): boolean {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(argv1);
  } catch {
    return import.meta.url === pathToFileURL(argv1).href;
  }
}
