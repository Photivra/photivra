// SPDX-License-Identifier: Apache-2.0

// Keeps the shared Photivra agent block (docs/agent-core.md) and its copies in
// AGENTS.md files identical. Reads and writes local files only.
//
//   node scripts/sync-agent-core.mjs [--target <AGENTS.md>]... [--write]
//
// The targets are this repository's AGENTS.md plus every --target path. Without
// --write it reports each copy as current, stale or missing a block and exits 1
// when any copy differs. With --write it first records the canonical body's
// sha256 in docs/agent-core.md, then replaces each target's block with it.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { fileURLToPath } from "node:url";

const BLOCK = /<!-- BEGIN photivra-agent-core v(\d+) sha256:[0-9a-f]{64} -->\n(<!--[^\n]*-->)\n([\s\S]*?\n)<!-- END photivra-agent-core -->/u;

export function sealed(text) {
  const match = text.match(BLOCK);
  if (!match) throw new Error("missing photivra-agent-core block");
  const [, version, notice, body] = match;
  const sha = createHash("sha256").update(body).digest("hex");
  const block = `<!-- BEGIN photivra-agent-core v${version} sha256:${sha} -->\n${notice}\n${body}<!-- END photivra-agent-core -->`;
  return { block, text: text.replace(BLOCK, () => block) };
}

export function copyInto(target, block) {
  if (!BLOCK.test(target)) return null;
  return target.replace(BLOCK, () => block);
}

function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const targets = [resolve(root, "AGENTS.md")];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--target") {
      const path = argv[++i];
      if (path === undefined) throw new Error("--target needs a path");
      targets.push(resolve(path));
    } else if (argv[i] !== "--write") {
      throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  const write = argv.includes("--write");
  const canonicalPath = resolve(root, "docs/agent-core.md");
  const canonical = sealed(readFileSync(canonicalPath, "utf8"));
  if (write) writeFileSync(canonicalPath, canonical.text);
  let differs = false;
  for (const path of targets) {
    if (!existsSync(path)) { console.log(`${path}: not found`); differs = true; continue; }
    const current = readFileSync(path, "utf8");
    const next = copyInto(current, canonical.block);
    if (next === null) { console.log(`${path}: no block`); differs = true; continue; }
    if (next === current) { console.log(`${path}: current`); continue; }
    if (write) { writeFileSync(path, next); console.log(`${path}: updated`); } else { console.log(`${path}: stale`); differs = true; }
  }
  if (differs) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
