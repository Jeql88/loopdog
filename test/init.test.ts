import { test } from "node:test";
import assert from "node:assert/strict";
import { runInit, printInitSummary } from "../src/init.ts";
import { makeFakeEnv } from "./helpers/fake-env.ts";

test("copies a template file that is absent in the target repo", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/templates/WORKFLOW.md": "workflow contents",
    },
  });

  const result = await runInit(env, "/templates");

  // The file landed in the target repo at the same relative path.
  assert.equal(await env.readFile("/repo/WORKFLOW.md"), "workflow contents");
  // ...and was reported as written.
  assert.deepEqual(result.written, ["WORKFLOW.md"]);
  assert.deepEqual(result.skipped, []);
});

test("skips a pre-existing file and never overwrites it", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/templates/CLAUDE.md": "stub claude from payload",
      "/repo/CLAUDE.md": "MY OWN project notes",
    },
  });

  const result = await runInit(env, "/templates");

  // The user's existing file is left completely untouched.
  assert.equal(await env.readFile("/repo/CLAUDE.md"), "MY OWN project notes");
  assert.deepEqual(result.written, []);
  assert.deepEqual(result.skipped, ["CLAUDE.md"]);
});

test("preserves nested directory structure when copying", async () => {
  const env = makeFakeEnv({
    cwd: "/repo",
    files: {
      "/templates/WORKFLOW.md": "wf",
      "/templates/.claude/skills/tdd/SKILL.md": "tdd skill",
      "/templates/docs/agents/issue-tracker.md": "tracker seed",
    },
  });

  const result = await runInit(env, "/templates");

  assert.equal(await env.readFile("/repo/.claude/skills/tdd/SKILL.md"), "tdd skill");
  assert.equal(await env.readFile("/repo/docs/agents/issue-tracker.md"), "tracker seed");
  assert.deepEqual(result.written.sort(), [
    ".claude/skills/tdd/SKILL.md",
    "WORKFLOW.md",
    "docs/agents/issue-tracker.md",
  ]);
});

test("summary reports written + skipped files and hands off to /configure-workflow", () => {
  const out: string[] = [];
  const env = makeFakeEnv({ writeOut: (s) => out.push(s) });

  printInitSummary(env, { written: ["WORKFLOW.md"], skipped: ["CLAUDE.md"] });
  const text = out.join("\n");

  // Both lists are reported by filename.
  assert.match(text, /written/i);
  assert.match(text, /WORKFLOW\.md/);
  assert.match(text, /skipped/i);
  assert.match(text, /CLAUDE\.md/);
  // Next-step handoff points at the configuration skill.
  assert.match(text, /\/configure-workflow/);
});
