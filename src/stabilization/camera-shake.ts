// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite
} from "../core/validation.js";
import { calculateThinLensImageDistance } from "../optics/thin-lens.js";

export interface EstimateCameraShakeBlurInput {
  focalLengthMm: number;
  shutterSeconds: number;
  angularVelocityRadPerSec: {
    yaw: number;
    pitch: number;
  };
  stabilizationStopsEquivalent: number;
  /** Optional focus distance in metres for focus-aware sensor-plane projection. */
  focusDistanceM?: number;
  pixelPitchMicrometers?: number;
}

export interface CameraShakeBlurSample {
  deltaXmm: number;
  deltaYmm: number;
  distanceMm: number;
  distancePixels?: number;
  deltaXPixels?: number;
  deltaYPixels?: number;
}

export interface CameraShakeEstimate {
  residualMotionFactor: number;
  projectionDistanceMm: number;
  unstabilized: CameraShakeBlurSample;
  stabilized: CameraShakeBlurSample;
}

function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new InvalidScientificInputError(`${name} must be finite.`);
  }
}

function projectAngularDisplacement(
  projectionDistanceMm: number,
  yawRad: number,
  pitchRad: number,
  pixelPitchMicrometers?: number
): CameraShakeBlurSample {
  const deltaXmm = projectionDistanceMm * Math.tan(yawRad);
  const deltaYmm = projectionDistanceMm * Math.tan(pitchRad);
  const distanceMm = Math.hypot(deltaXmm, deltaYmm);

  if (pixelPitchMicrometers === undefined) {
    return { deltaXmm, deltaYmm, distanceMm };
  }

  const pitchMm = pixelPitchMicrometers / 1000;
  return {
    deltaXmm,
    deltaYmm,
    distanceMm,
    distancePixels: distanceMm / pitchMm,
    deltaXPixels: deltaXmm / pitchMm,
    deltaYPixels: deltaYmm / pitchMm
  };
}

/**
 * Estimates sensor-plane blur from a controlled constant-angular-velocity
 * handheld shake profile, with optional equivalent stabilization attenuation.
 *
 * With focusDistanceM supplied, angular motion is projected using the same
 * ideal thin-lens sensor-plane distance as the other focus-aware projection
 * primitives; otherwise nominal focal length preserves the prior approximation.
 *
 * The optical projection is physically calculated, but mapping a stabilization
 * rating in stops to residual angular motion by 2^-stops is an educational
 * approximation. It is not a CIPA DC-011 measurement or a real-camera rating.
 */
export function estimateCameraShakeBlur(
  input: EstimateCameraShakeBlurInput
): CalculationResult<CameraShakeEstimate> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  requirePositiveFinite("shutterSeconds", input.shutterSeconds);
  requireFinite(
    "angularVelocityRadPerSec.yaw",
    input.angularVelocityRadPerSec.yaw
  );
  requireFinite(
    "angularVelocityRadPerSec.pitch",
    input.angularVelocityRadPerSec.pitch
  );

  if (
    !Number.isFinite(input.stabilizationStopsEquivalent) ||
    input.stabilizationStopsEquivalent < 0
  ) {
    throw new InvalidScientificInputError(
      "stabilizationStopsEquivalent must be finite and greater than or equal to zero."
    );
  }

  if (input.pixelPitchMicrometers !== undefined) {
    requirePositiveFinite(
      "pixelPitchMicrometers",
      input.pixelPitchMicrometers
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
  const yawRad =
    input.angularVelocityRadPerSec.yaw * input.shutterSeconds;
  const pitchRad =
    input.angularVelocityRadPerSec.pitch * input.shutterSeconds;
  const residualMotionFactor =
    2 ** -input.stabilizationStopsEquivalent;

  return approximationResult(
    {
      residualMotionFactor,
      projectionDistanceMm,
      unstabilized: projectAngularDisplacement(
        projectionDistanceMm,
        yawRad,
        pitchRad,
        input.pixelPitchMicrometers
      ),
      stabilized: projectAngularDisplacement(
        projectionDistanceMm,
        yawRad * residualMotionFactor,
        pitchRad * residualMotionFactor,
        input.pixelPitchMicrometers
      )
    },
    focusProjection === undefined
      ? "constant-angular-velocity-stabilization-equivalent"
      : "focus-aware-constant-angular-velocity-stabilization-equivalent",
    "1.0.0",
    [
      "Camera rotation is constant during the exposure",
      focusProjection === undefined
        ? "Nominal focal length is used as the infinity-focus projection distance"
        : "Thin-lens image distance for the selected focus plane is used as the projection distance",
      "Yaw and pitch are treated independently",
      "Equivalent stabilization stops attenuate angular displacement by 2^-stops",
      "This is not a CIPA DC-011 compliance measurement",
      "Roll, translation, subject motion, and stabilization limits are not modeled"
    ]
  );
}
