// SPDX-License-Identifier: Apache-2.0
/**
 * Reproducible 6–24 MP timing run for the `webgpu-f32` stages (`npm run bench:webgpu`). Not part of
 * `npm test` or `npm run test:webgpu`. It reports wall-clock milliseconds per stage, including upload
 * and readback, on the second run with warm pipelines, plus the adapter that ran them.
 *
 * - PHOTIVRA_WEBGPU_TIMING_MP: comma-separated megapixel sizes (default "6,12,24"), 3:2 frames.
 * - PHOTIVRA_WEBGPU_TIMING_CPU=1: also time the float64 CPU reference (slow at 24 MP).
 * - PHOTIVRA_WEBGPU_TIMING_OUT: write the JSON report to this path.
 * - PHOTIVRA_WEBGPU_ADAPTER=hardware, PHOTIVRA_WEBGPU_FLAGS, PHOTIVRA_WEBGPU_BROWSER, PHOTIVRA_WEBGPU_HEADLESS=0: choose a
 *   hardware adapter; PHOTIVRA_WEBGPU_REQUIRE_HARDWARE=1 refuses a software adapter (see docs/WEBGPU.md, or
 *   `npm run bench:webgpu:hardware`).
 *
 * A report whose adapter is a fallback (software) adapter, such as SwiftShader, does not measure GPU
 * performance and must not be quoted as such.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readoutProfile } from "../helpers/sensor-stage-fixtures.js";
import { adapterSkipReason, findChromium, isSoftwareAdapter, openBrowserPage, type BrowserPage, type WebGpuAdapterProbe } from "./chromium.js";
import { decodeTransport, encodeTransport } from "./codec.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
let page: BrowserPage | null = null;

beforeAll(async () => {
  const binary = findChromium();
  if (!binary) throw new Error("No Chromium binary found (set PHOTIVRA_WEBGPU_BROWSER).");
  page = await openBrowserPage(binary, root);
});
afterAll(async () => { await page?.close(); });

/** A 3:2 frame of about `megapixels` million sites (6 MP: 3000×2000; 24 MP: 6000×4000). */
export function frameOf(megapixels: number): { width: number; height: number } {
  const width = Math.round(Math.sqrt(megapixels * 1e6 * 1.5) / 2) * 2;
  return { width, height: Math.round(width / 1.5) };
}

it("times the webgpu-f32 stages at 6–24 MP", async () => {
  const probe = await page!.evaluate<WebGpuAdapterProbe>("import('/test/webgpu/page-runner.js').then(m => m.probe())");
  const reason = adapterSkipReason(probe);
  if (reason !== null) throw new Error(`Cannot time the stages: ${reason}.`);
  const sizes = (process.env.PHOTIVRA_WEBGPU_TIMING_MP ?? "6,12,24").split(",").map(Number);
  const timeCpu = process.env.PHOTIVRA_WEBGPU_TIMING_CPU === "1";
  const readout = readoutProfile({ gain: 3.1, bitDepth: 14, black: 512, preAdc: 60_000, sigmas: [2.5] });
  const runs: unknown[] = [];
  for (const megapixels of sizes) {
    const { width, height } = frameOf(megapixels);
    const payload = JSON.stringify(encodeTransport({ width, height, timeCpu, readoutProfile: readout }));
    runs.push(decodeTransport(await page!.evaluate<string>(`import('/test/webgpu/page-runner.js').then(m => m.timeStages(${payload}))`)));
  }
  const software = isSoftwareAdapter(probe);
  const report = { measuredAt: new Date().toISOString(), node: process.version, platform: `${process.platform}/${process.arch}`, adapter: probe.adapter,
    softwareAdapter: software, note: software ? "Software adapter: these timings are not GPU performance." : "Hardware adapter as reported by the browser.",
    runs };
  const text = JSON.stringify(report, null, 1);
  if (process.env.PHOTIVRA_WEBGPU_TIMING_OUT) writeFileSync(process.env.PHOTIVRA_WEBGPU_TIMING_OUT, text + "\n");
  console.info(`[bench:webgpu] ${text}`);
  expect(runs.length).toBe(sizes.length);
});
