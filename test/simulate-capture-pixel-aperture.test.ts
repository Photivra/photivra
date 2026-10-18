// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError, simulateCapture, type SimulateCaptureOptions } from "../src/index.js";

// Modulation of the red RAW sites of a horizontal sinusoid: least-squares cos/sin fit per even native row.
function redModulation(codes: Uint16Array, nativeWidth: number, nativeHeight: number, cyclesPerPixel: number): number {
  let sum = 0, rows = 0;
  for (let y = 2; y < nativeHeight - 2; y += 2) {
    let mean = 0, c = 0, s = 0, n = 0;
    for (let x = 0; x < 64; x += 2) mean += codes[y * nativeWidth + x]!;
    mean /= 32;
    for (let x = 0; x < 64; x += 2) { const p = 2 * Math.PI * cyclesPerPixel * x, d = codes[y * nativeWidth + x]! - mean; c += d * Math.cos(p); s += d * Math.sin(p); n++; }
    sum += 2 * Math.hypot(c, s) / n; rows++;
  }
  return sum / rows;
}

describe("pixel aperture (2.3)", () => {
  // 3/16 cycles per pixel: 12 whole cycles over 32 red sites, below the red grid's Nyquist frequency.
  const f = 3 / 16, width = 64, height = 16;
  const scene: SimulateCaptureOptions["scene"] = { kind: "reflectance-function", sceneId: "sine", evaluate: (p) => 0.45 + 0.35 * Math.cos(2 * Math.PI * f * (p.u * width / 2)) };

  it("integrates the photosite: the modulation follows the midpoint-rule box MTF sin(πfp)/(N·sin(πfp/N))", async () => {
    const point = await simulateCapture({ scene, output: { width, height } });
    const native = point.plan.exposure.geometry.nativeRaster;
    const m0 = redModulation(point.raw.codes, native.pixelWidth, native.pixelHeight, f);
    for (const n of [2, 4, 8]) {
      const box = await simulateCapture({ scene, output: { width, height }, sensor: { pixelAperture: { kind: "box", samplesPerAxis: n } } });
      const expected = Math.sin(Math.PI * f) / (n * Math.sin(Math.PI * f / n));
      expect(redModulation(box.raw.codes, native.pixelWidth, native.pixelHeight, f) / m0).toBeCloseTo(expected, 2);
      expect(box.diagnostics.providerEvaluationCount).toBe(n * n * point.diagnostics.providerEvaluationCount);
      expect(box.diagnostics.options).toContain("sensor.pixelAperture.box");
    }
    // The ideal box MTF |sinc(f·p)| is within 0.5 % of the N = 4 rule at this frequency.
    expect(Math.abs(Math.sin(Math.PI * f) / (Math.PI * f) / (Math.sin(Math.PI * f) / (4 * Math.sin(Math.PI * f / 4))) - 1)).toBeLessThan(0.005);
  }, 120_000);

  it("suppresses detail at the sampling frequency that point sampling aliases to full contrast", async () => {
    // One cycle per pixel: point samples all land on the same phase (a flat, wrong-brightness field); the box averages to the mean.
    const fine: SimulateCaptureOptions["scene"] = { kind: "reflectance-function", sceneId: "fine", evaluate: (p) => 0.45 + 0.35 * Math.cos(2 * Math.PI * (p.u * 16 / 2 + 0.5)) };
    const mean = (r: Awaited<ReturnType<typeof simulateCapture>>): number => Array.from(r.image.samples).reduce((s, x) => s + x, 0) / r.image.samples.length;
    const point = await simulateCapture({ scene: fine, output: { width: 16, height: 8 } }), box = await simulateCapture({ scene: fine, output: { width: 16, height: 8 }, sensor: { pixelAperture: "box" } });
    const grey = await simulateCapture({ scene: { preset: "uniform", reflectance: 0.45 }, output: { width: 16, height: 8 } });
    expect(Math.abs(mean(box) - mean(grey))).toBeLessThan(1);
    expect(Math.abs(mean(point) - mean(grey))).toBeGreaterThan(20);
  }, 60_000);

  it("keeps a uniform field, reports the model, runs with diffraction and anti-aliasing, and validates", async () => {
    const base = { scene: { preset: "uniform" as const }, output: { width: 12, height: 8 } };
    const point = await simulateCapture(base), box = await simulateCapture({ ...base, sensor: { pixelAperture: "box" } });
    const mean = (a: Uint16Array): number => a.reduce((s, x) => s + x, 0) / a.length;
    expect(Math.abs(mean(box.raw.codes) - mean(point.raw.codes))).toBeLessThan(1);
    expect(box.assumptions.find((a) => a.id === "sensor.pixelAperture")?.value).toEqual({ kind: "box", samplesPerAxis: 4, fillFactor: 1 });
    expect(point.assumptions.some((a) => a.id === "sensor.pixelAperture")).toBe(false);
    expect((await simulateCapture({ ...base, sensor: { pixelAperture: "point" } })).raw.codes).toEqual(point.raw.codes);
    // With diffraction the object-space convolution serves every aperture node (one lattice per sub-site shift); it equals the per-tap quadrature.
    const edge = { scene: { preset: "slanted-edge" as const }, output: { width: 12, height: 8 }, lens: { diffraction: "circular-aperture" as const }, sensor: { pixelAperture: { kind: "box" as const, samplesPerAxis: 2 } } };
    const fast = await simulateCapture(edge);
    expect(fast.request.diffraction?.execution).toBe("object-space-convolution");
    const perTap = await simulateCapture({ ...edge, lens: { psf: fast.request.diffraction!.psf } });
    expect(Array.from(perTap.raw.codes)).toEqual(Array.from(fast.raw.codes));
    const aa = await simulateCapture({ ...edge, sensor: { pixelAperture: { kind: "box", samplesPerAxis: 2 }, antiAliasing: { kind: "four-spot" } } });
    expect(aa.diagnostics.options).toEqual(expect.arrayContaining(["lens.diffraction", "sensor.antiAliasing", "sensor.pixelAperture.box"]));
    for (const pixelAperture of ["area", { kind: "box", samplesPerAxis: 0 }, { kind: "box", samplesPerAxis: 17 }, { kind: "gauss" }, { kind: "box", n: 2 }])
      await expect(simulateCapture({ ...base, sensor: { pixelAperture } as never })).rejects.toThrow(InvalidConfigurationError);
  }, 60_000);
});
