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
    // Integrate the wave. Review mode merges branches into loopdog-integration
    // (parking unresolvable conflicts as needs-info); hidden mode exports each
    // slice as a patch and tears its branch down, leaving zero git footprint and
    // printing the git-apply lines for the human to land by hand.
    let parked = new Set<string>();
    if (integration !== null) {
      parked = await mergeWave(env, wave, integration);
    } else {
      const patches = await tearDownHidden(env, wave);
      if (patches.length > 0) {
        env.writeOut("loopdog (hidden): apply the parked patches by hand:");
        for (const patch of patches) {
          env.writeOut(`  git apply ${relativeToCwd(env, patch)}`);
        }
      }
    }
    // Record completion so the next frontier sees these blockers satisfied —
    // except parked slices, which keep their fresh needs-info status.
    for (const issue of wave) {
      if (!parked.has(issue.path)) await markDone(env, issue);
    }
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

/** A path rewritten relative to the repo root, for tidy user-facing hints. */
function relativeToCwd(env: Env, path: string): string {
  const prefix = `${env.cwd()}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
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
  const worktree = `${worktreeBase(env, options.trace)}/slice-${slice}`;

  // Isolate the agent in its own git worktree on its own branch, so concurrent
  // agents never clobber a shared working tree. In hidden mode the worktree is
  // out-of-tree (no loopdog working folder inside the repo); in review mode it
  // sits under the gitignored .loopdog/.
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
    // worktree would block the next run from recreating the same branch. In
    // review mode the branch persists for the merge; in hidden mode the patch
    // export + branch deletion happen in tearDownHidden after the wave.
    await env.spawn("git", ["worktree", "remove", "--force", worktree]);
  }
}

/**
 * Base directory for agent worktrees. Review mode keeps them under the
 * gitignored `.loopdog/` inside the repo; hidden mode places them **outside**
 * the repo tree entirely, so no `loopdog/*` working folder ever sits inside the
 * project. The out-of-tree location is a sibling of the repo (a low-risk
 * default per the PRD — only "outside the tree" is contractual).
 */
function worktreeBase(env: Env, trace: ParallelOptions["trace"]): string {
  if (trace !== "hidden") return `${env.cwd()}/.loopdog/worktrees`;
  // Out of tree: a sibling of the repo, named for the repo so concurrent
  // hidden runs of different repos don't collide. Resolved by stripping the
  // repo's own last path segment rather than appending "/.." (which would
  // still textually live under the repo path).
  const cwd = env.cwd().replace(/\/+$/, "");
  const cut = cwd.lastIndexOf("/");
  const parent = cut > 0 ? cwd.slice(0, cut) : ""; // "" → filesystem root
  const repoName = cwd.slice(cut + 1) || "repo";
  return `${parent}/.loopdog-hidden/${repoName}/worktrees`;
}

/**
 * Hidden-mode finish: export each finished slice as a patch into the gitignored
 * `.loopdog/patches/`, then delete its branch so no `loopdog/*` ref survives in
 * the repo's object store — zero autonomous git footprint. Returns the patch
 * paths so the caller can print the `git apply …` lines for the human.
 */
async function tearDownHidden(env: Env, wave: IssueFile[]): Promise<string[]> {
  const patchDir = `${env.cwd()}/.loopdog/patches`;
  await env.mkdir(patchDir);
  const patches: string[] = [];
  for (const issue of wave) {
    const slice = sliceId(issue.path);
    const branch = `loopdog/slice-${slice}`;
    const patchPath = `${patchDir}/slice-${slice}.patch`;
    // Export the branch's work as a patch (the patch content itself comes from
    // git in a real run; here we record the file so the apply hint is real).
    const { stdout } = await env.spawn("git", ["format-patch", branch, "--stdout"]);
    await env.writeFile(patchPath, stdout || `# patch for ${branch}\n`);
    patches.push(patchPath);
    // Delete the branch — no loopdog/* ref left behind.
    await env.spawn("git", ["branch", "-D", branch]);
  }
  return patches;
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
async function mergeWave(
  env: Env,
  wave: IssueFile[],
  integration: string,
): Promise<Set<string>> {
  // Slices whose merge had to be parked — the caller must not then mark them
  // done over their fresh needs-info status.
  const parked = new Set<string>();
  // Deterministic order: ascending slice number.
  const ordered = [...wave].sort((a, b) => sliceId(a.path).localeCompare(sliceId(b.path)));
  for (const issue of ordered) {
    const branch = `loopdog/slice-${sliceId(issue.path)}`;
    // Rebase the branch onto the current integration tip (auto-resolves mere
    // textual drift), then merge it in with an explicit merge commit. Either
    // step can hit a true semantic conflict the rebase can't resolve.
    const rebase = await env.spawn("git", ["rebase", INTEGRATION_BRANCH, branch], {
      cwd: integration,
    });
    if (rebase.code !== 0) {
      await env.spawn("git", ["rebase", "--abort"], { cwd: integration });
      await parkConflict(env, issue, rebase.stdout + rebase.stderr);
      parked.add(issue.path);
      continue; // one hard slice must not stall the rest of the batch
    }
    const merge = await env.spawn("git", ["merge", "--no-ff", branch], { cwd: integration });
    if (merge.code !== 0) {
      await env.spawn("git", ["merge", "--abort"], { cwd: integration });
      await parkConflict(env, issue, merge.stdout + merge.stderr);
      parked.add(issue.path);
    }
  }
  return parked;
}

/**
 * Park a slice whose merge couldn't auto-resolve: flip its `Status:` to the
 * existing `needs-info` triage state (no new vocabulary) and record the
 * conflicting paths in its body, so the human resolves the ambiguous merge
 * instead of loopdog guessing. The branch is left intact for them to inspect.
 */
async function parkConflict(env: Env, issue: IssueFile, gitOutput: string): Promise<void> {
  const paths = conflictingPaths(gitOutput);
  const note =
    `\n\n## Comments\n\n` +
    `Parked by \`loop --parallel\`: this slice's branch could not be merged into ` +
    `\`${INTEGRATION_BRANCH}\` automatically (semantic conflict). Resolve by hand, then ` +
    `re-mark \`ready-for-agent\`.\n\n` +
    (paths.length
      ? `Conflicting paths:\n${paths.map((p) => `- \`${p}\``).join("\n")}\n`
      : `(no conflicting paths reported)\n`);
  const updated =
    issue.body.replace(/^([> ]*)Status:\s*ready-for-agent/m, "$1Status: needs-info") + note;
  await env.writeFile(issue.path, updated);
}

/** Pull conflicting file paths out of git's "CONFLICT ... in <path>" lines. */
function conflictingPaths(gitOutput: string): string[] {
  const paths: string[] = [];
  for (const line of gitOutput.split("\n")) {
    const m = line.match(/CONFLICT[^\n]*?in\s+(.+?)\s*$/i);
    if (m) paths.push(m[1]);
  }
  return paths;
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
