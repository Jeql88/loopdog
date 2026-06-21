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

test("the shipped templates/loopdog.json equals the loader's documented defaults", async () => {
  // init writes this file; if it drifts from DEFAULT_CONFIG, a fresh repo's
  // on-disk config would silently disagree with the loader's fallbacks.
  const shipped = fileURLToPath(new URL("../templates/loopdog.json", import.meta.url));
  const parsed = JSON.parse(await readFile(shipped, "utf8"));

  assert.deepEqual(parsed, DEFAULT_CONFIG);
});
