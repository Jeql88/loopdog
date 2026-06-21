# 01 — Project scaffold + the one test seam

> Status: done

## Parent

`.scratch/loopdog/PRD.md`

## What to build

The greenfield repo skeleton for the `loopdog` CLI, plus the single injected test
seam that every later slice is built through. This is the prefactor: "make the change
easy, then make the easy change."

Establish the product-repo layout from the PRD: `src/` (CLI source), `templates/`
(the single source of truth for the `init` payload), and `test/`. Set up `package.json`
as a Node + TypeScript CLI with a `bin` entry named `loopdog`, a build to `dist/`, and a
test runner.

The heart of this slice is the **one seam**: an injected **environment port** exposing
filesystem operations, a `spawn(cmd, args)` function, and the current working directory.
All command logic takes this port as a parameter. Production wires it to the real
`fs` / `child_process` / `process.cwd()`; tests inject fakes. This slice also establishes
the two reusable test fixtures the PRD calls for: a **real temp directory** helper (for
`init`) and a **fake `claude` spawner** (for `run`/`loop`).

The CLI entrypoint should parse args and dispatch to command handlers (handlers can be
no-ops/stubs for now), so the binary runs and prints usage.

## Acceptance criteria

- [ ] Repo has `src/`, `templates/`, and `test/` directories with the layout described in the PRD
- [ ] `package.json` defines a `loopdog` bin, a TypeScript build to `dist/`, and a working `npm test`
- [ ] An environment port type/interface exists exposing filesystem ops, `spawn(cmd, args)`, and cwd
- [ ] Production code wires the port to real `fs` / `child_process` / `process.cwd()`
- [ ] Tests can construct the port with fakes; a real-temp-dir helper and a fake-spawner helper exist and are exercised by at least one passing test
- [ ] Running the built binary with no/unknown args prints usage and exits cleanly
- [ ] All command logic is reached through the port — no command handler imports `fs`/`child_process` directly

## Blocked by

- None — can start immediately
