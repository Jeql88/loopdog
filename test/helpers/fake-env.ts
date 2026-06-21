import type { Env, SpawnResult, SpawnOptions } from "../../src/env.ts";

/** One recorded `spawn` call, for asserting what a handler tried to run. */
export interface SpawnCall {
  cmd: string;
  args: string[];
  /** What the handler piped to the child's stdin, if anything. */
  stdin?: string;
  /** The working directory set for this spawn, if any. */
  cwd?: string;
}

export interface FakeEnvOptions {
  /** Initial in-memory filesystem: path -> file contents. */
  files?: Record<string, string>;
  /** Working directory the fake reports. Defaults to "/repo". */
  cwd?: string;
  /** Sink for `writeOut`. Defaults to discarding output. */
  writeOut?: (line: string) => void;
  /** Sink for raw `write` chunks (streamed mirror). Defaults to discarding. */
  write?: (chunk: string) => void;
  /**
   * Canned responses for `spawn`, consumed in order. When exhausted, `spawn`
   * resolves to a zero-exit empty result. Each entry may be a partial result.
   */
  spawnResults?: Partial<SpawnResult>[];
  /**
   * When false, spawning `claude` rejects with an ENOENT-style error, exactly
   * as real `spawn` does when the binary is not on PATH. Defaults to true.
   */
  claudeOnPath?: boolean;
}

export interface FakeEnv extends Env {
  /** Every `spawn` call made through this env, in order. */
  readonly spawnCalls: SpawnCall[];
  /** Current in-memory filesystem snapshot. */
  readonly files: Record<string, string>;
}

const DEFAULT_SPAWN: SpawnResult = { code: 0, stdout: "", stderr: "" };

/**
 * A fully in-memory `Env` for fast, deterministic command tests. Records every
 * spawn call and serves canned spawn results — the fake-`claude`-spawner the
 * PRD calls for, used to drive `run`/`loop` without a live agent.
 */
export function makeFakeEnv(options: FakeEnvOptions = {}): FakeEnv {
  // Keys are stored normalised to "/" so the fake behaves identically whether a
  // handler passes POSIX or Windows separators — matching real fs on Windows,
  // where path.join yields "\". Without this, init's write-if-absent tests
  // could pass against the fake yet diverge against the real environment.
  const files = new Map<string, string>(
    Object.entries(options.files ?? {}).map(([k, v]) => [norm(k), v]),
  );
  const dirs = new Set<string>();
  const spawnCalls: SpawnCall[] = [];
  const spawnQueue = [...(options.spawnResults ?? [])];
  const claudeOnPath = options.claudeOnPath ?? true;
  const cwd = options.cwd ?? "/repo";
  const writeOut = options.writeOut ?? (() => {});
  const write = options.write ?? (() => {});

  // Register parent directories so readdir/exists behave for seeded files.
  for (const path of files.keys()) {
    for (const parent of ancestors(path)) dirs.add(parent);
  }

  const env: FakeEnv = {
    async readFile(path) {
      const data = files.get(norm(path));
      if (data === undefined) throw new Error(`ENOENT: ${path}`);
      return data;
    },
    async writeFile(path, data) {
      const key = norm(path);
      files.set(key, data);
      for (const parent of ancestors(key)) dirs.add(parent);
    },
    async exists(path) {
      const key = norm(path);
      return files.has(key) || dirs.has(key);
    },
    async mkdir(path) {
      const key = norm(path);
      dirs.add(key);
      for (const parent of ancestors(key)) dirs.add(parent);
    },
    async readdir(path) {
      const dir = norm(path);
      // Match real fs: reading a file as a directory fails (ENOTDIR), as does
      // reading a path that does not exist (ENOENT). This keeps the fake
      // faithful so file-vs-directory logic is genuinely exercised.
      if (files.has(dir)) throw new Error(`ENOTDIR: ${path}`);
      if (!dirs.has(dir)) throw new Error(`ENOENT: ${path}`);
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      const names = new Set<string>();
      for (const key of [...files.keys(), ...dirs]) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const name = rest.split("/")[0];
        if (name) names.add(name);
      }
      return [...names].sort();
    },
    async spawn(cmd, args, options) {
      spawnCalls.push({ cmd, args, stdin: options?.stdin, cwd: options?.cwd });
      if (cmd === "claude" && !claudeOnPath) {
        throw new Error(`spawn claude ENOENT`);
      }
      const next = spawnQueue.shift();
      const result = { ...DEFAULT_SPAWN, ...next };
      // Exercise the streaming path: real spawn forwards each output chunk to
      // onData as it arrives, so the fake forwards the canned output once.
      if (result.stdout) options?.onData?.(result.stdout, "stdout");
      if (result.stderr) options?.onData?.(result.stderr, "stderr");
      return result;
    },
    cwd() {
      return cwd;
    },
    writeOut,
    write,
    spawnCalls,
    get files() {
      return Object.fromEntries(files);
    },
  };

  return env;
}

/** Normalise path separators to "/" so the fake fs is separator-agnostic. */
function norm(path: string): string {
  return path.replace(/\\/g, "/");
}

/** All ancestor directory paths of a normalised path, excluding the path itself. */
function ancestors(path: string): string[] {
  const absolute = path.startsWith("/");
  const parts = path.split("/").filter(Boolean);
  const result: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    result.push(absolute ? `/${dir}` : dir);
  }
  return result;
}
