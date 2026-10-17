// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { calculateIrradianceConvolution, calculateTemporalExposureSum, calculateTemporalExposureSumPlan, composeRelativeErrorBounds, createImageKernelAccelerator,
  type ImageKernelRelativeErrorBound, type TemporalExposureSumInput } from "../src/index.js";
import { temporalExposureSumErrorBound } from "../src/gpu/temporal-sum-gpu.js";
import { createFakeGpu } from "./helpers/fake-webgpu.js";
import { convolutionCorpus } from "./helpers/webgpu-fixtures.js";
import { corpusRandom, temporalCorpus } from "./helpers/sensor-stage-fixtures.js";

function input(width: number, height: number, displacements: number[], weights: (k: number, y: number) => number, samples?: Float64Array): TemporalExposureSumInput {
  const nodes = displacements.length / 2, rowWeights = new Float64Array(nodes * height);
  for (let k = 0; k < nodes; k++) for (let y = 0; y < height; y++) rowWeights[k * height + y] = weights(k, y);
  return { schemaVersion: "0.1.0", width, height, samples: samples ?? new Float64Array(width * height).map((_, i) => i + 1),
    displacements: new Float64Array(displacements), rowWeights, boundary: "zero-outside-grid" };
}
function expectWithin(values: ArrayLike<number>, reference: ArrayLike<number>, bound: ImageKernelRelativeErrorBound): number {
  let worst = 0;
  for (let i = 0; i < reference.length; i++) {
    const d = Math.abs(values[i]! - reference[i]!);
    expect(d).toBeLessThanOrEqual(bound.relative * reference[i]! + bound.absolute);
    if (reference[i]! > 0) worst = Math.max(worst, d / reference[i]!);
  }
  return worst;
}

describe("temporal exposure sum reference", () => {
  it("is the exposure integral of a static scene under a global shutter", () => {
    const v = input(5, 4, [0, 0, 0, 0, 0, 0], () => 0.25);
    expect(Array.from(calculateTemporalExposureSum(v).values)).toEqual(Array.from(v.samples, s => 0.75 * s));
  });
  it("moves content by +displacement and loses what leaves the grid", () => {
    const v = input(5, 3, [2, 1], () => 1), out = calculateTemporalExposureSum(v).values;
    expect(out[1 * 5 + 2]).toBe(v.samples[0]); // source (0, 0) lands at (2, 1)
    expect(out[0]).toBe(0);
  });
  it("interpolates half-site motion bilinearly and conserves interior exposure", () => {
    const samples = new Float64Array(9).fill(0); samples[4] = 8;
    const out = calculateTemporalExposureSum(input(3, 3, [0.5, 0], () => 1, samples)).values;
    expect(out[4]).toBe(4); expect(out[5]).toBe(4);
    expect(out.reduce((s, x) => s + x, 0)).toBe(8);
  });
  it("gives rolling-shutter skew: each row sees the displacement of its own window", () => {
    const samples = new Float64Array(8 * 4); for (let y = 0; y < 4; y++) samples[y * 8 + 1] = 1; // vertical line at x = 1
    const out = calculateTemporalExposureSum(input(8, 4, [0, 0, 1, 0, 2, 0, 3, 0], (k, y) => (k === y ? 1 : 0), samples)).values;
    for (let y = 0; y < 4; y++) expect(out[y * 8 + 1 + y]).toBe(1); // the line is sheared one site per row
  });
  it("validates geometry, arrays and domains", () => {
    const bad: ((v: TemporalExposureSumInput) => void)[] = [
      (v): void => { (v as { schemaVersion: string }).schemaVersion = "2"; }, (v): void => { (v as { boundary: string }).boundary = "mirror"; },
      (v): void => { v.width = 0; }, (v): void => { v.samples = new Float64Array(2); }, (v): void => { v.samples[0] = -1; }, (v): void => { v.samples[1] = NaN; },
      (v): void => { v.displacements = new Float64Array(3); }, (v): void => { v.displacements = new Float64Array(0); }, (v): void => { v.displacements[0] = 5000; },
      (v): void => { v.displacements[1] = NaN; }, (v): void => { v.rowWeights = new Float64Array(1); }, (v): void => { v.rowWeights[0] = -1; },
      (v): void => { v.rowWeights[0] = 2 ** 17; }, (v): void => { v.displacements = new Float64Array(2 * 257); }, (v): void => { (v as unknown as Record<string, unknown>).x = 1; }
    ];
    for (const mutate of bad) { const v = temporalCorpus(6, 5, 3, 1); mutate(v); expect(() => calculateTemporalExposureSumPlan(v)).toThrow(); }
  });
});

