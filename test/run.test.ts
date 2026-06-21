import { test } from "node:test";
import assert from "node:assert/strict";
import { runRun } from "../src/run.ts";
import { makeFakeEnv } from "./helpers/fake-env.ts";

const RALPH = "RALPH PROMPT BODY";

test("declines AFK run when a remote (GitHub) issue tracker is configured", async () => {
  const out: string[] = [];
  const env = makeFakeEnv({
    cwd: "/repo",
    writeOut: (s) => out.push(s),
    files: {
      "/repo/docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n\nIssues live as GitHub issues.",
    },
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  assert.equal(result.ok, false);
  assert.equal(result.spawned, false);
  // No agent and not even the PATH probe — the gate short-circuits everything.
  assert.equal(env.spawnCalls.length, 0);
  // Clear, explanatory message about local-markdown-only AFK support.
  assert.match(out.join("\n"), /local/i);
  assert.match(out.join("\n"), /markdown/i);
});

test("local-markdown tracker proceeds even when its prose mentions GitHub", async () => {
  // The real local tracker doc says "No GitHub issues are created" — a naive
  // keyword sniff would wrongly gate it. The explicit "Local Markdown" heading
  // must win.
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/docs/agents/issue-tracker.md":
        "# Issue tracker: Local Markdown\n\nNo GitHub issues are created — everything stays local.",
    },
    spawnResults: [{ stdout: "claude 1.0" }, { stdout: "" }, { stdout: "did work" }],
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  // Not gated: it proceeded to spawn the agent.
  assert.equal(result.ok, true);
  assert.ok(env.spawnCalls.some((c) => c.cmd === "claude" && c.args.includes("--print")));
});

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

  // Exactly one `claude --print --permission-mode auto` spawn.
  const agentCalls = env.spawnCalls.filter(
    (c) => c.cmd === "claude" && c.args.includes("--print"),
  );
  assert.equal(agentCalls.length, 1);
  assert.deepEqual(agentCalls[0].args, ["--print", "--permission-mode", "auto"]);

  // The prompt is delivered via STDIN, never as a CLI arg — so a large
  // multi-line prompt can't be mangled by Windows shell quoting (issue 14).
  const prompt = agentCalls[0].stdin ?? "";
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

test("mirrors the agent's output live through env.write as it streams", async () => {
  // The agent's run can take minutes; its output must be surfaced as it
  // arrives, not buffered and dumped at the end. runRun passes an onData mirror
  // to spawn, which writes each chunk through the port's raw `write`.
  const streamed: string[] = [];
  const env = makeFakeEnv({
    cwd: "/repo",
    write: (chunk) => streamed.push(chunk),
    spawnResults: [
      { stdout: "claude 1.0" }, // version probe
      { stdout: "abc earlier" }, // git log
      { stdout: "implemented slice 04, committed." }, // agent run
    ],
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  assert.equal(result.ok, true);
  // The agent's actual transcript reached the user-facing stream live.
  assert.ok(streamed.join("").includes("implemented slice 04, committed."));
  // And the same text is still captured on the result for the stop-signal check.
  assert.match(result.output, /implemented slice 04/);
});
