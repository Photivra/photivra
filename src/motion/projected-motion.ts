// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite
} from "../core/validation.js";
import { calculateThinLensImageDistance } from "../optics/thin-lens.js";
import type { Vector3 } from "../schema/scene.js";

export interface CalculateProjectedMotionBlurInput {
  /** Lens focal length in millimetres. */
  focalLengthMm: number;
  /** Shutter-open duration in seconds. */
  shutterSeconds: number;
  /** Object position at shutter open, in camera-relative metres. +z is away from the camera. */
  positionM: Vector3;
  /** Constant world-space velocity during the exposure, in metres per second. */
  velocityMps: Vector3;
  /** Optional focus distance in metres for focus-aware sensor-plane projection. */
  focusDistanceM?: number;
  /** Optional sensor pixel pitch in micrometres for pixel-domain blur reporting. */
  pixelPitchMicrometers?: number;
}

export interface ProjectedMotionBlur {
  deltaXMm: number;
  deltaYMm: number;
  distanceMm: number;
  projectionDistanceMm: number;
  distancePixels?: number;
}

function requireFiniteVector3(name: string, value: Vector3): void {
  for (const component of ["x", "y", "z"] as const) {
    if (!Number.isFinite(value[component])) {
      throw new InvalidScientificInputError(
        `${name}.${component} must be finite.`
      );
    }
  }
}

/**
 * Calculates sensor-plane motion during an exposure using ideal rectilinear
 * projection and constant linear object velocity.
 *
 * Without focusDistanceM, nominal focal length is the backwards-compatible
 * pinhole projection distance. With focusDistanceM, the selected thin-lens
 * sensor-plane image distance is used.
 *
 * The calculation projects the object's shutter-open and shutter-close
 * positions onto the image plane and measures the displacement between them.
 * It therefore handles lateral and depth-direction motion without relying on a
 * generic "subject speed" category.
 *
 * @param input Camera, exposure, object-position, and velocity inputs.
 * @returns Projected sensor-plane displacement.
 */
export function calculateProjectedMotionBlur(
  input: CalculateProjectedMotionBlurInput
): CalculationResult<ProjectedMotionBlur> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  requirePositiveFinite("shutterSeconds", input.shutterSeconds);

  requireFiniteVector3("positionM", input.positionM);
  requireFiniteVector3("velocityMps", input.velocityMps);

  if (input.positionM.z <= 0) {
    throw new InvalidScientificInputError(
      "positionM.z must place the object in front of the camera."
    );
  }

  const endPositionM = {
    x: input.positionM.x + input.velocityMps.x * input.shutterSeconds,
    y: input.positionM.y + input.velocityMps.y * input.shutterSeconds,
    z: input.positionM.z + input.velocityMps.z * input.shutterSeconds
  };

  if (endPositionM.z <= 0) {
    throw new InvalidScientificInputError(
      "Object motion crosses or reaches the camera plane during the exposure."
    );
  }

  const focusProjection =
    input.focusDistanceM === undefined
      ? undefined
      : calculateThinLensImageDistance({
          focalLengthMm: input.focalLengthMm,
          objectDistanceM: input.focusDistanceM
        });
  const projectionDistanceMm =
    focusProjection?.value.imageDistanceMm ?? input.focalLengthMm;

  const startXmm =
    projectionDistanceMm * (input.positionM.x / input.positionM.z);
  const startYmm =
    projectionDistanceMm * (input.positionM.y / input.positionM.z);
  const endXmm =
    projectionDistanceMm * (endPositionM.x / endPositionM.z);
  const endYmm =
    projectionDistanceMm * (endPositionM.y / endPositionM.z);

  const deltaXMm = endXmm - startXmm;
  const deltaYMm = endYmm - startYmm;
  const distanceMm = Math.hypot(deltaXMm, deltaYMm);

  let distancePixels: number | undefined;
  if (input.pixelPitchMicrometers !== undefined) {
    requirePositiveFinite(
      "pixelPitchMicrometers",
      input.pixelPitchMicrometers
    );
    distancePixels = distanceMm / (input.pixelPitchMicrometers / 1000);
  }

  return calculatedResult(
    {
      deltaXMm,
      deltaYMm,
      distanceMm,
      projectionDistanceMm,
      ...(distancePixels === undefined ? {} : { distancePixels })
    },
    focusProjection === undefined
      ? "constant-velocity-pinhole-motion"
      : "focus-aware-constant-velocity-thin-lens-motion",
    "1.0.0",
    focusProjection === undefined
      ? [
          "Ideal rectilinear/pinhole projection",
          "Constant object velocity during the exposure",
          "Camera motion is not included in this calculation"
        ]
      : [
          "Ideal rectilinear paraxial thin-lens projection to the selected sensor plane",
          "Constant object velocity during the exposure",
          "Camera motion is not included in this calculation",
          "Real-lens focus breathing is not modeled"
        ]
  );
}
