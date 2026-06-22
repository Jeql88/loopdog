import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIXED_BACKLOG,
  REPO_SKELETON,
  setupBenchmarkRepo,
  runBenchmarkLoopDogAFK,
  runBenchmarkPlainSession,
  runBenchmarkSelfLoop,
  formatPathMetrics,
  cacheReadSharePct,
  QUALITY_CHECKS,
  scoreSlice,
  assertQualityComplete,
  buildReport,
  formatReport,
  REPORT_CAVEATS,
  type PathMetrics,
  type PathQuality,
  type QualityCheckKey,
} from "../src/benchmark.ts";
import { parseCost, ZERO_COST } from "../src/run.ts";
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
  // The agent never spawned (claude not on PATH), so no measured slice — the
  // run errored out before doing any work.
  assert.equal(metrics.iterations, 0);
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

  // 9000 / (9000 + 3000) = 0.75 → 75% (whole-number percent)
  assert.equal(metrics.cacheReadShare, 75);
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
    cacheReadShare: 84,
    slices: [
      {
        index: 1,
        cost: {
          inputTokens: 1234,
          outputTokens: 567,
          cacheCreationTokens: 8900,
          cacheReadTokens: 45000,
          costUsd: 0.1823,
        },
        cacheReadShare: 84,
      },
    ],
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

// ---------------------------------------------------------------------------
// Slice 02 — per-slice breakdown present, complete shape
// ---------------------------------------------------------------------------

test("PathMetrics carries a per-slice breakdown, not just the path total", async () => {
  const iter1 = resultEvent(0.02, { cacheCreationTokens: 5000, cacheReadTokens: 5000 });
  const iter2 =
    resultEvent(0.03, { cacheCreationTokens: 1000, cacheReadTokens: 9000 }) +
    "NO READY ISSUES\n";
  const env = makeFakeEnv({
    cwd: "/bench",
    files: { "/bench/.scratch/bench/issues/01.md": "> Status: ready-for-agent\nx" },
    spawnResults: [
      { stdout: "claude 1.0" }, { stdout: "log" }, { stdout: iter1 },
      { stdout: "claude 1.0" }, { stdout: "log" }, { stdout: iter2 },
    ],
  });

  const metrics = await runBenchmarkLoopDogAFK(env, { ralphPrompt: "RALPH", permissionMode: "auto" });

  // One SliceMetrics entry per measured iteration, each complete.
  assert.equal(metrics.slices.length, 2);
  assert.deepEqual(metrics.slices.map((s) => s.index), [1, 2]);
  for (const s of metrics.slices) {
    for (const key of ["inputTokens", "outputTokens", "cacheCreationTokens", "cacheReadTokens", "costUsd"] as const) {
      assert.ok(key in s.cost, `slice ${s.index} missing ${key}`);
    }
    assert.equal(typeof s.cacheReadShare, "number");
  }
  // Per-slice shares: slice 1 = 50%, slice 2 = 90%.
  assert.equal(metrics.slices[0]!.cacheReadShare, 50);
  assert.equal(metrics.slices[1]!.cacheReadShare, 90);
});

test("cacheReadSharePct is a whole-number percent and degrades to 0", () => {
  assert.equal(cacheReadSharePct({ ...ZERO_COST, cacheReadTokens: 9000, cacheCreationTokens: 3000 }), 75);
  assert.equal(cacheReadSharePct({ ...ZERO_COST }), 0); // no cached tokens
});

test("formatPathMetrics prints a line per slice", () => {
  const metrics: PathMetrics = {
    path: "loopdog-afk",
    iterations: 2,
    stoppedBy: "stop-signal",
    totalCost: { inputTokens: 10, outputTokens: 20, cacheCreationTokens: 30, cacheReadTokens: 70, costUsd: 0.5 },
    cacheReadShare: 70,
    slices: [
      { index: 1, cost: { ...ZERO_COST, costUsd: 0.2 }, cacheReadShare: 60 },
      { index: 2, cost: { ...ZERO_COST, costUsd: 0.3 }, cacheReadShare: 80 },
    ],
  };
  const out = formatReportSafe(() => formatPathMetrics(metrics));
  assert.match(out, /slice 1/);
  assert.match(out, /slice 2/);
});

// small helper so a throwing formatter surfaces as a readable assertion
function formatReportSafe(fn: () => string): string {
  return fn();
}

// ---------------------------------------------------------------------------
// Slice 03 — three paths, same backlog, same record shape
// ---------------------------------------------------------------------------

function singleSpawnEnv(stdout: string, code = 0) {
  return makeFakeEnv({
    cwd: "/bench",
    files: { "/bench/.scratch/bench/issues/01.md": "> Status: ready-for-agent\nx" },
    // plain/self-loop paths spawn claude exactly once — no version probe/git log.
    spawnResults: [{ stdout, code }],
  });
}

test("plain-session and self-loop produce the same PathMetrics shape as AFK", async () => {
  const ev = resultEvent(0.4, { cacheCreationTokens: 100000, cacheReadTokens: 50000 });

  const plain = await runBenchmarkPlainSession(singleSpawnEnv(ev), { ralphPrompt: "R", permissionMode: "auto" });
  const self = await runBenchmarkSelfLoop(singleSpawnEnv(ev), { ralphPrompt: "R", permissionMode: "auto" });

  for (const m of [plain, self]) {
    // Structurally identical record: same keys, populated slices, share present.
    for (const key of ["path", "iterations", "stoppedBy", "totalCost", "cacheReadShare", "slices"] as const) {
      assert.ok(key in m, `missing ${key}`);
    }
    assert.equal(m.slices.length, 1);
    assert.equal(m.totalCost.costUsd, 0.4);
  }
  assert.equal(plain.path, "plain-session");
  assert.equal(self.path, "one-session-self-loop");
});

