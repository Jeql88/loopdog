import type { Env } from "./env.ts";
import { readyIssues, assemblePrompt, type IssueFile } from "./run.ts";

/**
 * Options for a parallel `loop --parallel N` run. Mirrors the serial loop's
 * options, plus the parallel-specific caps and trace mode from the `parallel`
 * config block.
 */
export interface ParallelOptions {
  /** The ralph per-iteration prompt body (shipped with the tool). */
  ralphPrompt: string;
  /** Passed to each agent's `claude --permission-mode`. */
  permissionMode: string;
  /** Model id for every agent's `claude --model`. */
  model: string;
  /** Concurrency cap: at most this many agents/worktrees per wave. */
  maxAgents: number;
  /** Backstop: total agent spawns across the whole run may not exceed this. */
  maxIterations: number;
  /** Git footprint: "review" keeps branches; "hidden" exports patches. */
  trace: "review" | "hidden";
}

export interface ParallelResult {
  /** How many agents were dispatched across the whole run. */
  agentsDispatched: number;
  /** How many waves ran. */
  waves: number;
}

/**
 * The parallel orchestrator: loopdog itself conducts up to `maxAgents`
 * independent headless `claude --print` agents at once, each a fresh solo
 * context implementing one slice — *not* a lead-Claude-with-sub-agents model.
 * The agents never learn about each other; coordination lives here, in Node,
 * outside the agents, so each stays in the smart zone.
 *
 * This skeleton runs a single wave: pick up to `maxAgents` of the
 * lowest-numbered ready slices and run them concurrently. Dependency-aware wave
 * frontiers, worktree isolation, and ordered merge are layered on in later
 * slices; the contract proven here is that `--parallel` reaches a distinct
 * orchestrator path and fans out N solo agents through the `Env` seam.
 */
export async function runParallel(
  env: Env,
  options: ParallelOptions,
): Promise<ParallelResult> {
  const ready = await readyIssues(env);
  // A wave is bounded by both the concurrency cap and how many slices are
  // actually ready — never dispatch an agent with nothing to do.
  const wave = ready.slice(0, options.maxAgents);
  if (wave.length === 0) return { agentsDispatched: 0, waves: 0 };

  await Promise.all(wave.map((issue) => dispatchAgent(env, issue, options)));
  return { agentsDispatched: wave.length, waves: 1 };
}

/**
 * Spawn one fresh solo agent on one slice. Identical in shape to the serial
 * loop's spawn (same flags, prompt via stdin, model on argv) — the only
 * difference is N of these run at once. The prompt is assembled from the ralph
 * body and this single slice; it deliberately carries no mention of the other
 * agents in the wave.
 */
async function dispatchAgent(
  env: Env,
  issue: IssueFile,
  options: ParallelOptions,
): Promise<void> {
  // No commit context in the skeleton wave (worktree/branch choreography lands
  // in slice 04); the solo prompt is ralph + the one slice.
  const prompt = assemblePrompt(options.ralphPrompt, "no commits yet", issue.body);
  await env.spawn(
    "claude",
    [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      options.permissionMode,
      "--model",
      options.model,
    ],
    { stdin: prompt },
  );
}
