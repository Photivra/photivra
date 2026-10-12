// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  calculateCameraRotationImageMapping,
  calculateInverseCameraRotationImageMapping,
  calculateSensorApertureRays,
  estimateCameraShakeBlur
} from "../src/index.js";

/**
 * Independent physical reference: re-express the camera basis (+X right,
 * +Y up, +Z forward, left-handed) in a right-handed basis (+X right, +Y up,
 * +Z' = -Z backward), apply the textbook right-hand rotation matrix there,
 * and map back. A stationary world ray d seen by a camera rotated by R
 * appears at R^T d.
 */
function rightHandedRotationMatrix(
  axis: readonly [number, number, number],
  angle: number
): number[][] {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c]
  ];
}

function referenceMapping(
  focalLengthMm: number,
  point: { x: number; y: number },
  displacement: { pitch: number; yaw: number; roll: number }
): { x: number; y: number } {
  const angle = Math.hypot(
    displacement.pitch,
    displacement.yaw,
    displacement.roll
  );
  // The physical +Z (forward) axis is -Z' in the right-handed basis.
  const axis: [number, number, number] = [
    displacement.pitch / angle,
    displacement.yaw / angle,
    -displacement.roll / angle
  ];
  const r = rightHandedRotationMatrix(axis, angle);
  const d = [point.x / focalLengthMm, point.y / focalLengthMm, -1];
  // R^T d
  const rotated = [0, 1, 2].map(
    (i) => r[0]![i]! * d[0]! + r[1]![i]! * d[1]! + r[2]![i]! * d[2]!
  );
  const forward = -rotated[2]!;
  return {
    x: (focalLengthMm * rotated[0]!) / forward,
    y: (focalLengthMm * rotated[1]!) / forward
  };
}

