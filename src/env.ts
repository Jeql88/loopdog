import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { spawn as nodeSpawn } from "node:child_process";

/**
 * The one seam. Every loopdog command handler takes an `Env` and reaches the
 * outside world only through it: the filesystem, child processes, the current
 * working directory, and the output stream. Production wires this to real
 * `fs` / `child_process` / `process`; tests inject fakes.
 *
 * Keep this interface narrow — it is the single contract the whole CLI is
 * tested through, and a small interface is one that can be faked completely.
 */
export interface Env {
  /** Read a UTF-8 text file. Rejects if the path does not exist. */
  readFile(path: string): Promise<string>;
  /** Write a UTF-8 text file, creating or overwriting it. */
  writeFile(path: string, data: string): Promise<void>;
  /** True if a file or directory exists at the path. */
  exists(path: string): Promise<boolean>;
  /** Create a directory, including parents. No-op if it already exists. */
  mkdir(path: string): Promise<void>;
  /** List the entry names (not full paths) directly inside a directory. */
  readdir(path: string): Promise<string[]>;
  /**
   * Spawn a child process and resolve once it exits. On Windows a shell is used
   * so `.cmd` shims on PATH (claude, git) launch, which means **`args` must be
   * shell-safe** — short, space-free flags and tokens only. Anything large or
   * arbitrary (the ralph prompt) must be passed via `options.stdin`, never as
   * an arg. (See issue 14.)
   */
  spawn(cmd: string, args: string[], options?: SpawnOptions): Promise<SpawnResult>;
  /** The current working directory. */
  cwd(): string;
  /** Write a line (a trailing newline is added) to the user-facing stream. */
  writeOut(line: string): void;
  /** Write a raw chunk (no newline added) — for mirroring streamed output. */
  write(chunk: string): void;
}

export interface SpawnOptions {
  /**
   * Text to write to the child's stdin, then close it. Used to hand a large
   * payload (the ralph prompt) to `claude` without putting it on the command
   * line — where a shell could mangle or mis-quote it (see issue 14).
   */
  stdin?: string;
  /**
   * Run the child process in this directory. When undefined, the child
   * inherits the parent's working directory (today's behaviour). Used by the
   * parallel orchestrator to run each agent inside its own git worktree.
   */
  cwd?: string;
  /**
   * Called with each chunk of the child's stdout/stderr as it arrives, so a
   * long-running agent can be mirrored to the terminal live instead of dumped
   * at the end. The port stays presentation-free: it just forwards chunks; the
   * caller decides whether/where to show them. Captured output is still
   * returned in `SpawnResult` regardless. (See issue 15.)
   */
  onData?: (chunk: string, stream: "stdout" | "stderr") => void;
}

export interface SpawnResult {
  /** Process exit code (0 = success). Null if killed by a signal. */
  code: number | null;
  /** Everything the child wrote to stdout. */
  stdout: string;
  /** Everything the child wrote to stderr. */
  stderr: string;
}

/**
 * The production `Env`: the one place the real `fs`, `child_process`, and
 * `process` are touched. Every other module reaches them only through the port,
 * so nothing else needs to import Node's IO modules.
 */
export function realEnv(): Env {
  return {
    readFile: (path) => readFile(path, "utf8"),
    writeFile: (path, data) => writeFile(path, data, "utf8"),
    async exists(path) {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
    mkdir: async (path) => {
      await mkdir(path, { recursive: true });
    },
    readdir: (path) => readdir(path),
    spawn: (cmd, args, options) =>
      new Promise<SpawnResult>((resolve, reject) => {
        // On Windows the `claude` / `git` entrypoints on PATH are `.cmd` shims,
        // which spawn cannot launch by bare name without a shell (ENOENT), and
        // which Node refuses to launch by full path without one (EINVAL). So we
        // use a shell on Windows. This is safe here because no large/untrusted
        // text rides on the command line — the prompt is piped via stdin — so
        // there is nothing for the shell to mis-quote. (See issue 14.)
        const child = nodeSpawn(cmd, args, {
          shell: process.platform === "win32",
          ...(options?.cwd !== undefined && { cwd: options.cwd }),
        });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk) => {
          stdout += chunk;
          options?.onData?.(String(chunk), "stdout");
        });
        child.stderr?.on("data", (chunk) => {
          stderr += chunk;
          options?.onData?.(String(chunk), "stderr");
        });
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout, stderr }));
        if (options?.stdin !== undefined) {
          child.stdin?.end(options.stdin);
        }
      }),
    cwd: () => process.cwd(),
    writeOut: (line) => process.stdout.write(`${line}\n`),
    write: (chunk) => process.stdout.write(chunk),
  };
}
