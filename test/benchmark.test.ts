import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIXED_BACKLOG,
  REPO_SKELETON,
  setupBenchmarkRepo,
  runBenchmarkLoopDogAFK,
  formatPathMetrics,
  type PathMetrics,
} from "../src/benchmark.ts";
import { parseCost } from "../src/run.ts";
import { makeFakeEnv } from "./helpers/fake-env.ts";

// ---------------------------------------------------------------------------
// Fixed backlog shape
// ---------------------------------------------------------------------------

test("FIXED_BACKLOG has 3 to 5 independent slices", () => {
  assert.ok(FIXED_BACKLOG.length >= 3 && FIXED_BACKLOG.length <= 5);
});

test("every FIXED_BACKLOG slice has Status: ready-for-agent", () => {
  for (const slice of FIXED_BACKLOG) {
    assert.match(
      slice.content,
      /Status:\s*ready-for-agent/,
      `${slice.filename} missing ready-for-agent status`,
    );
  }
});

test("every FIXED_BACKLOG slice filename sorts correctly (zero-padded number prefix)", () => {
  const names = FIXED_BACKLOG.map((s) => s.filename);
  const sorted = [...names].sort();
  assert.deepEqual(names, sorted, "slices must be in sorted order");
});

// ---------------------------------------------------------------------------
// setupBenchmarkRepo
// ---------------------------------------------------------------------------

test("setupBenchmarkRepo writes all FIXED_BACKLOG slices into the issues dir", async () => {
  const env = makeFakeEnv({ cwd: "/bench" });

  await setupBenchmarkRepo(env);

  for (const slice of FIXED_BACKLOG) {
    const path = `/bench/.scratch/bench/issues/${slice.filename}`;
    assert.ok(env.files[path] !== undefined, `missing ${slice.filename}`);
    assert.match(env.files[path]!, /Status:\s*ready-for-agent/);
  }
});

test("setupBenchmarkRepo writes the project skeleton files", async () => {
  const env = makeFakeEnv({ cwd: "/bench" });

  await setupBenchmarkRepo(env);

  for (const filename of Object.keys(REPO_SKELETON)) {
    assert.ok(
      env.files[`/bench/${filename}`] !== undefined,
      `missing skeleton file ${filename}`,
    );
  }
});

test("setupBenchmarkRepo runs git init and makes an initial commit", async () => {
  const env = makeFakeEnv({ cwd: "/bench" });

  await setupBenchmarkRepo(env);

  const gitCalls = env.spawnCalls.filter((c) => c.cmd === "git");
  assert.ok(
    gitCalls.some((c) => c.args.includes("init")),
    "git init not called",
  );
  assert.ok(
    gitCalls.some((c) => c.args.includes("commit")),
    "git commit not called",
  );
});

// ---------------------------------------------------------------------------
// runBenchmarkLoopDogAFK — metrics accumulation
// ---------------------------------------------------------------------------

/** A stream-json result event with known token counts and cost. */
function resultEvent(
  costUsd: number,
  opts: {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  } = {},
): string {
  return (
    JSON.stringify({
      type: "result",
      subtype: "success",
      result: "Done.",
      total_cost_usd: costUsd,
      usage: {
        input_tokens: opts.inputTokens ?? 1000,
        output_tokens: opts.outputTokens ?? 200,
        cache_creation_input_tokens: opts.cacheCreationTokens ?? 5000,
        cache_read_input_tokens: opts.cacheReadTokens ?? 4000,
      },
    }) + "\n"
  );
}

