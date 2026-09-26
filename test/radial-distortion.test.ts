import { describe, expect, it } from "vitest";

import {
  calculateInverseRadialDistortionMapping,
  calculateRadialDistortionMapping,
  type RadialDistortionProfile
} from "../src/optics/radial-distortion.js";

const IDENTITY_PROFILE: RadialDistortionProfile = {
  normalizationRadiusMm: 20,
  maximumNormalizedRadius: 1,
  coefficients: {
    k1: 0,
    k2: 0,
    k3: 0
  }
};

describe("generic radial distortion mapping", () => {
  it("is exact identity when all coefficients are zero", () => {
    const forward = calculateRadialDistortionMapping({
      imagePointMm: { x: 12, y: -5 },
      profile: IDENTITY_PROFILE
    });
    const inverse = calculateInverseRadialDistortionMapping({
      distortedImagePointMm: { x: 12, y: -5 },
      profile: IDENTITY_PROFILE
    });

    expect(forward.value.mappedImagePointMm).toEqual({ x: 12, y: -5 });
    expect(forward.value.radialScale).toBe(1);
    expect(forward.value.deltaMm).toEqual({
      x: 0,
      y: 0,
      distance: 0
    });

    expect(inverse.value.sourceImagePointMm.x).toBeCloseTo(12, 12);
    expect(inverse.value.sourceImagePointMm.y).toBeCloseTo(-5, 12);
    expect(inverse.value.radialScaleAtSource).toBeCloseTo(1, 12);
  });

  it("models generic pincushion behavior with positive radial expansion", () => {
    const result = calculateRadialDistortionMapping({
      imagePointMm: { x: 16, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        coefficients: {
          k1: 0.1,
          k2: 0,
          k3: 0
        }
      }
    });

    expect(result.value.sourceNormalizedRadius).toBeCloseTo(0.8, 12);
    expect(result.value.radialScale).toBeCloseTo(1 + 0.1 * 0.8 ** 2, 12);
    expect(result.value.mappedImagePointMm.x).toBeGreaterThan(16);
    expect(result.value.deltaMm.x).toBeGreaterThan(0);
    expect(result.provenance.kind).toBe("approximation");
  });

  it("models generic barrel behavior with negative radial contraction", () => {
    const result = calculateRadialDistortionMapping({
      imagePointMm: { x: 16, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        coefficients: {
          k1: -0.1,
          k2: 0,
          k3: 0
        }
      }
    });

    expect(result.value.radialScale).toBeLessThan(1);
    expect(result.value.mappedImagePointMm.x).toBeLessThan(16);
    expect(result.value.deltaMm.x).toBeLessThan(0);
  });

  it("can represent a generic mustache-style radial scale reversal", () => {
    const profile: RadialDistortionProfile = {
      normalizationRadiusMm: 20,
      maximumNormalizedRadius: 1,
      coefficients: {
        k1: 0.1,
        k2: -0.15,
        k3: 0
      }
    };

    const inner = calculateRadialDistortionMapping({
      imagePointMm: { x: 10, y: 0 },
      profile
    });
    const outer = calculateRadialDistortionMapping({
      imagePointMm: { x: 20, y: 0 },
      profile
    });

    expect(inner.value.sourceNormalizedRadius).toBeCloseTo(0.5, 12);
    expect(inner.value.radialScale).toBeGreaterThan(1);
    expect(outer.value.sourceNormalizedRadius).toBeCloseTo(1, 12);
    expect(outer.value.radialScale).toBeLessThan(1);
    expect(outer.value.profileMinimumRadialDerivative).toBeGreaterThan(0);
  });

  it("preserves polar angle because this slice is radial-only", () => {
    const source = { x: 9, y: 12 };
    const result = calculateRadialDistortionMapping({
      imagePointMm: source,
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        coefficients: {
          k1: 0.08,
          k2: -0.02,
          k3: 0.01
        }
      }
    });

    expect(
      Math.atan2(
        result.value.mappedImagePointMm.y,
        result.value.mappedImagePointMm.x
      )
    ).toBeCloseTo(Math.atan2(source.y, source.x), 12);
  });

  it("uses the declared physical normalization radius rather than raw millimetres as coefficient input", () => {
    const coefficients = {
      k1: 0.1,
      k2: -0.02,
      k3: 0.005
    } as const;

    const first = calculateRadialDistortionMapping({
      imagePointMm: { x: 10, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        coefficients
      }
    });
    const second = calculateRadialDistortionMapping({
      imagePointMm: { x: 20, y: 0 },
      profile: {
        normalizationRadiusMm: 40,
        maximumNormalizedRadius: 1,
        coefficients
      }
    });

    expect(first.value.sourceNormalizedRadius).toBeCloseTo(0.5, 12);
    expect(second.value.sourceNormalizedRadius).toBeCloseTo(0.5, 12);
    expect(second.value.radialScale).toBeCloseTo(first.value.radialScale, 12);
    expect(second.value.mappedImagePointMm.x).toBeCloseTo(
      first.value.mappedImagePointMm.x * 2,
      12
    );
  });

  it("round-trips forward mapping through the deterministic inverse", () => {
    const profile: RadialDistortionProfile = {
      normalizationRadiusMm: 21.6333076528,
      maximumNormalizedRadius: 1,
      coefficients: {
        k1: -0.08,
        k2: 0.025,
        k3: -0.004
      }
    };
    const source = { x: 14.2, y: -8.4 };

    const forward = calculateRadialDistortionMapping({
      imagePointMm: source,
      profile
    });
    const inverse = calculateInverseRadialDistortionMapping({
      distortedImagePointMm: forward.value.mappedImagePointMm,
      profile
    });

    expect(inverse.value.sourceImagePointMm.x).toBeCloseTo(source.x, 11);
    expect(inverse.value.sourceImagePointMm.y).toBeCloseTo(source.y, 11);
    expect(inverse.value.sourceNormalizedRadius).toBeCloseTo(
      forward.value.sourceNormalizedRadius,
      12
    );
  });

  it("maps the optical-axis center to itself in both directions", () => {
    const profile: RadialDistortionProfile = {
      normalizationRadiusMm: 20,
      maximumNormalizedRadius: 1,
      coefficients: {
        k1: -0.1,
        k2: 0.03,
        k3: 0
      }
    };

    const forward = calculateRadialDistortionMapping({
      imagePointMm: { x: 0, y: 0 },
      profile
    });
    const inverse = calculateInverseRadialDistortionMapping({
      distortedImagePointMm: { x: 0, y: 0 },
      profile
    });

    expect(forward.value.mappedImagePointMm).toEqual({ x: 0, y: 0 });
    expect(forward.value.radialScale).toBe(1);
    expect(inverse.value.sourceImagePointMm).toEqual({ x: 0, y: 0 });
    expect(inverse.value.sourceNormalizedRadius).toBe(0);
  });

  it("fails closed when the declared profile is not one-to-one over its operating radius", () => {
    const profile: RadialDistortionProfile = {
      normalizationRadiusMm: 20,
      maximumNormalizedRadius: 1,
      coefficients: {
        k1: -1,
        k2: 0,
        k3: 0
      }
    };

    expect(() =>
      calculateRadialDistortionMapping({
        imagePointMm: { x: 5, y: 0 },
        profile
      })
    ).toThrow("strictly monotonic");

    expect(() =>
      calculateInverseRadialDistortionMapping({
        distortedImagePointMm: { x: 5, y: 0 },
        profile
      })
    ).toThrow("strictly monotonic");
  });

  it("accepts only floating-point-scale overshoot at the mapped inverse boundary", () => {
    const normalizationRadiusMm = Math.hypot(18, 12);
    const profile: RadialDistortionProfile = {
      normalizationRadiusMm,
      maximumNormalizedRadius: 1.1534673051457625,
      coefficients: {
        k1: -0.1,
        k2: 0,
        k3: 0
      }
    };

    const limitingCorner = calculateInverseRadialDistortionMapping({
      distortedImagePointMm: { x: 18, y: 12 },
      profile
    });

    expect(limitingCorner.value.distortedNormalizedRadius).toBeCloseTo(1, 15);
    expect(limitingCorner.value.sourceNormalizedRadius).toBeCloseTo(
      profile.maximumNormalizedRadius,
      14
    );
    expect(
      Math.hypot(
        limitingCorner.value.sourceImagePointMm.x,
        limitingCorner.value.sourceImagePointMm.y
      ) / normalizationRadiusMm
    ).toBeLessThanOrEqual(profile.maximumNormalizedRadius);

    expect(() =>
      calculateInverseRadialDistortionMapping({
        distortedImagePointMm: { x: 18.000000001, y: 12 },
        profile
      })
    ).toThrow("outside the mapped radial distortion profile");
  });

  it("fails closed outside the declared forward and inverse operating envelope", () => {
    const profile: RadialDistortionProfile = {
      normalizationRadiusMm: 20,
      maximumNormalizedRadius: 0.8,
      coefficients: {
        k1: 0.1,
        k2: 0,
        k3: 0
      }
    };

    expect(() =>
      calculateRadialDistortionMapping({
        imagePointMm: { x: 17, y: 0 },
        profile
      })
    ).toThrow("outside the radial distortion profile");

    const mappedBoundary = calculateRadialDistortionMapping({
      imagePointMm: { x: 16, y: 0 },
      profile
    }).value.mappedImagePointMm.x;

    expect(() =>
      calculateInverseRadialDistortionMapping({
        distortedImagePointMm: { x: mappedBoundary + 0.01, y: 0 },
        profile
      })
    ).toThrow("outside the mapped radial distortion profile");
  });

  it("rejects invalid profile coefficients and normalization geometry", () => {
    expect(() =>
      calculateRadialDistortionMapping({
        imagePointMm: { x: 1, y: 0 },
        profile: {
          normalizationRadiusMm: 0,
          maximumNormalizedRadius: 1,
          coefficients: {
            k1: 0,
            k2: 0,
            k3: 0
          }
        }
      })
    ).toThrow("normalizationRadiusMm");

    expect(() =>
      calculateRadialDistortionMapping({
        imagePointMm: { x: 1, y: 0 },
        profile: {
          normalizationRadiusMm: 20,
          maximumNormalizedRadius: 1,
          coefficients: {
            k1: Number.NaN,
            k2: 0,
            k3: 0
          }
        }
      })
    ).toThrow("coefficients.k1");
  });
});
