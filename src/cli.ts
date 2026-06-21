#!/usr/bin/env node
import { argv, exit } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import type { Env } from "./env.ts";
import { realEnv } from "./env.ts";
import { runInit, printInitSummary } from "./init.ts";
import { runRun } from "./run.ts";

const USAGE = `loopdog — drop an AI-engineering workflow into a repo and run it.

Usage: loopdog <command>

Commands:
  init    Copy the workflow payload into the current repo (write-if-absent).
  run     Implement exactly one ready slice via a headless Claude Code run.
  loop    Repeat run in fresh context until no ready slices remain.`;

/**
 * Parse argv (already sliced past `node` and the script path) and dispatch to a
 * command handler. Returns the process exit code. All side effects go through
 * `env`, so the whole CLI is driven from tests with a fake env.
 */
export async function run(
  argv: string[],
  env: Env,
  templatesRoot: string = defaultTemplatesRoot(),
): Promise<number> {
  const [command] = argv;

  switch (command) {
    case undefined:
      env.writeOut(USAGE);
      return 0;
    case "init": {
      const result = await runInit(env, templatesRoot);
      printInitSummary(env, result);
      return 0;
    }
    case "run": {
      const ralphPrompt = await env.readFile(defaultRalphPromptPath());
      const result = await runRun(env, { ralphPrompt, permissionMode: "auto" });
      return result.ok ? 0 : 1;
    }
    case "loop":
      // Handler lands in slice 04; for now the command is recognised.
      env.writeOut(`loopdog ${command}: not yet implemented`);
      return 0;
    default:
      env.writeOut(`Unknown command: ${command}\n\n${USAGE}`);
      return 1;
  }
}

/**
 * The shipped `templates/` directory, resolved relative to this module. At
 * runtime this file lives in `dist/`, so `templates/` is one level up — the
 * `package.json` `files` array ships both `dist/` and `templates/` together.
 */
function defaultTemplatesRoot(): string {
  return packageRelative("templates");
}

/** The shipped ralph per-iteration prompt, resolved relative to this module. */
function defaultRalphPromptPath(): string {
  return packageRelative("ralph", "prompt.md");
}

/** A path under the package root (this module lives in dist/, so go up one). */
function packageRelative(...parts: string[]): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", ...parts);
}

/** Binary entrypoint: wire the real environment and exit with the command's code. */
async function main(): Promise<void> {
  const code = await run(argv.slice(2), realEnv());
  exit(code);
}

// Run only when invoked as the binary, not when imported by tests.
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  void main();
}
