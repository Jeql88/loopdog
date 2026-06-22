# 01 — `SpawnOptions.cwd`: the seam widening (prefactor)

> Status: done

## Parent

`.scratch/parallel-agents/PRD.md`

## What to build

The single, deliberate widening of the existing `Env` seam that the whole parallel
feature is built on — done first, alone, so every later slice can assume it.

Add an optional `cwd` to the existing `SpawnOptions` bag (alongside `stdin`). When set,
the spawned child process — `claude` or any `git` command — runs with that directory as
its working directory; when absent, behaviour is exactly as today. This is what lets the
orchestrator run each agent and each git command inside a specific worktree without
introducing any new port method.

This is a prefactor — "make the change easy, then make the easy change." No orchestrator,
no parallel behaviour yet. Just the port contract, the real-env honouring it, and the fake
recording it.

```ts
// the only interface change in this slice
interface SpawnOptions {
  stdin?: string;
  cwd?: string; // run the child in this directory; undefined = inherit (today's behaviour)
}
```

## Acceptance criteria

- [ ] `SpawnOptions` has an optional `cwd`; omitting it leaves every existing call site and test unchanged
- [ ] The real `Env` passes `cwd` through to the underlying child-process spawn (verified by a real-env test that the child actually runs in the given directory)
- [ ] The fake `Env` records `cwd` on each recorded spawn call so orchestrator tests can assert which worktree a command ran in
- [ ] All existing tests still pass with no modification

## Blocked by

- None — can start immediately
