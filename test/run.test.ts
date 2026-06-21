import { test } from "node:test";
import assert from "node:assert/strict";
import { runRun } from "../src/run.ts";
import { makeFakeEnv } from "./helpers/fake-env.ts";

const RALPH = "RALPH PROMPT BODY";

test("fails early with install guidance when claude is not on PATH", async () => {
  const out: string[] = [];
  // claudeOnPath: false makes the fake's spawn throw ENOENT for `claude`,
  // simulating the binary being absent — exactly how real spawn fails.
  const env = makeFakeEnv({ cwd: "/repo", claudeOnPath: false, writeOut: (s) => out.push(s) });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  assert.equal(result.ok, false);
  assert.equal(result.spawned, false);
  // The agent was never spawned — only the PATH probe was attempted.
  assert.ok(env.spawnCalls.every((c) => c.args.includes("--version")));
  assert.match(out.join("\n"), /claude/i);
  assert.match(out.join("\n"), /install|PATH/i);
});

test("gathers ready issues (excluding done/) + git log + ralph prompt, spawns once", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/.scratch/feat/issues/01-ready.md": "> Status: ready-for-agent\nDo the ready thing.",
      "/repo/.scratch/feat/issues/02-blocked.md": "> Status: needs-info\nWait for human.",
      "/repo/.scratch/feat/issues/done/00-finished.md": "> Status: done\nALREADY FINISHED WORK.",
    },
    spawnResults: [
      { code: 0, stdout: "git log" }, // version probe
      { code: 0, stdout: "abc123 earlier commit" }, // git log
      { code: 0, stdout: "implemented slice 01" }, // claude agent run
    ],
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  assert.equal(result.ok, true);
  assert.equal(result.spawned, true);

  // Exactly one `claude --print --permission-mode auto <prompt>` spawn.
  const agentCalls = env.spawnCalls.filter(
    (c) => c.cmd === "claude" && c.args.includes("--print"),
  );
  assert.equal(agentCalls.length, 1);
  assert.deepEqual(agentCalls[0].args.slice(0, 3), ["--print", "--permission-mode", "auto"]);

  const prompt = agentCalls[0].args[3];
  // Ralph prompt + recent commits + the ready issue are all in context.
  assert.match(prompt, /RALPH PROMPT BODY/);
  assert.match(prompt, /abc123 earlier commit/);
  assert.match(prompt, /Do the ready thing/);
  // Archived (done/) work must NOT enter context — that's the hygiene property.
  assert.doesNotMatch(prompt, /ALREADY FINISHED WORK/);
});

test("detects the NO READY ISSUES stop signal from agent output", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    spawnResults: [
      { stdout: "claude 1.0" }, // version probe
      { stdout: "" }, // git log
      { stdout: "Nothing ready.\nNO READY ISSUES\n" }, // agent run
    ],
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  assert.equal(result.stopSignal, true);
});

test("no stop signal when the agent did work", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    spawnResults: [
      { stdout: "claude 1.0" },
      { stdout: "" },
      { stdout: "implemented slice 03, committed, archived." },
    ],
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  assert.equal(result.stopSignal, false);
});
