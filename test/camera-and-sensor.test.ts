import { describe, expect, it } from "vitest";

import {
  calculateCenteredCrop,
  calculateFieldOfView,
  calculateFieldOfViewBounds,
  calculatePixelPitch,
  InvalidScientificInputError
} from "../src/index.js";

describe("camera geometry and sensor sampling", () => {
  it("calculates horizontal field of view for a 50 mm lens on 36 mm sensor width", () => {
    const result = calculateFieldOfView({
      focalLengthMm: 50,
      sensorDimensionMm: 36
    });

    expect(result.value.degrees).toBeCloseTo(39.597752709, 9);
    expect(result.provenance.kind).toBe("calculated");
  });

  it("calculates asymmetric field-of-view bounds relative to the optical axis", () => {
    const centered = calculateFieldOfView({
      focalLengthMm: 50,
      sensorDimensionMm: 18
    });
    const bounds = calculateFieldOfViewBounds({
      focalLengthMm: 50,
      minimumSensorCoordinateMm: -18,
      maximumSensorCoordinateMm: 0
    });

    expect(bounds.value.minimumDegrees).toBeLessThan(0);
    expect(bounds.value.maximumDegrees).toBeCloseTo(0, 12);
    expect(bounds.value.degrees).toBeLessThan(centered.value.degrees);
    expect(bounds.provenance.model).toBe(
      "asymmetric-rectilinear-field-of-view"
    );
  });

  it("uses thin-lens image distance when focus distance is supplied", () => {
    const infinity = calculateFieldOfView({
      focalLengthMm: 50,
      sensorDimensionMm: 36
    });
    const close = calculateFieldOfView({
      focalLengthMm: 50,
      sensorDimensionMm: 36,
      focusDistanceM: 0.5
    });

    expect(close.value.projectionDistanceMm).toBeCloseTo(55.555555556, 9);
    expect(close.value.degrees).toBeLessThan(infinity.value.degrees);
    expect(close.provenance.model).toBe(
      "focus-aware-rectilinear-field-of-view"
    );
  });

  it("keeps distant focus-aware FOV within about one percent of pinhole", () => {
    const pinhole = calculateFieldOfView({
      focalLengthMm: 200,
      sensorDimensionMm: 36
    }).value.degrees;
    const focused = calculateFieldOfView({
      focalLengthMm: 200,
      sensorDimensionMm: 36,
      focusDistanceM: 22
    }).value.degrees;

    expect(Math.abs(focused - pinhole) / pinhole).toBeLessThan(0.01);
  });

  it("calculates 6 micrometre pitch for 36 mm across 6000 pixels", () => {
    const result = calculatePixelPitch({
      sensorWidthMm: 36,
      pixelWidth: 6000
    });

    expect(result.value.micrometers).toBeCloseTo(6, 12);
  });

  it("rejects crop factors below 1", () => {
    expect(() =>
      calculateCenteredCrop({
        pixelWidth: 6000,
        pixelHeight: 4000,
        cropFactor: 0.9
      })
    ).toThrow("cropFactor must be greater than or equal to 1.");
  });

  it("retains about 20 MP when a 45 MP 3:2 image is cropped by 1.5x", () => {
    const result = calculateCenteredCrop({
      pixelWidth: 8192,
      pixelHeight: 5464,
      cropFactor: 1.5
    });

    expect(result.value.megapixels).toBeCloseTo(19.89, 2);
    expect(result.value.retainedAreaFraction).toBeCloseTo(1 / 2.25, 3);
  });
});

describe("field-of-view bounds validation", () => {
  it.each([
    [{ minimumSensorCoordinateMm: Number.NaN, maximumSensorCoordinateMm: 1 }, "minimumSensorCoordinateMm must be finite"],
    [{ minimumSensorCoordinateMm: -1, maximumSensorCoordinateMm: Number.POSITIVE_INFINITY }, "maximumSensorCoordinateMm must be finite"],
    [{ minimumSensorCoordinateMm: 2, maximumSensorCoordinateMm: 2 }, "must be greater than minimumSensorCoordinateMm"],
    [{ minimumSensorCoordinateMm: 3, maximumSensorCoordinateMm: -3 }, "must be greater than minimumSensorCoordinateMm"]
  ])("rejects %o", (bounds, message) => {
    expect(() => calculateFieldOfViewBounds({ focalLengthMm: 50, ...bounds })).toThrow(InvalidScientificInputError);
    expect(() => calculateFieldOfViewBounds({ focalLengthMm: 50, ...bounds })).toThrow(message);
  });

  it("rejects a non-positive focal length and a focus distance inside the focal length", () => {
    expect(() => calculateFieldOfViewBounds({ focalLengthMm: 0, minimumSensorCoordinateMm: -1, maximumSensorCoordinateMm: 1 }))
      .toThrow(InvalidScientificInputError);
    expect(() => calculateFieldOfViewBounds({ focalLengthMm: 50, focusDistanceM: 0.04, minimumSensorCoordinateMm: -1,
      maximumSensorCoordinateMm: 1 })).toThrow(InvalidScientificInputError);
  });

  it("matches atan(x / v) at both bounds with the thin-lens image distance", () => {
    // Focus at 1 m with f = 50 mm: v = 1 / (1/50 - 1/1000) = 1000/19 mm.
    const v = 1000 / 19;
    const result = calculateFieldOfViewBounds({ focalLengthMm: 50, focusDistanceM: 1, minimumSensorCoordinateMm: -6,
      maximumSensorCoordinateMm: 18 }).value;
    expect(result.minimumRadians).toBeCloseTo(Math.atan(-6 / v), 14);
    expect(result.maximumRadians).toBeCloseTo(Math.atan(18 / v), 14);
    expect(result.radians).toBeCloseTo(Math.atan(18 / v) + Math.atan(6 / v), 14);
  });
});
