import { describe, expect, it } from "vitest";

import {
  approximationResult,
  calibratedResult,
  calculatedResult,
  estimatedResult,
  validateCalculationQuality,
  type CalculationQuality
} from "../src/index.js";

describe("calculation quality metadata", () => {
  const quality: CalculationQuality = {
    uncertainty: [
      {
        kind: "absolute",
        quantityPath: "value.distanceM",
        source: "measurement",
        plusMinus: 0.02,
        unit: "m",
        confidence: {
          level: 0.95,
          basis: "Repeated measurement coverage interval"
        }
      },
      {
        kind: "relative",
        quantityPath: "value.factor",
        source: "calibration",
        fraction: 0.03,
        note: "Calibration certificate expanded uncertainty"
      }
    ],
    validRanges: [
      {
        parameterPath: "input.focusDistanceM",
        unit: "m",
        minimum: 0.5,
        maximum: 100,
        note: "Validated calibration range"
      }
    ],
    notes: [
      "Uncertainty components are not combined automatically."
    ]
  };

  it("keeps deterministic calculated results lightweight when quality is absent", () => {
    const result = calculatedResult(42, "test-model", "1.0.0");

    expect(result).toEqual({
      value: 42,
      provenance: {
        kind: "calculated",
        model: "test-model",
        modelVersion: "1.0.0"
      }
    });
    expect(result.quality).toBeUndefined();
  });

  it("serializes path-specific absolute and relative uncertainty metadata", () => {
    const result = approximationResult(
      {
        distanceM: 10,
        factor: 2
      },
      "test-approximation",
      "1.0.0",
      ["Simplified model"],
      quality
    );

    expect(result.quality).toEqual(quality);
    expect(result.quality?.uncertainty?.[0]?.source).toBe("measurement");
    expect(result.quality?.uncertainty?.[1]?.source).toBe("calibration");
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("creates estimated and calibrated results with explicit quality metadata", () => {
    const estimated = estimatedResult(
      10,
      "estimated-distance",
      "1.0.0",
      ["Distance inferred from a reference"],
      {
        uncertainty: [
          {
            kind: "relative",
            quantityPath: "value",
            source: "model-approximation",
            fraction: 0.1
          }
        ]
      }
    );
    const calibrated = calibratedResult(
      0.52,
      "sensor-qe",
      "1.0.0",
      ["Laboratory calibration"],
      {
        uncertainty: [
          {
            kind: "absolute",
            quantityPath: "value",
            source: "calibration",
            plusMinus: 0.01,
            unit: "1"
          }
        ]
      }
    );

    expect(estimated.provenance.kind).toBe("estimated");
    expect(calibrated.provenance.kind).toBe("calibrated");
  });

  it("rejects invalid uncertainty magnitudes and confidence metadata", () => {
    expect(() =>
      validateCalculationQuality({
        uncertainty: [
          {
            kind: "absolute",
            quantityPath: "value.distanceM",
            source: "measurement",
            plusMinus: -0.1,
            unit: "m"
          }
        ]
      })
    ).toThrow("plusMinus must be finite and greater than or equal to zero");

    expect(() =>
      validateCalculationQuality({
        uncertainty: [
          {
            kind: "relative",
            quantityPath: "value.factor",
            source: "model-approximation",
            fraction: 0.1,
            confidence: {
              level: 1.1,
              basis: "Invalid level"
            }
          }
        ]
      })
    ).toThrow("confidence.level must be in (0, 1]");
  });

  it("rejects malformed valid ranges and empty quality placeholders", () => {
    expect(() =>
      validateCalculationQuality({
        validRanges: [
          {
            parameterPath: "input.distanceM",
            unit: "m",
            minimum: 10,
            maximum: 1
          }
        ]
      })
    ).toThrow("minimum must not exceed maximum");

    expect(() => validateCalculationQuality({})).toThrow(
      "Calculation quality must contain uncertainty, validRanges, or notes."
    );

    expect(() =>
      validateCalculationQuality({
        uncertainty: []
      })
    ).toThrow("uncertainty must be omitted rather than empty");
  });

  it("requires explicit units for absolute uncertainty and valid ranges", () => {
    expect(() =>
      validateCalculationQuality({
        uncertainty: [
          {
            kind: "absolute",
            quantityPath: "value.distanceM",
            source: "measurement",
            plusMinus: 0.1,
            unit: " "
          }
        ]
      })
    ).toThrow("uncertainty[0].unit must not be empty");

    expect(() =>
      validateCalculationQuality({
        validRanges: [
          {
            parameterPath: "input.distanceM",
            unit: " ",
            minimum: 1
          }
        ]
      })
    ).toThrow("validRanges[0].unit must not be empty");
  });
});
