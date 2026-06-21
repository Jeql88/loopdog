import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { realEnv } from "../src/env.ts";
import { withTempDir } from "./helpers/temp-dir.ts";

test("real env writes and reads a file through the port", async () => {
  await withTempDir(async (dir) => {
    const env = realEnv();
    const path = join(dir, "hello.txt");

    assert.equal(await env.exists(path), false);
    await env.writeFile(path, "world");
    assert.equal(await env.exists(path), true);
    assert.equal(await env.readFile(path), "world");
  });
});

test("real env spawn runs child in the given cwd", async () => {
  await withTempDir(async (dir) => {
    const env = realEnv();
    const target = resolve(dir);

    // Ask node to print its working directory — works cross-platform.
    const result = await env.spawn(
      "node",
      ["-e", "process.stdout.write(process.cwd())"],
      { cwd: target },
    );

    assert.equal(result.code, 0);
    // Resolve both to normalise Windows path casing / trailing separators.
    assert.equal(resolve(result.stdout), target);
  });
});

test("real env mkdir + readdir lists real entries", async () => {
  await withTempDir(async (dir) => {
    const env = realEnv();
    const sub = join(dir, "a", "b");
    await env.mkdir(sub);
    await env.writeFile(join(dir, "a", "file.txt"), "x");

    const entries = await env.readdir(join(dir, "a"));
    assert.deepEqual(entries.sort(), ["b", "file.txt"]);
  });
});
