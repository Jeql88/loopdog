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

test("fails early with a clear message when the target is not a git repo", async () => {
  const out: string[] = [];
  const env = makeFakeEnv({
    cwd: "/repo",
    writeOut: (s) => out.push(s),
    files: { ...READY },
    // git rev-parse exits non-zero → not a work tree.
    spawnResults: [{ code: 128, stderr: "fatal: not a git repository" }],
  });

  const result = await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "sonnet",
    maxAgents: 3,
    maxIterations: 50,
    trace: "review",
  });

  // No agent ran — the git-repo guard short-circuits before dispatch.
  assert.equal(result.agentsDispatched, 0);
  assert.ok(!env.spawnCalls.some((c) => c.cmd === "claude"));
  assert.match(out.join("\n"), /git repos/i);
});

test("each agent runs in its own worktree on a loopdog/slice-NN branch", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/.scratch/feat/issues/01-a.md": "> Status: ready-for-agent\nA",
      "/repo/.scratch/feat/issues/02-b.md": "> Status: ready-for-agent\nB",
    },
    // git rev-parse (repo check) succeeds; everything else returns clean.
    spawnResults: [{ code: 0, stdout: "true" }],
  });

  await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "sonnet",
    maxAgents: 2,
    maxIterations: 50,
    trace: "review",
  });

  // A worktree is added on a loopdog/slice-NN branch for each slice.
  const adds = env.spawnCalls.filter(
    (c) => c.cmd === "git" && c.args.includes("worktree") && c.args.includes("add"),
  );
  assert.equal(adds.length, 2);
  const branches = adds.flatMap((c) => c.args.filter((a) => a.startsWith("loopdog/slice-")));
  assert.deepEqual(branches.sort(), ["loopdog/slice-01", "loopdog/slice-02"]);

  // Each agent's cwd is its own worktree dir, distinct per agent.
  const agents = env.spawnCalls.filter((c) => c.cmd === "claude" && c.args.includes("--print"));
  const cwds = agents.map((a) => a.cwd);
  assert.ok(cwds.every((c) => typeof c === "string" && c.includes("slice-")));
  assert.equal(new Set(cwds).size, 2, "each agent has a distinct worktree cwd");

  // Worktrees are torn down afterward.
  const removes = env.spawnCalls.filter(
    (c) => c.cmd === "git" && c.args.includes("worktree") && c.args.includes("remove"),
  );
  assert.equal(removes.length, 2);
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
