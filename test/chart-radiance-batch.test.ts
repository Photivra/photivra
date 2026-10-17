// SPDX-License-Identifier: Apache-2.0
/**
 * Chart scene radiance and spectral integration, batched (#277): the float64 reference against the
 * planar provider's own radiance, and the `webgpu-f32` stage (fake device, float32 emulation) against the
 * reference for every built-in preset.
 */
import { describe, expect, it } from "vitest";
import { calculateChartRadianceBatch, calculateChartRadianceBatchPlan, createImageKernelAccelerator, createPlanarSceneRadianceProvider,
  planarChartPointsFromDirections, type ChartRadianceBatchInput } from "../src/index.js";
import { createFakeGpu } from "./helpers/fake-webgpu.js";
import { chartBatchInput, chartPoints, CHART_PRESET_SCENES } from "./helpers/chart-radiance-fixtures.js";

async function gpu(maximumBandBytes?: number): Promise<Awaited<ReturnType<typeof createImageKernelAccelerator>>> {
  return createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: createFakeGpu().gpu, ...(maximumBandBytes ? { maximumBandBytes } : {}) });
}

describe("batched chart radiance reference", () => {
  it.each(CHART_PRESET_SCENES)("%s: radiance queries equal the planar provider's radianceAt; integrals are its wavelength-ordered sums", (_, scene) => {
    const points = chartPoints(scene, 2 / 3, 200, 3);
    const provider = createPlanarSceneRadianceProvider({ scene, illuminant: { kind: "planckian", temperatureKelvin: 5000 }, illuminanceLux: 1000,
      distanceM: 2, framedWidthM: 1, aspect: 2 / 3, sceneId: "chart", providerProfileId: "chart" });
    const radiance = chartBatchInput(scene, points, "radiance"), r = calculateChartRadianceBatch(radiance);
    for (let q = 0; q < r.plan.queryCount; q++) {
      expect(r.values[q]).toBe(provider.radianceAt(points[2 * q]!, points[2 * q + 1]!, radiance.wavelengthsNanometers[radiance.wavelengthIndices![q]!]!));
    }
    const integral = chartBatchInput(scene, points, "spectral-integral"), s = calculateChartRadianceBatch(integral);
    expect(s.plan.columns).toBe(3);
    for (const q of [0, 17, r.plan.queryCount - 1]) {
      let sum = 0;
      for (let j = 0; j < 21; j++) sum += integral.channelWeights![1]![j]! * provider.radianceAt(points[2 * q]!, points[2 * q + 1]!, integral.wavelengthsNanometers[j]!);
      expect(s.values[q * 3 + 1]).toBe(sum);
    }
  });
  it("converts environment directions to plane points exactly as evaluateRadiance", () => {
    const provider = createPlanarSceneRadianceProvider({ scene: { preset: "checkerboard" }, illuminant: "cie-a", illuminanceLux: 500, distanceM: 3,
      framedWidthM: 1.2, aspect: 2 / 3, sceneId: "chart", providerProfileId: "chart" });
    const directions = Float64Array.from([0.1, -0.05, -0.99, -0.13, 0.08, -0.98, 0, 0, -1]);
    const points = planarChartPointsFromDirections({ directions, distanceM: 3, metresPerFrameUnit: 0.6 });
    for (let i = 0; i < 3; i++) {
      const o = { x: directions[3 * i]!, y: directions[3 * i + 1]!, z: directions[3 * i + 2]! };
      const request = { schemaVersion: "0.1.0", sampleId: "s", sceneId: "chart", providerProfileId: "chart", illuminationProfileId: "i", materialResponseProfileId: "m",
        wavelengthNanometers: 550, wavelengthBasis: "vacuum", target: { kind: "environment-direction", outgoingDirectionUnitVector: o } } as never;
      expect(provider.evaluateRadiance(request).spectralRadianceWattsPerSquareMeterSteradianNanometer).toBe(provider.radianceAt(points[2 * i]!, points[2 * i + 1]!, 550));
    }
    expect(() => planarChartPointsFromDirections({ directions: Float64Array.from([0, 0, 1]), distanceM: 3, metresPerFrameUnit: 1 })).toThrow(/toward/u);
  });
  it("validates the batch", () => {
    const scene = CHART_PRESET_SCENES[1]![1], ok = chartBatchInput(scene, chartPoints(scene, 2 / 3, 4, 1), "radiance");
    const bad: ((v: ChartRadianceBatchInput) => void)[] = [
      (v): void => { (v as { schemaVersion: string }).schemaVersion = "9"; }, (v): void => { v.points = new Float64Array(3); },
      (v): void => { v.points[0] = NaN; }, (v): void => { v.wavelengthsNanometers = []; }, (v): void => { v.wavelengthIndices![0] = 99; },
      (v): void => { v.channelWeights = [[1]]; }, (v): void => { delete v.wavelengthIndices; },
      (v): void => { (v as unknown as Record<string, unknown>).extra = 1; }, (v): void => { v.aspect = 0; }
    ];
    for (const mutate of bad) { const v = { ...ok, points: ok.points.slice(), wavelengthIndices: ok.wavelengthIndices!.slice() }; mutate(v); expect(() => calculateChartRadianceBatchPlan(v)).toThrow(); }
  });
});

describe("webgpu-f32 chart radiance (fake device, float32 emulation)", () => {
  it.each(CHART_PRESET_SCENES)("%s: every value is the reference rounded once to float32; flagged points are recomputed", async (_, scene) => {
    for (const mode of ["radiance", "spectral-integral"] as const) {
      const input = chartBatchInput(scene, chartPoints(scene, 2 / 3, 4000, 7), mode), reference = calculateChartRadianceBatch(input).values;
      const a = await gpu(), out = await a.evaluateChartRadiance(input);
      expect(out.values).toBeInstanceOf(Float32Array);
      expect(out.execution).toMatchObject({ backend: "webgpu-f32", errorBound: { kind: "relative-to-reference", relative: 2 ** -24, absolute: 2 ** -126 } });
      // Exactly the reference rounded once to float32, which is within the bound.
      for (let i = 0; i < reference.length; i++) expect(out.values[i], `value ${i}`).toBe(Math.fround(reference[i]!));
      // Random points are rarely flagged; boundary points are.
      expect(out.hostRecomputedQueryIndices.length).toBeLessThan(0.05 * 4000 + 400);
      const banded = await (await gpu(4096)).evaluateChartRadiance(input);
      expect(banded.values).toEqual(out.values);
      a.dispose();
    }
  });
  it("CPU backend returns the reference; GPU fails closed outside the float32 domain", async () => {
    const scene = CHART_PRESET_SCENES[5]![1], input = chartBatchInput(scene, chartPoints(scene, 2 / 3, 50, 2), "spectral-integral");
    const cpu = await (await createImageKernelAccelerator({ backend: "cpu-reference" })).evaluateChartRadiance(input);
    expect(cpu.values).toEqual(calculateChartRadianceBatch(input).values);
    const far = { ...input, points: Float64Array.from([2 ** 21, 0]) };
    await expect((await gpu()).evaluateChartRadiance(far)).rejects.toMatchObject({ reason: "unsupported-float32-domain" });
  });
});
