// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite
} from "../core/validation.js";

export interface CalculateThinLensImageDistanceInput {
  /** Lens focal length in millimetres. */
  focalLengthMm: number;
  /** Object/focus-plane distance from the lens principal plane in metres. */
  objectDistanceM: number;
}

export interface ThinLensImageDistance {
  /** Image/sensor-plane distance from the lens principal plane in millimetres. */
  imageDistanceMm: number;
  /** Absolute paraxial magnification at the supplied object distance. */
  magnification: number;
  /**
   * Image-distance scale relative to the infinity-focus approximation f.
   * Values approach 1 as object distance becomes large.
   */
  infinityProjectionScale: number;
}

/**
 * Calculates Gaussian thin-lens image distance:
 *
 * 1/f = 1/s + 1/v
 *
 * where f is focal length, s is object distance, and v is image distance.
 *
 * This is a paraxial ideal-lens model. It does not model real-lens focus
 * breathing, pupil magnification, principal-plane movement, or aberrations.
 */
export function calculateThinLensImageDistance(
  input: CalculateThinLensImageDistanceInput
): CalculationResult<ThinLensImageDistance> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  requirePositiveFinite("objectDistanceM", input.objectDistanceM);

  const objectDistanceMm = input.objectDistanceM * 1000;
  if (objectDistanceMm <= input.focalLengthMm) {
    throw new InvalidScientificInputError(
      "objectDistanceM must place the object plane beyond the focal length."
    );
  }

  const imageDistanceMm =
    (input.focalLengthMm * objectDistanceMm) /
    (objectDistanceMm - input.focalLengthMm);

  return calculatedResult(
    {
      imageDistanceMm,
      magnification: imageDistanceMm / objectDistanceMm,
      infinityProjectionScale: imageDistanceMm / input.focalLengthMm
    },
    "gaussian-thin-lens-image-distance",
    "1.0.0",
    [
      "Paraxial Gaussian thin-lens model",
      "Distances are measured from ideal principal planes",
      "Real-lens focus breathing and pupil magnification are not modeled"
    ]
  );
}
