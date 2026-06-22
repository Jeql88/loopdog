import type { Env } from "./env.ts";
import { runRun, ZERO_COST, type Cost } from "./run.ts";

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
  /** Token usage + dollar cost summed across every iteration. */
  totalCost: Cost;
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
  let totalCost: Cost = { ...ZERO_COST };
  const finish = (stoppedBy: LoopResult["stoppedBy"]): LoopResult => {
    env.writeOut(formatCostSummary(iterations, totalCost));
    return { iterations, stoppedBy, totalCost };
  };

  while (iterations < options.maxIterations) {
    env.writeOut(`\n===== loopdog iteration ${iterations + 1} =====`);
    const result = await runRun(env, {
      ralphPrompt: options.ralphPrompt,
      permissionMode: options.permissionMode,
    });
    iterations++;
    totalCost = addCost(totalCost, result.cost);

    // The agent's output streams live during each run; the per-iteration header
    // above is all the loop needs to add.
    if (!result.ok) return finish("error");
    if (result.stopSignal) return finish("stop-signal");
  }
  return finish("max-iterations");
}

/** Sum two cost records field-by-field. */
function addCost(a: Cost, b: Cost): Cost {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

/** End-of-loop summary: iteration count, total tokens by category, total cost. */
function formatCostSummary(iterations: number, total: Cost): string {
  return (
    `\n===== loopdog cost summary =====\n` +
    `${iterations} iteration(s) — ` +
    `in ${total.inputTokens} / out ${total.outputTokens} / ` +
    `cache-write ${total.cacheCreationTokens} / cache-read ${total.cacheReadTokens} tokens, ` +
    `$${total.costUsd.toFixed(4)} total`
  );
}
