import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Run `body` against a fresh real temporary directory, then remove it. This is
 * the real-fs fixture the PRD calls for: `init` is tested end-to-end against
 * an actual directory so we assert the files that genuinely land on disk.
 */
export async function withTempDir(
  body: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "loopdog-"));
  try {
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
