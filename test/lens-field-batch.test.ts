import { describe, expect, it } from "vitest";

import {
  calculateInverseLateralChromaticAberrationMapping,
  calculateInverseLateralChromaticAberrationMappings,
  calculateInverseRadialDistortionMapping,
  calculateInverseRadialDistortionMappings,
  type LateralChromaticAberrationProfile,
  type LensFieldPointMm,
  type RadialDistortionProfile
} from "../src/index.js";

const POINTS: readonly LensFieldPointMm[] = [
  { x: 0, y: 0 },
  { x: 3.5, y: -2.25 },
  { x: -8, y: 6 },
  { x: 14, y: 8 }
];

const RADIAL_PROFILE: RadialDistortionProfile = {
  normalizationRadiusMm: 21.633307652783937,
  maximumNormalizedRadius: 1,
  coefficients: { k1: 0.06, k2: -0.01, k3: 0.002 }
};

const CA_PROFILE: LateralChromaticAberrationProfile = {
  normalizationRadiusMm: 21.633307652783937,
  maximumNormalizedRadius: 1,
  baseDistortionCoefficients: { k1: 0.05, k2: -0.008, k3: 0.001 },
  redCoefficientOffset: { k1: 0.01, k2: 0, k3: 0 },
  blueCoefficientOffset: { k1: -0.01, k2: 0, k3: 0 }
};

describe("batch inverse lens-field mappings", () => {
  it("matches scalar inverse radial distortion point-for-point", () => {
    const batch = calculateInverseRadialDistortionMappings({
      distortedImagePointsMm: POINTS,
      profile: RADIAL_PROFILE
    });

    expect(batch.value.pointCount).toBe(POINTS.length);
    expect(batch.value.mappings).toHaveLength(POINTS.length);
    expect(batch.provenance.kind).toBe("approximation");

    POINTS.forEach((point, index) => {
      const scalar = calculateInverseRadialDistortionMapping({
        distortedImagePointMm: point,
        profile: RADIAL_PROFILE
      });
      const actual = batch.value.mappings[index];
      expect(actual).toBeDefined();
      expect(actual!.sourceImagePointMm.x).toBeCloseTo(
        scalar.value.sourceImagePointMm.x,
        14
      );
      expect(actual!.sourceImagePointMm.y).toBeCloseTo(
        scalar.value.sourceImagePointMm.y,
        14
      );
      expect(actual!.sourceNormalizedRadius).toBeCloseTo(
        scalar.value.sourceNormalizedRadius,
        14
      );
      expect(actual!.radialScaleAtSource).toBeCloseTo(
        scalar.value.radialScaleAtSource,
        14
      );
    });
  });

  it("matches scalar inverse lateral CA point-for-point and channel-for-channel", () => {
    const batch = calculateInverseLateralChromaticAberrationMappings({
      distortedImagePointsMm: POINTS,
      profile: CA_PROFILE
    });

    expect(batch.value.pointCount).toBe(POINTS.length);
    expect(batch.value.mappings).toHaveLength(POINTS.length);
    expect(batch.value.referenceChannel).toBe("green");

    POINTS.forEach((point, index) => {
      const scalar = calculateInverseLateralChromaticAberrationMapping({
        distortedImagePointMm: point,
        profile: CA_PROFILE
      });
      const actual = batch.value.mappings[index];
      expect(actual).toBeDefined();

      for (const channel of ["red", "green", "blue"] as const) {
        expect(actual!.channels[channel].sourceImagePointMm.x).toBeCloseTo(
          scalar.value.channels[channel].sourceImagePointMm.x,
          14
        );
        expect(actual!.channels[channel].sourceImagePointMm.y).toBeCloseTo(
          scalar.value.channels[channel].sourceImagePointMm.y,
          14
        );
        expect(actual!.channels[channel].radialScaleAtSource).toBeCloseTo(
          scalar.value.channels[channel].radialScaleAtSource,
          14
        );
      }

      expect(actual!.sourceSeparation.maximumPairDistanceMm).toBeCloseTo(
        scalar.value.sourceSeparation.maximumPairDistanceMm,
        14
      );
    });
  });

  it("copies caller points into batch results", () => {
    const points = [{ x: 4, y: 2 }];
    const batch = calculateInverseRadialDistortionMappings({
      distortedImagePointsMm: points,
      profile: RADIAL_PROFILE
    });

    points[0]!.x = 999;
    expect(batch.value.mappings[0]!.distortedImagePointMm).toEqual({
      x: 4,
      y: 2
    });
  });

  it("validates profiles even for an empty batch", () => {
    expect(() =>
      calculateInverseRadialDistortionMappings({
        distortedImagePointsMm: [],
        profile: {
          ...RADIAL_PROFILE,
          coefficients: { k1: -1, k2: 0, k3: 0 }
        }
      })
    ).toThrow("strictly monotonic");
  });

  it("keeps channel-specific failure context in batch CA", () => {
    expect(() =>
      calculateInverseLateralChromaticAberrationMappings({
        distortedImagePointsMm: [{ x: 2, y: 0 }],
        profile: {
          normalizationRadiusMm: 20,
          maximumNormalizedRadius: 1,
          baseDistortionCoefficients: { k1: 0, k2: 0, k3: 0 },
          redCoefficientOffset: { k1: 0, k2: 0, k3: 0 },
          blueCoefficientOffset: { k1: -1, k2: 0, k3: 0 }
        }
      })
    ).toThrow("blue channel");
  });

  it("reports the failing batch point index when a destination leaves the mapped envelope", () => {
    expect(() =>
      calculateInverseRadialDistortionMappings({
        distortedImagePointsMm: [
          { x: 0, y: 0 },
          { x: 50, y: 0 }
        ],
        profile: RADIAL_PROFILE
      })
    ).toThrow("distortedImagePointsMm[1]");
  });
});
