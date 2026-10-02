// SPDX-License-Identifier: Apache-2.0

/** Reuse the owned final-conformance fixture; publish data, never repository-only helper code. */
import process from "node:process";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const scratch = mkdtempSync(join(tmpdir(), "photivra-release-example-"));
try {
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--ignoreConfig", "--target", "ES2023", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--types", "node", "--strict", "--skipLibCheck", "--rootDir", ".", "--outDir", scratch, "test/helpers/tier-production-fixture.ts"], { stdio: "inherit" });
  writeFileSync(join(scratch,"package.json"), '{"type":"module"}');
  mkdirSync(join(scratch,"test/fixtures"), { recursive: true });
  copyFileSync("test/fixtures/basic-reference-scene.json", join(scratch,"test/fixtures/basic-reference-scene.json"));
  const { tierProductionRequest } = await import(pathToFileURL(join(scratch,"test/helpers/tier-production-fixture.js")));
  const request = tierProductionRequest("consumer");
  const { evaluateRadiance: evaluator, ...capture } = request.environmentCapture.capture;
  void evaluator;
  mkdirSync("docs/examples", { recursive: true });
  writeFileSync("docs/examples/production-request.json", JSON.stringify({ ...request, environmentCapture: { ...request.environmentCapture, capture } }, null, 2) + "\n");
} finally { rmSync(scratch, { recursive: true, force: true }); }
