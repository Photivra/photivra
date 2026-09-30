import { describe, expect, it } from "vitest";

import {
  InvalidScientificInputError,
  InvalidScientificResultError,
  calculateDepthOfField,
  calculateExposureValue100,
  calculateFieldOfView,
  calculatePixelPitch,
  calculateRelativeOpticalExposure,
  calculatedResult
} from "../src/index.js";

describe("engine numerical correctness contract", () => {
  it("keeps explicit millimetre-to-micrometre sampling conversion consistent", () => {
    const result = calculatePixelPitch({
      sensorWidthMm: 36,
      pixelWidth: 600
    }).value;

    expect(result.millimeters).toBeCloseTo(0.06, 15);
    expect(result.micrometers).toBeCloseTo(60, 12);
    expect(result.micrometers).toBeCloseTo(
      result.millimeters * 1000,
      12
    );
  });

  it("rejects non-finite public scientific inputs with the typed input error", () => {
    expect(() =>
      calculateFieldOfView({
        focalLengthMm: 50,
        sensorDimensionMm: Number.POSITIVE_INFINITY
      })
    ).toThrowError(InvalidScientificInputError);
  });

  it("rejects non-finite derived result values with the typed result error", () => {
    expect(() =>
      calculateExposureValue100({
        aperture: 1e308,
        shutterSeconds: 1
      })
    ).toThrowError(InvalidScientificResultError);

    expect(() =>
      calculatedResult(
        {
          nested: [1, Number.NEGATIVE_INFINITY]
        },
        "numerical-contract-test",
        "1.0.0"
      )
    ).toThrowError(InvalidScientificResultError);
  });

  it("uses semantic null rather than numeric infinity for an unbounded DOF far limit", () => {
    const result = calculateDepthOfField({
      focalLengthMm: 50,
      aperture: 8,
      focusDistanceM: 100,
      circleOfConfusionMm: 0.03
    }).value;

    expect(result.farLimitM).toBeNull();
    expect(result.totalDepthOfFieldM).toBeNull();
  });

  it("preserves exact stop-factor relations when the model is algebraically exact", () => {
    const result = calculateRelativeOpticalExposure({
      aperture: 4,
      shutterSeconds: 1 / 250,
      referenceAperture: 4,
      referenceShutterSeconds: 1 / 125
    }).value;

    expect(result.factor).toBe(0.5);
    expect(result.stops).toBe(-1);
  });
});
