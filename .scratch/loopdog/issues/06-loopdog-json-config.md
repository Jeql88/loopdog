# 06 — `loopdog.json` config + guardrail wiring

> Status: ready-for-agent

## Parent

`.scratch/loopdog/PRD.md`

## What to build

The `loopdog.json` config file written by `init` at the repo root and read by both the
CLI and the workflow skills. All guardrails default **ON** so a newcomer's first
experience is fully guided.

Shape (from the PRD):

```jsonc
{
  "guardrails": {
    "nextStepHints": true,   // skills print "Next: /clear, then run /<skill>"
    "contextHygiene": true   // skills print /clear reminders + teach smart/dumb zone
  },
  "loop": {
    "maxIterations": 50,      // AFK backstop
    "permissionMode": "auto"  // passed to claude
  }
}
```

This slice delivers: the default `loopdog.json` added to the `templates/` payload (so
`init` writes it), plus a **config loader** the CLI uses to read `loop.*`. The loader
must apply the documented defaults when the file or a field is absent.

Consumers land in their own slices: `loop` reads `loop.*` (slice 04); the skills read
`guardrails.*` (slice 08). This slice defines the schema, ships the default, and provides
the loader.

## Acceptance criteria

- [ ] A default `loopdog.json` (guardrails ON, `maxIterations: 50`, `permissionMode: "auto"`) is in `templates/` and gets written by `init`
- [ ] A config loader reads `loopdog.json` and exposes `guardrails.*` and `loop.*`
- [ ] Missing file or missing fields fall back to the documented defaults
- [ ] Loader behaviour is covered by tests (present file, absent file, partial file)

## Blocked by

- `.scratch/loopdog/issues/01-scaffold-and-test-seam.md`
