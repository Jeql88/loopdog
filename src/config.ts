import type { Env } from "./env.ts";

/** loopdog configuration, as written to `loopdog.json` by `init`. */
export interface LoopdogConfig {
  guardrails: {
    /** Skills print "Next: /clear, then run /<skill>". */
    nextStepHints: boolean;
    /** Skills print /clear reminders + teach the smart/dumb zone. */
    contextHygiene: boolean;
  };
  loop: {
    /** AFK backstop: stop after this many iterations. */
    maxIterations: number;
    /** Passed to `claude --permission-mode`. */
    permissionMode: string;
  };
}

/** Documented defaults — all guardrails ON, applied when config is absent. */
export const DEFAULT_CONFIG: LoopdogConfig = {
  guardrails: { nextStepHints: true, contextHygiene: true },
  loop: { maxIterations: 50, permissionMode: "auto" },
};

/**
 * Read `loopdog.json` from the repo root, falling back to the documented
 * defaults for a missing file or any missing field. The single source of truth
 * for both the CLI (`loop.*`) and the skills (`guardrails.*`).
 */
export async function loadConfig(env: Env): Promise<LoopdogConfig> {
  const path = `${env.cwd()}/loopdog.json`;
  if (!(await env.exists(path))) return DEFAULT_CONFIG;

  let raw: Partial<LoopdogConfig>;
  try {
    raw = JSON.parse(await env.readFile(path)) as Partial<LoopdogConfig>;
  } catch {
    // A malformed loopdog.json must not brick an unattended loop. Warn, name
    // the file, and fall back to the documented defaults rather than crashing.
    env.writeOut(`loopdog: ${path} is not valid JSON — using default config.`);
    return DEFAULT_CONFIG;
  }
  return {
    guardrails: { ...DEFAULT_CONFIG.guardrails, ...raw.guardrails },
    loop: { ...DEFAULT_CONFIG.loop, ...raw.loop },
  };
}
