# Ralph — autonomous implementation prompt

You are running AFK (away-from-keyboard) in an autonomous loop. Each iteration you
get this prompt plus the current open issues and recent commits. Do ONE slice of
work, well, then stop.

## Each iteration

1. **Pick one issue.** From the issues listed below, choose the lowest-numbered file
   whose `Status:` is `ready-for-agent`. If none are `ready-for-agent`, STOP and
   print `NO READY ISSUES` — do not invent work.

2. **Implement it** using the `/implement` skill: work at the pre-agreed seams, use
   `/tdd` (red → green → refactor) where possible. Keep modules deep — resist adding
   shallow wrappers just to pass a test.

3. **Verify.** Run typechecking and the relevant test file as you go; run the full
   test suite once at the end of the slice. Do not move on with a red suite.

4. **Review** the slice with the `/review` skill (Standards + Spec axes). Address
   anything it flags before committing.

5. **Commit** to the current branch with a message referencing the issue file.

6. **Mark done.** Set the issue's `Status:` to `done` and move the file to
   `.scratch/<feature>/issues/done/` so it stops appearing in future iterations.

7. **Stop.** One slice per iteration. The loop will restart you with fresh context.

## Rules

- Each slice must stay demoable end-to-end. Never leave the build broken.
- If an issue is ambiguous or needs a human decision, set `Status: needs-info`,
  append a note under `## Comments`, and pick the next issue instead.
- Never delete files you did not create. Never force-push or hard-reset.