test("runBenchmarkLoopDogAFK stops on stop signal and returns PathMetrics", async () => {
  // The agent returns "NO READY ISSUES" in its output → stop signal after 1 iteration.
  const env = makeFakeEnv({
    cwd: "/bench",
    files: {
      "/bench/.scratch/bench/issues/01-add-sum.md":
        "> Status: ready-for-agent\nAdd sum.",
    },
    spawnResults: [
      { stdout: "claude 1.0" }, // version probe
      { stdout: "abc123 init" }, // git log
      {
        stdout:
          resultEvent(0.02, {
            inputTokens: 1200,
            outputTokens: 300,
            cacheCreationTokens: 6000,
            cacheReadTokens: 3000,
          }) + "NO READY ISSUES\n",
      }, // claude run — emits stop signal
    ],
  });

  const metrics = await runBenchmarkLoopDogAFK(env, {
    ralphPrompt: "RALPH",
    permissionMode: "auto",
  });

  assert.equal(metrics.path, "loopdog-afk");
  assert.equal(metrics.iterations, 1);
  assert.equal(metrics.stoppedBy, "stop-signal");
  assert.equal(metrics.totalCost.inputTokens, 1200);
  assert.equal(metrics.totalCost.outputTokens, 300);
  assert.equal(metrics.totalCost.cacheCreationTokens, 6000);
  assert.equal(metrics.totalCost.cacheReadTokens, 3000);
  assert.equal(metrics.totalCost.costUsd, 0.02);
});

test("runBenchmarkLoopDogAFK accumulates costs across multiple iterations", async () => {
  // Two iterations before the stop signal.
  const iter1 = resultEvent(0.02, {
    inputTokens: 1000,
    outputTokens: 200,
    cacheCreationTokens: 5000,
    cacheReadTokens: 4000,
  });
  const iter2 =
    resultEvent(0.03, {
      inputTokens: 1100,
      outputTokens: 250,
      cacheCreationTokens: 0,
      cacheReadTokens: 9000,
    }) + "NO READY ISSUES\n";

  const env = makeFakeEnv({
    cwd: "/bench",
    files: {
      "/bench/.scratch/bench/issues/01-add-sum.md":
        "> Status: ready-for-agent\nAdd sum.",
    },
    spawnResults: [
      { stdout: "claude 1.0" }, // version probe iter 1
      { stdout: "abc123 init" }, // git log iter 1
      { stdout: iter1 }, // agent run iter 1
      // iter 2 — issue still shows as ready (fake env doesn't mutate files)
      { stdout: "claude 1.0" }, // version probe iter 2
      { stdout: "def456 new" }, // git log iter 2
      { stdout: iter2 }, // agent run iter 2 (+ stop signal)
    ],
  });

  const metrics = await runBenchmarkLoopDogAFK(env, {
    ralphPrompt: "RALPH",
    permissionMode: "auto",
  });

  assert.equal(metrics.iterations, 2);
  assert.equal(metrics.stoppedBy, "stop-signal");
  // Costs summed across both iterations.
  assert.equal(metrics.totalCost.inputTokens, 1000 + 1100);
  assert.equal(metrics.totalCost.outputTokens, 200 + 250);
  assert.equal(metrics.totalCost.cacheCreationTokens, 5000 + 0);
  assert.equal(metrics.totalCost.cacheReadTokens, 4000 + 9000);
  assert.ok(Math.abs(metrics.totalCost.costUsd - 0.05) < 0.0001);
});

test("runBenchmarkLoopDogAFK stops at maxIterations backstop", async () => {
  // One ready issue, no stop signal ever — should hit the max.
  const env = makeFakeEnv({
    cwd: "/bench",
    files: {
      "/bench/.scratch/bench/issues/01-add-sum.md":
        "> Status: ready-for-agent\nAdd sum.",
    },
    spawnResults: Array.from({ length: 30 }, (_, i) =>
      i % 3 === 0
        ? { stdout: "claude 1.0" } // version probe
        : i % 3 === 1
          ? { stdout: "abc commit" } // git log
          : { stdout: resultEvent(0.01) }, // agent run — no stop signal
    ),
  });

  const metrics = await runBenchmarkLoopDogAFK(env, {
    ralphPrompt: "RALPH",
    permissionMode: "auto",
    maxIterations: 3,
  });

  assert.equal(metrics.iterations, 3);
  assert.equal(metrics.stoppedBy, "max-iterations");
});

test("runBenchmarkLoopDogAFK records stoppedBy=error when runRun fails", async () => {
  const env = makeFakeEnv({
    cwd: "/bench",
    claudeOnPath: false, // causes runRun to return ok:false
    files: {
      "/bench/.scratch/bench/issues/01-add-sum.md":
        "> Status: ready-for-agent\nAdd sum.",
    },
  });

  const metrics = await runBenchmarkLoopDogAFK(env, {
    ralphPrompt: "RALPH",
    permissionMode: "auto",
  });

  assert.equal(metrics.stoppedBy, "error");
  assert.equal(metrics.iterations, 1);
});

