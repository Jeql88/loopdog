import type { Env } from "./env.ts";

/** What `init` did, for the printed summary and for tests to assert against. */
export interface InitResult {
  /** Relative paths written (were absent in the target). */
  written: string[];
  /** Relative paths skipped (already existed — never overwritten). */
  skipped: string[];
}

/**
 * The `init` command: copy the template payload from `templatesRoot` into the
 * current repo, write-if-absent. Deterministic file delivery — no judgment, no
 * interview. Returns the write/skip tally; the caller prints it.
 */
export async function runInit(
  env: Env,
  templatesRoot: string,
): Promise<InitResult> {
  const target = env.cwd();
  const written: string[] = [];
  const skipped: string[] = [];

  for (const rel of await listFiles(env, templatesRoot)) {
    const dest = `${target}/${rel}`;
    if (await env.exists(dest)) {
      skipped.push(rel);
      continue;
    }
    // Real fs needs the parent directory to exist before writing; the fake
    // tolerates its absence, so this is only caught end-to-end against real fs.
    const parent = dest.slice(0, dest.lastIndexOf("/"));
    if (parent) await env.mkdir(parent);
    await env.writeFile(dest, await env.readFile(`${templatesRoot}/${rel}`));
    written.push(rel);
  }

  await ensureGitignored(env, target);

  return { written, skipped };
}

/**
 * Ensure `.loopdog/` is gitignored so loopdog's operational scaffolding (run
 * logs, `status.json`, and review-mode worktree dirs) is never committed, in
 * both trace modes. Write-if-absent and non-clobbering: a missing `.gitignore`
 * is created with the single entry; an existing one is appended to only when
 * the entry isn't already present.
 */
async function ensureGitignored(env: Env, target: string): Promise<void> {
  const path = `${target}/.gitignore`;
  const entry = ".loopdog/";
  if (!(await env.exists(path))) {
    await env.writeFile(path, `${entry}\n`);
    return;
  }
  const current = await env.readFile(path);
  const present = current.split("\n").some((line) => line.trim() === entry);
  if (present) return;
  // Append on its own line, preserving everything already there.
  const sep = current.endsWith("\n") || current.length === 0 ? "" : "\n";
  await env.writeFile(path, `${current}${sep}${entry}\n`);
}

/**
 * Print the write/skip summary and the next-step handoff. Kept separate from
 * `runInit` so the copy logic returns pure data and the presentation is tested
 * through `env.writeOut`.
 */
export function printInitSummary(env: Env, result: InitResult): void {
  if (result.written.length > 0) {
    env.writeOut(`Written (${result.written.length}):`);
    for (const path of result.written) env.writeOut(`  + ${path}`);
  }
  if (result.skipped.length > 0) {
    env.writeOut(`Skipped — already present (${result.skipped.length}):`);
    for (const path of result.skipped) env.writeOut(`  = ${path}`);
  }
  env.writeOut(
    "\nNext: open Claude Code and run /configure-workflow to wire the workflow to how you work.",
  );
}

/**
 * Relative paths of every file under `root`, recursively. Directories are
 * walked; files are emitted. A path is a directory iff `readdir` succeeds —
 * `readdir` on a file rejects (ENOTDIR), which is how we tell the two apart
 * without widening the port with an `isDir`.
 */
async function listFiles(env: Env, root: string): Promise<string[]> {
  const out: string[] = [];
  await walk(env, root, "", out);
  return out;
}

async function walk(
  env: Env,
  root: string,
  prefix: string,
  out: string[],
): Promise<void> {
  const dir = prefix ? `${root}/${prefix}` : root;
  for (const name of await env.readdir(dir)) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (await isDir(env, `${root}/${rel}`)) {
      await walk(env, root, rel, out);
    } else {
      out.push(rel);
    }
  }
}

async function isDir(env: Env, path: string): Promise<boolean> {
  try {
    await env.readdir(path);
    return true;
  } catch (err) {
    // Only "it's a file" (ENOTDIR) or "it's gone" (ENOENT) mean not-a-directory.
    // Any other failure (e.g. EACCES on a real directory) must surface, not be
    // silently misread as a file — which would skip a directory's contents and
    // produce a partial install with no error.
    const message = err instanceof Error ? err.message : String(err);
    if (/ENOTDIR|ENOENT/.test(message)) return false;
    throw err;
  }
}
