# Issue tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in `.scratch/`. No GitHub
issues are created — everything stays local so finished plans can be archived
and kept out of future agent context.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The PRD is `.scratch/<feature-slug>/PRD.md`
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Marking work done (keeps finished plans out of future context)

When an issue is fully implemented and reviewed, set its `Status:` to `done` and
move the file to `.scratch/<feature-slug>/issues/done/`. The Ralph loop ignores
`done/` so completed plans never pollute future outputs.
