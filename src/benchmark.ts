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
import { runRun, ZERO_COST, type Cost } from "./run.ts";

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

/**
 * Per-path metrics record produced by one complete run of the loopdog-afk path
 * over the fixed backlog. Token numbers come from RunResult.cost, which runRun
 * fills via parseCost — no new token plumbing is added here.
 */
export interface PathMetrics {
  path: "loopdog-afk";
  /** How many runRun iterations executed. */
  iterations: number;
  /** Why the loop ended. */
  stoppedBy: "stop-signal" | "max-iterations" | "error";
  /** Token usage + dollar cost summed across all iterations. */
  totalCost: Cost;
  /**
   * cacheReadTokens / (cacheReadTokens + cacheCreationTokens).
   * 0 when no cached tokens were seen (e.g. a single short iteration).
   */
  cacheReadShare: number;
}

/**
 * Format the single-path metrics record as a human-readable string.
 * Includes all token categories, dollar cost, and cache-read share so nothing
 * is silently dropped from the report.
 */
export function formatPathMetrics(metrics: PathMetrics): string {
  const { totalCost: c, cacheReadShare } = metrics;
  return [
    `=== benchmark: ${metrics.path} ===`,
    `iterations: ${metrics.iterations}  stopped-by: ${metrics.stoppedBy}`,
    `tokens — in: ${c.inputTokens}  out: ${c.outputTokens}  cache-write: ${c.cacheCreationTokens}  cache-read: ${c.cacheReadTokens}`,
    `cost: $${c.costUsd.toFixed(4)}`,
    `cache-read share: ${Math.round(cacheReadShare * 100)}%`,
  ].join("\n");
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
  let iterations = 0;
  let totalCost: Cost = { ...ZERO_COST };
  let stoppedBy: PathMetrics["stoppedBy"] = "max-iterations";

  while (iterations < max) {
    const result = await runRun(env, {
      ralphPrompt: options.ralphPrompt,
      permissionMode: options.permissionMode,
      model: options.model,
    });
    iterations++;
    totalCost = addCost(totalCost, result.cost);

    if (!result.ok) {
      stoppedBy = "error";
      break;
    }
    if (result.stopSignal) {
      stoppedBy = "stop-signal";
      break;
    }
  }

  const cached = totalCost.cacheReadTokens + totalCost.cacheCreationTokens;
  const cacheReadShare = cached === 0 ? 0 : totalCost.cacheReadTokens / cached;

  return { path: "loopdog-afk", iterations, stoppedBy, totalCost, cacheReadShare };
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

  // Change into the work dir so all spawns (git, claude) run there.
  process.chdir(workDir);
  const env = realEnv();

  env.writeOut(`benchmark: setting up throwaway repo in ${workDir}`);
  await setupBenchmarkRepo(env);

  env.writeOut("benchmark: running loopdog-afk path…");
  const metrics = await runBenchmarkLoopDogAFK(env, {
    ralphPrompt,
    permissionMode: "auto",
  });

  env.writeOut(formatPathMetrics(metrics));
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
