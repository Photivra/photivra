// SPDX-License-Identifier: Apache-2.0

import process from "node:process";
import console from "node:console";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, process.argv[2] ?? "docs/validation/tier-acceptance-report-v1.json");
const scratch = mkdtempSync(join(tmpdir(), "photivra-tier-report-"));
try {
  execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", join(root, "tsconfig.json"),
    "--outDir", scratch], { cwd: root, stdio: "inherit" });
  writeFileSync(join(scratch, "package.json"), '{"type":"module"}');
  mkdirSync(join(scratch, "test/fixtures"), { recursive: true });
  copyFileSync(join(root, "test/fixtures/basic-reference-scene.json"), join(scratch, "test/fixtures/basic-reference-scene.json"));
  const { createTierAcceptanceReport } = await import(pathToFileURL(join(scratch, "test/helpers/tier-acceptance-report.js")));
  const report = createTierAcceptanceReport();
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, JSON.stringify(report, (_key, value) => typeof value === "number" ? Number(value.toPrecision(12)) : value, 2) + "\n");
  console.log(`Wrote tier acceptance report: ${output}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
