// SPDX-License-Identifier: Apache-2.0
/**
 * Real-GPU conformance of the `webgpu-f32` sensor stage and temporal exposure sum against their float64
 * references (`npm run test:webgpu`). Skips with a message when no browser or adapter is available,
 * unless PHOTIVRA_WEBGPU_REQUIRED=1. Timings from a software adapter (SwiftShader) are not GPU
 * performance, and none are asserted here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { chartBatchInput, chartPoints, CHART_PRESET_SCENES } from "../helpers/chart-radiance-fixtures.js";
import { calculateChartRadianceBatch, calculateTemporalExposureSum, simulatePackedSensorRaw, type ImageKernelExecution, type ImageKernelRelativeErrorBound,
  type PackedSensorRawDiagnostics, type PackedSensorRawInput } from "../../src/index.js";
import { calculatePackedSensorRawPlan, createPackedFixedPattern, simulatePackedSensorSite } from "../../src/capture/packed-sensor-raw.js";
import { fixedPatternCorpus, readoutProfile, sensorCorpus, sensorStageInput, temporalCorpus } from "../helpers/sensor-stage-fixtures.js";
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
  if (report.length) console.info(`[test:webgpu stages] ${JSON.stringify(report, null, 1)}`);
});

interface SensorResult { codes: Uint16Array; diagnostics: PackedSensorRawDiagnostics; execution: ImageKernelExecution; flaggedSiteIndices: Uint32Array }

function compareSensor(input: PackedSensorRawInput, gpu: SensorResult): { flagged: number; differing: number } {
  const reference = simulatePackedSensorRaw(input), flagged = new Set(gpu.flaggedSiteIndices);
  expect(gpu.execution.errorBound).toMatchObject({ kind: "exact-except-flagged-sites", flaggedSiteCount: flagged.size });
  let differing = 0;
  for (let i = 0; i < reference.codes.length; i++) {
    if (gpu.codes[i] !== reference.codes[i]) { differing++; expect(flagged.has(i), `site ${i} differs but is not flagged`).toBe(true); }
  }
  const repaired = gpu.codes.slice(), pattern = createPackedFixedPattern(calculatePackedSensorRawPlan(input));
  for (const i of gpu.flaggedSiteIndices) {
    const row = Math.floor(i / input.region.width), column = i % input.region.width;
    repaired[i] = simulatePackedSensorSite(reference.plan, input.photoElectrons[i]!, input.darkElectrons[i]!,
      (input.region.y + row) * input.nativeWidth + input.region.x + column, pattern === null ? null : pattern(column, row),
      (input.additionalChargeComponents ?? []).map(c => c.expectedElectrons[i]!)).code;
  }
  expect(repaired).toEqual(reference.codes);
  for (const key of Object.keys(reference.diagnostics) as (keyof PackedSensorRawDiagnostics)[]) {
    expect(Math.abs(gpu.diagnostics[key] - reference.diagnostics[key])).toBeLessThanOrEqual(flagged.size);
  }
  return { flagged: flagged.size, differing };
}

describe("webgpu-f32 sensor stage vs float64 reference", () => {
  const cases = [
    ["12-bit unit gain", readoutProfile(), 60_000],
    ["14-bit fractional gain, three noise sources", readoutProfile({ gain: 3.7, bitDepth: 14, black: 512, preAdc: 70_000, sigmas: [1.5, 0, 4.25] }), 60_000.5],
    ["16-bit low gain", readoutProfile({ gain: 0.95, bitDepth: 16, black: 1024, preAdc: 61_000, sigmas: [2.5] }), 60_000],
    ["INL and digital gain", readoutProfile({ gain: 18, bitDepth: 12, black: 256, saturation: 4000, preAdc: 66_000, sigmas: [3], digitalGain: 1.75,
      inl: [{ code: 0, offsetCodes: 0 }, { code: 1000, offsetCodes: 1.5 }, { code: 3000, offsetCodes: -2.25 }, { code: 4095, offsetCodes: 0.5 }] }), 60_000],
    ["inexact digital gain", readoutProfile({ gain: 15.3, bitDepth: 12, black: 128, preAdc: 66_000, sigmas: [2], digitalGain: 1.3 }), 60_000],
    ["noise-free power-of-two gain", readoutProfile({ gain: 2, bitDepth: 16, black: 0, preAdc: 70_000, sigmas: [0] }), 60_000]
  ] as const;
  it.each(cases)("%s: unflagged sites equal the reference exactly", async (name, readout, capacity) => {
    if (guard()) return;
    const input = sensorCorpus(256, 128, name.length, readout, capacity);
    const gpu = await call<SensorResult>("simulateSensor", { input });
    const { flagged, differing } = compareSensor(input, gpu);
    report.push({ stage: "sensor", case: name, sites: input.region.width * input.region.height, flaggedSites: flagged, differingSites: differing });
  });
  it.each(cases.slice(0, 5))("%s, with fixed-pattern noise and three additional charge components: unflagged sites equal the reference", async (name, readout, capacity) => {
    if (guard()) return;
    const input = fixedPatternCorpus(256, 128, name.length + 100, readout, capacity);
    const gpu = await call<SensorResult>("simulateSensor", { input });
    const { flagged, differing } = compareSensor(input, gpu);
    report.push({ stage: "sensor+fpn+charge", case: name, sites: input.region.width * input.region.height, flaggedSites: flagged, differingSites: differing });
  });
  it("an offset region and banding give the same codes; banding never changes results", async () => {
    if (guard()) return;
    const input = { ...sensorCorpus(200, 90, 4), nativeWidth: 6000, nativeHeight: 4000, region: { x: 5100, y: 3333, width: 200, height: 90 } };
    const whole = await call<SensorResult>("simulateSensor", { input });
    const banded = await call<SensorResult>("simulateSensor", { input, maximumBandBytes: 4096 });
    expect(banded.codes).toEqual(whole.codes);
    expect(Array.from(banded.flaggedSiteIndices)).toEqual(Array.from(whole.flaggedSiteIndices));
    compareSensor(input, whole);
  });
  it("statistical equivalence: patch means and variances agree with the reference and with the noise model", async () => {
    if (guard()) return;
    // Uniform patches; each patch has 4096 sites. Expected code mean E/g + black, variance (E + σ²)/g² + 1/12 (shot + read + quantization).
    const levels = [3, 20, 200, 2_000, 20_000], gain = 2.3, sigma = 3.5, black = 256, patch = 4096;
    const readout = readoutProfile({ gain, bitDepth: 16, black, preAdc: 1e6, sigmas: [sigma] });
    const input = sensorStageInput({ width: 512, height: levels.length * 8, seed: 99, capacity: 1e6, readout, photo: (i) => levels[Math.floor(i / patch)]! });
    const gpu = await call<SensorResult>("simulateSensor", { input }), reference = simulatePackedSensorRaw(input);
    const rows: Record<string, number>[] = [];
    levels.forEach((level, p) => {
      const moments = (codes: Uint16Array): { mean: number; variance: number } => {
        let s = 0, q = 0;
        for (let i = p * patch; i < (p + 1) * patch; i++) s += codes[i]!;
        const mean = s / patch;
        for (let i = p * patch; i < (p + 1) * patch; i++) q += (codes[i]! - mean) ** 2;
        return { mean, variance: q / (patch - 1) };
      };
      const g = moments(gpu.codes), c = moments(reference.codes);
      const expectedMean = level / gain + black, expectedVariance = (level + sigma ** 2) / gain ** 2 + 1 / 12;
      // GPU vs reference: same seeds, so the moments differ only through flagged sites.
      expect(Math.abs(g.mean - c.mean)).toBeLessThanOrEqual(4 * Math.sqrt(2 * c.variance / patch));
      expect(Math.abs(g.variance / c.variance - 1)).toBeLessThanOrEqual(4 * Math.sqrt(2 / (patch - 1)));
      // Both vs the model: 5-sigma sampling tolerances.
      expect(Math.abs(g.mean - expectedMean)).toBeLessThanOrEqual(5 * Math.sqrt(expectedVariance / patch));
      expect(Math.abs(g.variance / expectedVariance - 1)).toBeLessThanOrEqual(5 * Math.sqrt(2 / (patch - 1)));
      rows.push({ level, gpuMean: g.mean, referenceMean: c.mean, expectedMean, gpuVariance: g.variance, referenceVariance: c.variance, expectedVariance });
    });
    report.push({ stage: "sensor-statistics", flaggedSites: gpu.flaggedSiteIndices.length, patches: rows });
  });
});

describe("webgpu-f32 chart radiance vs float64 reference", () => {
  // The GPU's flagged points are recomputed in the browser realm, so the comparison uses that realm's float64 reference.
  // ECMAScript does not fix the last bit of Math.atan2, so a point placed exactly on a Siemens-star sector boundary can
  // classify differently in Node and in the browser (#471); those realm differences are counted and must be boundary points.
  it.each(CHART_PRESET_SCENES)("%s: unflagged values are the reference rounded once; flagged points recomputed", async (name, scene) => {
    if (guard()) return;
    for (const mode of ["radiance", "spectral-integral"] as const) {
      const input = chartBatchInput(scene, chartPoints(scene, 2 / 3, 60_000, name.length), mode), nodeReference = calculateChartRadianceBatch(input).values;
      const gpu = await call<{ values: Float32Array; execution: ImageKernelExecution; hostRecomputedQueryIndices: Uint32Array; reference: Float64Array }>(
        "chartRadiance", { input, reference: true });
      const reference = gpu.reference, columns = reference.length / (input.points.length / 2);
      expect(gpu.execution.errorBound).toMatchObject({ kind: "relative-to-reference", relative: 2 ** -24 });
      let worst = 0;
      const realmDifferences: number[] = [];
      for (let i = 0; i < reference.length; i++) {
        expect(gpu.values[i], `value ${i}`).toBe(Math.fround(reference[i]!));
        if (reference[i]! !== 0) worst = Math.max(worst, Math.abs(gpu.values[i]! - reference[i]!) / Math.abs(reference[i]!));
        if (nodeReference[i] !== reference[i]) realmDifferences.push(Math.floor(i / columns));
      }
      const recomputed = new Set(gpu.hostRecomputedQueryIndices);
      for (const q of realmDifferences) expect(q >= 60_000 && recomputed.has(q), `query ${q} differs between realms but is not a flagged boundary point`).toBe(true);
      const random = Array.from(gpu.hostRecomputedQueryIndices).filter(i => i < 60_000).length;
      report.push({ stage: "chart-radiance", preset: name, mode, queries: input.points.length / 2, recomputed: gpu.hostRecomputedQueryIndices.length,
        recomputedRandomPoints: random, measuredMaximumRelative: worst, realmDifferentQueries: new Set(realmDifferences).size });
    }
  });
});

describe("webgpu-f32 temporal exposure sum vs float64 reference", () => {
  it.each([[257, 129, 1, true, true], [200, 150, 9, true, true], [160, 120, 32, false, true], [120, 160, 5, true, false]] as const)(
    "%i×%i, %i nodes (rolling %s, sub-site %s)", async (w, h, nodes, rolling, subSite) => {
      if (guard()) return;
      const input = temporalCorpus(w, h, nodes, w * 3 + nodes, rolling, subSite), reference = calculateTemporalExposureSum(input).values;
      const gpu = await call<{ values: Float32Array; execution: ImageKernelExecution }>("sumTemporal", { input });
      const bound = gpu.execution.errorBound as ImageKernelRelativeErrorBound;
      expect(bound.kind).toBe("relative-to-reference");
      let worst = 0;
      for (let i = 0; i < reference.length; i++) {
        const d = Math.abs(gpu.values[i]! - reference[i]!);
        expect(d).toBeLessThanOrEqual(bound.relative * reference[i]! + bound.absolute);
        if (reference[i]! > 0) worst = Math.max(worst, d / reference[i]!);
      }
      const banded = await call<{ values: Float32Array }>("sumTemporal", { input, maximumBandBytes: 4096 });
      expect(banded.values).toEqual(gpu.values);
      report.push({ stage: "temporal-sum", grid: `${w}x${h}`, nodes, measuredMaximumRelative: worst, boundRelative: bound.relative });
    });
});
