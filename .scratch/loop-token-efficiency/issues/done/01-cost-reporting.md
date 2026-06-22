# 01 — Per-iteration + loop cost reporting

> Status: done

## Parent

`.scratch/loop-token-efficiency/PRD.md`

## What to build

Surface what each AFK iteration actually costs, pulled for free from data the loop
already receives. `runRun` already spawns `claude --output-format stream-json --verbose`
and parses the streamed lines; the terminal `result` event carries a `usage` block
(`input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
`cache_read_input_tokens`) and `total_cost_usd`. Capture those — no extra request, no
estimation.

After each iteration, print a one-line cost report broken into input / output /
cache-creation / cache-read tokens plus the dollar cost. At loop end, print a summary
totalling tokens and cost across every iteration. This lands **first** so the other
levers (selection, prompt-order, model) can be validated against real cost numbers, and
so cost can be judged per *completed* slice, not just per iteration.

Capture the usage from the `result` event already being parsed (the stream renderer in
`run.ts` sees every line) and return it from `runRun` so `runLoop` can accumulate it.
The numbers must reach the user through the existing `writeOut` sink.

## Acceptance criteria

- [ ] `runRun` captures `usage` (input/output/cache-creation/cache-read tokens) and `total_cost_usd` from the stream-json `result` event and returns them in its result
- [ ] After an iteration, `writeOut` receives a per-iteration cost line showing all four token categories and the dollar cost
- [ ] `runLoop` accumulates per-iteration usage and emits an end-of-loop summary line (total tokens by category + total cost)
- [ ] A `result` event missing the `usage`/`total_cost_usd` fields degrades gracefully (zeros / "unknown"), never throws
- [ ] Captured from the existing stream — no additional spawn or API request is made to obtain cost
- [ ] Existing run/loop behaviour is unchanged: live streamed output, the iteration header, the run/loop summary lines, stop-signal detection
- [ ] Tested through `runRun` / `runLoop` with the fake `Env`: a canned `result` event with a `usage` block and `total_cost_usd` produces the per-iteration line; a multi-iteration loop produces the summary

## Blocked by

- None — can start immediately
