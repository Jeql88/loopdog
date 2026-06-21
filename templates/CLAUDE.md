# CLAUDE.md

> Stub created by `loopdog init`. This file is yours — extend it with your project's
> own instructions. `init` never overwrites an existing `CLAUDE.md`, and
> `/configure-workflow` only ever touches the `## Agent skills` section below.

This repo uses the **loopdog** AI-engineering workflow. See `WORKFLOW.md` for the
end-to-end loop and which command runs at each stage.

## The smart zone vs the dumb zone

An AI is **smart in a fresh, short context and dumb as the context window fills**. The
workflow keeps work in the smart zone: each `loopdog loop` iteration runs in a *fresh*
agent, finished issues are archived out of context, and you `/clear` between the
high-judgment human steps. Automate the dumb zone (well-specified implementation); keep
the smart zone manual but guided. See `WORKFLOW.md` for the full rationale.

## Agent skills

<!--
  Populated by /configure-workflow — run it once after `loopdog init`. It writes
  your issue tracker, triage labels, and domain-doc layout here, and the details
  into docs/agents/*.md. Until then, this section is intentionally empty.
-->
