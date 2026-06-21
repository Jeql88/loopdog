import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
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
