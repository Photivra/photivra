// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  calculateAiryDisk,
  calculateDefocusCircle,
  calculateDepthOfField,
  InvalidScientificInputError
} from "../src/index.js";

describe("optics foundation", () => {
  it("calculates the first-zero Airy diameter for 550 nm at f/8", () => {
    const result = calculateAiryDisk({
      wavelengthNm: 550,
      aperture: 8
    });

    expect(result.value.firstZeroDiameterMicrometers).toBeCloseTo(10.736, 12);
  });

  it("calculates exact thin-lens depth-of-field limits", () => {
    const result = calculateDepthOfField({
      focalLengthMm: 50,
      aperture: 8,
      focusDistanceM: 5,
      circleOfConfusionMm: 0.03
    });

    // Independent derivation (millimetres), f = 50, N = 8, c = 0.03, s = 5000:
    //   H - f = f^2 / (N c) = 2500 / 0.24 = 31250 / 3
    //   H     = 31250 / 3 + 50 = 31400 / 3 = 10466.666... -> 10.4666... m
    // Solving f^2 |s - d| / (N d (s - f)) = c for d:
    //   near = s (H - f) / ((H - f) + (s - f))
    //        = 5000 (31250/3) / (31250/3 + 4950)
    //        = 156250000 / 46100 = 1562500 / 461 = 3389.370932754881... mm
    //   far  = s (H - f) / ((H - f) - (s - f))
    //        = 156250000 / 16400 = 390625 / 41 = 9527.439024390244... mm
    expect(result.value.hyperfocalDistanceM).toBeCloseTo(31.4 / 3, 12);
    expect(result.value.nearLimitM).toBeCloseTo(1562.5 / 461, 12);
    expect(result.value.farLimitM).toBeCloseTo(390.625 / 41, 12);
    expect(result.value.totalDepthOfFieldM).toBeCloseTo(
      390.625 / 41 - 1562.5 / 461,
      12
    );
  });

  it("places the geometric defocus circle exactly at c on both DOF limits", () => {
    let checked = 0;
    for (const focalLengthMm of [8, 24, 50, 135, 400]) {
      for (const aperture of [1.4, 2.8, 8, 22]) {
        for (const circleOfConfusionMm of [0.005, 0.015, 0.03, 0.06]) {
          const hyperfocalM =
            (focalLengthMm * focalLengthMm) /
              (aperture * circleOfConfusionMm) /
              1000 +
            focalLengthMm / 1000;
          for (const fraction of [0.002, 0.05, 0.3, 0.75, 0.999]) {
            const focusDistanceM = Math.max(
              hyperfocalM * fraction,
              (focalLengthMm / 1000) * 1.5
            );
            if (focusDistanceM >= hyperfocalM) continue;
            const dof = calculateDepthOfField({
              focalLengthMm,
              aperture,
              focusDistanceM,
              circleOfConfusionMm
            }).value;
            const blurAt = (subjectDistanceM: number): number =>
              calculateDefocusCircle({
                focalLengthMm,
                aperture,
                focusDistanceM,
                subjectDistanceM
              }).value.diameterMm;

            expect(dof.nearLimitM).toBeLessThan(focusDistanceM);
            expect(dof.farLimitM).not.toBeNull();
            expect(dof.farLimitM!).toBeGreaterThan(focusDistanceM);
            expect(
              Math.abs(blurAt(dof.nearLimitM) / circleOfConfusionMm - 1)
            ).toBeLessThan(1e-9);
            expect(
              Math.abs(blurAt(dof.farLimitM!) / circleOfConfusionMm - 1)
            ).toBeLessThan(1e-9);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("returns an infinite far limit at and beyond the hyperfocal distance", () => {
    const input = {
      focalLengthMm: 50,
      aperture: 8,
      circleOfConfusionMm: 0.03
    };
    const hyperfocalDistanceM = calculateDepthOfField({
      ...input,
      focusDistanceM: 5
    }).value.hyperfocalDistanceM;

    for (const focusDistanceM of [
      hyperfocalDistanceM,
      hyperfocalDistanceM + 0.025,
      hyperfocalDistanceM * 3
    ]) {
      const dof = calculateDepthOfField({ ...input, focusDistanceM }).value;
      expect(dof.farLimitM).toBeNull();
      expect(dof.totalDepthOfFieldM).toBeNull();
    }

    // Focused at H, the near limit is H/2 exactly:
    // s(H - f)/(H + s - 2f) with s = H gives H(H - f)/(2(H - f)) = H/2.
    const atHyperfocal = calculateDepthOfField({
      ...input,
      focusDistanceM: hyperfocalDistanceM
    }).value;
    expect(atHyperfocal.nearLimitM).toBeCloseTo(hyperfocalDistanceM / 2, 12);

    // The defocus circle of a very distant subject approaches c at s = H:
    // the limit d -> infinity of f^2 (d - s) / (N d (s - f)) is f^2/(N(s - f)) = c.
    const farBlur = calculateDefocusCircle({
      focalLengthMm: input.focalLengthMm,
      aperture: input.aperture,
      focusDistanceM: hyperfocalDistanceM,
      subjectDistanceM: 1e12
    }).value.diameterMm;
    expect(Math.abs(farBlur / input.circleOfConfusionMm - 1)).toBeLessThan(1e-9);
  });

  it("produces zero geometric defocus on the focus plane", () => {
    const result = calculateDefocusCircle({
      focalLengthMm: 200,
      aperture: 2.8,
      focusDistanceM: 10,
      subjectDistanceM: 10
    });

    expect(result.value.diameterMm).toBeCloseTo(0, 12);
  });

  it("rejects a circle of confusion at or above the aperture diameter f/N (numeric review #6)", () => {
    const input = { focalLengthMm: 50, aperture: 1.4, focusDistanceM: 3 };
    expect(() => calculateDepthOfField({ ...input, circleOfConfusionMm: 40 })).toThrow(/smaller than the aperture diameter/);
    expect(() => calculateDepthOfField({ ...input, circleOfConfusionMm: 50 / 1.4 })).toThrow(/smaller than the aperture diameter/);
    const justBelow = calculateDepthOfField({ ...input, circleOfConfusionMm: 35 }).value;
    expect(justBelow.nearLimitM * 1000).toBeGreaterThan(input.focalLengthMm);
  });

  it("evaluates defocus with the stable closed form f^2|s-d|/(N d (s-f)) at extreme distances", () => {
    // Exact rational oracle with integer millimetre inputs: c = f^2 |s - d| / (N d (s - f)).
    const exact = (f: bigint, n: bigint, s: bigint, d: bigint): number => {
      const numerator = f * f * (s > d ? s - d : d - s) * 10n ** 30n;
      return Number(numerator / (n * d * (s - f))) / 1e30;
    };
    for (const [subjectDistanceM, focusDistanceM] of [[1e9, 5], [5, 1e9], [1e6, 1e6 + 1], [0.3, 1e12]] as const) {
      const value = calculateDefocusCircle({ focalLengthMm: 50, aperture: 4, focusDistanceM, subjectDistanceM }).value.diameterMm;
      const oracle = exact(50n, 4n, BigInt(focusDistanceM * 1000), BigInt(subjectDistanceM * 1000));
      expect(Math.abs(value - oracle) / oracle).toBeLessThan(1e-14);
    }
    expect(calculateDefocusCircle({ focalLengthMm: 50, aperture: 4, focusDistanceM: 5, subjectDistanceM: 3 }).provenance.modelVersion).toBe("1.1.0");
  });

  it("rejects unknown fields on scalar calculators instead of ignoring them (API review #4)", () => {
    expect(() => calculateDepthOfField({ focalLengthMm: 50, aperture: 4, focusDistanceM: 3, circleOfConfusionMm: 0.03,
      focusDistanceMm: 3000 } as never)).toThrow('calculateDepthOfField input has unknown field "focusDistanceMm".');
    expect(() => calculateDefocusCircle({ focalLengthMm: 50, aperture: 4, focusDistanceM: 3, subjectDistanceM: 5,
      circleOfConfusionMm: 0.03 } as never)).toThrow(/unknown field "circleOfConfusionMm"/);
    expect(() => calculateAiryDisk({ aperture: 8, wavelengthNm: 550, wavelengthNanometers: 550 } as never)).toThrow(/unknown field/);
    expect(() => calculateDepthOfField(null as never)).toThrow("calculateDepthOfField input must be an object.");
  });
});

describe("depth-of-field focus-plane validation", () => {
  const base = { focalLengthMm: 50, aperture: 8, circleOfConfusionMm: 0.03 };
  // A real image needs s > f (thin lens 1/v = 1/f - 1/s); s = f puts the image at infinity.
  it.each([0.05, 0.03, 0.0499999])("rejects focus distance %f m at or inside a 50 mm focal length", (focusDistanceM) => {
    expect(() => calculateDepthOfField({ ...base, focusDistanceM })).toThrow(InvalidScientificInputError);
    expect(() => calculateDepthOfField({ ...base, focusDistanceM })).toThrow("beyond the focal length");
  });

  it("accepts a focus plane just beyond the focal length with finite limits around it", () => {
    // s = 50.5 mm: near = s(H-f)/(H+s-2f) and far = s(H-f)/(H-s), both within 0.01 mm of s here.
    const s = 50.5, hMinusF = 50 * 50 / (8 * 0.03), h = hMinusF + 50;
    const dof = calculateDepthOfField({ ...base, focusDistanceM: s / 1000 }).value;
    expect(dof.nearLimitM).toBeCloseTo(s * hMinusF / (h + s - 100) / 1000, 12);
    expect(dof.farLimitM).toBeCloseTo(s * hMinusF / (h - s) / 1000, 12);
  });
});
