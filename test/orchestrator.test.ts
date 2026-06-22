import { test } from "node:test";
import assert from "node:assert/strict";
import { runParallel } from "../src/orchestrator.ts";
import { makeFakeEnv } from "./helpers/fake-env.ts";

const RALPH = "RALPH PROMPT BODY";

/** Several independent ready slices for the orchestrator to dispatch. */
const READY = {
  "/repo/.scratch/feat/issues/01-a.md": "> Status: ready-for-agent\nslice A body",
  "/repo/.scratch/feat/issues/02-b.md": "> Status: ready-for-agent\nslice B body",
  "/repo/.scratch/feat/issues/03-c.md": "> Status: ready-for-agent\nslice C body",
  "/repo/.scratch/feat/issues/04-d.md": "> Status: ready-for-agent\nslice D body",
};

test("runs one wave of up to maxAgents concurrent claude --print agents", async () => {
  const env = makeFakeEnv({ cwd: "/repo", files: { ...READY } });

  await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "sonnet",
    maxAgents: 3,
    maxIterations: 50,
    trace: "review",
  });

  // The skeleton runs exactly one wave: up to maxAgents agents, no more.
  const agents = env.spawnCalls.filter((c) => c.cmd === "claude" && c.args.includes("--print"));
  assert.equal(agents.length, 3, "dispatched maxAgents agents in the wave");
});

test("never dispatches more agents than ready slices", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/.scratch/feat/issues/01-a.md": "> Status: ready-for-agent\nonly one ready",
      "/repo/.scratch/feat/issues/02-b.md": "> Status: needs-info\nblocked",
    },
  });

  await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "sonnet",
    maxAgents: 3,
    maxIterations: 50,
    trace: "review",
  });

  const agents = env.spawnCalls.filter((c) => c.cmd === "claude" && c.args.includes("--print"));
  assert.equal(agents.length, 1, "only the single ready slice is dispatched");
});

test("each agent is a fresh solo run — its prompt names no sibling agent", async () => {
  const env = makeFakeEnv({ cwd: "/repo", files: { ...READY } });

  await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "sonnet",
    maxAgents: 2,
    maxIterations: 50,
    trace: "review",
  });

  const agents = env.spawnCalls.filter((c) => c.cmd === "claude" && c.args.includes("--print"));
  assert.equal(agents.length, 2);
  for (const a of agents) {
    const prompt = a.stdin ?? "";
    // The agent is solo: its prompt carries the ralph body + exactly one slice,
    // and no awareness of the other agents running alongside it.
    assert.match(prompt, /RALPH PROMPT BODY/);
    assert.doesNotMatch(prompt, /other agent|sibling|parallel agent|wave/i);
  }
  // Each agent got a distinct slice (no two agents handed the same body).
  const bodies = agents.map((a) => a.stdin ?? "");
  assert.notEqual(bodies[0], bodies[1], "agents work distinct slices");
});

test("passes the model through to every agent in the wave", async () => {
  const env = makeFakeEnv({ cwd: "/repo", files: { ...READY } });

  await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "opus",
    maxAgents: 2,
    maxIterations: 50,
    trace: "review",
  });

  const agents = env.spawnCalls.filter((c) => c.cmd === "claude" && c.args.includes("--print"));
  for (const a of agents) {
    const i = a.args.indexOf("--model");
    assert.equal(a.args[i + 1], "opus");
  }
});
