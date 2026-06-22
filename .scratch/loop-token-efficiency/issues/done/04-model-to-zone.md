# 04 — Model-to-zone selection (default Sonnet, Opus override)

> Status: done

## Parent

`.scratch/loop-token-efficiency/PRD.md`

## What to build

Let the AFK dumb-zone path (`run` / `loop`, TDD implementation) default to a cheaper
model while leaving the human smart-zone skills on Opus. `runRun` passes a
`--model <id>` argument to the spawned `claude`, defaulting to **Sonnet** — the
cost-sensitive implementation path. Sonnet is the balanced default (Haiku's thrash risk
on TDD+review can cost a full cold-start for zero progress, erasing the saving); Opus
stays available as a per-run escape hatch for a hard feature.

The model is read from config and is **stable for the entire loop run** — it must not
change between iterations, because the prompt cache is model-scoped and a mid-loop switch
would invalidate it (this is what makes slice 03's cacheable prefix actually pay off).
Add the model setting to the existing `loop` config block in `loopdog.json`, read through
the existing `loadConfig`, which already merges per-section and falls back to documented
defaults on a missing or malformed file. A per-run override (CLI flag) can bump to Opus;
the config field is the durable record.

The model id must be shell-safe (it rides on the command line, not stdin — see the
spawn-args constraint in `env.ts`), which a plain model id like `sonnet` / `opus`
satisfies. Smart-zone interactive skills (grilling, PRD, slicing, review) are unaffected
and remain on Opus.

## Acceptance criteria

- [ ] `LoopdogConfig.loop` has a model field defaulting to Sonnet; `DEFAULT_CONFIG` includes it
- [ ] An absent `loop.model` yields the Sonnet default; a partial `loop` block merges field-by-field (existing `loadConfig` behaviour)
- [ ] A malformed `loopdog.json` still warns and falls back to defaults, the model field included
- [ ] The spawned `claude` args include `--model` with the configured id
- [ ] A per-run override (CLI flag) changes the model for that run; the config field is the durable default
- [ ] The model is identical across every iteration of a single `loop` run (no mid-loop switch)
- [ ] No smart-zone skill behaviour changes — this only affects the AFK run/loop spawn
- [ ] Tested through `runRun` / `runLoop` / `loadConfig` with the fake `Env`: default-Sonnet flag, per-run override, model-stable-across-iterations, and config load + malformed fallback

## Blocked by

- None — can start immediately