test("single-spawn paths spawn claude with the headless guards", async () => {
  const env = singleSpawnEnv(resultEvent(0.1));
  await runBenchmarkPlainSession(env, { ralphPrompt: "R", permissionMode: "auto" });
  const call = env.spawnCalls.find((c) => c.cmd === "claude" && c.args.includes("--print"));
  assert.ok(call, "no claude --print spawn");
  assert.ok(call!.args.includes("--max-turns"), "missing --max-turns guard");
  assert.ok(call!.args.includes("--append-system-prompt"), "missing --append-system-prompt guard");
});

test("single-spawn path records stoppedBy=error on non-zero exit", async () => {
  const m = await runBenchmarkPlainSession(singleSpawnEnv("", 1), { ralphPrompt: "R", permissionMode: "auto" });
  assert.equal(m.stoppedBy, "error");
});

// ---------------------------------------------------------------------------
// Slice 04 — mechanical quality scoring, complete record
// ---------------------------------------------------------------------------

test("QUALITY_CHECKS pre-registers the four named checks with written criteria", () => {
  const keys = QUALITY_CHECKS.map((c) => c.key);
  assert.deepEqual(keys, ["specPasses", "noInvariantViolation", "noModuleDuplication", "noContradictedDecision"]);
  for (const c of QUALITY_CHECKS) assert.ok(c.criterion.length > 0, `${c.key} missing criterion`);
});

test("scoreSlice always emits a verdict for every check, even if scorer skips one", () => {
  // scorer only answers one check; the other three must default to a recorded fail.
  const sq = scoreSlice(1, (key) => (key === "specPasses" ? { pass: true, note: "tests green" } : undefined));
  for (const c of QUALITY_CHECKS) {
    assert.ok(c.key in sq.checks, `missing ${c.key}`);
  }
  assert.equal(sq.checks.specPasses.pass, true);
  assert.equal(sq.checks.noInvariantViolation.pass, false);
  assert.match(sq.checks.noInvariantViolation.note, /unscored/);
});

test("assertQualityComplete throws when a slice or check is missing", () => {
  const good: PathQuality = {
    path: "loopdog-afk",
    slices: [scoreSlice(1, () => ({ pass: true, note: "ok" }))],
  };
  assert.doesNotThrow(() => assertQualityComplete(good, 1));
  assert.throws(() => assertQualityComplete(good, 2), /expected 2 slices/);

  // A slice missing a check.
  const broken: PathQuality = {
    path: "loopdog-afk",
    slices: [{ index: 1, checks: { specPasses: { pass: true, note: "" } } as Record<QualityCheckKey, { pass: boolean; note: string }> }],
  };
  assert.throws(() => assertQualityComplete(broken, 1), /missing check/);
});

// ---------------------------------------------------------------------------
// Slice 05 — report, winners, crossover, caveats
// ---------------------------------------------------------------------------

function pathResult(path: PathMetrics["path"], costUsd: number, checksPass: boolean) {
  const metrics: PathMetrics = {
    path,
    iterations: 1,
    stoppedBy: "stop-signal",
    totalCost: { ...ZERO_COST, costUsd, cacheReadTokens: 8000, cacheCreationTokens: 2000 },
    cacheReadShare: 80,
    slices: [{ index: 1, cost: { ...ZERO_COST, costUsd }, cacheReadShare: 80 }],
  };
  const quality: PathQuality = {
    path,
    slices: [scoreSlice(1, () => ({ pass: checksPass, note: "n" }))],
  };
  return { metrics, quality };
}

test("buildReport picks the cheapest path as token winner and the best-scored as quality winner", () => {
  const results = [
    pathResult("plain-session", 0.1, false), // cheapest
    pathResult("loopdog-afk", 0.5, true), // best quality
    pathResult("one-session-self-loop", 0.3, false),
  ];
  const report = buildReport(results);
  assert.equal(report.tokenWinner, "plain-session");
  assert.equal(report.qualityWinner, "loopdog-afk");
  assert.match(report.crossover, /crossover|harness prefix|small backlog/i);
});

test("buildReport throws if any path is missing metrics or quality (no silent skip)", () => {
  assert.throws(() => buildReport([]), /no path results/);
});

test("formatReport includes every path, both winners, crossover, and the two caveats", () => {
  const results = [
    pathResult("plain-session", 0.1, true),
    pathResult("loopdog-afk", 0.5, true),
    pathResult("one-session-self-loop", 0.3, false),
  ];
  const out = formatReport(buildReport(results));
  // Every path present.
  assert.match(out, /plain-session/);
  assert.match(out, /loopdog-afk/);
  assert.match(out, /one-session-self-loop/);
  // Verdict + crossover.
  assert.match(out, /token winner/i);
  assert.match(out, /quality winner/i);
  assert.match(out, /crossover/i);
  // Both honesty caveats.
  assert.match(out, /SCORING BIAS/);
  assert.match(out, /DEFERRED LEVERS/);
  assert.equal(REPORT_CAVEATS.length, 2);
});
