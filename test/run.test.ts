import { test } from "node:test";
import assert from "node:assert/strict";
import { runRun, makeStreamRenderer } from "../src/run.ts";
import { makeFakeEnv } from "./helpers/fake-env.ts";

const RALPH = "RALPH PROMPT BODY";

/** A single ready issue, so deterministic selection has something to spawn for. */
const READY_ISSUE = { "/repo/.scratch/feat/issues/01-ready.md": "> Status: ready-for-agent\nDo the ready thing." };

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
      ...READY_ISSUE,
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
  // Streams incrementally (stream-json) so a long run isn't silent until exit.
  assert.deepEqual(agentCalls[0].args, [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "auto",
  ]);

  // The prompt is delivered via STDIN, never as a CLI arg — so a large
  // multi-line prompt can't be mangled by Windows shell quoting (issue 14).
  const prompt = agentCalls[0].stdin ?? "";
  assert.match(prompt, /RALPH PROMPT BODY/);
  assert.match(prompt, /abc123 earlier commit/);
  assert.match(prompt, /Do the ready thing/);
  // Archived (done/) work must NOT enter context — that's the hygiene property.
  assert.doesNotMatch(prompt, /ALREADY FINISHED WORK/);
});

test("selects the lowest-numbered ready issue and sends only that one", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/.scratch/feat/issues/01-first.md": "> Status: ready-for-agent\nFIRST READY SLICE.",
      "/repo/.scratch/feat/issues/02-second.md": "> Status: ready-for-agent\nSECOND READY SLICE.",
      "/repo/.scratch/feat/issues/03-third.md": "> Status: ready-for-agent\nTHIRD READY SLICE.",
    },
    spawnResults: [
      { stdout: "claude 1.0" }, // version probe
      { stdout: "" }, // git log
      { stdout: "did it" }, // agent run
    ],
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  assert.equal(result.spawned, true);
  const prompt =
    env.spawnCalls.find((c) => c.cmd === "claude" && c.args.includes("--print"))?.stdin ?? "";
  // Only the lowest-numbered ready issue is handed to the agent.
  assert.match(prompt, /FIRST READY SLICE/);
  assert.doesNotMatch(prompt, /SECOND READY SLICE/);
  assert.doesNotMatch(prompt, /THIRD READY SLICE/);
});

test("never selects a non-ready issue; picks the next ready one instead", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      // Lowest-numbered, but blocked — must be skipped.
      "/repo/.scratch/feat/issues/01-blocked.md": "> Status: needs-info\nBLOCKED SLICE.",
      "/repo/.scratch/feat/issues/02-triage.md": "> Status: needs-triage\nUNTRIAGED SLICE.",
      "/repo/.scratch/feat/issues/03-ready.md": "> Status: ready-for-agent\nTHE READY SLICE.",
      "/repo/.scratch/feat/issues/done/00-done.md": "> Status: done\nARCHIVED SLICE.",
    },
    spawnResults: [{ stdout: "claude 1.0" }, { stdout: "" }, { stdout: "did it" }],
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  const prompt =
    env.spawnCalls.find((c) => c.cmd === "claude" && c.args.includes("--print"))?.stdin ?? "";
  assert.equal(result.spawned, true);
  assert.match(prompt, /THE READY SLICE/);
  assert.doesNotMatch(prompt, /BLOCKED SLICE/);
  assert.doesNotMatch(prompt, /UNTRIAGED SLICE/);
  assert.doesNotMatch(prompt, /ARCHIVED SLICE/);
});

test("with no ready issue, emits the stop signal without spawning the agent", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/.scratch/feat/issues/01-blocked.md": "> Status: needs-info\nblocked",
      "/repo/.scratch/feat/issues/done/00-done.md": "> Status: done\ndone",
    },
    spawnResults: [{ stdout: "claude 1.0" }], // only the version probe should run
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  assert.equal(result.ok, true);
  assert.equal(result.stopSignal, true);
  // No agent was spawned — loopdog decided the backlog was empty itself.
  assert.equal(result.spawned, false);
  assert.equal(
    env.spawnCalls.filter((c) => c.cmd === "claude" && c.args.includes("--print")).length,
    0,
  );
});