describe("camera rotation sign convention across APIs", () => {
  it("matches an independent right-handed-basis rotation for combined axes and off-axis points", () => {
    const cases = [
      { pitch: 0.4, yaw: 0, roll: 0 },
      { pitch: 0, yaw: 0.4, roll: 0 },
      { pitch: 0, yaw: 0, roll: 0.4 },
      { pitch: 0.12, yaw: -0.3, roll: 0.25 },
      { pitch: -0.2, yaw: 0.15, roll: -0.35 }
    ];
    const points = [
      { x: 0, y: 0 },
      { x: 12, y: -7 },
      { x: -15, y: 9 }
    ];
    for (const angularVelocityRadPerSec of cases) {
      for (const imagePointMm of points) {
        const result = calculateCameraRotationImageMapping({
          focalLengthMm: 50,
          imagePointMm,
          timeSecondsFromExposureStart: 0.25,
          angularVelocityRadPerSec
        }).value;
        const expected = referenceMapping(
          50,
          imagePointMm,
          result.angularDisplacementRad
        );
        expect(result.mappedImagePointMm.x).toBeCloseTo(expected.x, 11);
        expect(result.mappedImagePointMm.y).toBeCloseTo(expected.y, 11);

        // The inverse mapping returns the same reference point.
        const inverse = calculateInverseCameraRotationImageMapping({
          focalLengthMm: 50,
          imagePointMm: result.mappedImagePointMm,
          timeSecondsFromExposureStart: 0.25,
          angularVelocityRadPerSec
        }).value;
        expect(inverse.referenceImagePointMm.x).toBeCloseTo(
          imagePointMm.x,
          11
        );
        expect(inverse.referenceImagePointMm.y).toBeCloseTo(
          imagePointMm.y,
          11
        );
      }
    }
  });

  it("states the physical meaning: yaw left moves content +X, pitch up moves content -Y, roll moves content counter-clockwise", () => {
    const map = (
      angularVelocityRadPerSec: { pitch: number; yaw: number; roll: number },
      imagePointMm = { x: 0, y: 0 }
    ): { x: number; y: number; distance: number } =>
      calculateCameraRotationImageMapping({
        focalLengthMm: 50,
        imagePointMm,
        timeSecondsFromExposureStart: 1,
        angularVelocityRadPerSec
      }).value.deltaMm;

    expect(map({ pitch: 0, yaw: 0.01, roll: 0 }).x).toBeGreaterThan(0);
    expect(map({ pitch: 0.01, yaw: 0, roll: 0 }).y).toBeLessThan(0);
    // A point on +X moves toward +Y under positive roll.
    expect(
      map({ pitch: 0, yaw: 0, roll: 0.01 }, { x: 10, y: 0 }).y
    ).toBeGreaterThan(0);
  });

  it("agrees with estimateCameraShakeBlur() at the optical axis for each signed single axis", () => {
    const focalLengthMm = 85;
    const shutterSeconds = 1 / 15;
    for (const [axis, rate] of [
      ["yaw", 0.03],
      ["yaw", -0.03],
      ["pitch", 0.02],
      ["pitch", -0.02]
    ] as const) {
      const yaw = axis === "yaw" ? rate : 0;
      const pitch = axis === "pitch" ? rate : 0;
      for (const focusDistanceM of [undefined, 1.5]) {
        const shake = estimateCameraShakeBlur({
          focalLengthMm,
          shutterSeconds,
          angularVelocityRadPerSec: { yaw, pitch },
          stabilizationStopsEquivalent: 0,
          ...(focusDistanceM === undefined ? {} : { focusDistanceM })
        }).value.unstabilized;
        const mapping = calculateCameraRotationImageMapping({
          focalLengthMm,
          imagePointMm: { x: 0, y: 0 },
          timeSecondsFromExposureStart: shutterSeconds,
          angularVelocityRadPerSec: { pitch, yaw, roll: 0 },
          ...(focusDistanceM === undefined ? {} : { focusDistanceM })
        }).value.deltaMm;

        expect(Math.sign(shake.deltaXmm)).toBe(Math.sign(mapping.x));
        expect(Math.sign(shake.deltaYmm)).toBe(Math.sign(mapping.y));
        expect(shake.deltaXmm).toBeCloseTo(mapping.x, 12);
        expect(shake.deltaYmm).toBeCloseTo(mapping.y, 12);
      }
    }
  });

  it("rotates aperture rays with the same physical rotation as the inverse image mapping", () => {
    const angularVelocityRadPerSec = { pitch: 0.3, yaw: -0.5, roll: 0.2 };
    const timeSecondsFromOpeningReference = 0.2;
    const sourcePointNativeSensorMm = { x: 6, y: -4 };
    const rays = calculateSensorApertureRays({
      focalLengthMm: 50,
      nominalFNumber: 4,
      focus: { kind: "infinity" },
      sourcePointNativeSensorMm,
      angularVelocityRadPerSec,
      timeSecondsFromOpeningReference,
      pupil: {
        kind: "ideal-uniform-circular-pupil",
        radialSampleCount: 1,
        angularSampleCount: 4,
        evidence: [
          {
            sourceOrigin: "photivra",
            sourceReference: "test:sign-consistency",
            reuseStatus: "photivra-owned"
          }
        ],
        limitation: "test pupil"
      }
    }).value;
    const inverse = calculateInverseCameraRotationImageMapping({
      focalLengthMm: 50,
      // Native +Y down becomes image-plane +Y up.
      imagePointMm: {
        x: sourcePointNativeSensorMm.x,
        y: -sourcePointNativeSensorMm.y
      },
      timeSecondsFromExposureStart: timeSecondsFromOpeningReference,
      angularVelocityRadPerSec
    }).value;
    // At infinity focus every pupil ray shares the chief-ray direction.
    const direction = rays.rays[0]!.directionUnitVector;
    expect((50 * direction.x) / direction.z).toBeCloseTo(
      inverse.referenceImagePointMm.x,
      11
    );
    expect((50 * direction.y) / direction.z).toBeCloseTo(
      inverse.referenceImagePointMm.y,
      11
    );
  });
});
