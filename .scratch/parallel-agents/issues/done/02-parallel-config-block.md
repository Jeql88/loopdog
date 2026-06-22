# 02 — `parallel` config block in `loadConfig`

> Status: done

## Parent

`.scratch/parallel-agents/PRD.md`

## What to build

Teach `loadConfig` about a new optional `parallel` block in `loopdog.json`, merged exactly
like the existing `loop.*` and `guardrails.*` sections: defaults apply when the block (or
any field) is absent, partial blocks merge field-by-field, and malformed JSON still falls
back safely to defaults.

```jsonc
"parallel": {
  "maxAgents": 3,        // concurrent worktrees/agents per wave
  "trace": "review"      // "review" (default) | "hidden"
}
```

Crucially, this is a **v2-era addition that does not change `init`'s v1 output** — `init`
must keep writing the v1 `loopdog.json` with no `parallel` block. The defaults apply purely
through `loadConfig`'s per-section merge when the block is absent, so adopting loopdog v1
is never complicated by a feature that ships later.

## Acceptance criteria

- [ ] `LoopdogConfig` has a `parallel` section with `maxAgents` (default 3) and `trace` (default `"review"`)
- [ ] `DEFAULT_CONFIG` includes the parallel defaults; an absent `parallel` block yields them
- [ ] A partial `parallel` block merges field-by-field over the defaults (e.g. only `trace` set → `maxAgents` stays 3)
- [ ] Malformed `loopdog.json` still warns and falls back to defaults, parallel block included
- [ ] `init`'s emitted `loopdog.json` is unchanged — it contains no `parallel` block (asserted)

## Blocked by

- None — can start immediately