test("orders the prompt static-prefix-first, commits last (cacheable prefix)", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/.scratch/feat/issues/01-ready.md": "> Status: ready-for-agent\nTHE SELECTED ISSUE.",
    },
    spawnResults: [
      { stdout: "claude 1.0" }, // version probe
      { stdout: "deadbee recent commit" }, // git log
      { stdout: "did it" }, // agent run
    ],
  });

  await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  const prompt =
    env.spawnCalls.find((c) => c.cmd === "claude" && c.args.includes("--print"))?.stdin ?? "";
  const ralphAt = prompt.indexOf("RALPH PROMPT BODY");
  const issueAt = prompt.indexOf("THE SELECTED ISSUE");
  const commitsAt = prompt.indexOf("deadbee recent commit");
  // Static prefix (ralph, then the issue) comes before the volatile commit tail.
  assert.ok(ralphAt >= 0 && issueAt > ralphAt, "ralph then issue");
  assert.ok(commitsAt > issueAt, "commits come after the issue");
  // And the commit block is the LAST section — nothing of substance after it.
  assert.equal(commitsAt, Math.max(ralphAt, issueAt, commitsAt), "commits last");
});

test("trims the commit list to ~5 recent commits via git log", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/.scratch/feat/issues/01-ready.md": "> Status: ready-for-agent\nslice",
    },
    spawnResults: [{ stdout: "claude 1.0" }, { stdout: "log" }, { stdout: "did it" }],
  });

  await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  const gitLog = env.spawnCalls.find((c) => c.cmd === "git" && c.args.includes("log"));
  assert.ok(gitLog, "git log was spawned");
  // Trimmed from 20 to 5 to keep the volatile tail small.
  assert.ok(gitLog.args.includes("-5"), `git log limited to 5: ${gitLog.args.join(" ")}`);
  assert.ok(!gitLog.args.includes("-20"), "no longer requests 20");
});

