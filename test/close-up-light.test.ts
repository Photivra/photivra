// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { calculateChartFraming, calculateSubjectDistanceForFraming, calculateThinLensImageDistance, simulateCapture } from "../src/index.js";
import { scaledTimeout } from "./helpers/test-timeout.js";

const fullFrame = { widthMm: 36, heightMm: 24 }, a3 = { widthM: 0.42, heightM: 0.297 };

describe("close-up light factor (2.6): closeUpTransmission and closeUpLossStops", () => {
  it("is 1/(1 + m)² at the focus distance, in stops 2·log2(1 + m)", () => {
    for (const subjectDistanceM of [0.4, 1, 3, 100]) {
      const r = calculateChartFraming({ sensor: fullFrame, focalLengthMm: 50, chart: a3, subjectDistanceM });
      const m = calculateThinLensImageDistance({ focalLengthMm: 50, objectDistanceM: subjectDistanceM }).value.magnification;
      expect(r.closeUpTransmission).toBeCloseTo(1 / (1 + r.magnification) ** 2, 13);
      expect(r.closeUpTransmission).toBe(1 / ((1 + m) * (1 + m)));
      expect(r.closeUpLossStops).toBeCloseTo(-Math.log2(r.closeUpTransmission), 13);
    }
    // Focused elsewhere: the factor follows the focus distance, not the chart plane.
    const refocused = calculateChartFraming({ sensor: fullFrame, focalLengthMm: 50, chart: a3, subjectDistanceM: 1, focusDistanceM: 0.5 });
    expect(refocused.closeUpTransmission).toBe(calculateChartFraming({ sensor: fullFrame, focalLengthMm: 50, chart: a3, subjectDistanceM: 0.5 }).closeUpTransmission);
    // At 0.4 m with 50 mm, m = 1/7: about 0.385 stop darker than at infinity focus.
    expect(calculateChartFraming({ sensor: fullFrame, focalLengthMm: 50, chart: a3, subjectDistanceM: 0.4 }).closeUpLossStops).toBeCloseTo(2 * Math.log2(8 / 7), 12);
  });

  it("calculateSubjectDistanceForFraming reports the same factor as calculateChartFraming at its distance", () => {
    const fit = calculateSubjectDistanceForFraming({ sensor: fullFrame, equivalentFocalLengthMm: 50, chart: a3 });
    const framing = calculateChartFraming({ sensor: fullFrame, focalLengthMm: fit.focalLengthMm, chart: a3, subjectDistanceM: fit.subjectDistanceM });
    expect([fit.closeUpTransmission, fit.closeUpLossStops]).toEqual([framing.closeUpTransmission, framing.closeUpLossStops]);
    expect(fit.closeUpTransmission).toBeCloseTo(1 / (1 + fit.magnification) ** 2, 12);
  });

  it("predicts the RAW signal ratio of simulateCapture between a near and a far uniform chart", async () => {
    const mean = async (subjectDistanceM: number): Promise<number> => {
      const r = await simulateCapture({ scene: { preset: "uniform", reflectance: 0.5 }, subjectDistanceM, output: { width: 24, height: 24 } });
      let sum = 0;
      for (let i = 0; i < r.raw.codes.length; i++) sum += r.raw.codes[i]! - r.raw.blackLevels[i]!;
      expect(Array.from(r.raw.saturationFlags).every((f) => f === 0)).toBe(true);
      return sum / r.raw.codes.length;
    };
    const near = 0.35, far = 50, ratio = (await mean(near)) / (await mean(far));
    const sensor = { widthMm: 26 * 0.006, heightMm: 26 * 0.006 }, chart = { widthM: 0.1 };
    const expected = calculateChartFraming({ sensor, focalLengthMm: 50, chart, subjectDistanceM: near }).closeUpTransmission /
      calculateChartFraming({ sensor, focalLengthMm: 50, chart, subjectDistanceM: far }).closeUpTransmission;
    expect(expected).toBeLessThan(0.75);
    expect(Math.abs(ratio / expected - 1)).toBeLessThan(0.005);
  }, scaledTimeout(60_000));
});
