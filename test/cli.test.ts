import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/cli.ts";
import { makeFakeEnv } from "./helpers/fake-env.ts";

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
