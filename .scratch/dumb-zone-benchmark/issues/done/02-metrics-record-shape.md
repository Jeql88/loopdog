# 02 — Complete metrics record (all token categories + cache-read share)

> Status: done

## Parent

`.scratch/dumb-zone-benchmark/PRD.md`

## What to build

Harden the single-path metrics record from slice 01 into the **full, pre-fixed shape**
the benchmark grades on, so that no metric is ever silently dropped and the record is the
same for every path. Reported **per-path and per-slice**.

The metrics record carries, for a path:

- total **input**, **output**, **cache-creation**, and **cache-read** tokens,
- total **`total_cost_usd`**,
- **cache-read share** (cache-read ÷ (cache-read + cache-creation), as a whole-number
  percent — the same direct signal of cross-process reuse the cache-health verdict uses),
- the same breakdown **per slice**, not only per path.

The benchmark's outputs vary in token *magnitude* run-to-run, but the record's *shape*
must be deterministic: a complete record means every token category, cost, and the
cache-read share are present for every slice and for the path total. This is what the
tests assert — coverage and shape, not specific token counts (those are already covered
by the existing `parseCost` tests).

## Acceptance criteria

- [ ] The metrics record contains input, output, cache-creation, cache-read, total cost, and cache-read share for the path total
- [ ] The same breakdown is reported per slice, not only per path
- [ ] Cache-read share is computed as cache-read ÷ (cache-read + cache-creation) as a whole-number percent, degrading gracefully when no cached tokens were seen
- [ ] Unit tests feed canned `stream-json` `result` events through a fake env and assert the record is *complete in shape* (no category or per-slice entry silently missing), not specific magnitudes
- [ ] No new token plumbing — values still come from the existing `result`-event parsing
- [ ] Full test suite passes; the change is committed

## Blocked by

- `.scratch/dumb-zone-benchmark/issues/01-backlog-and-harness-skeleton.md`
