# 02 — README token story leads with proven levers

> Status: done

## Parent

`.scratch/cache-health/PRD.md`

## What to build

The README currently has **no token/cost section at all**, which leaves loopdog's central
"streamlines AI engineering without burning tokens" promise unstated and unbacked. Add a
token section that **leads with what the validated session actually measured**, rather
than implying caching as an unverified feature:

- The cross-process prompt cache **is** reused across the fresh `claude --print`
  processes loopdog spawns one-per-slice — measured cache-read was ~83% of all cached
  tokens on a real two-slice loop. This is what makes loopdog affordable.
- Sonnet-by-default is a flat discount on top of that.
- Be honest about the fragility the same measurement exposed: the cache is the *only*
  reason it is cheap; harness overhead (~200K tokens/slice) dominates everything loopdog
  controls, and the new cache-health verdict (issue 01) is what monitors the cache on
  every run so a silent regression surfaces as words, not a quietly larger bill.

Keep it prose; lead with the proven, demote any unverified framing. No code change.

## Acceptance criteria

- [ ] The README has a token/cost section that leads with the measured, proven levers (cross-process cache reuse; Sonnet-by-default discount)
- [ ] Any framing that implies caching is an unverified or aspirational feature is removed or demoted
- [ ] The section is honest about the fragility: the cache is what stands between cheap and a ~10× bill, and references the cache-health verdict as the per-run monitor
- [ ] Prose only — no code, config, or command behaviour changes
- [ ] Claims in the section match the validated numbers recorded in the PRD (do not invent figures)

## Blocked by

- None — can start immediately
