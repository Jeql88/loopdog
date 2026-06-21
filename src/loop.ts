import type { Env } from "./env.ts";
import { runRun } from "./run.ts";

export interface LoopOptions {
  /** The ralph per-iteration prompt body (shipped with the tool). */
  ralphPrompt: string;
  /** Passed to each `run` iteration's `claude --permission-mode`. */
  permissionMode: string;
  /** Backstop: stop after this many iterations even without a stop signal. */
  maxIterations: number;
}

export interface LoopResult {
  /** How many `run` iterations executed. */
  iterations: number;
  /** Why the loop ended. */
  stoppedBy: "stop-signal" | "max-iterations" | "error";
}

/**
 * The AFK loop: repeat one `run` iteration until the agent signals no ready
 * issues remain, or the `maxIterations` backstop is hit. Each iteration is a
 * fresh `claude` process — fresh context, the smart zone — so finished work
 * from a prior iteration never degrades judgment on the next slice.
 */
export async function runLoop(
  env: Env,
  options: LoopOptions,
): Promise<LoopResult> {
  let iterations = 0;
  while (iterations < options.maxIterations) {
    env.writeOut(`\n===== loopdog iteration ${iterations + 1} =====`);
    const result = await runRun(env, {
      ralphPrompt: options.ralphPrompt,
      permissionMode: options.permissionMode,
    });
    iterations++;

    // The agent's output streams live during each run; the per-iteration header
    // above is all the loop needs to add.
    if (!result.ok) return { iterations, stoppedBy: "error" };
    if (result.stopSignal) return { iterations, stoppedBy: "stop-signal" };
  }
  return { iterations, stoppedBy: "max-iterations" };
}
