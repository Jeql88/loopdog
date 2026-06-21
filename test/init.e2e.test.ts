import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "../src/cli.ts";
import { realEnv } from "../src/env.ts";
import { withTempDir } from "./helpers/temp-dir.ts";

/** Build the env with cwd pinned to the target repo (real fs, real spawn unused). */
function envInDir(dir: string, out: string[]) {
  return { ...realEnv(), cwd: () => dir, writeOut: (s: string) => out.push(s) };
}

test("init copies a real templates tree into a real repo, write-if-absent", async () => {
  await withTempDir(async (root) => {
    // A real templates payload on disk.
    const templates = join(root, "templates");
    await mkdir(join(templates, "docs", "agents"), { recursive: true });
    await writeFile(join(templates, "WORKFLOW.md"), "workflow");
    await writeFile(join(templates, "CLAUDE.md"), "stub claude");
    await writeFile(join(templates, "docs", "agents", "tracker.md"), "seed");

    // A target repo that already has its own CLAUDE.md.
    const repo = join(root, "repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "CLAUDE.md"), "MY OWN NOTES");

    const out: string[] = [];
    const code = await run(["init"], envInDir(repo, out), templates);
    const text = out.join("\n");

    assert.equal(code, 0);
    // New files landed, structure preserved.
    assert.equal(await readFile(join(repo, "WORKFLOW.md"), "utf8"), "workflow");
    assert.equal(
      await readFile(join(repo, "docs", "agents", "tracker.md"), "utf8"),
      "seed",
    );
    // The user's CLAUDE.md is untouched and reported as skipped.
    assert.equal(await readFile(join(repo, "CLAUDE.md"), "utf8"), "MY OWN NOTES");
    assert.match(text, /skipped/i);
    assert.match(text, /CLAUDE\.md/);
    assert.match(text, /\/configure-workflow/);
  });
});
