import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadConfig, DEFAULT_CONFIG } from "../src/config.ts";
import { makeFakeEnv } from "./helpers/fake-env.ts";

test("loads values from a present loopdog.json", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/loopdog.json": JSON.stringify({
        guardrails: { nextStepHints: false, contextHygiene: false },
        loop: { maxIterations: 7, permissionMode: "plan" },
      }),
    },
  });

  const config = await loadConfig(env);

  assert.equal(config.guardrails.nextStepHints, false);
  assert.equal(config.guardrails.contextHygiene, false);
  assert.equal(config.loop.maxIterations, 7);
  assert.equal(config.loop.permissionMode, "plan");
});

test("falls back to all documented defaults when loopdog.json is absent", async () => {
  const env = makeFakeEnv({ cwd: "/repo" });

  const config = await loadConfig(env);

  assert.deepEqual(config, DEFAULT_CONFIG);
  // The documented defaults: guardrails ON, maxIterations 50, permission auto.
  assert.equal(config.guardrails.nextStepHints, true);
  assert.equal(config.guardrails.contextHygiene, true);
  assert.equal(config.loop.maxIterations, 50);
  assert.equal(config.loop.permissionMode, "auto");
});

test("merges a partial file field-by-field with defaults", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      // Only one loop field set; everything else should default.
      "/repo/loopdog.json": JSON.stringify({ loop: { maxIterations: 3 } }),
    },
  });

  const config = await loadConfig(env);

  assert.equal(config.loop.maxIterations, 3); // from file
  assert.equal(config.loop.permissionMode, "auto"); // default
  assert.equal(config.guardrails.nextStepHints, true); // default
});

test("loop.model defaults to sonnet and loads an override from the file", async () => {
  // Absent loop.model → the cost-sensitive Sonnet default.
  const defaulted = await loadConfig(makeFakeEnv({ cwd: "/repo" }));
  assert.equal(defaulted.loop.model, "sonnet");

  // A present loop.model is honoured (the durable per-repo default).
  const overridden = await loadConfig(
    makeFakeEnv({
      cwd: "/repo",
      files: { "/repo/loopdog.json": JSON.stringify({ loop: { model: "opus" } }) },
    }),
  );
  assert.equal(overridden.loop.model, "opus");
  // Other loop fields still default — field-by-field merge.
  assert.equal(overridden.loop.maxIterations, 50);
});

test("falls back to defaults (with a warning) when loopdog.json is malformed", async () => {
  const out: string[] = [];
  const env = makeFakeEnv({
    cwd: "/repo",
    writeOut: (s) => out.push(s),
    files: { "/repo/loopdog.json": "{ this is not valid json" },
  });

  const config = await loadConfig(env);

  // A typo'd config must not crash an unattended loop.
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.match(out.join("\n"), /not valid json/i);
});

test("absent parallel block yields parallel defaults", async () => {
  // A v1 loopdog.json has no parallel block — loadConfig fills in the defaults.
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/loopdog.json": JSON.stringify({
        loop: { maxIterations: 5, permissionMode: "plan" },
      }),
    },
  });

  const config = await loadConfig(env);

  assert.equal(config.parallel.maxAgents, 3);
  assert.equal(config.parallel.trace, "review");
});

test("partial parallel block merges field-by-field over defaults", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/repo/loopdog.json": JSON.stringify({
        parallel: { trace: "hidden" },
      }),
    },
  });

  const config = await loadConfig(env);

  assert.equal(config.parallel.trace, "hidden"); // from file
  assert.equal(config.parallel.maxAgents, 3); // default
});

test("malformed loopdog.json falls back to defaults including parallel", async () => {
  const out: string[] = [];
  const env = makeFakeEnv({
    cwd: "/repo",
    writeOut: (s) => out.push(s),
    files: { "/repo/loopdog.json": "not json at all" },
  });

  const config = await loadConfig(env);

  assert.equal(config.parallel.maxAgents, 3);
  assert.equal(config.parallel.trace, "review");
  assert.match(out.join("\n"), /not valid json/i);
});

test("the shipped templates/loopdog.json is v1 — no parallel block", async () => {
  // init emits the v1 config; the parallel block is a v2-era addition that
  // surfaces purely through loadConfig's per-section merge, not the template.
  const shipped = fileURLToPath(new URL("../templates/loopdog.json", import.meta.url));
  const parsed = JSON.parse(await readFile(shipped, "utf8"));

  // Template must not contain a parallel block.
  assert.equal("parallel" in parsed, false);
  // v1 fields still match their defaults.
  assert.deepEqual(parsed.guardrails, DEFAULT_CONFIG.guardrails);
  assert.deepEqual(parsed.loop, DEFAULT_CONFIG.loop);
});
