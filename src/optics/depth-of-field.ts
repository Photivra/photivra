// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite
} from "../core/validation.js";
import { calculateThinLensImageDistance } from "./thin-lens.js";

export interface CalculateDepthOfFieldInput {
  /** Lens focal length in millimetres. */
  focalLengthMm: number;
  /** F-number. */
  aperture: number;
  /** Focus distance from the lens plane in metres. */
  focusDistanceM: number;
  /** Acceptable circle of confusion diameter in millimetres. */
  circleOfConfusionMm: number;
}

export interface DepthOfField {
  hyperfocalDistanceM: number;
  nearLimitM: number;
  /** Null represents an infinite far limit. */
  farLimitM: number | null;
  /** Null represents infinite total depth of field. */
  totalDepthOfFieldM: number | null;
}

/**
 * Calculates thin-lens depth-of-field limits using the conventional
 * hyperfocal-distance formulation.
 *
 * The model is geometric and does not include diffraction, aberrations,
 * focus breathing, pupil magnification, or macro/high-magnification effects.
 *
 * @param input Lens, focus, aperture, and acceptable blur-circle inputs.
 * @returns Hyperfocal, near, and far depth-of-field distances.
 */
export function calculateDepthOfField(
  input: CalculateDepthOfFieldInput
): CalculationResult<DepthOfField> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  requirePositiveFinite("aperture", input.aperture);
  requirePositiveFinite("focusDistanceM", input.focusDistanceM);
  requirePositiveFinite("circleOfConfusionMm", input.circleOfConfusionMm);

  const focusDistanceMm = input.focusDistanceM * 1000;
  if (focusDistanceMm <= input.focalLengthMm) {
    throw new InvalidScientificInputError(
      "focusDistanceM must place the focus plane beyond the focal length."
    );
  }

  const hyperfocalDistanceMm =
    (input.focalLengthMm * input.focalLengthMm) /
      (input.aperture * input.circleOfConfusionMm) +
    input.focalLengthMm;

  const focusOffsetMm = focusDistanceMm - input.focalLengthMm;
  const nearLimitMm =
    (hyperfocalDistanceMm * focusDistanceMm) /
    (hyperfocalDistanceMm + focusOffsetMm);

  const farDenominator = hyperfocalDistanceMm - focusOffsetMm;
  const farLimitMm =
    farDenominator <= 0
      ? null
      : (hyperfocalDistanceMm * focusDistanceMm) / farDenominator;

  return calculatedResult(
    {
      hyperfocalDistanceM: hyperfocalDistanceMm / 1000,
      nearLimitM: nearLimitMm / 1000,
      farLimitM: farLimitMm === null ? null : farLimitMm / 1000,
      totalDepthOfFieldM:
        farLimitMm === null ? null : (farLimitMm - nearLimitMm) / 1000
    },
    "thin-lens-depth-of-field",
    "1.0.0",
    [
      "Geometric thin-lens model",
      "Circle of confusion is supplied by the caller",
      "Macro/high-magnification effects are not modeled"
    ]
  );
}

export interface CalculateDefocusCircleInput {
  /** Lens focal length in millimetres. */
  focalLengthMm: number;
  /** F-number. */
  aperture: number;
  /** Focus-plane distance from the lens plane in metres. */
  focusDistanceM: number;
  /** Subject-plane distance from the lens plane in metres. */
  subjectDistanceM: number;
}

export interface DefocusCircle {
  /** Geometric blur-circle diameter at the sensor plane in millimetres. */
  diameterMm: number;
}

/**
 * Calculates the geometric defocus-circle diameter at the sensor plane for a
 * subject plane away from the selected focus plane.
 *
 * @param input Lens, aperture, focus-plane, and subject-plane distances.
 * @returns Geometric blur-circle diameter.
 */
export function calculateDefocusCircle(
  input: CalculateDefocusCircleInput
): CalculationResult<DefocusCircle> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  requirePositiveFinite("aperture", input.aperture);
  requirePositiveFinite("focusDistanceM", input.focusDistanceM);
  requirePositiveFinite("subjectDistanceM", input.subjectDistanceM);

  let focusImageDistanceMm: number;
  let subjectImageDistanceMm: number;
  try {
    focusImageDistanceMm = calculateThinLensImageDistance({
      focalLengthMm: input.focalLengthMm,
      objectDistanceM: input.focusDistanceM
    }).value.imageDistanceMm;
    subjectImageDistanceMm = calculateThinLensImageDistance({
      focalLengthMm: input.focalLengthMm,
      objectDistanceM: input.subjectDistanceM
    }).value.imageDistanceMm;
  } catch (error) {
    if (error instanceof InvalidScientificInputError) {
      throw new InvalidScientificInputError(
        "focusDistanceM and subjectDistanceM must be beyond the focal length."
      );
    }
    throw error;
  }
  const apertureDiameterMm = input.focalLengthMm / input.aperture;

  const diameterMm =
    apertureDiameterMm *
    (Math.abs(subjectImageDistanceMm - focusImageDistanceMm) /
      subjectImageDistanceMm);

  return calculatedResult(
    { diameterMm },
    "thin-lens-defocus-circle",
    "1.0.0",
    ["Geometric thin-lens model", "Ideal circular entrance pupil"]
  );
}
