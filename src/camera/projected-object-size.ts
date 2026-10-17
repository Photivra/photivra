// SPDX-License-Identifier: Apache-2.0

/**
 * Projected size, on the sensor, of a flat object that faces the camera (fronto-parallel).
 * - Without focusDistanceM, it uses ideal pinhole projection with the nominal focal length.
 * - With focusDistanceM, it projects onto the ideal thin-lens sensor plane for that focus distance.
 * @see docs/PHYSICS_FOUNDATION.md for the equations, units, coordinate conventions, known blockers
 * and support limits.
 */

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { requirePositiveFinite } from "../core/validation.js";
import { calculateThinLensImageDistance } from "../optics/thin-lens.js";
import { requireInputKeys } from "../core/record-validation.js";

export interface CalculateProjectedObjectSizeInput {
  /** Lens focal length in millimetres. */
  focalLengthMm: number;
  /** Object width in metres. */
  objectWidthM: number;
  /** Object height in metres. */
  objectHeightM: number;
  /** Object-plane distance from the camera in metres. */
  distanceM: number;
  /** Optional focus distance in metres for focus-aware sensor-plane projection. */
  focusDistanceM?: number;
  /** Optional sensor pixel pitch in micrometres. */
  pixelPitchMicrometers?: number;
}

export interface ProjectedObjectSize {
  widthMm: number;
  heightMm: number;
  projectionDistanceMm: number;
  widthPixels?: number;
  heightPixels?: number;
}

/**
 * Calculates the projected size of a flat object that faces the camera
 * (fronto-parallel).
 *
 * Without focusDistanceM, it uses ideal pinhole projection with the nominal
 * focal length. With focusDistanceM, it projects onto the ideal thin-lens
 * sensor plane for that focus distance.
 *
 * @param input Lens, object-size, distance, optional focus, and optional pixel-pitch inputs.
 * @returns Projected object dimensions at the sensor plane.
 */
export function calculateProjectedObjectSize(
  input: CalculateProjectedObjectSizeInput
): CalculationResult<ProjectedObjectSize> {
  requireInputKeys(input, "calculateProjectedObjectSize", ["focalLengthMm", "objectWidthM", "objectHeightM", "distanceM", "focusDistanceM", "pixelPitchMicrometers"]);
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  requirePositiveFinite("objectWidthM", input.objectWidthM);
  requirePositiveFinite("objectHeightM", input.objectHeightM);
  requirePositiveFinite("distanceM", input.distanceM);

  const focusProjection =
    input.focusDistanceM === undefined
      ? undefined
      : calculateThinLensImageDistance({
          focalLengthMm: input.focalLengthMm,
          objectDistanceM: input.focusDistanceM
        });
  const projectionDistanceMm =
    focusProjection?.value.imageDistanceMm ?? input.focalLengthMm;
  const widthMm =
    projectionDistanceMm * (input.objectWidthM / input.distanceM);
  const heightMm =
    projectionDistanceMm * (input.objectHeightM / input.distanceM);
  const model =
    focusProjection === undefined
      ? "fronto-parallel-pinhole-object-size"
      : "focus-aware-thin-lens-object-size";
  const assumptions =
    focusProjection === undefined
      ? [
          "Ideal pinhole projection",
          "Object plane is fronto-parallel to the sensor",
          "Physical object dimensions are supplied by the caller"
        ]
      : [
          "Ideal paraxial thin-lens projection to the selected sensor plane",
          "Object plane is fronto-parallel to the sensor",
          "Physical object dimensions are supplied by the caller",
          "Real-lens focus breathing and pupil magnification are not modeled"
        ];

  if (input.pixelPitchMicrometers === undefined) {
    return calculatedResult(
      { widthMm, heightMm, projectionDistanceMm },
      model,
      "1.0.0",
      assumptions
    );
  }

  requirePositiveFinite(
    "pixelPitchMicrometers",
    input.pixelPitchMicrometers
  );
  const pitchMm = input.pixelPitchMicrometers / 1000;

  return calculatedResult(
    {
      widthMm,
      heightMm,
      projectionDistanceMm,
      widthPixels: widthMm / pitchMm,
      heightPixels: heightMm / pitchMm
    },
    model,
    "1.0.0",
    assumptions
  );
}
