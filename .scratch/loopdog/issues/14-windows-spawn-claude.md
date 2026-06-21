# 14 — Windows: `run`/`loop` cannot spawn the `claude` (or `git`) CLI

> Status: ready-for-agent

## Parent

`.scratch/loopdog/PRD.md`

## What to build

On Windows, `realEnv().spawn` fails to launch `claude` and `git`, so `loopdog run`
and `loop` are completely non-functional on the author's own platform — the exact
audience loopdog exists to serve. The acceptance demo (slice 12) surfaced this.

Make `env.spawn` reliably launch PATH commands on Windows **while passing arguments
verbatim** (the ralph prompt is one large multi-line argument).

## Diagnosis (gathered 2026-06-21, during the slice-12 demo)

The Windows `claude`/`git` entrypoints on PATH are `.cmd` shims (plus an
extensionless POSIX shim). The current `spawn(cmd, args, { shell: false })`
([src/env.ts](../../../src/env.ts) `realEnv`) cannot launch them. Every naive fix
fails a different way:

- **`spawn(cmd, …, { shell: false })`** → `ENOENT`: won't resolve `.cmd` by bare name.
- **Resolve to the full `claude.cmd` path, `shell: false`** → `EINVAL`: Node 20+ blocks
  spawning `.bat`/`.cmd` without a shell (CVE-2024-27980 mitigation).
- **`spawn(cmd, args, { shell: true })`** → resolves the shim, BUT triggers Node
  **DEP0190** and **mangles the prompt**: args are concatenated into a cmd.exe command
  line unescaped, so our multi-line prompt is split on spaces/`&`/`|`/quotes. Verified:
  a realistic prompt arg came back as just `"#"`. This is both a correctness bug (agent
  gets garbage context) and an injection risk.

## Likely direction (decide during implementation)

The prompt should probably **not** be passed as a CLI arg at all on Windows. Options to
weigh: pass the prompt via **stdin** (`claude --print` reading stdin) or a **temp file**;
or adopt a vetted cross-platform resolver (cross-spawn-style) that handles `.cmd`
quoting. Whatever is chosen must keep the one-seam design (fix lives in `realEnv().spawn`,
the fake stays simple) and must pass the existing `claude`-on-PATH guard's ENOENT path.

## Acceptance criteria

- [ ] On Windows, `loopdog run` launches `claude` and `git` successfully (no ENOENT/EINVAL)
- [ ] The full multi-line ralph prompt reaches the agent intact (a known marker string in the prompt round-trips byte-for-byte)
- [ ] No shell-injection path: args are never concatenated into an unescaped shell command line
- [ ] The `claude`-not-on-PATH guard still fires correctly (still surfaces as a clean "not found" message)
- [ ] Works on POSIX too (no regression); covered by a test that does not require a live claude
- [ ] The slice-12 acceptance demo (`loopdog run` on a fresh repo) completes end-to-end on Windows

## Blocked by

- None — diagnosis done; can start immediately
