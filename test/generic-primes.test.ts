// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { GENERIC_PRIME_EQUIVALENT_FOCAL_LENGTHS_MM, InvalidConfigurationError, calculateGenericPrimeMinimumFocusDistanceM, calculateSubjectDistanceForFraming,
  resolveGenericPrimeLens, simulateCapture } from "../src/index.js";

const fullFrame = { widthMm: 36, heightMm: 24 };
const a3 = { widthM: 0.42, heightM: 0.28 };

describe("generic prime family (2.3)", () => {
  it("derives the focal length, f-number range and minimum focus of every prime", () => {
    const expected: Record<number, [number, number]> = { 10: [2.8, 16], 16: [2.8, 16], 20: [1.8, 22], 28: [1.8, 22], 35: [1.4, 22], 85: [1.4, 22], 105: [2, 22], 135: [2, 22],
      200: [2.8, 32], 300: [2.8, 32], 400: [4, 32], 600: [4, 32], 800: [5.6, 32], 1200: [8, 32] };
    for (const eq of GENERIC_PRIME_EQUIVALENT_FOCAL_LENGTHS_MM) {
      const lens = resolveGenericPrimeLens({ equivalentFocalLengthMm: eq, activeImagingArea: fullFrame });
      expect(lens.focalLengthMm).toBeCloseTo(eq, 9);
      if (expected[eq]) expect([lens.widestFNumber, lens.narrowestFNumber]).toEqual(expected[eq]);
      expect(lens.fNumbers[0]).toBe(lens.widestFNumber);
      expect(lens.fNumbers.at(-1)).toBe(lens.narrowestFNumber);
      expect(lens.minimumFocusDistanceM).toBeCloseTo(Math.max(0.1, eq / 1000 * (1 + 1 / 0.15)), 12);
    }
    expect(resolveGenericPrimeLens({ equivalentFocalLengthMm: 50, activeImagingArea: fullFrame }).fNumbers).toEqual([1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22]);
    // APS-C 23.5 × 15.6 mm: crop 1.534, a 50 mm-equivalent prime is about 32.6 mm.
    const apsc = resolveGenericPrimeLens({ equivalentFocalLengthMm: 50, activeImagingArea: { widthMm: 23.5, heightMm: 15.6 } });
    expect(apsc.cropFactor35Mm).toBeCloseTo(1.534, 3);
    expect(apsc.focalLengthMm).toBeCloseTo(50 / apsc.cropFactor35Mm, 12);
    expect(calculateGenericPrimeMinimumFocusDistanceM(4)).toBe(0.1);
    expect(() => resolveGenericPrimeLens({ equivalentFocalLengthMm: 55, activeImagingArea: fullFrame })).toThrow(InvalidConfigurationError);
  });

  it("fits a chart with thin-lens d = f(1 + 1/m), reports coverage and the minimum-focus check", () => {
    const fit = calculateSubjectDistanceForFraming({ sensor: fullFrame, equivalentFocalLengthMm: 50, chart: a3 });
    expect(fit.magnification).toBeCloseTo(36 / 420, 14);
    expect(fit.subjectDistanceM).toBeCloseTo(0.05 * (1 + 420 / 36), 12);
    expect(fit.coverage).toEqual({ frameWidthFraction: expect.closeTo(1, 12), frameHeightFraction: expect.closeTo(1, 12) });
    expect(fit.prime?.lensId).toBe("generic-prime-50mm-equivalent");
    expect(fit.belowMinimumFocus).toBe(false);
    // A 4:3 chart on a 3:2 sensor: contain fits the height, cover the width.
    const square = { widthM: 0.4, heightM: 0.3 };
    const contain = calculateSubjectDistanceForFraming({ sensor: fullFrame, focalLengthMm: 50, chart: square });
    expect(contain.coverage.frameHeightFraction).toBeCloseTo(1, 12);
    expect(contain.coverage.frameWidthFraction).toBeLessThan(1);
    const cover = calculateSubjectDistanceForFraming({ sensor: fullFrame, focalLengthMm: 50, chart: square, fit: "cover" });
    expect(cover.coverage.frameWidthFraction).toBeCloseTo(1, 12);
    expect(cover.coverage.frameHeightFraction).toBeGreaterThan(1);
    expect(calculateSubjectDistanceForFraming({ sensor: fullFrame, equivalentFocalLengthMm: 10, chart: { widthM: 0.21 } }).belowMinimumFocus).toBe(true);
    expect(() => calculateSubjectDistanceForFraming({ sensor: fullFrame, chart: a3 } as never)).toThrow(InvalidConfigurationError);
    expect(() => calculateSubjectDistanceForFraming({ sensor: fullFrame, focalLengthMm: 50, chart: a3, fit: "stretch" as never })).toThrow(InvalidConfigurationError);
  });

  it("matches simulateCapture's framing when the chart is placed at the fit distance", async () => {
    const frame = { widthMm: 64 * 6 / 1000, heightMm: 48 * 6 / 1000 };
    const fit = calculateSubjectDistanceForFraming({ sensor: frame, equivalentFocalLengthMm: 50, chart: { widthM: 0.42 } });
    const capture = await simulateCapture({ scene: { preset: "slanted-edge" }, lens: { prime: 50 }, chartSize: { widthM: 0.42 }, subjectDistanceM: fit.subjectDistanceM, output: { width: 64, height: 48 } });
    expect(capture.scene.chart!.frameWidthFraction).toBeCloseTo(1, 10);
    expect(capture.scene.chart!.magnification).toBeCloseTo(fit.magnification, 12);
    expect(capture.assumptions.find((a) => a.id === "lens.prime")?.value).toMatchObject({ lensId: "generic-prime-50mm-equivalent", widestFNumber: 1.4 });
  });

  it("validates a prime in simulateCapture", async () => {
    const base = { scene: { preset: "uniform" as const }, output: { width: 8, height: 8 } };
    await expect(simulateCapture({ ...base, lens: { prime: 1200, fNumber: 4 } })).rejects.toThrow("outside the generic-prime-1200mm-equivalent range f/8–f/32");
    await expect(simulateCapture({ ...base, lens: { prime: 50, focalLengthMm: 50 } })).rejects.toThrow(InvalidConfigurationError);
    await expect(simulateCapture({ ...base, lens: { prime: 55 } })).rejects.toThrow(InvalidConfigurationError);
    // Full-frame pixels: 36 mm / 8 px = 4500 µm is outside the facade's pitch range, so use 1000 px of 36 µm for a full-frame-sized frame.
    const ff = { scene: { preset: "uniform" as const }, output: { width: 1000, height: 8, region: { x: 0, y: 0, width: 2, height: 2 } }, sensor: { pixelPitchMicrometers: 36 } };
    await expect(simulateCapture({ ...ff, lens: { prime: 200 }, subjectDistanceM: 1 })).rejects.toThrow("focuses no closer than");
    const ok = await simulateCapture({ ...ff, lens: { prime: 200, fNumber: 2.8 }, subjectDistanceM: 5 });
    expect(ok.exposure.settings.fNumber).toBe(2.8);
  }, 60_000);
});
