// SPDX-License-Identifier: Apache-2.0
/**
 * Real-GPU conformance of the display view's Speed kernel (#478) and Quality kernels (#479) against the float64 CPU reference
 * (`npm run test:webgpu`): the small chart-preset fixtures of test/display-view-speed-gpu.test.ts and
 * test/display-view-quality-gpu.test.ts, every component inside the result's a-priori bounds, the agreement reported in ΔE2000
 * and noise-σ units, banding and regions, and the renderers' self-check cases. Skips with a message when no browser or adapter is
 * available, unless PHOTIVRA_WEBGPU_REQUIRED=1. Timings from a software adapter (SwiftShader) are not GPU performance and none are
 * asserted; the Quality cases report the per-stage wall-clock times for the record.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import type { ImageKernelExecution, SimulateCaptureOptions } from "../../src/index.js";
import { simulateDisplayViewWithInternals } from "../../src/facade/simulate-display-view.js";
import { SMALL_FRAME, SMALL_VIEW, compareDisplayViews, type ComparableGpuResult } from "../helpers/display-view-gpu-fixture.js";
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
  if (report.length) process.stdout.write(`[test:webgpu display-view] ${JSON.stringify(report, null, 1)}\n`);
});

interface PageResult { cpu: { samples: Uint8Array; expected: Float64Array; noiseStd: Float64Array }; gpu: ComparableGpuResult; flaggedPixelIndices: Uint32Array;
  hostRecomputedPixelIndices: Uint32Array; execution: ImageKernelExecution; gpuMilliseconds: number }

const sensor = { pixelPitchMicrometers: 6, pixelAperture: { kind: "box" as const, samplesPerAxis: 2 } };
const output = { ...SMALL_FRAME, format: "srgb-8" as const };
const cases: [string, SimulateCaptureOptions][] = [
  ["slanted edge", { scene: { preset: "slanted-edge", angleDegrees: 5 }, lens: { prime: 50, fNumber: 8 }, sensor, output }],
  ["Siemens star (bar)", { scene: { preset: "siemens-star", cycles: 36 }, lens: { prime: 50, fNumber: 8 }, sensor, output }],
  ["step wedge", { scene: { preset: "step-wedge", steps: 11 }, lens: { prime: 50, fNumber: 8 }, sensor, output }],
  ["checkerboard", { scene: { preset: "checkerboard", squaresAcross: 12 }, lens: { prime: 50, fNumber: 8 }, sensor, output }],
  ["spectral patches", { scene: { preset: "patches", columns: 4, patches: Array.from({ length: 8 }, (_, i) => ({ patchId: `p${i}`, reflectance: i % 2 === 0 ?
    { kind: "tabulated" as const, samples: [380, 480, 580, 680, 780].map((w, j) => ({ wavelengthNanometers: w, value: 0.1 + 0.08 * i + 0.1 * j })) } : 0.05 + 0.1 * i })) },
    lens: { prime: 50, fNumber: 8 }, sensor, output }],
  ["step wedge at the white clip", { scene: { preset: "step-wedge", steps: 11 }, lens: { prime: 50, fNumber: 8 }, exposure: { mode: "manual", iso: 100, shutterSeconds: 1 / 15 }, sensor, output }],
  ["step wedge at ISO 6400", { scene: { preset: "step-wedge", steps: 11 }, lens: { prime: 50, fNumber: 8 }, exposure: { mode: "manual", iso: 6400, shutterSeconds: 1 / 8000 }, sensor, output }],
  ["step wedge, Reinhard", { scene: { preset: "step-wedge", steps: 11 }, lens: { prime: 50, fNumber: 8 }, exposure: { mode: "manual", iso: 100, shutterSeconds: 1 / 30 }, sensor,
    output: { ...output, toneCurve: "positive-reinhard-per-channel" } }]
];

describe("webgpu-f32 display view (Speed) vs the float64 reference", () => {
  it.each(cases)("%s: every component inside the a-priori bounds; samples within one code", async (name, options) => {
    if (guard()) return;
    const result = await call<PageResult>("displayViewSpeed", { options, view: SMALL_VIEW });
    // The GPU is compared with the CPU reference of the same realm (the browser's). The Node reference's bytes are reported too:
    // they agree except where the browser's Math (atan2 in the Siemens star's geometry) differs in the last bit (docs/DISPLAY_VIEW.md,
    // "Same bytes in every engine").
    const node = await simulateDisplayViewWithInternals(options, SMALL_VIEW);
    let browserVersusNode = 0;
    for (let i = 0; i < node.internals.samples.length; i++) if (result.cpu.samples[i] !== node.internals.samples[i]) browserVersusNode++;
    const a = compareDisplayViews(result.cpu, result.gpu);
    expect(result.execution).toMatchObject({ backend: "webgpu-f32", arithmetic: "float32" });
    expect(a.outsideExpectedBound).toBe(0);
    expect(a.outsideVarianceBound).toBe(0);
    expect(a.largestCodeDifference).toBeLessThanOrEqual(1);
    expect(a.differingSamples).toBeLessThanOrEqual(0.01 * a.pixels * 3);
    expect(Array.from(result.hostRecomputedPixelIndices)).toEqual(Array.from(result.flaggedPixelIndices));
    report.push({ case: name, pixels: a.pixels, deltaE2000Maximum: a.deltaEMaximum, deltaE2000Rms: a.deltaERms, sigmaUnitsMaximum: a.sigmaUnitsMaximum, sigmaUnitsRms: a.sigmaUnitsRms,
      sigmaRelativeMaximum: a.sigmaRelativeMaximum, differingSamples: a.differingSamples, flagged: result.flaggedPixelIndices.length, browserCpuVersusNodeCpuSamples: browserVersusNode,
      largestExpectedBoundRatio: a.largestExpectedRatio, largestVarianceBoundRatio: a.largestVarianceRatio, softwareAdapterMilliseconds: result.gpuMilliseconds });
  });
  it("banding never changes a byte, and a region equals the same pixels of the whole view", async () => {
    if (guard()) return;
    const options = cases[1]![1];
    const whole = await call<PageResult>("displayViewSpeed", { options, view: SMALL_VIEW });
    const banded = await call<PageResult>("displayViewSpeed", { options, view: SMALL_VIEW, maximumBandBytes: 4096 });
    expect(Array.from(banded.gpu.samples)).toEqual(Array.from(whole.gpu.samples));
    expect(Array.from(banded.gpu.expected)).toEqual(Array.from(whole.gpu.expected));
    const region = { x: 90, y: 60, width: 24, height: 16 };
    const part = await call<PageResult>("displayViewSpeed", { options, view: { ...SMALL_VIEW, region } });
    for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) for (let c = 0; c < 3; c++) {
      const o = ((region.y + y) * SMALL_VIEW.width + region.x + x) * 3 + c, p = (y * region.width + x) * 3 + c;
      expect(part.gpu.samples[p]).toBe(whole.gpu.samples[o]);
      expect(part.gpu.expected[p]).toBe(whole.gpu.expected[o]);
    }
  });
  it("the renderer's self-check case passes on the device", async () => {
    if (guard()) return;
    const { outcome } = await call<{ outcome: true | string }>("displayViewConformance", {});
    expect(outcome).toBe(true);
  });
});

interface QualityPageResult extends PageResult { cpu: PageResult["cpu"] & { ahdCorrectedPixelCount: number }; stageMilliseconds: Record<string, number>; tapsPerSite: number; statesComputed: number; ahdCorrectedPixelCount: number;
  cpuStages: { fullMs: number; restMs: number; signalMs: number; statesMs: number; restBitIdentical: boolean } | null }
const qualitySensor = { ...sensor, antiAliasing: { kind: "four-spot" as const } };
const qualityOutput = { ...output, demosaic: "ahd" as const };
const qualityLens = { prime: 50 as const, fNumber: 8, diffraction: "circular-aperture" as const };
/** The Quality fixtures of test/display-view-quality-gpu.test.ts: diffraction, the four-spot filter and AHD on the small charts. */
const qualityCases: [string, SimulateCaptureOptions][] = [
  ["slanted edge", { scene: { preset: "slanted-edge", angleDegrees: 5 }, lens: qualityLens, sensor: qualitySensor, output: qualityOutput }],
  ["Siemens star (bar)", { scene: { preset: "siemens-star", cycles: 36 }, lens: qualityLens, sensor: qualitySensor, output: qualityOutput }],
  ["step wedge", { scene: { preset: "step-wedge", steps: 11 }, lens: qualityLens, sensor: qualitySensor, output: qualityOutput }],
  ["checkerboard", { scene: { preset: "checkerboard", squaresAcross: 12 }, lens: qualityLens, sensor: qualitySensor, output: qualityOutput }],
  ["spectral patches", { scene: { preset: "patches", columns: 4, patches: Array.from({ length: 8 }, (_, i) => ({ patchId: `p${i}`, reflectance: i % 2 === 0 ?
    { kind: "tabulated" as const, samples: [380, 480, 580, 680, 780].map((w, j) => ({ wavelengthNanometers: w, value: 0.1 + 0.08 * i + 0.1 * j })) } : 0.05 + 0.1 * i })) },
    lens: qualityLens, sensor: qualitySensor, output: qualityOutput }],
  ["step wedge at the white clip", { scene: { preset: "step-wedge", steps: 11 }, lens: qualityLens, exposure: { mode: "manual", iso: 100, shutterSeconds: 1 / 15 }, sensor: qualitySensor, output: qualityOutput }],
  ["step wedge at ISO 6400 (the low-signal correction)", { scene: { preset: "step-wedge", steps: 11 }, lens: qualityLens, exposure: { mode: "manual", iso: 6400, shutterSeconds: 1 / 8000 }, sensor: qualitySensor, output: qualityOutput }],
  ["step wedge, Reinhard", { scene: { preset: "step-wedge", steps: 11 }, lens: qualityLens, exposure: { mode: "manual", iso: 100, shutterSeconds: 1 / 30 }, sensor: qualitySensor,
    output: { ...qualityOutput, toneCurve: "positive-reinhard-per-channel" } }],
  ["AHD without diffraction", { scene: { preset: "checkerboard", squaresAcross: 12 }, lens: { prime: 50, fNumber: 8 }, sensor: qualitySensor, output: qualityOutput }]
];

