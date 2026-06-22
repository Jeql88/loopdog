import { test } from "node:test";
import assert from "node:assert/strict";
import { runLoop } from "../src/loop.ts";
import { makeFakeEnv } from "./helpers/fake-env.ts";

const RALPH = "RALPH";

/**
 * Build the spawn queue for `n` full iterations. Each iteration consumes:
 * a `claude --version` probe, a `git log`, and the agent run. The agent's
 * stdout on the final iteration carries the stop signal.
 */
function queueForIterations(agentOutputs: string[]) {
  return agentOutputs.flatMap((agentOut) => [
    { stdout: "claude 1.0" }, // version probe
    { stdout: "" }, // git log
    { stdout: agentOut }, // agent run
  ]);
}

/** A stream-json result event carrying a usage block and dollar cost. */
function resultEvent(usage: {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  cost: number;
}) {
  return (
    JSON.stringify({
      type: "result",
      subtype: "success",
      result: "did work",
      total_cost_usd: usage.cost,
      usage: {
        input_tokens: usage.input,
        output_tokens: usage.output,
        cache_creation_input_tokens: usage.cacheCreate,
        cache_read_input_tokens: usage.cacheRead,
      },
    }) + "\n"
  );
}

test("repeats run until the NO READY ISSUES stop signal appears", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    spawnResults: queueForIterations([
      "implemented slice A",
      "implemented slice B",
      "nothing left\nNO READY ISSUES",
    ]),
  });

  const result = await runLoop(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    maxIterations: 50,
  });

  assert.equal(result.iterations, 3);
  assert.equal(result.stoppedBy, "stop-signal");
});

test("accumulates per-iteration usage and emits an end-of-loop cost summary", async () => {
  const out: string[] = [];
  const env = makeFakeEnv({
    cwd: "/repo",
    writeOut: (s) => out.push(s),
    spawnResults: [
      { stdout: "claude 1.0" },
      { stdout: "" },
      { stdout: resultEvent({ input: 100, output: 10, cacheCreate: 1000, cacheRead: 0, cost: 0.05 }) },
      { stdout: "claude 1.0" },
      { stdout: "" },
      {
        stdout:
          resultEvent({ input: 200, output: 20, cacheCreate: 500, cacheRead: 800, cost: 0.02 }) +
          "NO READY ISSUES\n",
      },
    ],
  });

  const result = await runLoop(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    maxIterations: 50,
  });

  assert.equal(result.iterations, 2);
  // The summary totals tokens by category and the dollar cost across iterations.
  const text = out.join("\n");
  assert.match(text, /summary/i);
  assert.match(text, /300/); // input 100 + 200
  assert.match(text, /30\b/); // output 10 + 20
  assert.match(text, /1500|1,500/); // cache-creation 1000 + 500
  assert.match(text, /800/); // cache-read 0 + 800
  assert.match(text, /0\.07|\$0\.07/); // cost 0.05 + 0.02
});

test("each iteration spawns its own fresh claude agent process", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    spawnResults: queueForIterations([
      "did slice A",
      "did slice B\nNO READY ISSUES",
    ]),
  });

  await runLoop(env, { ralphPrompt: RALPH, permissionMode: "auto", maxIterations: 50 });

  // One agent spawn per iteration — distinct processes, not a reused one.
  const agentSpawns = env.spawnCalls.filter(
    (c) => c.cmd === "claude" && c.args.includes("--print"),
  );
  assert.equal(agentSpawns.length, 2);
});

test("stops at maxIterations even when the stop signal never appears", async () => {
  // Every agent run reports work done, never the stop signal — left alone this
  // would loop forever. The backstop must cap it.
  const env = makeFakeEnv({
    cwd: "/repo",
    spawnResults: queueForIterations(Array(10).fill("still working, no signal")),
  });

  const result = await runLoop(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    maxIterations: 3,
  });

  assert.equal(result.iterations, 3);
  assert.equal(result.stoppedBy, "max-iterations");
});

test("stops immediately when an iteration fails (claude not on PATH)", async () => {
  const env = makeFakeEnv({ cwd: "/repo", claudeOnPath: false });

  const result = await runLoop(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    maxIterations: 50,
  });

  // A failed run has no trustworthy output — bail out, don't keep looping.
  assert.equal(result.iterations, 1);
  assert.equal(result.stoppedBy, "error");
});

test("loop declines (does not spin) when a remote issue tracker is configured", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/docs/agents/issue-tracker.md": "# Issue tracker: GitLab\n",
    },
  });

  const result = await runLoop(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    maxIterations: 50,
  });

  // The gate makes the first iteration fail; the loop bails instead of spinning.
  assert.equal(result.iterations, 1);
  assert.equal(result.stoppedBy, "error");
  assert.equal(env.spawnCalls.length, 0);
});
