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

test("dispatches concurrent claude --print agents, capped at maxAgents per wave", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: { ...READY }, // 4 independent ready slices
    spawnResults: [{ code: 0, stdout: "true" }],
  });

  const result = await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "sonnet",
    maxAgents: 3,
    maxIterations: 50,
    trace: "review",
  });

  // All four independent slices drain, no wave exceeding the cap (4 → 3 + 1).
  const agents = env.spawnCalls.filter((c) => c.cmd === "claude" && c.args.includes("--print"));
  assert.equal(agents.length, 4);
  assert.ok(result.waveSizes.every((s) => s <= 3), `waves: ${result.waveSizes}`);
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
  const env = makeFakeEnv({
    cwd: "/repo",
    files: { ...READY },
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

  const agents = env.spawnCalls.filter((c) => c.cmd === "claude" && c.args.includes("--print"));
  assert.equal(agents.length, 4); // all four independent slices drain
  for (const a of agents) {
    const prompt = a.stdin ?? "";
    // The agent is solo: its prompt carries the ralph body + exactly one slice,
    // and no awareness of the other agents running alongside it.
    assert.match(prompt, /RALPH PROMPT BODY/);
    assert.doesNotMatch(prompt, /other agent|sibling|parallel agent|wave/i);
  }
  // Every agent got a distinct slice (no two agents handed the same body).
  const bodies = agents.map((a) => a.stdin ?? "");
  assert.equal(new Set(bodies).size, bodies.length, "agents work distinct slices");
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

  // A worktree is added on a loopdog/slice-NN branch for each slice (the
  // integration worktree, added by the merge step, is a separate branch).
  const adds = env.spawnCalls.filter(
    (c) =>
      c.cmd === "git" &&
      c.args.includes("worktree") &&
      c.args.includes("add") &&
      c.args.some((a) => a.startsWith("loopdog/slice-")),
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

test("dispatches only slices whose Blocked by are all done; unblocks across waves", async () => {
  // 02 is blocked by 01. Wave 1 can only run 01; once 01 is done, wave 2 runs 02.
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/.scratch/feat/issues/01-base.md": "> Status: ready-for-agent\n\n## What\nbase",
      "/repo/.scratch/feat/issues/02-dependent.md":
        "> Status: ready-for-agent\n\n## Blocked by\n\n- `.scratch/feat/issues/01-base.md`\n",
    },
    spawnResults: [{ code: 0, stdout: "true" }], // repo check; rest default code 0
  });

  const result = await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "sonnet",
    maxAgents: 3,
    maxIterations: 50,
    trace: "review",
  });

  // Two waves: 01 alone, then 02 once its blocker is done.
  assert.deepEqual(result.waveSizes, [1, 1]);
  assert.equal(result.stoppedBy, "empty-frontier");

  // The dependent slice's branch was created only in the second wave — never
  // dispatched while its blocker was still pending.
  const adds = env.spawnCalls.filter(
    (c) => c.cmd === "git" && c.args.includes("worktree") && c.args.includes("add"),
  );
  const order = adds.flatMap((c) => c.args.filter((a) => a.startsWith("loopdog/slice-")));
  assert.deepEqual(order, ["loopdog/slice-01", "loopdog/slice-02"]);
});

test("never runs more than maxAgents agents in a single wave", async () => {
  const files: Record<string, string> = {};
  for (let n = 1; n <= 5; n++) {
    const id = String(n).padStart(2, "0");
    files[`/repo/.scratch/feat/issues/${id}-x.md`] = "> Status: ready-for-agent\nindependent";
  }
  const env = makeFakeEnv({
    cwd: "/repo",
    files,
    spawnResults: [{ code: 0, stdout: "true" }],
  });

  const result = await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "sonnet",
    maxAgents: 2,
    maxIterations: 50,
    trace: "review",
  });

  // 5 independent slices, cap 2 → waves of 2,2,1. No wave exceeds the cap.
  assert.ok(result.waveSizes.every((s) => s <= 2), `waves: ${result.waveSizes}`);
  assert.equal(result.agentsDispatched, 5);
  assert.equal(result.stoppedBy, "empty-frontier");
});

