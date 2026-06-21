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
  /** Spawn a child process and resolve once it exits. */
  spawn(cmd: string, args: string[]): Promise<SpawnResult>;
  /** The current working directory. */
  cwd(): string;
  /** Write a line to the user-facing output stream. */
  writeOut(line: string): void;
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
    spawn: (cmd, args) =>
      new Promise<SpawnResult>((resolve, reject) => {
        const child = nodeSpawn(cmd, args, { shell: false });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk) => (stdout += chunk));
        child.stderr?.on("data", (chunk) => (stderr += chunk));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout, stderr }));
      }),
    cwd: () => process.cwd(),
    writeOut: (line) => process.stdout.write(`${line}\n`),
  };
}
