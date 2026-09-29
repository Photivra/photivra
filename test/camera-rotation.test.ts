import { describe, expect, it } from "vitest";

import {
  calculateCameraRotationImageMapping,
  calculateInverseCameraRotationImageMapping
} from "../src/motion/camera-rotation.js";

describe("spatial camera-rotation image mapping", () => {
  it("maps center yaw with the exact rectilinear tangent relation", () => {
    const focalLengthMm = 50;
    const yaw = 0.02;
    const timeSecondsFromExposureStart = 0.5;
    const angle = yaw * timeSecondsFromExposureStart;

    const result = calculateCameraRotationImageMapping({
      focalLengthMm,
      imagePointMm: { x: 0, y: 0 },
      timeSecondsFromExposureStart,
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw,
        roll: 0
      }
    });

    expect(result.value.mappedImagePointMm.x).toBeCloseTo(
      -focalLengthMm * Math.tan(angle),
      12
    );
    expect(result.value.mappedImagePointMm.y).toBeCloseTo(0, 12);
    expect(result.value.deltaMm.x).toBeLessThan(0);
    expect(result.provenance.kind).toBe("calculated");
  });

  it("maps center pitch with the exact rectilinear tangent relation", () => {
    const focalLengthMm = 85;
    const pitch = 0.015;
    const timeSecondsFromExposureStart = 0.4;
    const angle = pitch * timeSecondsFromExposureStart;

    const result = calculateCameraRotationImageMapping({
      focalLengthMm,
      imagePointMm: { x: 0, y: 0 },
      timeSecondsFromExposureStart,
      angularVelocityRadPerSec: {
        pitch,
        yaw: 0,
        roll: 0
      }
    });

    expect(result.value.mappedImagePointMm.x).toBeCloseTo(0, 12);
    expect(result.value.mappedImagePointMm.y).toBeCloseTo(
      focalLengthMm * Math.tan(angle),
      12
    );
    expect(result.value.deltaMm.y).toBeGreaterThan(0);
  });

  it("keeps the optical-axis center fixed under pure roll", () => {
    const result = calculateCameraRotationImageMapping({
      focalLengthMm: 50,
      imagePointMm: { x: 0, y: 0 },
      timeSecondsFromExposureStart: 0.25,
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0,
        roll: 0.3
      }
    });

    expect(result.value.mappedImagePointMm.x).toBeCloseTo(0, 12);
    expect(result.value.mappedImagePointMm.y).toBeCloseTo(0, 12);
    expect(result.value.deltaMm.distance).toBeCloseTo(0, 12);
  });

  it("rotates off-axis image points oppositely to positive camera roll", () => {
    const point = { x: 10, y: 0 };
    const timeSecondsFromExposureStart = 0.5;
    const roll = 0.2;
    const angle = roll * timeSecondsFromExposureStart;

    const result = calculateCameraRotationImageMapping({
      focalLengthMm: 50,
      imagePointMm: point,
      timeSecondsFromExposureStart,
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0,
        roll
      }
    });

    expect(result.value.mappedImagePointMm.x).toBeCloseTo(
      point.x * Math.cos(angle),
      12
    );
    expect(result.value.mappedImagePointMm.y).toBeCloseTo(
      -point.x * Math.sin(angle),
      12
    );
    expect(
      Math.hypot(
        result.value.mappedImagePointMm.x,
        result.value.mappedImagePointMm.y
      )
    ).toBeCloseTo(Math.hypot(point.x, point.y), 12);
  });

  it("is exactly identity at exposure start for any finite angular velocity", () => {
    const result = calculateCameraRotationImageMapping({
      focalLengthMm: 35,
      imagePointMm: { x: 12.5, y: -6.25 },
      timeSecondsFromExposureStart: 0,
      angularVelocityRadPerSec: {
        pitch: 0.4,
        yaw: -0.3,
        roll: 0.2
      }
    });

    expect(result.value.mappedImagePointMm).toEqual({
      x: 12.5,
      y: -6.25
    });
    expect(result.value.deltaMm).toEqual({
      x: 0,
      y: 0,
      distance: 0
    });
    expect(result.value.angularDisplacementRad.magnitude).toBe(0);
  });

  it("produces spatially varying yaw flow across the image field", () => {
    const common = {
      focalLengthMm: 50,
      timeSecondsFromExposureStart: 1 / 10,
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0.2,
        roll: 0
      }
    } as const;

    const center = calculateCameraRotationImageMapping({
      ...common,
      imagePointMm: { x: 0, y: 0 }
    }).value;
    const edge = calculateCameraRotationImageMapping({
      ...common,
      imagePointMm: { x: 18, y: 0 }
    }).value;
    const corner = calculateCameraRotationImageMapping({
      ...common,
      imagePointMm: { x: 18, y: 12 }
    }).value;

    expect(edge.deltaMm.x).not.toBeCloseTo(center.deltaMm.x, 8);
    expect(corner.deltaMm.y).not.toBeCloseTo(center.deltaMm.y, 8);
    expect(corner.deltaMm.distance).not.toBeCloseTo(
      center.deltaMm.distance,
      8
    );
  });

  it("uses one axis-angle rotation for simultaneous pitch yaw and roll", () => {
    const result = calculateCameraRotationImageMapping({
      focalLengthMm: 50,
      imagePointMm: { x: 5, y: -3 },
      timeSecondsFromExposureStart: 0.25,
      angularVelocityRadPerSec: {
        pitch: 0.04,
        yaw: -0.02,
        roll: 0.03
      }
    });

    expect(result.value.angularDisplacementRad).toEqual(
      expect.objectContaining({
        pitch: 0.01,
        yaw: -0.005,
        roll: 0.0075
      })
    );
    expect(result.value.angularDisplacementRad.magnitude).toBeCloseTo(
      Math.hypot(0.01, -0.005, 0.0075),
      12
    );
    expect(result.value.deltaMm.distance).toBeGreaterThan(0);
  });

  it("uses focus-aware projection distance when focus is supplied", () => {
    const input = {
      focalLengthMm: 200,
      imagePointMm: { x: 0, y: 0 },
      timeSecondsFromExposureStart: 1 / 30,
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0.01,
        roll: 0
      }
    } as const;

    const pinhole = calculateCameraRotationImageMapping(input);
    const focused = calculateCameraRotationImageMapping({
      ...input,
      focusDistanceM: 22
    });

    expect(focused.value.projectionDistanceMm).toBeCloseTo(
      201.834862385,
      9
    );
    expect(Math.abs(focused.value.deltaMm.x)).toBeGreaterThan(
      Math.abs(pinhole.value.deltaMm.x)
    );
    expect(focused.provenance.model).toBe(
      "focus-aware-spatial-camera-rotation-mapping"
    );
  });

  it("reports axis-aware geometric sample displacement without collapsing pitch", () => {
    const result = calculateCameraRotationImageMapping({
      focalLengthMm: 50,
      imagePointMm: { x: 10, y: 5 },
      timeSecondsFromExposureStart: 0.2,
      angularVelocityRadPerSec: {
        pitch: 0.01,
        yaw: 0.02,
        roll: 0.03
      },
      samplingPitchMicrometers: {
        x: 5,
        y: 10
      }
    });

    expect(result.value.deltaImagePlaneSamples).toBeDefined();
    expect(result.value.deltaImagePlaneSamples?.x).toBeCloseTo(
      result.value.deltaMm.x / 0.005,
      12
    );
    expect(result.value.deltaImagePlaneSamples?.y).toBeCloseTo(
      result.value.deltaMm.y / 0.01,
      12
    );
    expect(result.value.deltaImagePlaneSamples?.distance).toBeCloseTo(
      Math.hypot(
        result.value.deltaMm.x / 0.005,
        result.value.deltaMm.y / 0.01
      ),
      12
    );
  });

  it("rejects negative time and non-finite rotation inputs", () => {
    expect(() =>
      calculateCameraRotationImageMapping({
        focalLengthMm: 50,
        imagePointMm: { x: 0, y: 0 },
        timeSecondsFromExposureStart: -0.1,
        angularVelocityRadPerSec: {
          pitch: 0,
          yaw: 0,
          roll: 0
        }
      })
    ).toThrow("timeSecondsFromExposureStart");

    expect(() =>
      calculateCameraRotationImageMapping({
        focalLengthMm: 50,
        imagePointMm: { x: 0, y: 0 },
        timeSecondsFromExposureStart: 0.1,
        angularVelocityRadPerSec: {
          pitch: Number.NaN,
          yaw: 0,
          roll: 0
        }
      })
    ).toThrow("angularVelocityRadPerSec.pitch");
  });

  it("fails closed if rotation maps the world ray to or behind the camera plane", () => {
    expect(() =>
      calculateCameraRotationImageMapping({
        focalLengthMm: 50,
        imagePointMm: { x: 0, y: 0 },
        timeSecondsFromExposureStart: 1,
        angularVelocityRadPerSec: {
          pitch: 0,
          yaw: Math.PI,
          roll: 0
        }
      })
    ).toThrow("to or behind the camera plane");
  });
  it("round-trips forward and analytic inverse rotation mappings", () => {
    const input = {
      focalLengthMm: 85,
      imagePointMm: { x: 12.5, y: -4.75 },
      timeSecondsFromExposureStart: 0.037,
      angularVelocityRadPerSec: {
        pitch: 0.06,
        yaw: -0.11,
        roll: 0.04
      },
      focusDistanceM: 8
    } as const;

    const forward = calculateCameraRotationImageMapping(input).value;
    const inverse = calculateInverseCameraRotationImageMapping({
      ...input,
      imagePointMm: forward.mappedImagePointMm
    });

    expect(inverse.value.referenceImagePointMm.x).toBeCloseTo(
      input.imagePointMm.x,
      11
    );
    expect(inverse.value.referenceImagePointMm.y).toBeCloseTo(
      input.imagePointMm.y,
      11
    );
    expect(inverse.provenance.kind).toBe("calculated");
    expect(inverse.provenance.assumptions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("analytic"),
        expect.stringContaining("no iterative solve")
      ])
    );
  });

  it("keeps the analytic inverse at identity for zero time or zero rotation", () => {
    const zeroTime = calculateInverseCameraRotationImageMapping({
      focalLengthMm: 50,
      imagePointMm: { x: 7, y: -3 },
      timeSecondsFromExposureStart: 0,
      angularVelocityRadPerSec: {
        pitch: 0.2,
        yaw: -0.1,
        roll: 0.05
      }
    }).value;
    const zeroRotation = calculateInverseCameraRotationImageMapping({
      focalLengthMm: 50,
      imagePointMm: { x: 7, y: -3 },
      timeSecondsFromExposureStart: 0.5,
      angularVelocityRadPerSec: {
        pitch: 0,
        yaw: 0,
        roll: 0
      }
    }).value;

    expect(zeroTime.referenceImagePointMm).toEqual({ x: 7, y: -3 });
    expect(zeroRotation.referenceImagePointMm).toEqual({ x: 7, y: -3 });
  });

  it("reports inverse sample displacement in the image-plane basis", () => {
    const result = calculateInverseCameraRotationImageMapping({
      focalLengthMm: 50,
      imagePointMm: { x: 10, y: 5 },
      timeSecondsFromExposureStart: 0.2,
      angularVelocityRadPerSec: {
        pitch: 0.01,
        yaw: 0.02,
        roll: 0.03
      },
      samplingPitchMicrometers: {
        x: 5,
        y: 10
      }
    }).value;

    expect(result.deltaImagePlaneSamples?.x).toBeCloseTo(
      result.deltaMm.x / 0.005,
      12
    );
    expect(result.deltaImagePlaneSamples?.y).toBeCloseTo(
      result.deltaMm.y / 0.01,
      12
    );
  });

  it("fails closed when inverse rotation sends the ray behind the reference plane", () => {
    expect(() =>
      calculateInverseCameraRotationImageMapping({
        focalLengthMm: 50,
        imagePointMm: { x: 0, y: 0 },
        timeSecondsFromExposureStart: 1,
        angularVelocityRadPerSec: {
          pitch: 0,
          yaw: Math.PI,
          roll: 0
        }
      })
    ).toThrow("reference camera plane");
  });

});
