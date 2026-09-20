import { describe, expect, it } from "vitest";

import {
  calculateAiryDisk,
  calculateCenteredCrop,
  calculateDefocusCircle,
  calculateFieldOfView,
  calculateProjectedMotionBlur,
  calculateProjectedObjectSize,
  estimateCameraShakeBlur
} from "../src/index.js";

function expectFiniteTree(value: unknown): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value)).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(expectFiniteTree);
    return;
  }
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(expectFiniteTree);
  }
}

describe("scientific invariants across representative ranges", () => {
  it("field of view decreases monotonically as focal length increases", () => {
    const focalLengths = [14, 24, 35, 50, 85, 135, 200, 400, 600];
    const values = focalLengths.map(
      (focalLengthMm) =>
        calculateFieldOfView({
          focalLengthMm,
          sensorDimensionMm: 36
        }).value.degrees
    );

    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeLessThan(values[index - 1] ?? Infinity);
    }
  });

  it("projected object size increases with focal length and decreases with distance", () => {
    const wide = calculateProjectedObjectSize({
      focalLengthMm: 50,
      objectWidthM: 1,
      objectHeightM: 2,
      distanceM: 20,
      pixelPitchMicrometers: 5
    }).value;
    const tele = calculateProjectedObjectSize({
      focalLengthMm: 200,
      objectWidthM: 1,
      objectHeightM: 2,
      distanceM: 20,
      pixelPitchMicrometers: 5
    }).value;
    const distant = calculateProjectedObjectSize({
      focalLengthMm: 200,
      objectWidthM: 1,
      objectHeightM: 2,
      distanceM: 80,
      pixelPitchMicrometers: 5
    }).value;

    expect(tele.heightPixels ?? 0).toBeGreaterThan(wide.heightPixels ?? 0);
    expect(distant.heightPixels ?? Infinity).toBeLessThan(
      tele.heightPixels ?? 0
    );
  });

  it("centered crop dimensions and retained area never increase with crop factor", () => {
    const factors = [1, 1.1, 1.5, 2, 4, 8];
    const values = factors.map(
      (cropFactor) =>
        calculateCenteredCrop({
          pixelWidth: 6000,
          pixelHeight: 4000,
          cropFactor
        }).value
    );

    for (let index = 1; index < values.length; index += 1) {
      const current = values[index];
      const previous = values[index - 1];
      expect(current?.pixelWidth ?? Infinity).toBeLessThanOrEqual(
        previous?.pixelWidth ?? 0
      );
      expect(current?.pixelHeight ?? Infinity).toBeLessThanOrEqual(
        previous?.pixelHeight ?? 0
      );
      expect(current?.retainedAreaFraction ?? Infinity).toBeLessThanOrEqual(
        previous?.retainedAreaFraction ?? 0
      );
    }
  });

  it("Airy first-zero diameter increases with f-number and wavelength", () => {
    const fast = calculateAiryDisk({
      aperture: 2.8,
      wavelengthNm: 450
    }).value.firstZeroDiameterMicrometers;
    const stopped = calculateAiryDisk({
      aperture: 11,
      wavelengthNm: 450
    }).value.firstZeroDiameterMicrometers;
    const red = calculateAiryDisk({
      aperture: 11,
      wavelengthNm: 650
    }).value.firstZeroDiameterMicrometers;

    expect(stopped).toBeGreaterThan(fast);
    expect(red).toBeGreaterThan(stopped);
  });

  it("defocus is zero on the focus plane across representative lenses", () => {
    for (const focalLengthMm of [24, 50, 85, 200, 600]) {
      const value = calculateDefocusCircle({
        focalLengthMm,
        aperture: 5.6,
        focusDistanceM: 50,
        subjectDistanceM: 50
      }).value.diameterMm;

      expect(value).toBeCloseTo(0, 12);
    }
  });

  it("zero subject velocity produces zero image displacement", () => {
    const value = calculateProjectedMotionBlur({
      focalLengthMm: 200,
      shutterSeconds: 1 / 30,
      positionM: { x: 2, y: 1, z: 25 },
      velocityMps: { x: 0, y: 0, z: 0 },
      pixelPitchMicrometers: 5
    }).value;

    expect(value.distanceMm).toBe(0);
    expect(value.distancePixels).toBe(0);
  });

  it("additional stabilization stops never increase the modeled residual blur", () => {
    const stops = [0, 1, 2, 3, 4, 5, 6];
    const distances = stops.map(
      (stabilizationStopsEquivalent) =>
        estimateCameraShakeBlur({
          focalLengthMm: 200,
          shutterSeconds: 1 / 30,
          angularVelocityRadPerSec: {
            yaw: 0.01,
            pitch: -0.005
          },
          stabilizationStopsEquivalent
        }).value.stabilized.distanceMm
    );

    for (let index = 1; index < distances.length; index += 1) {
      expect(distances[index]).toBeLessThanOrEqual(
        distances[index - 1] ?? 0
      );
    }
  });

  it("representative public calculation outputs contain only finite numbers", () => {
    const results = [
      calculateFieldOfView({
        focalLengthMm: 14,
        sensorDimensionMm: 36
      }),
      calculateProjectedObjectSize({
        focalLengthMm: 600,
        objectWidthM: 0.7,
        objectHeightM: 1.85,
        distanceM: 22,
        pixelPitchMicrometers: 4
      }),
      calculateAiryDisk({
        aperture: 22,
        wavelengthNm: 700
      }),
      estimateCameraShakeBlur({
        focalLengthMm: 600,
        shutterSeconds: 1 / 4,
        angularVelocityRadPerSec: {
          yaw: 0.02,
          pitch: -0.015
        },
        stabilizationStopsEquivalent: 0,
        pixelPitchMicrometers: 4
      })
    ];

    results.forEach(expectFiniteTree);
  });
});