// ---------------------------------------------------------------------------
// cacheReadShare calculation
// ---------------------------------------------------------------------------

test("cacheReadShare is cacheRead / (cacheRead + cacheCreation)", async () => {
  const env = makeFakeEnv({
    cwd: "/bench",
    files: {
      "/bench/.scratch/bench/issues/01-add-sum.md":
        "> Status: ready-for-agent\nAdd sum.",
    },
    spawnResults: [
      { stdout: "claude 1.0" },
      { stdout: "" },
      {
        stdout:
          resultEvent(0.01, { cacheCreationTokens: 3000, cacheReadTokens: 9000 }) +
          "NO READY ISSUES\n",
      },
    ],
  });

  const metrics = await runBenchmarkLoopDogAFK(env, {
    ralphPrompt: "RALPH",
    permissionMode: "auto",
  });

  // 9000 / (9000 + 3000) = 0.75
  assert.ok(Math.abs(metrics.cacheReadShare - 0.75) < 0.001);
});

test("cacheReadShare is 0 when no cached tokens are seen", async () => {
  const env = makeFakeEnv({
    cwd: "/bench",
    files: {
      "/bench/.scratch/bench/issues/01-add-sum.md":
        "> Status: ready-for-agent\nAdd sum.",
    },
    spawnResults: [
      { stdout: "claude 1.0" },
      { stdout: "" },
      {
        stdout:
          resultEvent(0.01, { cacheCreationTokens: 0, cacheReadTokens: 0 }) +
          "NO READY ISSUES\n",
      },
    ],
  });

  const metrics = await runBenchmarkLoopDogAFK(env, {
    ralphPrompt: "RALPH",
    permissionMode: "auto",
  });

  assert.equal(metrics.cacheReadShare, 0);
});

// ---------------------------------------------------------------------------
// formatPathMetrics — complete metrics record shape
// ---------------------------------------------------------------------------

test("formatPathMetrics includes all token categories, cost, and cache-read share", () => {
  const metrics: PathMetrics = {
    path: "loopdog-afk",
    iterations: 3,
    stoppedBy: "stop-signal",
    totalCost: {
      inputTokens: 1234,
      outputTokens: 567,
      cacheCreationTokens: 8900,
      cacheReadTokens: 45000,
      costUsd: 0.1823,
    },
    cacheReadShare: 0.835,
  };

  const output = formatPathMetrics(metrics);

  // Path name and stop reason.
  assert.match(output, /loopdog-afk/);
  assert.match(output, /stop-signal/);
  assert.match(output, /3/); // iterations

  // All four token categories — none silently dropped.
  assert.match(output, /1234/, "inputTokens missing");
  assert.match(output, /567/, "outputTokens missing");
  assert.match(output, /8900/, "cacheCreationTokens missing");
  assert.match(output, /45000/, "cacheReadTokens missing");

  // Dollar cost.
  assert.match(output, /0\.1823|\$0\.18/, "costUsd missing");

  // Cache-read share (84% from 0.835 — Math.round(83.5) = 84).
  assert.match(output, /84%/, "cacheReadShare missing");
});

// ---------------------------------------------------------------------------
// parseCost export (contract: exported from run.ts, not duplicated)
// ---------------------------------------------------------------------------

test("parseCost is exported from src/run.ts and parses a result event correctly", () => {
  const stdout =
    JSON.stringify({
      type: "result",
      total_cost_usd: 0.0456,
      usage: {
        input_tokens: 500,
        output_tokens: 100,
        cache_creation_input_tokens: 2000,
        cache_read_input_tokens: 8000,
      },
    }) + "\n";

  const cost = parseCost(stdout);

  assert.equal(cost.inputTokens, 500);
  assert.equal(cost.outputTokens, 100);
  assert.equal(cost.cacheCreationTokens, 2000);
  assert.equal(cost.cacheReadTokens, 8000);
  assert.equal(cost.costUsd, 0.0456);
});
