import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFakeEnv } from "./helpers/fake-env.ts";

test("fake fs is separator-agnostic so it matches real fs on Windows", async () => {
  const env = makeFakeEnv();

  // A handler using path.join produces "\" separators on Windows.
  await env.writeFile("repo\\a\\file.txt", "x");

  // Reads, existence, and listings must agree regardless of separator.
  assert.equal(await env.readFile("repo/a/file.txt"), "x");
  assert.equal(await env.exists("repo\\a"), true);
  assert.equal(await env.exists("repo/a"), true);
  assert.deepEqual(await env.readdir("repo/a"), ["file.txt"]);
});

test("fake spawner records calls and returns canned output in order", async () => {
  const env = makeFakeEnv({
    spawnResults: [
      { code: 0, stdout: "first run output" },
      { code: 0, stdout: "NO READY ISSUES" },
    ],
  });

  const first = await env.spawn("claude", ["--print", "--permission-mode", "auto"]);
  const second = await env.spawn("claude", ["--print"]);

  // Canned output is served in order.
  assert.equal(first.stdout, "first run output");
  assert.equal(second.stdout, "NO READY ISSUES");

  // Calls are recorded with their command and args, for prompt-assembly assertions.
  assert.equal(env.spawnCalls.length, 2);
  assert.deepEqual(env.spawnCalls[0], {
    cmd: "claude",
    args: ["--print", "--permission-mode", "auto"],
  });
});

test("fake spawner defaults to a clean zero-exit result when queue is empty", async () => {
  const env = makeFakeEnv();

  const result = await env.spawn("claude", []);

  assert.deepEqual(result, { code: 0, stdout: "", stderr: "" });
});
