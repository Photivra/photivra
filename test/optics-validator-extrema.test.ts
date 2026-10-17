// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { calculateIlluminationVignetting } from "../src/optics/illumination-vignetting.js";
import { calculateRadialDistortionMapping } from "../src/optics/radial-distortion.js";

function bruteForceExtrema(
  coefficients: { r2: number; r4: number; r6: number },
  maximumRadius: number
): { minimum: number; maximum: number } {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let i = 0; i <= 20000; i += 1) {
    const s = (maximumRadius * maximumRadius * i) / 20000;
    const t = 1 + coefficients.r2 * s + coefficients.r4 * s * s + coefficients.r6 * s * s * s;
    minimum = Math.min(minimum, t);
    maximum = Math.max(maximum, t);
  }
  return { minimum, maximum };
}

function evaluate(coefficients: { r2: number; r4: number; r6: number }, maximumNormalizedRadius = 1): ReturnType<typeof calculateIlluminationVignetting> {
  return calculateIlluminationVignetting({
    imagePointMm: { x: 0, y: 0 },
    profile: { normalizationRadiusMm: 10, maximumNormalizedRadius, coefficients }
  });
}

describe("illumination-vignetting interior extrema", () => {
  it("rejects a quartic profile whose throughput dips below zero mid-field though both ends are positive", () => {
    // T(s) = 1 - 3 s + 2.1 s²: T(0) = 1, T(1) = 0.1, interior minimum at s = 3 / 4.2 is about -0.071.
    expect(bruteForceExtrema({ r2: -3, r4: 2.1, r6: 0 }, 1).minimum).toBeLessThan(0);
    expect(() => evaluate({ r2: -3, r4: 2.1, r6: 0 })).toThrow(/strictly greater than zero/);
  });

  it("rejects a sextic (r6 != 0) profile with a negative interior minimum", () => {
    const coefficients = { r2: -3, r4: 2.1, r6: 0.01 };
    const brute = bruteForceExtrema(coefficients, 1);
    expect(brute.minimum).toBeLessThan(0);
    expect(1 + coefficients.r2 + coefficients.r4 + coefficients.r6).toBeGreaterThan(0);
    expect(() => evaluate(coefficients)).toThrow(/strictly greater than zero/);
  });

  it("rejects a sextic profile that amplifies above one mid-field", () => {
    const coefficients = { r2: 0.5, r4: -1, r6: -0.1 };
    expect(bruteForceExtrema(coefficients, 1).maximum).toBeGreaterThan(1);
    expect(() => evaluate(coefficients)).toThrow(/must not amplify/);
  });

  it("reports the interior minimum of an accepted sextic profile (critical point s = 1 inside rho <= 1.2)", () => {
    // dT/ds = -1.2 + 1.8 s - 0.6 s² = -0.6 (s - 1)(s - 2): interior minimum T(1) = 0.5 below T(1.44).
    const coefficients = { r2: -1.2, r4: 0.9, r6: -0.2 };
    const result = evaluate(coefficients, 1.2).value;
    const brute = bruteForceExtrema(coefficients, 1.2);
    expect(result.profileMinimumThroughputFactor).toBeCloseTo(0.5, 12);
    expect(result.profileMinimumThroughputFactor).toBeLessThanOrEqual(brute.minimum + 1e-12);
    expect(brute.minimum - result.profileMinimumThroughputFactor).toBeLessThan(1e-6);
    expect(result.profileMaximumThroughputFactor).toBe(1);
  });

  it("matches brute-force extrema over a deterministic grid of accepted and rejected profiles", () => {
    let accepted = 0;
    let rejected = 0;
    for (const r2 of [-1.5, -0.8, -0.3, 0]) {
      for (const r4 of [-0.5, 0, 0.4, 1.1]) {
        for (const r6 of [-0.3, 0, 0.2, 0.6]) {
          const coefficients = { r2, r4, r6 };
          const brute = bruteForceExtrema(coefficients, 1.1);
          const valid = brute.minimum > 1e-9 && brute.maximum <= 1 + 1e-12;
          const clearlyInvalid = brute.minimum < -1e-6 || brute.maximum > 1 + 1e-6;
          if (valid) {
            const result = evaluate(coefficients, 1.1).value;
            expect(Math.abs(result.profileMinimumThroughputFactor - brute.minimum)).toBeLessThan(1e-6);
            accepted += 1;
          } else if (clearlyInvalid) {
            expect(() => evaluate(coefficients, 1.1)).toThrow();
            rejected += 1;
          }
        }
      }
    }
    expect(accepted).toBeGreaterThan(5);
    expect(rejected).toBeGreaterThan(5);
  });
});

describe("radial-distortion degenerate critical roots", () => {
  it("handles a double root of the derivative quadratic (zero discriminant)", () => {
    // 3 k1 + 10 k2 s + 21 k3 s² = 1 - 2 s + s² = (s - 1)²: the radial derivative 1 + s - s² + s³/3
    // has an inflection, not an extremum, at s = 1 and stays >= 1.
    const result = calculateRadialDistortionMapping({
      imagePointMm: { x: 3, y: 4 },
      profile: { normalizationRadiusMm: 10, maximumNormalizedRadius: 1.5, coefficients: { k1: 1 / 3, k2: -0.2, k3: 1 / 21 } }
    });
    expect(result.value.profileMinimumRadialDerivative).toBeCloseTo(1, 12);
  });

  it("handles a pure k3 profile (vanishing linear and constant terms)", () => {
    const result = calculateRadialDistortionMapping({
      imagePointMm: { x: 3, y: 4 },
      profile: { normalizationRadiusMm: 10, maximumNormalizedRadius: 1, coefficients: { k1: 0, k2: 0, k3: -0.1 } }
    });
    expect(result.value.profileMinimumRadialDerivative).toBeCloseTo(1 - 0.7, 12);
    expect(() => calculateRadialDistortionMapping({
      imagePointMm: { x: 3, y: 4 },
      profile: { normalizationRadiusMm: 10, maximumNormalizedRadius: 1, coefficients: { k1: 0, k2: 0, k3: -0.2 } }
    })).toThrow(/monotonic/);
  });

  it("handles a pure k2 profile (linear quadratic, single root at s = 0)", () => {
    const result = calculateRadialDistortionMapping({
      imagePointMm: { x: 3, y: 4 },
      profile: { normalizationRadiusMm: 10, maximumNormalizedRadius: 1, coefficients: { k1: 0, k2: -0.1, k3: 0 } }
    });
    expect(result.value.profileMinimumRadialDerivative).toBeCloseTo(0.5, 12);
  });
});
