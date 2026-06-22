# 01 — Cache-health verdict in the end-of-loop cost summary

> Status: done

## Parent

`.scratch/cache-health/PRD.md`

## What to build

> **Implementation note:** this slice is already built in the working tree (uncommitted)
> — `cacheHealthLine` in `src/loop.ts`, wired into `formatCostSummary`, with unit tests
> in `test/loop.test.ts`, and the full suite passes. Scope this slice to **confirm,
> commit, and archive** the existing implementation, not to rebuild it from scratch.
> Only re-derive code if the working-tree version is missing or fails review against the
> contract below.

Append a one-line, plain-English **cache-health verdict** to loopdog's end-of-loop cost
summary, so an AFK operator learns whether the cross-iteration prompt cache was actually
reused without having to eyeball raw token counts. loopdog re-pays a large fixed harness
overhead on every fresh-process slice; it stays cheap only because the harness serves
most of that as cache-*read* rather than cache-*write*. This verdict surfaces the one
number that says whether that discount is landing.

The verdict is a **pure function of the loop's already-summed `Cost` record** — no I/O,
no `Env` — so it is trivially unit-testable. The metric is the cache-read share:
`readShare = cacheRead / (cacheRead + cacheCreation)`, as a whole-number percent.
Input/output tokens are deliberately excluded from the denominator. The line is appended
after the existing totals line; the per-iteration cost line and the raw totals are
unchanged. Costs zero extra tokens — it reads only data already captured from the
`result` event.

Bands (thresholds grounded in the real validated run, which measured ~83% read share):

```
cached === 0          → "cache: no cached tokens seen (single short iteration?)."
readShare ≥ 60        → "cache: healthy — N% of cached tokens were reads (cheap). The cross-iteration prompt cache is working."
25 ≤ readShare < 60   → "cache: partial — only N% ... check that slices finish within the ~5-min cache TTL."
readShare < 25        → "cache: COLD — only N% ... levers are inert ... Only the model choice is saving tokens."
```

## Acceptance criteria

- [ ] A pure function takes the loop's total `Cost` record and returns a single verdict line; it performs no I/O and reads no `Env`
- [ ] The metric is cache-read share = `cacheRead / (cacheRead + cacheCreation)`, expressed as a whole-number percent; input/output tokens are not in the denominator
- [ ] `readShare ≥ 60` returns a **healthy** verdict stating the cross-iteration cache is working
- [ ] `25 ≤ readShare < 60` returns a **partial** verdict that flags some full-price iterations and points at the ~5-min cache TTL
- [ ] `readShare < 25` returns a **COLD** verdict stating the cacheable-prefix levers are inert and only the model choice is saving tokens
- [ ] `cacheRead + cacheCreation === 0` returns a graceful "no cached tokens seen" message and never divides by zero
- [ ] The verdict line is appended to the existing end-of-loop cost summary (after the totals line); the per-iteration cost line and the raw token totals are unchanged
- [ ] No new spawn, request, CLI surface, config, or module is introduced — only a verdict derived from the `Cost` already summed across iterations
- [ ] Unit tests assert the band *language* (healthy / partial / COLD / no-cached-tokens) for representative `Cost` records, including each band boundary and the zero-cached degenerate case
- [ ] The existing `runLoop` test that drives the loop through the fake `Env` confirms the summary now contains a cache verdict line
- [ ] Full test suite passes; the change is committed and the issue archived to `done/`

## Blocked by

- None — can start immediately
