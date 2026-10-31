// SPDX-License-Identifier: Apache-2.0
// Early warning for the Node support policy: evaluates the newest published build of each
// supported major against node-lts-policy.mjs for today and the next days, so a date boundary
// (an LTS start, the end of the LTS marker grace period, an end of life) is seen before it
// fails the required CI checks. Run daily by .github/workflows/node-lts-lookahead.yml.
import assert from "node:assert/strict";
import { error, log } from "node:console";
import { appendFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { assertSupportedRuntime, supportedNodeMajors } from "./node-lts-policy.mjs";

export const nodeReleaseIndexUrl = "https://nodejs.org/dist/index.json";
export const lookAheadDays = 14;
const dayMs = 86_400_000;

function parseRelease(release) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(release?.version ?? "");
  if (!match) return undefined;
  return { version: match[0].slice(1), parts: match.slice(1).map(Number), lts: release.lts || undefined };
}

// The newest stable release of a major, by version number rather than by list order.
export function newestRelease(releases, major) {
  let newest;
  for (const release of releases.map(parseRelease)) {
    if (!release || release.parts[0] !== major) continue;
    if (!newest || release.parts[1] > newest.parts[1] || (release.parts[1] === newest.parts[1] && release.parts[2] > newest.parts[2]))
      newest = release;
  }
  return newest;
}

// The newest stable release of any major: what the CI `node` leg tests. setup-node's own `node`
// alias takes the first entry of the index, which can be a prerelease (v27.0.0-alpha.0.0.0 was
// listed first on 2026-10-29, #510), and the policy guard rightly refuses a prerelease.
export function newestStableRelease(releases) {
  let newest;
  for (const release of releases.map(parseRelease)) {
    if (!release) continue;
    const i = newest ? release.parts.findIndex((part, k) => part !== newest.parts[k]) : -1;
    if (!newest || (i !== -1 && release.parts[i] > newest.parts[i])) newest = release;
  }
  return newest;
}

// Evaluates the policy at 00:00 UTC of `from`'s date and of each of the next `days` dates (the
// policy's windows change only at 00:00 UTC). Returns the first failing date of each major.
export function lookAheadFailures(releases, from = new Date(), days = lookAheadDays) {
  assert.ok(Array.isArray(releases), "The Node release index must be an array.");
  assert.ok(from instanceof Date && Number.isFinite(from.getTime()), "Invalid look-ahead start date.");
  const firstDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const failures = [];
  for (const major of supportedNodeMajors) {
    const newest = newestRelease(releases, major);
    for (let day = 0; day <= days; day++) {
      const at = new Date(firstDay + day * dayMs);
      const date = at.toISOString().slice(0, 10);
      if (!newest) {
        failures.push({ major, date, version: undefined, reason: `No stable Node ${major} release is published.` });
        break;
      }
      try {
        assertSupportedRuntime(newest.version, newest.lts, at);
      } catch (failure) {
        failures.push({ major, date, version: newest.version, reason: failure.message });
        break;
      }
    }
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const response = await globalThis.fetch(nodeReleaseIndexUrl);
  assert.ok(response.ok, `Fetching ${nodeReleaseIndexUrl} failed: HTTP ${response.status}.`);
  const releases = await response.json();
  if (process.argv[2] === "--newest-stable") {
    // `node .github/node-lts-lookahead.mjs --newest-stable` prints version=<x.y.z> for CI.
    const newest = newestStableRelease(releases);
    assert.ok(newest, "The Node release index lists no stable release.");
    log(`version=${newest.version}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${newest.version}\n`);
    process.exit(0);
  }
  const from = new Date();
  const failures = lookAheadFailures(releases, from);
  for (const { major, date, version, reason } of failures)
    error(`::error title=Node ${major} support policy::From ${date}, Node ${major} (newest published build ${version ?? "none"}) fails the support policy: ${reason}`);
  if (failures.length > 0) {
    process.exitCode = 1;
  } else {
    const newest = supportedNodeMajors.map((major) => `${major}: ${newestRelease(releases, major).version}`).join(", ");
    log(`Node support policy look-ahead passed from ${from.toISOString().slice(0, 10)} for ${lookAheadDays} days (newest builds ${newest}).`);
  }
}
