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
  /** The number of agents in each wave, in order — for asserting the cap. */
  waveSizes: number[];
  /** Why the run ended. */
  stoppedBy: "empty-frontier" | "max-iterations" | "not-a-git-repo";
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
    return { agentsDispatched: 0, waves: 0, waveSizes: [], stoppedBy: "not-a-git-repo" };
  }

  const waveSizes: number[] = [];
  let agentsDispatched = 0;
  // In review mode, set up the integration worktree once for the whole run —
  // re-creating its branch each wave would fail in real git.
  const integration =
    options.trace === "review" ? await ensureIntegrationWorktree(env) : null;

  // Dependency-aware wave scheduler. Each iteration recomputes the frontier
  // (ready slices whose blockers are all done), dispatches up to maxAgents of
  // them, marks them done, and repeats — so a slice becomes eligible the moment
  // its blockers complete. The orchestrator owns the stop decision: the run
  // ends when the frontier is empty, regardless of any per-agent signal.
  while (true) {
    const frontier = await computeFrontier(env);
    if (frontier.length === 0) {
      return { agentsDispatched, waves: waveSizes.length, waveSizes, stoppedBy: "empty-frontier" };
    }

    // maxIterations bounds TOTAL spawns across the whole run (not per-agent), so
    // a misbehaving run cannot spawn unbounded agents. Trim the wave to whatever
    // budget remains; if none remains, stop.
    const remaining = options.maxIterations - agentsDispatched;
    if (remaining <= 0) {
      return { agentsDispatched, waves: waveSizes.length, waveSizes, stoppedBy: "max-iterations" };
    }
    const wave = frontier.slice(0, Math.min(options.maxAgents, remaining));

    await Promise.all(wave.map((issue) => dispatchAgent(env, issue, options)));
    // Integrate the wave's branches before recording completion. In review mode
    // (default) this merges them into loopdog-integration; conflict handling and
    // the hidden-mode patch export land in slices 07-08.
    if (integration !== null) await mergeWave(env, wave, integration);
    // Record completion so the next frontier sees these blockers satisfied.
    for (const issue of wave) await markDone(env, issue);
    waveSizes.push(wave.length);
    agentsDispatched += wave.length;

    if (agentsDispatched >= options.maxIterations) {
      return { agentsDispatched, waves: waveSizes.length, waveSizes, stoppedBy: "max-iterations" };
    }
  }
}

/**
 * The wave frontier: every `ready-for-agent` slice whose `Blocked by`
 * references are all `done`. A blocker counts as satisfied only when an issue
 * with that slice number is actually `done` (in an `issues/done/` archive, or
 * a file whose `Status:` reads `done`). A blocker that is still pending — or
 * that does not exist at all — leaves the slice blocked until a later wave.
 * Returned in slice-number order, capped by the caller.
 */
async function computeFrontier(env: Env): Promise<IssueFile[]> {
  const ready = await readyIssues(env);
  const done = await doneSliceIds(env);
  return ready.filter((issue) => {
    const blockers = parseBlockedBy(issue.body);
    return blockers.every((b) => done.has(b));
  });
}

/**
 * Slice numbers of every `done` issue — those archived under `issues/done/`
 * plus any whose `Status:` line still reads `done` in place. These are the
 * blockers the frontier treats as satisfied.
 */
async function doneSliceIds(env: Env): Promise<Set<string>> {
  const ids = new Set<string>();
  const root = `${env.cwd()}/.scratch`;
  await (async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await env.readdir(dir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/ENOTDIR|ENOENT/.test(message)) return;
      throw err;
    }
    for (const name of entries) {
      const child = `${dir}/${name}`;
      if (name.endsWith(".md")) {
        // Archived under done/, or status-done in place — either counts.
        const isArchived = /\/done\/[^/]+\.md$/.test(child);
        const body = await env.readFile(child);
        if (isArchived || /^[> ]*Status:\s*done/m.test(body)) {
          ids.add(sliceId(child));
        }
      } else {
        await walk(child);
      }
    }
  })(root);
  return ids;
}

/**
 * The slice numbers a `## Blocked by` section references. Blockers are written
 * as paths like `.scratch/feat/issues/01-base.md`; we key on the slice number
 * so a blocker is matched regardless of feature directory. A slice with no
 * `Blocked by` section has no blockers.
 */
function parseBlockedBy(body: string): string[] {
  const section = body.match(/##\s*Blocked by\s*\n([\s\S]*?)(?:\n##\s|$)/i);
  if (!section) return [];
  const ids: string[] = [];
  for (const line of section[1].split("\n")) {
    // Match an issue filename reference and pull its leading slice number.
    const m = line.match(/(\d+)-[^/`\s]+\.md/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

/**
 * Mark a dispatched slice `done` and stop it appearing in future frontiers.
 * In a real run the agent flips its own status and slice 06's merge integrates
 * it; here the orchestrator records completion directly so the next wave's
 * dependency frontier is correct through the Env seam.
 */
async function markDone(env: Env, issue: IssueFile): Promise<void> {
  const updated = issue.body.replace(
    /^([> ]*)Status:\s*ready-for-agent/m,
    "$1Status: done",
  );
  await env.writeFile(issue.path, updated);
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

/** The persistent integration branch all review-mode slices merge into. */
const INTEGRATION_BRANCH = "loopdog-integration";

/**
 * Merge a finished wave's branches back together — the review-mode integration
 * path. Each `loopdog/slice-NN` branch is merged **in slice-number order** into
 * a single `loopdog-integration` branch with `git merge --no-ff`, after being
 * rebased onto the current integration tip so mere textual drift from a sibling
 * slice auto-resolves instead of stalling the run. `main` is never touched and
 * nothing is pushed — promoting integration to a real branch is always a
 * deliberate human action. (Semantic-conflict parking is slice 07; here clean
 * rebases/merges are assumed.)
 */
async function mergeWave(env: Env, wave: IssueFile[], integration: string): Promise<void> {
  // Deterministic order: ascending slice number.
  const branches = wave
    .map((issue) => `loopdog/slice-${sliceId(issue.path)}`)
    .sort();
  for (const branch of branches) {
    // Rebase the branch onto the current integration tip (auto-resolves drift),
    // then merge it in with an explicit merge commit.
    await env.spawn("git", ["rebase", INTEGRATION_BRANCH, branch], { cwd: integration });
    await env.spawn("git", ["merge", "--no-ff", branch], { cwd: integration });
  }
}

/**
 * Ensure the `loopdog-integration` branch and its worktree exist, returning the
 * worktree path. Merges run inside this dedicated worktree so the user's own
 * working tree (and `main`) are never checked out or disturbed.
 */
async function ensureIntegrationWorktree(env: Env): Promise<string> {
  const dir = `${env.cwd()}/.loopdog/worktrees/integration`;
  // `worktree add -b` both creates the branch and checks it out into `dir`.
  // Idempotent in practice across waves: the first wave creates it; a canned/
  // real "already exists" is benign because subsequent merges target the same
  // branch by name. (Conflict/edge handling is out of scope for this slice.)
  await env.spawn("git", ["worktree", "add", "-b", INTEGRATION_BRANCH, dir]);
  return dir;
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
