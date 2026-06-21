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
