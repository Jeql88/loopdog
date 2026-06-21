---
name: grill-me
description: A relentless interview to sharpen a plan or design.
disable-model-invocation: true
---

Run a `/grilling` session.

---

## Before you finish (guardrails)

Read `loopdog.json` and honour its `guardrails` flags before printing either block.

- If `guardrails.contextHygiene` is true (default): remind the user that grilling fills
  the context window, so the next stage must start fresh — _"This grilling session is
  now long context. `/clear` before the next step so the PRD starts in the smart zone."_
- If `guardrails.nextStepHints` is true (default), end with:
  > **Next:** `/clear`, then run `/to-prd` to synthesise this grilling into a PRD.
