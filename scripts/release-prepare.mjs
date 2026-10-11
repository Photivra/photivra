// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-only release preparation: align every engine version surface to one version.
 *
 * Usage: npm run release:prepare -- <major.minor.patch>
 *
 * Updates package.json and the package-lock.json root fields (through `npm version`),
 * ENGINE_API_VERSION in src/core/version.ts, CITATION.cff, the current-release mentions
 * in README.md and docs/DEVELOPERS.md, and regenerates docs/api. It never touches
 * POC_SIMULATION_API_VERSION or any schema/model version, and never tags or publishes.
 * Release records, changelog entries and publication dates stay manual review items.
 */
import process from "node:process";
import console from "node:console";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const usage = "Usage: npm run release:prepare -- <major.minor.patch>";
const args = process.argv.slice(2);
if (args.length !== 1) throw new Error(usage);
const next = args[0];
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(next)) {
  throw new Error(`Expected a stable major.minor.patch version, received "${next}". ${usage}`);
}
const current = JSON.parse(readFileSync("package.json", "utf8")).version;
if (next === current) throw new Error(`package.json is already at ${current}.`);

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const previous = escape(current);

/** Each rule must match at least once, so wording drift fails loudly instead of being skipped. */
const rules = [
  ["src/core/version.ts", new RegExp(`(ENGINE_API_VERSION = ")${previous}(")`, "gu")],
  ["CITATION.cff", new RegExp(`^(version: ")${previous}(")$`, "gmu")],
  ["README.md", new RegExp(`(@photivra/engine@)${previous}()`, "gu")],
  ["README.md", new RegExp(`(\`v)${previous}(\` tag)`, "gu")],
  ["README.md", new RegExp(`(Repository package version: \`)${previous}(\`)`, "gu")],
  ["README.md", new RegExp(`(Engine API contract: \`)${previous}(\`)`, "gu")],
  ["README.md", new RegExp(`(New captures/plans record )${previous}(;)`, "gu")],
  ["docs/DEVELOPERS.md", new RegExp(`(\\*\\*@photivra/engine )${previous}(\\*\\*)`, "gu")],
  ["docs/DEVELOPERS.md", new RegExp(`(root API contract \\*\\*)${previous}(\\*\\*)`, "gu")],
  ["docs/DEVELOPERS.md", new RegExp(`(@photivra/engine@)${previous}()`, "gu")],
  ["docs/DEVELOPERS.md", new RegExp(`(// )${previous}(: matches the package version)`, "gu")]
];

const files = new Map();
for (const [path, pattern] of rules) {
  const text = files.get(path) ?? readFileSync(path, "utf8");
  if (!pattern.test(text)) throw new Error(`No ${current} version mention matched ${pattern} in ${path}; update scripts/release-prepare.mjs.`);
  pattern.lastIndex = 0;
  files.set(path, text.replace(pattern, `$1${next}$2`));
}

const npmVersion = ["version", next, "--no-git-tag-version", "--ignore-scripts"];
// Under `npm run`, npm_execpath is npm's own CLI script; reuse it instead of resolving a shell shim.
if (process.env.npm_execpath) execFileSync(process.execPath, [process.env.npm_execpath, ...npmVersion], { stdio: "inherit" });
else execFileSync("npm", npmVersion, { stdio: "inherit" });
for (const [path, text] of files) writeFileSync(path, text);
execFileSync(process.execPath, ["scripts/generate-api-reference.mjs"], { stdio: "inherit" });

const review = [];
for (const path of ["README.md", "docs/DEVELOPERS.md"]) {
  readFileSync(path, "utf8").split("\n").forEach((line, index) => {
    if ((line.includes(current) || line.includes(next)) && /published|release record/iu.test(line)) review.push(`  ${path}:${index + 1}: ${line.trim().slice(0, 160)}`);
  });
}
console.log(`Prepared ${current} -> ${next}: package.json, package-lock.json, src/core/version.ts, CITATION.cff, README.md, docs/DEVELOPERS.md and docs/api.`);
console.log("Review manually: the CHANGELOG entry, the release record, publication dates and these release-record lines:");
console.log(review.join("\n") || "  (none)");
console.log("Then run npm run check, npm run coverage, npm run build, npm run docs:check and npm run pack:check.");