describe("webgpu-f32 display view (Quality) vs the float64 reference", () => {
  it.each(qualityCases)("%s: every component inside the a-priori bounds; samples within one code", async (name, options) => {
    if (guard()) return;
    // The CPU reference's stages are timed in the page too (the same realm and host), for the AHD placement (docs/WEBGPU.md).
    const result = await call<QualityPageResult>("displayViewQuality", { options, view: SMALL_VIEW, timeCpu: true });
    const node = await simulateDisplayViewWithInternals(options, SMALL_VIEW);
    let browserVersusNode = 0;
    for (let i = 0; i < node.internals.samples.length; i++) if (result.cpu.samples[i] !== node.internals.samples[i]) browserVersusNode++;
    const a = compareDisplayViews(result.cpu, result.gpu);
    expect(result.execution).toMatchObject({ backend: "webgpu-f32", arithmetic: "float32" });
    expect(a.outsideExpectedBound).toBe(0);
    expect(a.outsideVarianceBound).toBe(0);
    expect(a.largestCodeDifference).toBeLessThanOrEqual(1);
    expect(a.differingSamples).toBeLessThanOrEqual(0.01 * a.pixels * 3);
    expect(Array.from(result.hostRecomputedPixelIndices)).toEqual(Array.from(result.flaggedPixelIndices));
    expect(result.ahdCorrectedPixelCount).toBe(result.cpu.ahdCorrectedPixelCount);
    report.push({ case: "quality: " + name, pixels: a.pixels, deltaE2000Maximum: a.deltaEMaximum, deltaE2000Rms: a.deltaERms, sigmaUnitsMaximum: a.sigmaUnitsMaximum, sigmaUnitsRms: a.sigmaUnitsRms,
      sigmaRelativeMaximum: a.sigmaRelativeMaximum, differingSamples: a.differingSamples, flagged: result.flaggedPixelIndices.length, browserCpuVersusNodeCpuSamples: browserVersusNode,
      largestExpectedBoundRatio: a.largestExpectedRatio, largestVarianceBoundRatio: a.largestVarianceRatio, tapsPerSite: result.tapsPerSite, correctedPixels: result.ahdCorrectedPixelCount,
      statesComputed: result.statesComputed, softwareAdapterMilliseconds: result.gpuMilliseconds, softwareAdapterStageMilliseconds: result.stageMilliseconds, browserCpuStageMilliseconds: result.cpuStages });
  });
  it("banding never changes a byte, and a region equals the same pixels of the whole view", async () => {
    if (guard()) return;
    const options = qualityCases[3]![1];
    const whole = await call<QualityPageResult>("displayViewQuality", { options, view: SMALL_VIEW });
    const banded = await call<QualityPageResult>("displayViewQuality", { options, view: SMALL_VIEW, maximumBandBytes: 1 << 20 });
    expect(Array.from(banded.gpu.samples)).toEqual(Array.from(whole.gpu.samples));
    expect(Array.from(banded.gpu.expected)).toEqual(Array.from(whole.gpu.expected));
    const region = { x: 90, y: 60, width: 24, height: 16 };
    const part = await call<QualityPageResult>("displayViewQuality", { options, view: { ...SMALL_VIEW, region } });
    for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) for (let c = 0; c < 3; c++) {
      const o = ((region.y + y) * SMALL_VIEW.width + region.x + x) * 3 + c, p = (y * region.width + x) * 3 + c;
      expect(part.gpu.samples[p]).toBe(whole.gpu.samples[o]);
      expect(part.gpu.expected[p]).toBe(whole.gpu.expected[o]);
    }
  });
  it("the Quality self-check case passes on the device", async () => {
    if (guard()) return;
    const { outcome } = await call<{ outcome: true | string }>("displayViewQualityConformance", {});
    expect(outcome).toBe(true);
  });
});
