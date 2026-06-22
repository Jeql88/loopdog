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
  // Parallel mode hard-requires a git repository — worktree isolation depends
  // on it. Fail early and clearly, before spawning any agent. (Serial `loop`
  // keeps working in any directory; this requirement is parallel-only.)
  if (!(await isGitRepo(env))) {
    env.writeOut(
      "loopdog: `loop --parallel` requires a git repository (it isolates each\n" +
        "agent in its own git worktree). Run it inside a git repo, or use serial\n" +
        "`loop` which works in any directory.",
    );
    return { agentsDispatched: 0, waves: 0 };
  }

  const ready = await readyIssues(env);
  // A wave is bounded by both the concurrency cap and how many slices are
  // actually ready — never dispatch an agent with nothing to do.
  const wave = ready.slice(0, options.maxAgents);
  if (wave.length === 0) return { agentsDispatched: 0, waves: 0 };

  await Promise.all(wave.map((issue) => dispatchAgent(env, issue, options)));
  return { agentsDispatched: wave.length, waves: 1 };
}

/** True if `cwd` is inside a git work tree, via `git rev-parse` through the port. */
async function isGitRepo(env: Env): Promise<boolean> {
  try {
    const { code } = await env.spawn("git", ["rev-parse", "--is-inside-work-tree"]);
    return code === 0;
  } catch {
    return false;
  }
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
  const slice = sliceId(issue.path);
  const branch = `loopdog/slice-${slice}`;
  const worktree = `${env.cwd()}/.loopdog/worktrees/slice-${slice}`;

  // Isolate the agent in its own git worktree on its own branch, so concurrent
  // agents never clobber a shared working tree. Merge/rebase of these branches
  // is slice 06; here the branch is just created, worked in, and torn down.
  await env.spawn("git", ["worktree", "add", "-b", branch, worktree]);
  try {
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
      { stdin: prompt, cwd: worktree },
    );
  } finally {
    // Always tear the worktree down, even if the agent failed — a stale
    // worktree would block the next run from recreating the same branch.
    await env.spawn("git", ["worktree", "remove", "--force", worktree]);
  }
}

/**
 * The two-digit slice number from an issue filename (e.g. `01-a.md` → "01"),
 * used to name the agent's branch and worktree deterministically. Falls back to
 * the bare filename stem if no leading number is present.
 */
function sliceId(issuePath: string): string {
  const file = issuePath.split("/").pop() ?? issuePath;
  const match = file.match(/^(\d+)/);
  return match ? match[1] : file.replace(/\.md$/, "");
}
