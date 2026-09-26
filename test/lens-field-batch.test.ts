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

  it("accepts the frozen Test Fixture barrel limiting corner in batch mode", () => {
    const normalizationRadiusMm = Math.hypot(18, 12);
    const profile: RadialDistortionProfile = {
      normalizationRadiusMm,
      maximumNormalizedRadius: 1.1534673051457625,
      coefficients: { k1: -0.1, k2: 0, k3: 0 }
    };
    const batch = calculateInverseRadialDistortionMappings({
      distortedImagePointsMm: [
        { x: -18, y: 12 },
        { x: 18, y: 12 },
        { x: 18, y: -12 },
        { x: -18, y: -12 }
      ],
      profile
    });

    expect(batch.value.mappings).toHaveLength(4);
    for (const mapping of batch.value.mappings) {
      expect(mapping.sourceNormalizedRadius).toBeCloseTo(
        profile.maximumNormalizedRadius,
        14
      );
      expect(
        Math.hypot(
          mapping.sourceImagePointMm.x,
          mapping.sourceImagePointMm.y
        ) / normalizationRadiusMm
      ).toBeLessThanOrEqual(profile.maximumNormalizedRadius);
    }
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
  it("fails closed on sparse point arrays instead of preserving holes", () => {
    const radialPoints = new Array<LensFieldPointMm>(2);
    radialPoints[0] = { x: 0, y: 0 };

    expect(() =>
      calculateInverseRadialDistortionMappings({
        distortedImagePointsMm: radialPoints,
        profile: RADIAL_PROFILE
      })
    ).toThrow("distortedImagePointsMm[1]");

    const caPoints = new Array<LensFieldPointMm>(2);
    caPoints[0] = { x: 0, y: 0 };

    expect(() =>
      calculateInverseLateralChromaticAberrationMappings({
        distortedImagePointsMm: caPoints,
        profile: CA_PROFILE
      })
    ).toThrow("distortedImagePointsMm[1]");
  });

  it("fails closed with scientific input errors for malformed runtime point shapes", () => {
    expect(() =>
      calculateInverseRadialDistortionMappings({
        distortedImagePointsMm: [
          null as unknown as LensFieldPointMm
        ],
        profile: RADIAL_PROFILE
      })
    ).toThrow("finite numeric x and y");

    expect(() =>
      calculateInverseLateralChromaticAberrationMappings({
        distortedImagePointsMm:
          null as unknown as readonly LensFieldPointMm[],
        profile: CA_PROFILE
      })
    ).toThrow("must be an array");
  });

});
