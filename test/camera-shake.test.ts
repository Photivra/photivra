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

  it("keeps ideal stable support at exact zero across focal length, shutter, focus, pitch, and stabilization settings", () => {
    const cases = [
      {
        focalLengthMm: 24,
        shutterSeconds: 1 / 2000,
        stabilizationStopsEquivalent: 0,
        pixelPitchMicrometers: 8
      },
      {
        focalLengthMm: 600,
        shutterSeconds: 2,
        stabilizationStopsEquivalent: 8,
        pixelPitchMicrometers: 3.2
      },
      {
        focalLengthMm: 85,
        shutterSeconds: 1 / 15,
        stabilizationStopsEquivalent: 4,
        focusDistanceM: 1.5,
        pixelPitchMicrometers: 4.5
      }
    ] as const;

    for (const input of cases) {
      const result = estimateCameraShakeBlur({
        ...input,
        angularVelocityRadPerSec: {
          yaw: 0,
          pitch: 0
        }
      });

      expect(result.value.unstabilized).toMatchObject({
        deltaXmm: 0,
        deltaYmm: 0,
        distanceMm: 0,
        distancePixels: 0,
        deltaXPixels: 0,
        deltaYPixels: 0
      });
      expect(result.value.stabilized).toMatchObject({
        deltaXmm: 0,
        deltaYmm: 0,
        distanceMm: 0,
        distancePixels: 0,
        deltaXPixels: 0,
        deltaYPixels: 0
      });
    }
  });

  it("does not let stabilization create motion from a zero-motion input", () => {
    const off = estimateCameraShakeBlur({
      focalLengthMm: 200,
      shutterSeconds: 4,
      angularVelocityRadPerSec: {
        yaw: 0,
        pitch: 0
      },
      stabilizationStopsEquivalent: 0
    });
    const attenuated = estimateCameraShakeBlur({
      focalLengthMm: 200,
      shutterSeconds: 4,
      angularVelocityRadPerSec: {
        yaw: 0,
        pitch: 0
      },
      stabilizationStopsEquivalent: 12
    });

    expect(off.value.unstabilized.distanceMm).toBe(0);
    expect(off.value.stabilized.distanceMm).toBe(0);
    expect(attenuated.value.unstabilized.distanceMm).toBe(0);
    expect(attenuated.value.stabilized.distanceMm).toBe(0);
  });
});
