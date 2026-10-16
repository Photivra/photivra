// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-only: point this checkout's Git hooks at .githooks (`npm run hooks:install`).
 * Skipped in CI, outside a Git work tree (for example a packed or dependency install),
 * and when the contributor already configured a different core.hooksPath.
 * Messages go to stderr: npm 10 forwards lifecycle stdout into `npm pack --json` output.
 */
import process from "node:process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const note = (message) => process.stderr.write(`${message}\n`);
const git = (...args) => spawnSync("git", args, { encoding: "utf8" });

if (process.env.CI) {
  note("Git hooks: skipped in CI.");
} else if (!existsSync(".githooks/pre-push")) {
  note("Git hooks: skipped; .githooks is not present.");
} else {
  const top = git("rev-parse", "--show-toplevel");
  if (top.status !== 0 || resolve(top.stdout.trim()) !== resolve(process.cwd())) {
    note("Git hooks: skipped; not the root of a Git work tree.");
  } else {
    const configured = git("config", "--get", "core.hooksPath").stdout.trim();
    if (configured && configured !== ".githooks") {
      note(`Git hooks: left core.hooksPath=${configured} unchanged; run npm run prepush manually.`);
    } else if (!configured) {
      const set = git("config", "core.hooksPath", ".githooks");
      note(set.status === 0 ? "Git hooks: installed .githooks (pre-push runs npm run prepush)." : "Git hooks: could not set core.hooksPath; run npm run prepush manually.");
    } else {
      note("Git hooks: .githooks already installed.");
    }
  }
}
