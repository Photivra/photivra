// SPDX-License-Identifier: Apache-2.0
/**
 * The display view's Speed kernel (#478) at the app's view size: a 24 MP, 6 µm, 6000 × 4000 frame with the 2 × 2 box pixel
 * aperture shown at 2028 × 1352 (2.96 real pixels per display pixel, the exact area mean), one chart-preset fixture, the float32
 * emulation against the CPU reference per pixel. One whole view: the CPU reference takes tens of seconds on this host and the
 * emulation about as long, so this file runs apart from the small fixtures (test/display-view-speed-gpu.test.ts).
 */
import { describe, expect, it } from "vitest";
import { createFakeGpu } from "./helpers/fake-webgpu.js";
import { compareDisplayViews, displayViewGpuFixture, renderOnGpu, runtimeOf } from "./helpers/display-view-gpu-fixture.js";
import { finishDisplayViewPixel } from "../src/gpu/display-view-speed-gpu.js";
import { NATIVE_RAW_LIMITS } from "../src/index.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

describe("display view Speed kernel at 2028 × 1352 on the 24 MP frame", () => {
  it("checkerboard: every component inside the a-priori bounds; ΔE2000 and σ-unit agreement reported", async () => {
    const options = { scene: { preset: "checkerboard" as const, squaresAcross: 12 }, lens: { prime: 50 as const, fNumber: 8 },
      sensor: { pixelPitchMicrometers: 6, pixelAperture: { kind: "box" as const, samplesPerAxis: 2 } }, output: { width: 6000, height: 4000, format: "srgb-8" as const, maximumPixels: NATIVE_RAW_LIMITS.ceilingPixels } };
    const view = { width: 2028, height: 1352 };
    let t = performance.now();
    const fixture = await displayViewGpuFixture(options, view);
    const cpuMs = performance.now() - t;
    const runtime = await runtimeOf(createFakeGpu().gpu);
    t = performance.now();
    const gpu = await renderOnGpu(runtime, fixture, 256 * 1024 * 1024);
    const emulationMs = performance.now() - t;
    const a = compareDisplayViews(fixture.cpu, gpu);
    // The host finishing alone (quantization term, three portable normals, Cholesky, clipped centre, encode, rounding), timed on this host.
    const moments = new Float32Array(9), samples = new Uint8Array(3), expected = new Float64Array(3), noiseStd = new Float64Array(3);
    moments.set([0.3, 0.4, 0.5, 1e-5, 1e-5, 1e-5, 1e-6, 1e-6, 1e-6]);
    t = performance.now();
    const pixels = view.width * view.height;
    for (let i = 0; i < pixels; i++) finishDisplayViewPixel(moments, 0.114, 1, i, 1 / 255, 255, samples, expected, noiseStd, 0);
    const finishingMs = performance.now() - t;
    process.stdout.write("[display-view gpu emulation 2028x1352] " + JSON.stringify({ ...a, flagged: gpu.flaggedPixelIndices.length, recomputed: gpu.hostRecomputedPixelIndices.length,
      cpuReferenceMs: Math.round(cpuMs), float32EmulationMs: Math.round(emulationMs), hostFinishingMsPerView: Math.round(finishingMs), hostFinishingNsPerPixel: Math.round(1e6 * finishingMs / pixels),
      expectedValueBound: gpu.expectedValueBound, varianceBound: gpu.varianceBound }, null, 1) + "\n");
    expect(a.pixels).toBe(pixels);
    expect(a.outsideExpectedBound).toBe(0);
    expect(a.outsideVarianceBound).toBe(0);
    expect(a.largestCodeDifference).toBeLessThanOrEqual(1);
    expect(a.deltaEMaximum).toBeLessThan(0.01);
    expect(a.sigmaUnitsMaximum).toBeLessThan(0.01);
    expect(a.sigmaRelativeMaximum).toBeLessThan(0.01);
    runtime.destroy();
  }, scaledTimeout(1_200_000));
});
