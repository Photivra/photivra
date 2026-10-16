// SPDX-License-Identifier: Apache-2.0

/**
 * Import this module before `../dist/index.js` in repository benchmark scripts. ES modules evaluate their
 * imports in order, so it runs first and refuses to measure a missing or stale build: any `src/` file newer
 * than `dist/index.js` means the build no longer reflects the source (`dist/` is not checked in).
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import console from "node:console";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const built = join(root, "dist", "index.js");

function newestSourceMilliseconds(directory) {
  let newest = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestSourceMilliseconds(path) : statSync(path).mtimeMs);
  }
  return newest;
}

let builtMilliseconds;
try {
  builtMilliseconds = statSync(built).mtimeMs;
} catch {
  console.error("dist/index.js is missing. Run `npm run build` before this benchmark.");
  process.exit(1);
}
if (newestSourceMilliseconds(join(root, "src")) > builtMilliseconds) {
  console.error("dist/ is older than src/ and would benchmark stale code. Run `npm run build` before this benchmark.");
  process.exit(1);
}
