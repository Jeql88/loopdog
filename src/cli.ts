#!/usr/bin/env node
import { argv, exit } from "node:process";
import { pathToFileURL } from "node:url";
import type { Env } from "./env.ts";
import { realEnv } from "./env.ts";

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
export async function run(argv: string[], env: Env): Promise<number> {
  const [command] = argv;

  switch (command) {
    case undefined:
      env.writeOut(USAGE);
      return 0;
    case "init":
    case "run":
    case "loop":
      // Handlers land in later slices; for now the command is recognised.
      env.writeOut(`loopdog ${command}: not yet implemented`);
      return 0;
    default:
      env.writeOut(`Unknown command: ${command}\n\n${USAGE}`);
      return 1;
  }
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
