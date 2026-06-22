import type { Env } from "./env.ts";

/** The stop signal the agent prints when no ready slices remain. */
export const STOP_SIGNAL = "NO READY ISSUES";

export interface RunOptions {
  /** The ralph per-iteration prompt body (shipped with the tool). */
  ralphPrompt: string;
  /** Passed to `claude --permission-mode`; from config, default "auto". */
  permissionMode: string;
}

/**
 * Token usage and dollar cost for one iteration, lifted straight from the
 * stream-json `result` event's `usage` block and `total_cost_usd`. All fields
 * default to 0 when the agent didn't run or the event omitted them, so callers
 * can sum across iterations without null-checks.
 */
export interface Cost {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

/** A zero-valued cost — the safe default when no `result` usage was seen. */
export const ZERO_COST: Cost = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  costUsd: 0,
};

export interface RunResult {
  /** False if the run could not proceed (e.g. `claude` not on PATH). */
  ok: boolean;
  /** Whether the agent process was spawned this iteration. */
  spawned: boolean;
  /** Whether the agent reported the stop signal (no ready issues left). */
  stopSignal: boolean;
  /** Everything the spawned agent wrote to stdout (empty if not spawned). */
  output: string;
  /** Token usage + dollar cost for this iteration (zeros if not spawned). */
  cost: Cost;
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
    return { ok: false, spawned: false, stopSignal: false, output: "", cost: ZERO_COST };
  }

  if (!(await claudeOnPath(env))) {
    env.writeOut(
      "loopdog: the `claude` CLI was not found on your PATH.\n" +
        "Install Claude Code (https://docs.claude.com/en/docs/claude-code) and try again.",
    );
    return { ok: false, spawned: false, stopSignal: false, output: "", cost: ZERO_COST };
  }

  const issues = await gatherReadyIssues(env);
  const commits = await recentCommits(env);
  const prompt = assemblePrompt(options.ralphPrompt, commits, issues);

  // `claude --print` alone buffers its whole reply and emits it only on exit,
  // so a long run looks silent until it finishes. `--output-format stream-json
  // --verbose` emits incremental JSON events as the agent works; we render
  // those to readable text live via the mirror below. The prompt goes via
  // stdin (not argv) so a Windows shell can't mangle the large payload.
  const render = makeStreamRenderer((text) => env.write(text));
  const result = await env.spawn(
    "claude",
    [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      options.permissionMode,
    ],
    { stdin: prompt, onData: (chunk) => render(chunk) },
  );

  const stopSignal = result.stdout.includes(STOP_SIGNAL);
  const cost = parseCost(result.stdout);
  env.writeOut(formatCostLine(cost));
  return { ok: true, spawned: true, stopSignal, output: result.stdout, cost };
}

/**
 * Pull this iteration's token usage and dollar cost from the captured
 * stream-json stdout. The terminal `result` event carries a `usage` block and
 * `total_cost_usd`; we scan the lines for it after the run rather than
 * threading mutable state through the presentation-only renderer. Any missing
 * field degrades to 0 so cost reporting never throws on an odd `result` shape.
 */
function parseCost(stdout: string): Cost {
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isRecord(event) || event.type !== "result") continue;
    const usage = isRecord(event.usage) ? event.usage : {};
    return {
      inputTokens: numberOr0(usage.input_tokens),
      outputTokens: numberOr0(usage.output_tokens),
      cacheCreationTokens: numberOr0(usage.cache_creation_input_tokens),
      cacheReadTokens: numberOr0(usage.cache_read_input_tokens),
      costUsd: numberOr0(event.total_cost_usd),
    };
  }
  return { ...ZERO_COST };
}

/** A non-negative finite number, or 0 for anything else (missing/NaN/string). */
function numberOr0(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** One-line per-iteration cost report: token categories + dollar cost. */
export function formatCostLine(cost: Cost): string {
  return (
    `cost: in ${cost.inputTokens} / out ${cost.outputTokens} / ` +
    `cache-write ${cost.cacheCreationTokens} / cache-read ${cost.cacheReadTokens} tokens, ` +
    `$${cost.costUsd.toFixed(4)}`
  );
}

/**
 * Build a stateful renderer that turns a stream of `claude --output-format
 * stream-json` chunks into readable text, calling `write` with each rendered
 * fragment as it arrives. Chunks may split mid-line, so partial lines are
 * buffered until their newline. Lines that aren't the event types we surface
 * (assistant text, the final result) are skipped, and any non-JSON line is
 * passed through verbatim so nothing is silently lost.
 */
export function makeStreamRenderer(
  write: (text: string) => void,
): (chunk: string) => void {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      const rendered = renderStreamLine(line);
      if (rendered) write(rendered);
    }
  };
}

/** Render one stream-json line to readable text, or "" to skip it. */
function renderStreamLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  let event: unknown;
  try {
    event = JSON.parse(trimmed);
  } catch {
    // Not JSON (e.g. a warning printed before streaming begins) — show it as-is.
    return `${line}\n`;
  }
  if (typeof event !== "object" || event === null) return "";
  const e = event as Record<string, unknown>;

  // Assistant turns carry the agent's text in message.content blocks.
  if (e.type === "assistant" && isRecord(e.message)) {
    const content = e.message.content;
    if (Array.isArray(content)) {
      const text = content
        .filter((b): b is Record<string, unknown> => isRecord(b) && b.type === "text")
        .map((b) => String(b.text ?? ""))
        .join("");
      return text ? `${text}\n` : "";
    }
  }
  // The terminal result event: print its summary text if present.
  if (e.type === "result" && typeof e.result === "string") {
    return `${e.result}\n`;
  }
  return "";
}

/** Narrow an unknown to a plain object for safe property access. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