test("stops when the frontier is empty (orchestrator's decision)", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      // Only a blocked slice — its blocker does not exist as done, so the
      // frontier is empty from the start.
      "/repo/.scratch/feat/issues/02-dependent.md":
        "> Status: ready-for-agent\n\n## Blocked by\n\n- `.scratch/feat/issues/01-missing.md`\n",
    },
    spawnResults: [{ code: 0, stdout: "true" }],
  });

  const result = await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "sonnet",
    maxAgents: 3,
    maxIterations: 50,
    trace: "review",
  });

  assert.equal(result.agentsDispatched, 0);
  assert.equal(result.stoppedBy, "empty-frontier");
  assert.ok(!env.spawnCalls.some((c) => c.cmd === "claude"));
});

test("total agent spawns never exceed maxIterations", async () => {
  const files: Record<string, string> = {};
  for (let n = 1; n <= 10; n++) {
    const id = String(n).padStart(2, "0");
    files[`/repo/.scratch/feat/issues/${id}-x.md`] = "> Status: ready-for-agent\nindependent";
  }
  const env = makeFakeEnv({
    cwd: "/repo",
    files,
    spawnResults: [{ code: 0, stdout: "true" }],
  });

  const result = await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "sonnet",
    maxAgents: 3,
    maxIterations: 4, // cap below the 10-slice backlog
    trace: "review",
  });

  const agents = env.spawnCalls.filter((c) => c.cmd === "claude" && c.args.includes("--print"));
  assert.ok(agents.length <= 4, `spawned ${agents.length}, cap 4`);
  assert.equal(result.stoppedBy, "max-iterations");
});

test("merges clean branches into loopdog-integration in slice-number order", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/.scratch/feat/issues/01-a.md": "> Status: ready-for-agent\nA",
      "/repo/.scratch/feat/issues/02-b.md": "> Status: ready-for-agent\nB",
      "/repo/.scratch/feat/issues/03-c.md": "> Status: ready-for-agent\nC",
    },
    spawnResults: [{ code: 0, stdout: "true" }], // repo check; rest clean
  });

  await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "sonnet",
    maxAgents: 3,
    maxIterations: 50,
    trace: "review",
  });

  // --no-ff merges into the integration branch, in slice-number order.
  const merges = env.spawnCalls.filter(
    (c) => c.cmd === "git" && c.args.includes("merge") && c.args.includes("--no-ff"),
  );
  const mergedBranches = merges.map(
    (c) => c.args.find((a) => a.startsWith("loopdog/slice-")) ?? "",
  );
  assert.deepEqual(mergedBranches, [
    "loopdog/slice-01",
    "loopdog/slice-02",
    "loopdog/slice-03",
  ]);
});

test("rebases each branch onto the integration tip before merging it", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/.scratch/feat/issues/01-a.md": "> Status: ready-for-agent\nA",
      "/repo/.scratch/feat/issues/02-b.md": "> Status: ready-for-agent\nB",
    },
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

  // For each branch, a rebase onto loopdog-integration precedes its --no-ff merge.
  const gitOps = env.spawnCalls.filter((c) => c.cmd === "git");
  const rebase01 = gitOps.findIndex(
    (c) => c.args.includes("rebase") && c.args.includes("loopdog/slice-01"),
  );
  const merge01 = gitOps.findIndex(
    (c) => c.args.includes("merge") && c.args.includes("loopdog/slice-01"),
  );
  assert.ok(rebase01 >= 0, "slice-01 was rebased");
  assert.ok(merge01 > rebase01, "rebase precedes merge for slice-01");
});

test("review mode never touches main or pushes", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/.scratch/feat/issues/01-a.md": "> Status: ready-for-agent\nA",
    },
    spawnResults: [{ code: 0, stdout: "true" }],
  });

  await runParallel(env, {
    ralphPrompt: RALPH,
    permissionMode: "auto",
    model: "sonnet",
    maxAgents: 3,
    maxIterations: 50,
    trace: "review",
  });

  // No git command ever names main or pushes.
  for (const c of env.spawnCalls.filter((x) => x.cmd === "git")) {
    assert.ok(!c.args.includes("push"), `no push: ${c.args.join(" ")}`);
    assert.ok(!c.args.includes("main"), `never main: ${c.args.join(" ")}`);
    assert.ok(!c.args.includes("master"), `never master: ${c.args.join(" ")}`);
  }
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
