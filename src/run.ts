import type { Env } from "./env.ts";

/** The stop signal the agent prints when no ready slices remain. */
export const STOP_SIGNAL = "NO READY ISSUES";

export interface RunOptions {
  /** The ralph per-iteration prompt body (shipped with the tool). */
  ralphPrompt: string;
  /** Passed to `claude --permission-mode`; from config, default "auto". */
  permissionMode: string;
}

export interface RunResult {
  /** False if the run could not proceed (e.g. `claude` not on PATH). */
  ok: boolean;
  /** Whether the agent process was spawned this iteration. */
  spawned: boolean;
  /** Whether the agent reported the stop signal (no ready issues left). */
  stopSignal: boolean;
}

/**
 * One iteration of the ralph loop: guard that `claude` is installed, gather the
 * agent's context (open issues + recent commits + the ralph prompt), spawn the
 * agent exactly once, and report whether it signalled "no ready issues".
 */
export async function runRun(env: Env, options: RunOptions): Promise<RunResult> {
  if ((await detectIssueSource(env)) === "remote") {
    env.writeOut(
      "loopdog: a remote issue tracker is configured, but AFK run/loop in v1\n" +
        "supports local-markdown issues only (under .scratch/*/issues/). The\n" +
        "interactive workflow skills still work; only the autonomous loop is gated.",
    );
    return { ok: false, spawned: false, stopSignal: false };
  }

  if (!(await claudeOnPath(env))) {
    env.writeOut(
      "loopdog: the `claude` CLI was not found on your PATH.\n" +
        "Install Claude Code (https://docs.claude.com/en/docs/claude-code) and try again.",
    );
    return { ok: false, spawned: false, stopSignal: false };
  }

  const issues = await gatherReadyIssues(env);
  const commits = await recentCommits(env);
  const prompt = assemblePrompt(options.ralphPrompt, commits, issues);

  // The prompt goes via stdin, not argv: it is large and multi-line, and a
  // shell (needed to launch the `claude` shim on Windows) would mangle it as a
  // command-line argument. `claude --print` reads the prompt from stdin.
  const result = await env.spawn(
    "claude",
    ["--print", "--permission-mode", options.permissionMode],
    { stdin: prompt },
  );

  const stopSignal = result.stdout.includes(STOP_SIGNAL);
  return { ok: true, spawned: true, stopSignal };
}

/**
 * Concatenated contents of every `ready-for-agent` issue under
 * `.scratch/<*>/issues/`, excluding the `done/` archive. Excluding `done/` is
 * the context-hygiene mechanism: finished work never re-enters the agent's
 * context to taint the next iteration.
 */
async function gatherReadyIssues(env: Env): Promise<string> {
  const root = `${env.cwd()}/.scratch`;
  const bodies: string[] = [];
  for (const file of await findIssueFiles(env, root)) {
    const body = await env.readFile(file);
    if (/^[> ]*Status:\s*ready-for-agent/m.test(body)) bodies.push(body);
  }
  return bodies.join("\n\n---\n\n");
}

/** Paths of every `*.md` under any `issues/` directory, skipping `done/`. */
async function findIssueFiles(env: Env, root: string): Promise<string[]> {
  const found: string[] = [];
  await (async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await env.readdir(dir);
    } catch (err) {
      // A missing path or a non-directory (.md file) is expected — nothing to
      // gather there. Any other failure (e.g. EACCES on a real directory) must
      // surface, not be swallowed: silently dropping issues would feed the
      // agent an incomplete context and let it "finish" work it never saw.
      const message = err instanceof Error ? err.message : String(err);
      if (/ENOTDIR|ENOENT/.test(message)) return;
      throw err;
    }
    for (const name of entries) {
      if (name === "done") continue; // never descend into the archive
      const child = `${dir}/${name}`;
      if (name.endsWith(".md") && dir.endsWith("/issues")) {
        found.push(child);
      } else {
        await walk(child);
      }
    }
  })(root);
  return found.sort();
}

/** Recent commit summaries for context, via `git log` through the port. */
async function recentCommits(env: Env): Promise<string> {
  try {
    const { stdout } = await env.spawn("git", ["log", "--oneline", "-20"]);
    return stdout.trim() || "no commits yet";
  } catch {
    return "no commits yet";
  }
}

/** Assemble the agent prompt: ralph instructions + commits + open issues. */
function assemblePrompt(ralph: string, commits: string, issues: string): string {
  return [
    ralph,
    "## Recent commits",
    commits,
    "## Open issues",
    issues,
  ].join("\n\n");
}

/**
 * Whether issues come from a remote tracker (GitHub/GitLab) or local markdown.
 * The choice is recorded by `/configure-workflow` in the issue-tracker doc's
 * heading; absence of the file means the local-markdown default. AFK run/loop
 * supports local only — this is the signal the gate keys off.
 */
async function detectIssueSource(env: Env): Promise<"local" | "remote"> {
  const docPath = `${env.cwd()}/docs/agents/issue-tracker.md`;
  if (!(await env.exists(docPath))) return "local";
  const doc = await env.readFile(docPath);
  // An explicit "local markdown" declaration is authoritative — a local doc may
  // legitimately mention GitHub/GitLab in prose (e.g. "no GitHub issues are
  // created"), so it must win over the keyword sniff below.
  if (/local\s*markdown/i.test(doc)) return "local";
  // Otherwise, a GitHub/GitLab tracker named anywhere in the doc gates AFK.
  return /github|gitlab/i.test(doc) ? "remote" : "local";
}

/** True if the `claude` binary can be spawned (i.e. it is on PATH). */
async function claudeOnPath(env: Env): Promise<boolean> {
  try {
    await env.spawn("claude", ["--version"]);
    return true;
  } catch {
    return false;
  }
}
