# 03 — Cacheable prompt order + trimmed commits

> Status: done

## Parent

`.scratch/loop-token-efficiency/PRD.md`

## What to build

Restructure the per-iteration prompt so the prompt cache can be reused between
consecutive iterations that fire within its (~5-minute) TTL. Today `assemblePrompt`
orders the prompt as ralph → commits → issues, which puts the volatile commit list in
the middle, busting the cacheable prefix for everything after it.

Invert it: **static prefix first** (ralph instructions, then the single selected issue),
**volatile tail last** (recent commits). The static prefix must be byte-identical across
iterations for cache reuse to land — the only thing that legitimately varies is which
single issue is selected (slice 02) and the trailing commits.

Also relocate and trim the commit block: it moves to the **end** of the prompt, and the
commit count drops from the current 20 to roughly 5. Commits are kept (not dropped
entirely) to preserve a modest "what just happened" hygiene signal; whether they can be
dropped completely is a measurement-gated follow-up, out of scope here. With a stable
model per run (slice 04) and this cacheable prefix, consecutive iterations within the
cache window pay cache-**read** rates (~10% of input price) on the shared prefix instead
of full cache-creation.

## Acceptance criteria

- [ ] In the assembled `stdin`, the static prefix (ralph instructions + the single selected issue) precedes the commit block
- [ ] The recent-commits block is the **last** section of the prompt
- [ ] The commit list is trimmed to ~5 recent commits (down from 20), sourced via the existing `git log` spawn through the port
- [ ] Across iterations selecting the same issue, the static prefix is byte-identical (only the trailing commits differ)
- [ ] Tested through `runRun` with the fake `Env`, asserting on the recorded spawn `stdin`: prefix-before-commits ordering and the trimmed commit count

## Blocked by

- 02 — the cacheable prefix is built around the single selected issue, so one-issue selection must land first
