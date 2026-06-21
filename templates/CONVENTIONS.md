# CONVENTIONS.md

Coding standards for this repo, read automatically by `/tdd` (while implementing) and
`/review` (while reviewing). Edit this file to make a standard apply to every future
slice without restating it. This is a starting set — adjust it to your project.

## Modules

- **Design deep modules.** A lot of behaviour behind a small interface, placed at a clean
  seam, tested through that interface. Prefer deepening an existing module over adding a
  shallow wrapper.
- **Few seams.** The fewer seams across the codebase, the better — the ideal is one. Reach
  the outside world (filesystem, processes, network, clock) through that seam, not
  directly, so the whole thing is drivable from tests with fakes.

## Tests

- **Test observable behaviour through the public interface**, never implementation
  details. A test should survive an internal refactor that doesn't change behaviour.
- **Vertical slices, not horizontal.** One test → one piece of implementation → repeat.
  Don't write all tests first, then all code.
- **Integration-style over mocking internal collaborators.** Inject fakes at the seam;
  don't reach in and stub private helpers. A fake must stay faithful to the real thing it
  stands in for (e.g. match real error modes), or tests pass against a lie.

## Errors

- **Fail loud on the unexpected; degrade gracefully on the foreseen.** Narrow a `catch` to
  the conditions you actually expect (e.g. "file absent") and re-throw the rest — never
  swallow an error in a way that silently produces a partial or wrong result.

## Style

- Match the surrounding code's naming, structure, and comment density.
- Comments explain *why*, not *what*; keep them where the reasoning is non-obvious.
- Keep the public surface small and the names honest.
