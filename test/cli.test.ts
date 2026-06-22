import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.ts";
import { makeFakeEnv } from "./helpers/fake-env.ts";

/** The absolute path cli.ts reads the ralph prompt from (mirrors packageRelative). */
const RALPH_PATH = fileURLToPath(new URL("../ralph/prompt.md", import.meta.url));

test("no args prints usage and exits cleanly", async () => {
  const out: string[] = [];
  const env = makeFakeEnv({ writeOut: (s) => out.push(s) });

  const code = await run([], env);

  assert.equal(code, 0);
  assert.match(out.join("\n"), /usage/i);
  assert.match(out.join("\n"), /init/);
  assert.match(out.join("\n"), /run/);
  assert.match(out.join("\n"), /loop/);
});

test("unknown command prints usage and exits non-zero", async () => {
  const out: string[] = [];
  const env = makeFakeEnv({ writeOut: (s) => out.push(s) });

  const code = await run(["frobnicate"], env);

  assert.equal(code, 1);
  assert.match(out.join("\n"), /usage/i);
});

test("loop --parallel N routes into the orchestrator (fans out agents)", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      [RALPH_PATH]: "RALPH",
      "/repo/.scratch/feat/issues/01-a.md": "> Status: ready-for-agent\nA",
      "/repo/.scratch/feat/issues/02-b.md": "> Status: ready-for-agent\nB",
    },
  });

  const code = await run(["loop", "--parallel", "2"], env);

  assert.equal(code, 0);
  // The orchestrator fanned out one agent per ready slice — the parallel path,
  // not the serial loop (which would spawn a version probe + git log first).
  const agents = env.spawnCalls.filter((c) => c.cmd === "claude" && c.args.includes("--print"));
  assert.equal(agents.length, 2);
  // No --version probe: the orchestrator skeleton doesn't do the serial guard.
  assert.ok(!env.spawnCalls.some((c) => c.args.includes("--version")));
});

test("loop with no flag still runs the serial loop unchanged", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      [RALPH_PATH]: "RALPH",
      // No ready issues → serial loop selects nothing → stop signal, no agent.
    },
    spawnResults: [{ stdout: "claude 1.0" }], // version probe only
  });

  const code = await run(["loop"], env);

  assert.equal(code, 0);
  // Serial path: the version probe runs (the orchestrator path never probes).
  assert.ok(env.spawnCalls.some((c) => c.args.includes("--version")));
});