test("captures usage + cost from the stream-json result event and reports it", async () => {
  const out: string[] = [];
  const resultEvent =
    JSON.stringify({
      type: "result",
      subtype: "success",
      result: "Done.",
      total_cost_usd: 0.0123,
      usage: {
        input_tokens: 1200,
        output_tokens: 340,
        cache_creation_input_tokens: 19000,
        cache_read_input_tokens: 5000,
      },
    }) + "\n";
  const env = makeFakeEnv({
    cwd: "/repo",
    writeOut: (s) => out.push(s),
    files: { ...READY_ISSUE },
    spawnResults: [
      { stdout: "claude 1.0" }, // version probe
      { stdout: "" }, // git log
      { stdout: resultEvent }, // agent run
    ],
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  // Captured onto the result for the loop to accumulate.
  assert.equal(result.cost.inputTokens, 1200);
  assert.equal(result.cost.outputTokens, 340);
  assert.equal(result.cost.cacheCreationTokens, 19000);
  assert.equal(result.cost.cacheReadTokens, 5000);
  assert.equal(result.cost.costUsd, 0.0123);

  // A per-iteration cost line reaches the user, showing all four token
  // categories and the dollar cost.
  const text = out.join("\n");
  assert.match(text, /1200|1,200/);
  assert.match(text, /340/);
  assert.match(text, /19000|19,000/);
  assert.match(text, /5000|5,000/);
  assert.match(text, /0\.0123|\$0\.01/);
});

test("a result event without usage/cost degrades to zeros, never throws", async () => {
  const out: string[] = [];
  const env = makeFakeEnv({
    cwd: "/repo",
    writeOut: (s) => out.push(s),
    files: { ...READY_ISSUE },
    spawnResults: [
      { stdout: "claude 1.0" },
      { stdout: "" },
      // result event with no usage block and no total_cost_usd
      { stdout: JSON.stringify({ type: "result", subtype: "success", result: "Done." }) + "\n" },
    ],
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  assert.equal(result.ok, true);
  assert.equal(result.cost.inputTokens, 0);
  assert.equal(result.cost.outputTokens, 0);
  assert.equal(result.cost.cacheCreationTokens, 0);
  assert.equal(result.cost.cacheReadTokens, 0);
  assert.equal(result.cost.costUsd, 0);
});

test("detects the NO READY ISSUES stop signal from agent output", async () => {
  // A ready issue exists, so the agent is spawned; the agent itself then reports
  // the stop signal in its output (the agent-emitted path, distinct from
  // loopdog's own empty-backlog short-circuit).
  const env = makeFakeEnv({
    cwd: "/repo",
    files: { ...READY_ISSUE },
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
    files: { ...READY_ISSUE },
    spawnResults: [
      { stdout: "claude 1.0" },
      { stdout: "" },
      { stdout: "implemented slice 03, committed, archived." },
    ],
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  assert.equal(result.stopSignal, false);
});

test("stream renderer extracts assistant text and skips noise events", () => {
  const out: string[] = [];
  const render = makeStreamRenderer((t) => out.push(t));
  render(JSON.stringify({ type: "system", subtype: "init" }) + "\n");
  render(
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Implementing slice 01." }] },
    }) + "\n",
  );
  render(JSON.stringify({ type: "rate_limit_event" }) + "\n");
  render(JSON.stringify({ type: "result", subtype: "success", result: "Done." }) + "\n");

  const text = out.join("");
  assert.match(text, /Implementing slice 01\./);
  assert.match(text, /Done\./);
  // System/rate-limit events are noise — not surfaced to the user.
  assert.doesNotMatch(text, /system|rate_limit/);
});

test("stream renderer buffers chunks that split a line mid-way", () => {
  const out: string[] = [];
  const render = makeStreamRenderer((t) => out.push(t));
  const full =
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "half-and-half" }] },
    }) + "\n";
  // Deliver the line in two arbitrary chunks — the renderer must not emit until
  // the newline arrives, then emit the whole reassembled line once.
  render(full.slice(0, 20));
  assert.equal(out.length, 0, "nothing emitted before the newline");
  render(full.slice(20));
  assert.match(out.join(""), /half-and-half/);
});

test("stream renderer passes a non-JSON line through verbatim", () => {
  const out: string[] = [];
  const render = makeStreamRenderer((t) => out.push(t));
  // A warning printed before streaming begins isn't JSON — it must not be lost.
  render("(node:1) DeprecationWarning: something\n");
  assert.match(out.join(""), /DeprecationWarning/);
});

test("mirrors the agent's output live through env.write as it streams", async () => {
  // The agent's run can take minutes; its output must be surfaced as it
  // arrives, not buffered and dumped at the end. runRun passes an onData mirror
  // to spawn, which writes each chunk through the port's raw `write`.
  const streamed: string[] = [];
  // The agent run emits stream-json lines (newline-terminated), which the
  // renderer turns into readable text on the user-facing stream.
  const agentLine =
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "implemented slice 04, committed." }] },
    }) + "\n";
  const env = makeFakeEnv({
    cwd: "/repo",
    write: (chunk) => streamed.push(chunk),
    files: { ...READY_ISSUE },
    spawnResults: [
      { stdout: "claude 1.0" }, // version probe
      { stdout: "abc earlier" }, // git log
      { stdout: agentLine }, // agent run (stream-json)
    ],
  });

  const result = await runRun(env, { ralphPrompt: RALPH, permissionMode: "auto" });

  assert.equal(result.ok, true);
  // The agent's actual transcript reached the user-facing stream live, rendered
  // from stream-json to plain text.
  assert.ok(streamed.join("").includes("implemented slice 04, committed."));
  // And the raw stream-json is still captured on the result for the stop check.
  assert.match(result.output, /implemented slice 04/);
});
