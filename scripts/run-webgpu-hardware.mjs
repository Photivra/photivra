// SPDX-License-Identifier: Apache-2.0

/**
 * Runs the WebGPU conformance suite or the 6–24 MP timing run on a hardware adapter, on Linux, macOS or
 * Windows (`npm run test:webgpu:hardware`, `npm run bench:webgpu:hardware`). Repository tooling only; not
 * published.
 *
 * It sets, unless already set: PHOTIVRA_WEBGPU_ADAPTER=hardware (hardware Chromium flags; ignored when
 * PHOTIVRA_WEBGPU_FLAGS is given), PHOTIVRA_WEBGPU_REQUIRED=1 (fail instead of skip) and
 * PHOTIVRA_WEBGPU_REQUIRE_HARDWARE=1 (a software adapter such as SwiftShader is a failure). Extra
 * arguments go to Vitest, for example a test file to run only that file. See docs/WEBGPU.md,
 * "Running on hardware".
 */
import { spawn } from "node:child_process";
import console from "node:console";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";

const mode = process.argv[2];
const configs = { test: "vitest.webgpu.config.ts", bench: "vitest.webgpu-timing.config.ts" };
if (!(mode in configs)) {
  console.error("Usage: node scripts/run-webgpu-hardware.mjs test|bench [vitest arguments]");
  process.exit(2);
}
const env = { ...process.env };
for (const [key, value] of [["PHOTIVRA_WEBGPU_ADAPTER", "hardware"], ["PHOTIVRA_WEBGPU_REQUIRED", "1"], ["PHOTIVRA_WEBGPU_REQUIRE_HARDWARE", "1"]]) {
  if (env[key] === undefined) env[key] = value;
}
console.info(`[webgpu:hardware] ${mode}: adapter=${env.PHOTIVRA_WEBGPU_FLAGS ? `flags "${env.PHOTIVRA_WEBGPU_FLAGS}"` : env.PHOTIVRA_WEBGPU_ADAPTER}, ` +
  `browser=${env.PHOTIVRA_WEBGPU_BROWSER ?? "auto-detected"}, headless=${env.PHOTIVRA_WEBGPU_HEADLESS === "0" ? "no" : "yes"}, ` +
  `require hardware=${env.PHOTIVRA_WEBGPU_REQUIRE_HARDWARE}. The report prints the adapter; record it with the results.`);
const vitestPackage = createRequire(import.meta.url).resolve("vitest/package.json");
const vitest = join(dirname(vitestPackage), "vitest.mjs");
const child = spawn(process.execPath, [vitest, "run", "--config", configs[mode], ...process.argv.slice(3)], { stdio: "inherit", env });
child.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 1));
