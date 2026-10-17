// SPDX-License-Identifier: Apache-2.0
/**
 * Per-fixture rollout (#277): for every built-in chart preset, the method error of the `webgpu-f32`
 * image-formation path (chart radiance and spectral integration on the GPU, then the isoplanatic
 * convolution with kernels sampled from the lens PSF profile) against the per-site CPU engine, on sampled
 * tiles of a `simulateCapture` frame. These are accuracy numbers, not speed. See test/helpers/rollout-fixture.ts
 * and docs/WEBGPU.md, "Per-fixture rollout (method error)".
 *
 * Asserted per tile: the GPU path is within the composed a-priori arithmetic bound of the float64 method
 * at every site, and the method error is within its pinned value. Skips without a browser or adapter unless
 * PHOTIVRA_WEBGPU_REQUIRED=1.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { composeRelativeErrorBounds, type ImageKernelExecution, type ImageKernelRelativeErrorBound } from "../../src/index.js";
import { CHART_PRESET_SCENES } from "../helpers/chart-radiance-fixtures.js";
import { channelPlanes, cpuMethodTile, methodError, methodTile, perSiteTile, rolloutMethodInputs, rolloutPsfProfile, rolloutSetup,
  ROLLOUT_TILES, ROLLOUT_PINNED_METHOD_ERROR } from "../helpers/rollout-fixture.js";
import { adapterSkipReason, findChromium, isSoftwareAdapter, openBrowserPage, type BrowserPage, type WebGpuAdapterProbe } from "./chromium.js";
import { decodeTransport, encodeTransport } from "./codec.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const required = process.env.PHOTIVRA_WEBGPU_REQUIRED === "1";
let page: BrowserPage | null = null, skip: string | null = null;
const report: Record<string, unknown>[] = [];

async function call<T>(fn: string, payload: unknown): Promise<T> {
  const text = await page!.evaluate<string>(`import('/test/webgpu/page-runner.js').then(m => m.${fn}(${JSON.stringify(encodeTransport(payload))}))`);
  return decodeTransport<T>(text);
}
function guard(): boolean {
  if (skip === null) return false;
  if (required) throw new Error(`WebGPU conformance required but unavailable: ${skip}`);
  console.warn(`[test:webgpu] skipped: ${skip}`);
  return true;
}
beforeAll(async () => {
  const binary = findChromium();
  if (!binary) { skip = "no Chromium binary found (set PHOTIVRA_WEBGPU_BROWSER or PLAYWRIGHT_BROWSERS_PATH)"; return; }
  page = await openBrowserPage(binary, root);
  const probe = await page.evaluate<WebGpuAdapterProbe>("import('/test/webgpu/page-runner.js').then(m => m.probe())");
  skip = adapterSkipReason(probe);
  if (skip === null) report.push({ adapter: probe.adapter, softwareAdapter: isSoftwareAdapter(probe) });
});
afterAll(async () => {
  await page?.close();
  if (report.length) console.info(`[test:webgpu rollout] ${JSON.stringify(report, null, 1)}`);
});

describe("per-fixture rollout: webgpu-f32 image formation vs the per-site engine", () => {
  it.each(CHART_PRESET_SCENES)("%s", async (name, scene) => {
    if (guard()) return;
    const setup = await rolloutSetup(scene);
    for (const config of ROLLOUT_TILES) {
      const profile = rolloutPsfProfile(setup, config.psfPitchMicrometers, config.psfHalfWidth), tile = config.tile;
      const inputs = rolloutMethodInputs(setup, profile, tile);
      const radiance = await call<{ values: Float32Array; execution: ImageKernelExecution }>("chartRadiance", { input: inputs.radiance });
      const planes = channelPlanes(radiance.values, inputs.region.width * inputs.region.height);
      const convolved: Float32Array[] = [];
      let convolutionBound: ImageKernelRelativeErrorBound | null = null;
      for (const samples of planes) {
        const out = await call<{ values: Float32Array; execution: ImageKernelExecution }>("convolve", { input: { ...inputs.convolution, samples } });
        convolved.push(out.values);
        convolutionBound = out.execution.errorBound as ImageKernelRelativeErrorBound;
      }
      const gpu = methodTile(inputs, tile, convolved), cpu = cpuMethodTile(inputs, tile), reference = perSiteTile(setup, profile, tile);
      // Arithmetic: the GPU path against the float64 method, within the composed a-priori bound.
      const bound = composeRelativeErrorBounds(radiance.execution.errorBound as ImageKernelRelativeErrorBound, convolutionBound!, inputs.maximumKernelSum);
      let arithmetic = 0;
      for (let i = 0; i < cpu.length; i++) {
        const d = Math.abs(gpu[i]! - cpu[i]!);
        expect(d).toBeLessThanOrEqual(bound.relative * Math.abs(cpu[i]!) + bound.absolute);
        if (cpu[i]! !== 0) arithmetic = Math.max(arithmetic, d / Math.abs(cpu[i]!));
      }
      // Method error: the GPU path against the per-site engine, within its pinned value.
      const error = methodError(gpu, reference), pinned = ROLLOUT_PINNED_METHOD_ERROR[name]![config.id]!;
      expect(error.maximumOfPeak).toBeLessThanOrEqual(pinned);
      report.push({ preset: name, config: config.id, sites: tile.width * tile.height, methodMaximumOfPeak: error.maximumOfPeak, methodRmsOfPeak: error.rmsOfPeak,
        methodMaximumRelativeAbove10Percent: error.maximumRelativeAbove10Percent, pinned, arithmeticMaximumRelative: arithmetic, arithmeticBoundRelative: bound.relative });
    }
  });
});
