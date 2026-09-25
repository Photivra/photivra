import { describe, expect, it } from "vitest";

import {
  calculateInverseLateralChromaticAberrationMapping,
  calculateLateralChromaticAberrationMapping,
  type LateralChromaticAberrationProfile
} from "../src/optics/lateral-chromatic-aberration.js";
import { calculateRadialDistortionMapping } from "../src/optics/radial-distortion.js";

const ZERO = { k1: 0, k2: 0, k3: 0 } as const;

const NEUTRAL_PROFILE: LateralChromaticAberrationProfile = {
  normalizationRadiusMm: 20,
  maximumNormalizedRadius: 1,
  baseDistortionCoefficients: {
    k1: -0.05,
    k2: 0.01,
    k3: 0
  },
  redCoefficientOffset: ZERO,
  blueCoefficientOffset: ZERO
};

describe("green-reference lateral chromatic aberration mapping", () => {
  it("produces zero channel separation when red/blue offsets are zero", () => {
    const result = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 14, y: 7 },
      profile: NEUTRAL_PROFILE
    });

    expect(result.value.referenceChannel).toBe("green");
    expect(result.value.separation.maximumPairDistanceMm).toBe(0);
    expect(result.value.channels.red.mappedImagePointMm).toEqual(
      result.value.channels.green.mappedImagePointMm
    );
    expect(result.value.channels.blue.mappedImagePointMm).toEqual(
      result.value.channels.green.mappedImagePointMm
    );
  });

  it("matches the standalone base distortion exactly when offsets are zero", () => {
    const source = { x: 14, y: -6 };
    const ca = calculateLateralChromaticAberrationMapping({
      imagePointMm: source,
      profile: NEUTRAL_PROFILE
    });
    const base = calculateRadialDistortionMapping({
      imagePointMm: source,
      profile: {
        normalizationRadiusMm: NEUTRAL_PROFILE.normalizationRadiusMm,
        maximumNormalizedRadius: NEUTRAL_PROFILE.maximumNormalizedRadius,
        coefficients: NEUTRAL_PROFILE.baseDistortionCoefficients
      }
    });

    for (const channel of ["red", "green", "blue"] as const) {
      expect(ca.value.channels[channel].mappedImagePointMm).toEqual(
        base.value.mappedImagePointMm
      );
      expect(ca.value.channels[channel].radialScale).toBeCloseTo(
        base.value.radialScale,
        12
      );
    }
  });

  it("separates red and blue around the green-reference field mapping", () => {
    const result = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 16, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        baseDistortionCoefficients: {
          k1: -0.03,
          k2: 0,
          k3: 0
        },
        redCoefficientOffset: {
          k1: 0.04,
          k2: 0,
          k3: 0
        },
        blueCoefficientOffset: {
          k1: -0.04,
          k2: 0,
          k3: 0
        }
      }
    });

    expect(result.value.channels.red.radialScale).toBeGreaterThan(
      result.value.channels.green.radialScale
    );
    expect(result.value.channels.blue.radialScale).toBeLessThan(
      result.value.channels.green.radialScale
    );
    expect(result.value.separation.redGreen.x).toBeGreaterThan(0);
    expect(result.value.separation.blueGreen.x).toBeLessThan(0);
    expect(result.value.separation.redBlue.distance).toBeGreaterThan(
      result.value.separation.redGreen.distance
    );
    expect(result.provenance.kind).toBe("approximation");
  });

  it("keeps all channels coincident on the optical axis", () => {
    const result = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 0, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        baseDistortionCoefficients: {
          k1: -0.1,
          k2: 0.03,
          k3: 0
        },
        redCoefficientOffset: {
          k1: 0.08,
          k2: -0.01,
          k3: 0
        },
        blueCoefficientOffset: {
          k1: -0.08,
          k2: 0.01,
          k3: 0
        }
      }
    });

    expect(result.value.channels.red.mappedImagePointMm).toEqual({
      x: 0,
      y: 0
    });
    expect(result.value.channels.green.mappedImagePointMm).toEqual({
      x: 0,
      y: 0
    });
    expect(result.value.channels.blue.mappedImagePointMm).toEqual({
      x: 0,
      y: 0
    });
    expect(result.value.separation.maximumPairDistanceMm).toBe(0);
  });

  it("preserves radial direction within each representative channel", () => {
    const source = { x: 9, y: 12 };
    const result = calculateLateralChromaticAberrationMapping({
      imagePointMm: source,
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        baseDistortionCoefficients: {
          k1: 0.01,
          k2: 0,
          k3: 0
        },
        redCoefficientOffset: {
          k1: 0.03,
          k2: 0,
          k3: 0
        },
        blueCoefficientOffset: {
          k1: -0.04,
          k2: 0,
          k3: 0
        }
      }
    });

    const angle = Math.atan2(source.y, source.x);
    for (const channel of ["red", "green", "blue"] as const) {
      const mapped = result.value.channels[channel].mappedImagePointMm;
      expect(Math.atan2(mapped.y, mapped.x)).toBeCloseTo(angle, 12);
    }
  });

  it("reports the combined coefficients used for every channel", () => {
    const result = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 5, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        baseDistortionCoefficients: {
          k1: -0.05,
          k2: 0.01,
          k3: 0.002
        },
        redCoefficientOffset: {
          k1: 0.01,
          k2: -0.002,
          k3: 0
        },
        blueCoefficientOffset: {
          k1: -0.015,
          k2: 0.003,
          k3: -0.001
        }
      }
    });

    expect(result.value.channels.green.combinedCoefficients).toEqual({
      k1: -0.05,
      k2: 0.01,
      k3: 0.002
    });
    expect(result.value.channels.red.combinedCoefficients).toEqual({
      k1: -0.04,
      k2: 0.008,
      k3: 0.002
    });
    expect(result.value.channels.blue.combinedCoefficients).toEqual({
      k1: -0.065,
      k2: 0.013,
      k3: 0.001
    });
  });

  it("round-trips each representative channel through the shared composite inverse API", () => {
    const profile: LateralChromaticAberrationProfile = {
      normalizationRadiusMm: 21,
      maximumNormalizedRadius: 1,
      baseDistortionCoefficients: {
        k1: -0.06,
        k2: 0.018,
        k3: 0
      },
      redCoefficientOffset: {
        k1: 0.02,
        k2: -0.006,
        k3: 0
      },
      blueCoefficientOffset: {
        k1: -0.02,
        k2: 0.006,
        k3: 0
      }
    };
    const source = { x: 13.25, y: -7.5 };
    const forward = calculateLateralChromaticAberrationMapping({
      imagePointMm: source,
      profile
    });

    for (const channel of ["red", "green", "blue"] as const) {
      const inverse = calculateInverseLateralChromaticAberrationMapping({
        distortedImagePointMm:
          forward.value.channels[channel].mappedImagePointMm,
        profile
      });

      expect(inverse.value.channels[channel].sourceImagePointMm.x).toBeCloseTo(
        source.x,
        11
      );
      expect(inverse.value.channels[channel].sourceImagePointMm.y).toBeCloseTo(
        source.y,
        11
      );
    }
  });

  it("returns different per-channel ideal source coordinates for one distorted destination", () => {
    const inverse = calculateInverseLateralChromaticAberrationMapping({
      distortedImagePointMm: { x: 15, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        baseDistortionCoefficients: ZERO,
        redCoefficientOffset: {
          k1: 0.05,
          k2: 0,
          k3: 0
        },
        blueCoefficientOffset: {
          k1: -0.05,
          k2: 0,
          k3: 0
        }
      }
    });

    expect(inverse.value.channels.red.sourceImagePointMm.x).toBeLessThan(15);
    expect(inverse.value.channels.green.sourceImagePointMm.x).toBeCloseTo(
      15,
      12
    );
    expect(inverse.value.channels.blue.sourceImagePointMm.x).toBeGreaterThan(
      15
    );
    expect(inverse.value.sourceSeparation.maximumPairDistanceMm).toBeGreaterThan(
      0
    );
  });

  it("scales physical separation with the shared normalization radius at equal normalized position", () => {
    const coefficients = {
      baseDistortionCoefficients: ZERO,
      redCoefficientOffset: {
        k1: 0.04,
        k2: 0,
        k3: 0
      },
      blueCoefficientOffset: {
        k1: -0.04,
        k2: 0,
        k3: 0
      }
    } as const;

    const first = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 10, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        ...coefficients
      }
    });
    const second = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 20, y: 0 },
      profile: {
        normalizationRadiusMm: 40,
        maximumNormalizedRadius: 1,
        ...coefficients
      }
    });

    expect(second.value.separation.redBlue.distance).toBeCloseTo(
      first.value.separation.redBlue.distance * 2,
      12
    );
  });

  it("fails closed with channel-specific context if a combined channel profile is not invertible", () => {
    expect(() =>
      calculateLateralChromaticAberrationMapping({
        imagePointMm: { x: 5, y: 0 },
        profile: {
          normalizationRadiusMm: 20,
          maximumNormalizedRadius: 1,
          baseDistortionCoefficients: ZERO,
          redCoefficientOffset: ZERO,
          blueCoefficientOffset: {
            k1: -1,
            k2: 0,
            k3: 0
          }
        }
      })
    ).toThrow("blue channel");
  });

  it("rejects non-finite channel offsets before composing profiles", () => {
    expect(() =>
      calculateLateralChromaticAberrationMapping({
        imagePointMm: { x: 5, y: 0 },
        profile: {
          normalizationRadiusMm: 20,
          maximumNormalizedRadius: 1,
          baseDistortionCoefficients: ZERO,
          redCoefficientOffset: {
            k1: Number.NaN,
            k2: 0,
            k3: 0
          },
          blueCoefficientOffset: ZERO
        }
      })
    ).toThrow("redCoefficientOffset.k1");
  });

  it("documents that RGB channels are representative mappings rather than spectral/CFA calibration", () => {
    const result = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 10, y: 0 },
      profile: NEUTRAL_PROFILE
    });

    const assumptions = result.provenance.assumptions?.join(" ") ?? "";
    expect(assumptions).toContain("representative rendering channels");
    expect(assumptions).toContain("not calibrated wavelengths");
    expect(assumptions).toContain("does not blur");
    expect(assumptions).toContain("Longitudinal");
  });
});
