import { describe, expect, it } from "vitest";

import { estimateCameraShakeBlur } from "../src/index.js";

describe("camera shake stabilization estimate", () => {
  it("projects controlled angular shake and reduces it by equivalent stops", () => {
    const result = estimateCameraShakeBlur({
      focalLengthMm: 200,
      shutterSeconds: 1 / 30,
      angularVelocityRadPerSec: {
        yaw: 0.01,
        pitch: 0
      },
      stabilizationStopsEquivalent: 3,
      pixelPitchMicrometers: 6
    });

    expect(result.provenance.kind).toBe("approximation");
    expect(result.value.residualMotionFactor).toBeCloseTo(0.125, 12);
    expect(result.value.unstabilized.distancePixels).toBeCloseTo(
      (200 * Math.tan(0.01 / 30)) / 0.006,
      10
    );
    expect(result.value.stabilized.distancePixels).toBeCloseTo(
      (200 * Math.tan((0.01 / 30) * 0.125)) / 0.006,
      10
    );
    expect(result.value.unstabilized.deltaXPixels).toBeCloseTo(
      (200 * Math.tan(0.01 / 30)) / 0.006,
      10
    );
    expect(result.value.unstabilized.deltaYPixels).toBeCloseTo(0, 12);
  });

  it("rejects non-finite approximation outputs", () => {
    expect(() =>
      estimateCameraShakeBlur({
        focalLengthMm: 1e308,
        shutterSeconds: 1,
        angularVelocityRadPerSec: {
          yaw: 1.4,
          pitch: 0
        },
        stabilizationStopsEquivalent: 0
      })
    ).toThrow("Calculation produced a non-finite number");
  });

  it("uses focus-aware projection distance when focus is supplied", () => {
    const pinhole = estimateCameraShakeBlur({
      focalLengthMm: 200,
      shutterSeconds: 1 / 30,
      angularVelocityRadPerSec: {
        yaw: 0.01,
        pitch: 0
      },
      stabilizationStopsEquivalent: 0
    });
    const focused = estimateCameraShakeBlur({
      focalLengthMm: 200,
      shutterSeconds: 1 / 30,
      angularVelocityRadPerSec: {
        yaw: 0.01,
        pitch: 0
      },
      stabilizationStopsEquivalent: 0,
      focusDistanceM: 22
    });

    expect(focused.value.projectionDistanceMm).toBeCloseTo(
      201.834862385,
      9
    );
    expect(focused.value.unstabilized.distanceMm).toBeGreaterThan(
      pinhole.value.unstabilized.distanceMm
    );
    expect(focused.provenance.model).toBe(
      "focus-aware-constant-angular-velocity-stabilization-equivalent"
    );
  });

  it("matches unstabilized blur when equivalent stops are zero", () => {
    const result = estimateCameraShakeBlur({
      focalLengthMm: 50,
      shutterSeconds: 1 / 60,
      angularVelocityRadPerSec: {
        yaw: 0.005,
        pitch: -0.003
      },
      stabilizationStopsEquivalent: 0
    });

    expect(result.value.stabilized.distanceMm).toBeCloseTo(
      result.value.unstabilized.distanceMm,
      12
    );
  });
});
