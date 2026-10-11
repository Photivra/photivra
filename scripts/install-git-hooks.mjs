// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-only: point this checkout's Git hooks at .githooks during `npm install`/`npm ci`.
 * Skipped in CI, outside a Git work tree (for example a packed or dependency install),
 * and when the contributor already configured a different core.hooksPath.
 */
import process from "node:process";
import console from "node:console";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const git = (...args) => spawnSync("git", args, { encoding: "utf8" });

if (process.env.CI) {
  console.log("Git hooks: skipped in CI.");
} else if (!existsSync(".githooks/pre-push")) {
  console.log("Git hooks: skipped; .githooks is not present.");
} else {
  const top = git("rev-parse", "--show-toplevel");
  if (top.status !== 0 || resolve(top.stdout.trim()) !== resolve(process.cwd())) {
    console.log("Git hooks: skipped; not the root of a Git work tree.");
  } else {
    const configured = git("config", "--get", "core.hooksPath").stdout.trim();
    if (configured && configured !== ".githooks") {
      console.log(`Git hooks: left core.hooksPath=${configured} unchanged; run npm run prepush manually.`);
    } else if (!configured) {
      const set = git("config", "core.hooksPath", ".githooks");
      console.log(set.status === 0 ? "Git hooks: installed .githooks (pre-push runs npm run prepush)." : "Git hooks: could not set core.hooksPath; run npm run prepush manually.");
    } else {
      console.log("Git hooks: .githooks already installed.");
    }
  }
}
