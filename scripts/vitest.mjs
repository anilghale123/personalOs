/**
 * vitest launcher.
 *
 * Why this exists: vitest's module runner compares the test-file import
 * ids (which come from Node's package resolution — realpath'd, so on
 * Windows the drive letter is always uppercase `C:`) against paths derived
 * from the process cwd. A git-bash shell often reports its cwd with a
 * lowercase drive (`c:\...`), the comparison then misses, the test file
 * gets a *second* copy of @vitest/runner, and every describe() dies with
 * "Cannot read properties of undefined (reading 'config')".
 *
 * Re-executing vitest from the on-disk casing of the project root makes
 * every module URL agree. On sane cwds this is a transparent passthrough.
 */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

let cwd = process.cwd();
let vitestEntry = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
try {
  cwd = realpathSync.native(cwd);
  // The entry path becomes vitest's main-module URL, so it must carry the
  // same on-disk casing as the cwd — realpath'ing only one of the two
  // keeps the split that breaks the runner.
  vitestEntry = realpathSync.native(vitestEntry);
} catch {
  // Keep the original paths; the worst case is the bug this fixes.
}
const child = spawn(process.execPath, [vitestEntry, ...process.argv.slice(2)], {
  cwd,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
