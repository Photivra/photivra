import { describe, expect, it } from "vitest";

import {
  calculateProjectedMotionBlur,
  type CalculateProjectedMotionBlurInput
} from "../src/index.js";

describe("projected subject motion", () => {
  it("projects lateral motion into millimetres and pixels on the sensor", () => {
    const result = calculateProjectedMotionBlur({
      focalLengthMm: 200,
      shutterSeconds: 1 / 1000,
      positionM: { x: 0, y: 0, z: 20 },
      velocityMps: { x: 10, y: 0, z: 0 },
      pixelPitchMicrometers: 5
    });

    expect(result.value.deltaXMm).toBeCloseTo(0.1, 12);
    expect(result.value.deltaYMm).toBeCloseTo(0, 12);
    expect(result.value.distanceMm).toBeCloseTo(0.1, 12);
    expect(result.value.distancePixels).toBeCloseTo(20, 12);
  });

  it("uses the selected focus plane for near-field motion projection", () => {
    const pinhole = calculateProjectedMotionBlur({
      focalLengthMm: 200,
      shutterSeconds: 1 / 1000,
      positionM: { x: 0, y: 0, z: 22 },
      velocityMps: { x: 10, y: 0, z: 0 },
      pixelPitchMicrometers: 5
    });
    const focused = calculateProjectedMotionBlur({
      focalLengthMm: 200,
      shutterSeconds: 1 / 1000,
      positionM: { x: 0, y: 0, z: 22 },
      velocityMps: { x: 10, y: 0, z: 0 },
      focusDistanceM: 22,
      pixelPitchMicrometers: 5
    });

    expect(focused.value.projectionDistanceMm).toBeCloseTo(
      201.834862385,
      9
    );
    expect(focused.value.distanceMm).toBeGreaterThan(
      pinhole.value.distanceMm
    );
    expect(
      (focused.value.distanceMm - pinhole.value.distanceMm) /
        pinhole.value.distanceMm
    ).toBeLessThan(0.01);
    expect(focused.provenance.model).toBe(
      "focus-aware-constant-velocity-thin-lens-motion"
    );
  });

  it("omits pixel-domain output when pixel pitch is not supplied", () => {
    const result = calculateProjectedMotionBlur({
      focalLengthMm: 100,
      shutterSeconds: 1 / 100,
      positionM: { x: 0, y: 0, z: 10 },
      velocityMps: { x: 1, y: 0, z: 0 }
    });

    expect(result.value.distanceMm).toBeGreaterThan(0);
    expect(result.value.distancePixels).toBeUndefined();
  });

  it("rejects motion that crosses the camera plane", () => {
    expect(() =>
      calculateProjectedMotionBlur({
        focalLengthMm: 50,
        shutterSeconds: 1,
        positionM: { x: 0, y: 0, z: 1 },
        velocityMps: { x: 0, y: 0, z: -2 }
      })
    ).toThrow("crosses or reaches the camera plane");
  });

  it("rejects a vector with a missing required component", () => {
    const malformedPosition = {
      y: 0,
      z: 20
    } as unknown as CalculateProjectedMotionBlurInput["positionM"];

    expect(() =>
      calculateProjectedMotionBlur({
        focalLengthMm: 200,
        shutterSeconds: 1 / 1000,
        positionM: malformedPosition,
        velocityMps: { x: 10, y: 0, z: 0 }
      })
    ).toThrow("positionM.x must be finite.");
  });
});
