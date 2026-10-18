// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { calculateChartFraming, calculateSubjectDistanceForFraming, InvalidConfigurationError, simulateCapture } from "../src/index.js";

const fullFrame = { widthMm: 36, heightMm: 24 };
const a3 = { widthM: 0.42, heightM: 0.28 };
const close = (actual: number, expected: number, relative = 1e-12): void => { expect(Math.abs(actual / expected - 1)).toBeLessThan(relative); };

describe("calculateChartFraming (2.5): chart coverage at any subject distance", () => {
  it("follows the thin lens: magnification v/d, framed size and coverage, worked full-frame example", () => {
    // 50 mm at 1 m: v = 50·1000/950 = 52.63 mm, m = 0.05263, the frame spans 36/m = 684 mm, so an A3 chart covers 61.4 % of the width.
    const r = calculateChartFraming({ sensor: fullFrame, focalLengthMm: 50, chart: a3, subjectDistanceM: 1 });
    close(r.imageDistanceMm, 50 * 1000 / 950);
    close(r.magnification, 50 / 950);
    close(r.framedWidthM, 0.036 * 950 / 50);
    close(r.coverage.frameWidthFraction, 0.42 / 0.684);
    close(r.coverage.frameHeightFraction, 0.28 / 0.456);
    close(r.chartImageMm.width, 420 * 50 / 950);
    expect(r.prime).toBeNull();
    expect(r.minimumFocusDistanceM).toBeCloseTo(0.05 * (1 + 1 / 0.15), 12);
    expect(r.belowMinimumFocus).toBe(false);
    expect(r.scientificStatus).toBe("approximation");
    expect(r.assumptions.map((a) => a.id)).toEqual(["focusDistanceM", "model.thin-lens-framing", "minimumFocus"]);
    // Closer than the fit distance the chart is cropped (coverage above 1); farther it shrinks in proportion to (d − f).
    const near = calculateChartFraming({ sensor: fullFrame, focalLengthMm: 50, chart: a3, subjectDistanceM: 0.4 });
    expect(near.coverage.frameWidthFraction).toBeGreaterThan(1);
    const far = calculateChartFraming({ sensor: fullFrame, focalLengthMm: 50, chart: a3, subjectDistanceM: 10.05 });
    close(far.coverage.frameWidthFraction / r.coverage.frameWidthFraction, 0.95 / 10);
  });

  it("gives coverage 1 on the limiting side at calculateSubjectDistanceForFraming's distance, for every fit and sensor shape", () => {
    for (const sensor of [fullFrame, { widthMm: 4.8, heightMm: 3.6 }, { widthMm: 23.5, heightMm: 15.6 }]) for (const equivalent of [10, 50, 200, 1200]) {
      for (const fit of ["contain", "width", "height", "cover"] as const) {
        const target = calculateSubjectDistanceForFraming({ sensor, equivalentFocalLengthMm: equivalent, chart: a3, fit });
        const r = calculateChartFraming({ sensor, equivalentFocalLengthMm: equivalent, chart: a3, subjectDistanceM: target.subjectDistanceM });
        close(r.magnification, target.magnification);
        close(r.coverage.frameWidthFraction, target.coverage.frameWidthFraction);
        close(r.coverage.frameHeightFraction, target.coverage.frameHeightFraction);
        const limiting = fit === "width" ? r.coverage.frameWidthFraction : fit === "height" ? r.coverage.frameHeightFraction :
          fit === "contain" ? Math.max(r.coverage.frameWidthFraction, r.coverage.frameHeightFraction) : Math.min(r.coverage.frameWidthFraction, r.coverage.frameHeightFraction);
        close(limiting, 1);
        expect(r.minimumFocusDistanceM).toBe(target.minimumFocusDistanceM);
        expect(r.belowMinimumFocus).toBe(target.belowMinimumFocus);
        expect(r.prime?.lensId).toBe(target.prime?.lensId);
      }
    }
  });

  it("matches simulateCapture's result.scene.chart at any distance, with a prime, a tier lens and a separate focus distance", async () => {
    const cases = [
      { lens: { prime: 50 as const }, subjectDistanceM: 0.9, pitch: 100 },
      { lens: { prime: 50 as const }, subjectDistanceM: 7, pitch: 100 },
      { lens: { prime: 24 as const, fNumber: 4 }, subjectDistanceM: 0.35, pitch: 9 },
      { lens: { focalLengthMm: 50 }, subjectDistanceM: 40, pitch: 6 },
      { lens: { focalLengthMm: 50, focusDistanceM: 25 }, subjectDistanceM: 40, pitch: 6 }
    ];
    for (const { lens, subjectDistanceM, pitch } of cases) {
      const width = 48, height = 32, sensor = { widthMm: width * pitch / 1000, heightMm: height * pitch / 1000 };
      const capture = await simulateCapture({ scene: { preset: "siemens-star" }, lens, chartSize: a3, subjectDistanceM, sensor: { pixelPitchMicrometers: pitch, spectralStepNanometers: 100 },
        output: { width, height } });
      const chart = capture.scene.chart!;
      const r = calculateChartFraming({ sensor, chart: a3, subjectDistanceM, ...("prime" in lens ? { equivalentFocalLengthMm: lens.prime } : { focalLengthMm: lens.focalLengthMm }),
        ...("focusDistanceM" in lens ? { focusDistanceM: lens.focusDistanceM } : {}) });
      close(r.magnification, chart.magnification);
      close(r.coverage.frameWidthFraction, chart.frameWidthFraction);
      close(r.coverage.frameHeightFraction, chart.frameHeightFraction);
      close(r.chartImageMm.width, chart.imageWidthMm);
      close(r.chartImageMm.height, chart.imageHeightMm);
      close(r.framedWidthM, capture.scene.framedWidthM);
      close(r.framedHeightM, capture.scene.framedHeightM);
      if ("prime" in lens) close(r.focalLengthMm, (capture.assumptions.find((a) => a.id === "lens.prime")!.value as { focalLengthMm: number }).focalLengthMm);
    }
  }, 120_000);

  it("flags distances below the generic prime's minimum focus, as simulateCapture refuses them", async () => {
    const r = calculateChartFraming({ sensor: fullFrame, equivalentFocalLengthMm: 50, chart: a3, subjectDistanceM: 0.3 });
    expect(r.prime?.minimumFocusDistanceM).toBeCloseTo(0.05 * (1 + 1 / 0.15), 12);
    expect(r.belowMinimumFocus).toBe(true);
    expect(r.coverage.frameWidthFraction).toBeGreaterThan(1);
    await expect(simulateCapture({ scene: { preset: "uniform" }, lens: { prime: 50 }, chartSize: a3, subjectDistanceM: 0.3, sensor: { pixelPitchMicrometers: 36000 / 768 },
      output: { width: 768, height: 512 } })).rejects.toThrow(InvalidConfigurationError);
    expect(calculateChartFraming({ sensor: fullFrame, equivalentFocalLengthMm: 50, chart: a3, subjectDistanceM: 2, focusDistanceM: 0.3 }).belowMinimumFocus).toBe(true);
    // The default chart height follows the sensor's shape.
    const square = calculateChartFraming({ sensor: fullFrame, focalLengthMm: 50, chart: { widthM: 0.3 }, subjectDistanceM: 3 });
    expect(square.chart.heightM).toBeCloseTo(0.2, 15);
    expect(square.assumptions[0]!.id).toBe("chart.heightM");
  });

  it("validates its input", () => {
    const base = { sensor: fullFrame, focalLengthMm: 50, chart: a3, subjectDistanceM: 2 };
    const bad: [Record<string, unknown>, RegExp][] = [
      [{ subjectDistanceM: 0 }, /subjectDistanceM/], [{ subjectDistanceM: 0.04 }, /more than the focal length/], [{ focusDistanceM: 0.05 }, /more than the focal length/],
      [{ focusDistanceM: Number.NaN }, /focusDistanceM/], [{ equivalentFocalLengthMm: 50 }, /exactly one/], [{ fit: "contain" }, /unknown field "fit"/],
      [{ chart: { widthM: 0.4, depthM: 1 } }, /Unknown chart field/], [{ sensor: { widthMm: 36 } }, /sensor.heightMm/]
    ];
    for (const [patch, message] of bad) expect(() => calculateChartFraming({ ...base, ...patch } as never)).toThrow(message);
    expect(() => calculateChartFraming(null as never)).toThrow(InvalidConfigurationError);
  });
});
