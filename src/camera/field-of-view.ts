// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { requirePositiveFinite } from "../core/validation.js";
import { calculateThinLensImageDistance } from "../optics/thin-lens.js";

export interface CalculateFieldOfViewInput {
  /** Lens focal length in millimetres. */
  focalLengthMm: number;
  /** Sensor dimension corresponding to the requested field of view, in millimetres. */
  sensorDimensionMm: number;
  /**
   * Optional focus distance in metres. When supplied, the ideal thin-lens
   * image distance is used as the projection distance. Omit to preserve the
   * infinity-focus/pinhole approximation.
   */
  focusDistanceM?: number;
}

export interface FieldOfView {
  /** Angular field of view in degrees. */
  degrees: number;
  /** Angular field of view in radians. */
  radians: number;
  /** Projection/image-plane distance used by the geometry, in millimetres. */
  projectionDistanceMm: number;
}

/**
 * Calculates rectilinear angular field of view as
 * 2 * atan(sensorDimension / (2 * projectionDistance)).
 *
 * Without focusDistanceM, projectionDistance is nominal focal length for
 * backwards-compatible infinity-focus/pinhole behavior. With focusDistanceM,
 * projectionDistance is the ideal Gaussian thin-lens image distance for that
 * focus plane.
 *
 * Neither mode models real-lens focus breathing or distortion.
 *
 * @param input Focal length, matching sensor dimension, and optional focus distance.
 * @returns Angular field of view.
 */
export function calculateFieldOfView(
  input: CalculateFieldOfViewInput
): CalculationResult<FieldOfView> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  requirePositiveFinite("sensorDimensionMm", input.sensorDimensionMm);

  const focusProjection =
    input.focusDistanceM === undefined
      ? undefined
      : calculateThinLensImageDistance({
          focalLengthMm: input.focalLengthMm,
          objectDistanceM: input.focusDistanceM
        });
  const projectionDistanceMm =
    focusProjection?.value.imageDistanceMm ?? input.focalLengthMm;
  const radians =
    2 * Math.atan(input.sensorDimensionMm / (2 * projectionDistanceMm));

  return calculatedResult(
    {
      radians,
      degrees: (radians * 180) / Math.PI,
      projectionDistanceMm
    },
    focusProjection === undefined
      ? "rectilinear-field-of-view"
      : "focus-aware-rectilinear-field-of-view",
    "1.0.0",
    focusProjection === undefined
      ? [
          "Ideal rectilinear/pinhole projection",
          "Nominal focal length represents the infinity-focus projection distance"
        ]
      : [
          "Ideal rectilinear paraxial thin-lens projection",
          "Sensor plane uses the thin-lens image distance for the supplied focus distance",
          "Real-lens focus breathing and distortion are not modeled"
        ]
  );
}
