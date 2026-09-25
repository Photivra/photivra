import { describe, expect, it } from "vitest";

import {
  calculateIlluminationVignetting,
  type IlluminationVignettingProfile
} from "../src/optics/illumination-vignetting.js";

const IDENTITY_PROFILE: IlluminationVignettingProfile = {
  normalizationRadiusMm: 20,
  maximumNormalizedRadius: 1,
  coefficients: {
    r2: 0,
    r4: 0,
    r6: 0
  }
};

describe("generic illumination vignetting", () => {
  it("is exactly neutral on the optical axis", () => {
    const result = calculateIlluminationVignetting({
      imagePointMm: { x: 0, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        coefficients: {
          r2: -0.4,
          r4: 0.1,
          r6: 0
        }
      }
    });

    expect(result.value.normalizedRadius).toBe(0);
    expect(result.value.linearThroughputFactor).toBe(1);
    expect(result.value.attenuationStops).toBe(0);
  });

  it("is identity everywhere when coefficients are zero", () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 12, y: 9 }
    ]) {
      const result = calculateIlluminationVignetting({
        imagePointMm: point,
        profile: IDENTITY_PROFILE
      });

      expect(result.value.linearThroughputFactor).toBe(1);
      expect(result.value.attenuationStops).toBe(0);
    }
  });

  it("attenuates field illumination in linear-light space", () => {
    const result = calculateIlluminationVignetting({
      imagePointMm: { x: 16, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        coefficients: {
          r2: -0.5,
          r4: 0.1,
          r6: 0
        }
      }
    });

    const r = 0.8;
    const expected =
      1 - 0.5 * r ** 2 + 0.1 * r ** 4;

    expect(result.value.normalizedRadius).toBeCloseTo(r, 12);
    expect(result.value.linearThroughputFactor).toBeCloseTo(expected, 12);
    expect(result.value.linearThroughputFactor).toBeLessThan(1);
    expect(result.value.attenuationStops).toBeGreaterThan(0);
    expect(result.provenance.kind).toBe("approximation");
  });

  it("reports attenuation stops from the linear throughput factor", () => {
    const result = calculateIlluminationVignetting({
      imagePointMm: { x: 20, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        coefficients: {
          r2: -0.5,
          r4: 0,
          r6: 0
        }
      }
    });

    expect(result.value.linearThroughputFactor).toBeCloseTo(0.5, 12);
    expect(result.value.attenuationStops).toBeCloseTo(1, 12);
  });

  it("uses the declared physical normalization radius", () => {
    const profile = {
      maximumNormalizedRadius: 1,
      coefficients: {
        r2: -0.4,
        r4: 0.05,
        r6: 0
      }
    } as const;

    const first = calculateIlluminationVignetting({
      imagePointMm: { x: 10, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        ...profile
      }
    });
    const second = calculateIlluminationVignetting({
      imagePointMm: { x: 20, y: 0 },
      profile: {
        normalizationRadiusMm: 40,
        ...profile
      }
    });

    expect(first.value.normalizedRadius).toBeCloseTo(0.5, 12);
    expect(second.value.normalizedRadius).toBeCloseTo(0.5, 12);
    expect(second.value.linearThroughputFactor).toBeCloseTo(
      first.value.linearThroughputFactor,
      12
    );
  });

  it("is radial-only and therefore angle-independent at equal radius", () => {
    const profile: IlluminationVignettingProfile = {
      normalizationRadiusMm: 20,
      maximumNormalizedRadius: 1,
      coefficients: {
        r2: -0.35,
        r4: 0.04,
        r6: -0.01
      }
    };

    const horizontal = calculateIlluminationVignetting({
      imagePointMm: { x: 15, y: 0 },
      profile
    });
    const diagonal = calculateIlluminationVignetting({
      imagePointMm: { x: 9, y: 12 },
      profile
    });

    expect(horizontal.value.normalizedRadius).toBeCloseTo(0.75, 12);
    expect(diagonal.value.normalizedRadius).toBeCloseTo(0.75, 12);
    expect(diagonal.value.linearThroughputFactor).toBeCloseTo(
      horizontal.value.linearThroughputFactor,
      12
    );
  });

  it("validates extrema across the whole declared field, not only the sampled point", () => {
    const result = calculateIlluminationVignetting({
      imagePointMm: { x: 5, y: 0 },
      profile: {
        normalizationRadiusMm: 20,
        maximumNormalizedRadius: 1,
        coefficients: {
          r2: -0.8,
          r4: 0.8,
          r6: -0.3
        }
      }
    });

    expect(result.value.profileMaximumThroughputFactor).toBeCloseTo(1, 12);
    expect(result.value.profileMinimumThroughputFactor).toBeGreaterThan(0);
    expect(result.value.profileMinimumThroughputFactor).toBeLessThan(1);
  });

  it("rejects profiles that amplify above the optical-axis normalization anywhere in the envelope", () => {
    expect(() =>
      calculateIlluminationVignetting({
        imagePointMm: { x: 0, y: 0 },
        profile: {
          normalizationRadiusMm: 20,
          maximumNormalizedRadius: 1,
          coefficients: {
            r2: -0.4,
            r4: 0.8,
            r6: 0
          }
        }
      })
    ).toThrow("must not amplify");
  });

  it("rejects profiles that reach zero or negative throughput anywhere in the envelope", () => {
    expect(() =>
      calculateIlluminationVignetting({
        imagePointMm: { x: 0, y: 0 },
        profile: {
          normalizationRadiusMm: 20,
          maximumNormalizedRadius: 1,
          coefficients: {
            r2: -1,
            r4: 0,
            r6: 0
          }
        }
      })
    ).toThrow("strictly greater than zero");
  });

  it("fails closed outside the declared operating radius", () => {
    expect(() =>
      calculateIlluminationVignetting({
        imagePointMm: { x: 17, y: 0 },
        profile: {
          normalizationRadiusMm: 20,
          maximumNormalizedRadius: 0.8,
          coefficients: {
            r2: -0.3,
            r4: 0,
            r6: 0
          }
        }
      })
    ).toThrow("outside the illumination vignetting profile");
  });

  it("rejects non-finite coefficients and invalid normalization geometry", () => {
    expect(() =>
      calculateIlluminationVignetting({
        imagePointMm: { x: 1, y: 0 },
        profile: {
          normalizationRadiusMm: 0,
          maximumNormalizedRadius: 1,
          coefficients: {
            r2: 0,
            r4: 0,
            r6: 0
          }
        }
      })
    ).toThrow("normalizationRadiusMm");

    expect(() =>
      calculateIlluminationVignetting({
        imagePointMm: { x: 1, y: 0 },
        profile: {
          normalizationRadiusMm: 20,
          maximumNormalizedRadius: 1,
          coefficients: {
            r2: Number.NaN,
            r4: 0,
            r6: 0
          }
        }
      })
    ).toThrow("coefficients.r2");
  });

  it("states that this model changes throughput only and excludes pupil/PSF behavior", () => {
    const result = calculateIlluminationVignetting({
      imagePointMm: { x: 10, y: 0 },
      profile: IDENTITY_PROFILE
    });

    const assumptions = result.provenance.assumptions?.join(" ") ?? "";
    expect(assumptions).toContain("scene-linear/channel-linear");
    expect(assumptions).toContain("does not alter field coordinates");
    expect(assumptions).toContain("Mechanical/pupil vignetting");
    expect(assumptions).toContain("not calibrated radiometry");
  });
});