describe("accelerated temporal exposure sum", () => {
  it("CPU backend returns the reference", async () => {
    const v = temporalCorpus(37, 23, 7, 2), a = await createImageKernelAccelerator({ backend: "cpu-reference" });
    const out = await a.sumTemporalExposure(v, { yieldControl: async () => {} });
    expect(out.values).toEqual(calculateTemporalExposureSum(v).values);
    expect(out.execution.backend).toBe("cpu-reference");
  });
  it.each([[61, 29, 1, true, true], [61, 29, 9, true, true], [40, 33, 16, false, true], [33, 40, 5, true, false]] as const)(
    "%i×%i, %i nodes (rolling %s, sub-site %s) stays within the a-priori bound (fake device)", async (w, h, nodes, rolling, subSite) => {
      const v = temporalCorpus(w, h, nodes, w + nodes, rolling, subSite), reference = calculateTemporalExposureSum(v).values;
      const a = await createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: createFakeGpu().gpu });
      const out = await a.sumTemporalExposure(v);
      expect(out.execution).toMatchObject({ backend: "webgpu-f32", errorBound: temporalExposureSumErrorBound(out.plan) });
      expectWithin(out.values, reference, out.execution.errorBound as ImageKernelRelativeErrorBound);
      const banded = await (await createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: createFakeGpu().gpu, maximumBandBytes: 4096 }))
        .sumTemporalExposure(v);
      expect(banded.values).toEqual(out.values);
    });
});

describe("accuracy contract: composition of stage bounds", () => {
  it("composes relative bounds through a non-negative linear stage (randomized check)", () => {
    const random = corpusRandom(99);
    for (let trial = 0; trial < 200; trial++) {
      const n = 6, m = 4, a = Array.from({ length: n }, () => random() * 10 ** (6 * random() - 3));
      const first: ImageKernelRelativeErrorBound = { kind: "relative-to-reference", relative: random() * 1e-3, absolute: random() * 1e-6 };
      const second: ImageKernelRelativeErrorBound = { kind: "relative-to-reference", relative: random() * 1e-3, absolute: random() * 1e-6 };
      // Worst-case perturbation of stage 1, a non-negative operator B (row sums ≤ W), worst-case perturbation of stage 2.
      const approx = a.map(v => v + (random() < .5 ? -1 : 1) * (first.relative * v + first.absolute));
      const B = Array.from({ length: m }, () => Array.from({ length: n }, () => random() / n)), W = Math.max(...B.map(r => r.reduce((s, x) => s + x, 0)));
      const exact = B.map(r => r.reduce((s, x, j) => s + x * a[j]!, 0)), onApprox = B.map(r => r.reduce((s, x, j) => s + x * approx[j]!, 0));
      const result = onApprox.map(v => v + (random() < .5 ? -1 : 1) * (second.relative * v + second.absolute));
      const composed = composeRelativeErrorBounds(first, second, W);
      result.forEach((v, i) => expect(Math.abs(v - exact[i]!)).toBeLessThanOrEqual((composed.relative * exact[i]! + composed.absolute) * (1 + 1e-12)));
    }
    expect(() => composeRelativeErrorBounds({ kind: "relative-to-reference", relative: -1, absolute: 0 }, { kind: "relative-to-reference", relative: 0, absolute: 0 }, 1)).toThrow(RangeError);
  });
  it("bounds the convolution → temporal-sum chain on the fake device by the composed bound", async () => {
    const conv = convolutionCorpus(48, 36, 3, 16, 12, 5);
    const a = await createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: createFakeGpu().gpu });
    const gpuConv = await a.convolveIrradiance(conv);
    const temporal = temporalCorpus(48, 36, 6, 8), referenceChain = calculateTemporalExposureSum({ ...temporal, samples: calculateIrradianceConvolution(conv).values }).values;
    const gpuChain = await a.sumTemporalExposure({ ...temporal, samples: gpuConv.values });
    const composed = composeRelativeErrorBounds(gpuConv.execution.errorBound as ImageKernelRelativeErrorBound,
      gpuChain.execution.errorBound as ImageKernelRelativeErrorBound, gpuChain.plan.maximumRowWeightSum);
    expectWithin(gpuChain.values, referenceChain, composed);
  });
});
