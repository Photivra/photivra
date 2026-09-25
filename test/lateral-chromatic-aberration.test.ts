import { describe, expect, it } from "vitest";

import {
  calculateInverseLateralChromaticAberrationMapping,
  calculateLateralChromaticAberrationMapping,
  type LateralChromaticAberrationChannel,
  type LateralChromaticAberrationProfile
} from "../src/optics/lateral-chromatic-aberration.js";

const CHANNELS = ["red", "green", "blue"] as const satisfies readonly LateralChromaticAberrationChannel[];

const NEUTRAL_PROFILE: LateralChromaticAberrationProfile = {
  normalizationRadiusMm: 20,
  maximumNormalizedRadius: 1,
  channelCoefficients: {
    red: { k1: -0.05, k2: 0.01, k3: 0 },
    green: { k1: -0.05, k2: 0.01, k3: 0 },
    blue: { k1: -0.05, k2: 0.01, k3: 0 }
  }
};

describe("generic lateral chromatic aberration mapping", () => {
  it("produces zero channel separation when all channel profiles are identical", () => {
    const result = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 14, y: 7 },
      profile: NEUTRAL_PROFILE
    });

    expect(result.value.pairwiseSeparationMm).toEqual({
      redGreen: 0,
      blueGreen: 0,
      redBlue: 0,
      maximum: 0
    });
    expect(result.value.channels.red.mappedImagePointMm).toEqual(
      result.value.channels.green.mappedImagePointMm
    );
    expect(result.value.channels.blue.mappedImagePointMm).toEqual(
      result.value.channels.green.mappedImagePointMm
    );
  });

  it("separates channels through field mapping rather than blur", () => {
    const result = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 16, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        channelCoefficients: {
          red: { k1: 0.04, k2: 0, k3: 0 },
          green: { k1: 0, k2: 0, k3: 0 },
          blue: { k1: -0.04, k2: 0, k3: 0 }
        }
      }
    });

    expect(result.value.channels.red.mappedImagePointMm.x).toBeGreaterThan(16);
    expect(result.value.channels.green.mappedImagePointMm.x).toBeCloseTo(
      16,
      12
    );
    expect(result.value.channels.blue.mappedImagePointMm.x).toBeLessThan(16);
    expect(result.value.pairwiseSeparationMm.redBlue).toBeGreaterThan(
      result.value.pairwiseSeparationMm.redGreen
    );
    expect(result.value.pairwiseSeparationMm.maximum).toBe(
      result.value.pairwiseSeparationMm.redBlue
    );
    expect(result.provenance.kind).toBe("approximation");
  });

  it("keeps all channels coincident on the optical axis", () => {
    const result = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 0, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        channelCoefficients: {
          red: { k1: 0.1, k2: -0.02, k3: 0 },
          green: { k1: 0, k2: 0, k3: 0 },
          blue: { k1: -0.1, k2: 0.02, k3: 0 }
        }
      }
    });

    for (const channel of CHANNELS) {
      expect(result.value.channels[channel].mappedImagePointMm).toEqual({
        x: 0,
        y: 0
      });
    }
    expect(result.value.pairwiseSeparationMm.maximum).toBe(0);
  });

  it("preserves each channel's radial direction while allowing different radial scales", () => {
    const source = { x: 9, y: 12 };
    const result = calculateLateralChromaticAberrationMapping({
      imagePointMm: source,
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        channelCoefficients: {
          red: { k1: 0.04, k2: 0, k3: 0 },
          green: { k1: 0.01, k2: 0, k3: 0 },
          blue: { k1: -0.03, k2: 0, k3: 0 }
        }
      }
    });

    const sourceAngle = Math.atan2(source.y, source.x);
    for (const channel of CHANNELS) {
      const mapped = result.value.channels[channel].mappedImagePointMm;
      expect(Math.atan2(mapped.y, mapped.x)).toBeCloseTo(sourceAngle, 12);
    }

    expect(result.value.channels.red.radialScale).toBeGreaterThan(
      result.value.channels.green.radialScale
    );
    expect(result.value.channels.green.radialScale).toBeGreaterThan(
      result.value.channels.blue.radialScale
    );
  });

  it("round-trips each channel through its corresponding inverse mapping", () => {
    const profile: LateralChromaticAberrationProfile = {
      normalizationRadiusMm: 21,
      maximumNormalizedRadius: 1,
      channelCoefficients: {
        red: { k1: -0.04, k2: 0.012, k3: 0 },
        green: { k1: -0.06, k2: 0.018, k3: 0 },
        blue: { k1: -0.08, k2: 0.024, k3: 0 }
      }
    };
    const source = { x: 13.25, y: -7.5 };
    const forward = calculateLateralChromaticAberrationMapping({
      imagePointMm: source,
      profile
    });

    for (const channel of CHANNELS) {
      const inverse = calculateInverseLateralChromaticAberrationMapping({
        distortedImagePointMm:
          forward.value.channels[channel].mappedImagePointMm,
        profile
      });

      expect(
        inverse.value.channels[channel].sourceImagePointMm.x
      ).toBeCloseTo(source.x, 11);
      expect(
        inverse.value.channels[channel].sourceImagePointMm.y
      ).toBeCloseTo(source.y, 11);
    }
  });

  it("returns different inverse source coordinates for a shared distorted destination", () => {
    const result = calculateInverseLateralChromaticAberrationMapping({
      distortedImagePointMm: { x: 15, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        channelCoefficients: {
          red: { k1: 0.05, k2: 0, k3: 0 },
          green: { k1: 0, k2: 0, k3: 0 },
          blue: { k1: -0.05, k2: 0, k3: 0 }
        }
      }
    });

    expect(result.value.channels.red.sourceImagePointMm.x).toBeLessThan(15);
    expect(result.value.channels.green.sourceImagePointMm.x).toBeCloseTo(
      15,
      12
    );
    expect(result.value.channels.blue.sourceImagePointMm.x).toBeGreaterThan(
      15
    );
    expect(result.value.pairwiseSourceSeparationMm.maximum).toBeGreaterThan(0);
  });

  it("shares one explicit normalization and operating envelope across channels", () => {
    const first = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 10, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        channelCoefficients: {
          red: { k1: 0.04, k2: 0, k3: 0 },
          green: { k1: 0, k2: 0, k3: 0 },
          blue: { k1: -0.04, k2: 0, k3: 0 }
        }
      }
    });
    const second = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 20, y: 0 },
      profile: {
        normalizationRadiusMm: 40,
        maximumNormalizedRadius: 1,
        channelCoefficients: {
          red: { k1: 0.04, k2: 0, k3: 0 },
          green: { k1: 0, k2: 0, k3: 0 },
          blue: { k1: -0.04, k2: 0, k3: 0 }
        }
      }
    });

    expect(second.value.pairwiseSeparationMm.redBlue).toBeCloseTo(
      first.value.pairwiseSeparationMm.redBlue * 2,
      12
    );
  });

  it("fails closed with channel-specific context when one channel profile is non-invertible", () => {
    expect(() =>
      calculateLateralChromaticAberrationMapping({
        imagePointMm: { x: 5, y: 0 },
        profile: {
          normalizationRadiusMm: 20,
          maximumNormalizedRadius: 1,
          channelCoefficients: {
            red: { k1: 0, k2: 0, k3: 0 },
            green: { k1: 0, k2: 0, k3: 0 },
            blue: { k1: -1, k2: 0, k3: 0 }
          }
        }
      })
    ).toThrow("blue channel");
  });

  it("documents that this is channel mapping rather than spectral/CFA calibration", () => {
    const result = calculateLateralChromaticAberrationMapping({
      imagePointMm: { x: 10, y: 0 },
      profile: NEUTRAL_PROFILE
    });

    const assumptions = result.provenance.assumptions?.join(" ") ?? "";
    expect(assumptions).toContain("abstract red, green, and blue renderer channels");
    expect(assumptions).toContain("not a spectral lens model");
    expect(assumptions).toContain("not a");
    expect(assumptions).toContain("sensor CFA calibration");
    expect(assumptions).toContain("Longitudinal chromatic aberration");
  });
});
