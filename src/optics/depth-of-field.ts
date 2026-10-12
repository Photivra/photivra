// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Calculates exact thin-lens depth-of-field limits from the hyperfocal distance H = f^2/(Nc) + f:
 * near = s(H - f)/(H + s - 2f), far = s(H - f)/(H - s), infinite (null) when s >= H.
 * The model is geometric and does not include diffraction, aberrations, focus breathing, pupil
 * magnification, or macro/high-magnification effects.
 * Calculates the geometric defocus-circle diameter at the sensor plane for a subject plane away from
 * the selected focus plane.
 * @see docs/PHYSICS_FOUNDATION.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

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
 * Calculates exact thin-lens depth-of-field limits. With hyperfocal
 * distance H = f^2/(Nc) + f and focus distance s, the near limit is
 * s(H - f)/(H + s - 2f) and the far limit is s(H - f)/(H - s), which is
 * infinite (`null`) when s >= H. At both limits the geometric defocus circle
 * from {@link calculateDefocusCircle} equals the supplied circle of confusion.
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

  // H - f = f^2 / (N c), kept separately to avoid cancellation.
  const hyperfocalOffsetMm =
    (input.focalLengthMm * input.focalLengthMm) /
    (input.aperture * input.circleOfConfusionMm);
  const hyperfocalDistanceMm = hyperfocalOffsetMm + input.focalLengthMm;

  // Exact thin-lens limits. The defocus-circle diameter for a subject at d
  // while focused at s is c(d) = f^2 |s - d| / (N d (s - f)). Solving
  // c(d) = c with H = f^2 / (N c) + f gives
  //   near = s (H - f) / (H + s - 2f) = s (H - f) / ((H - f) + (s - f))
  //   far  = s (H - f) / (H - s), infinite when s >= H.
  const nearLimitMm =
    (focusDistanceMm * hyperfocalOffsetMm) /
    (hyperfocalOffsetMm + (focusDistanceMm - input.focalLengthMm));

  // Compare against the reported hyperfocal distance in metres as well, so a
  // caller focusing at exactly the returned hyperfocalDistanceM always gets an
  // infinite far limit despite millimetre/metre rounding.
  const hyperfocalDistanceM = hyperfocalDistanceMm / 1000;
  const farDenominator = hyperfocalDistanceMm - focusDistanceMm;
  const farLimitMm =
    farDenominator <= 0 || input.focusDistanceM >= hyperfocalDistanceM
      ? null
      : (focusDistanceMm * hyperfocalOffsetMm) / farDenominator;

  return calculatedResult(
    {
      hyperfocalDistanceM,
      nearLimitM: nearLimitMm / 1000,
      farLimitM: farLimitMm === null ? null : farLimitMm / 1000,
      totalDepthOfFieldM:
        farLimitMm === null ? null : (farLimitMm - nearLimitMm) / 1000
    },
    "thin-lens-depth-of-field",
    "1.1.0",
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
  return calculateDefocusCircleUsingFocusProjection(input);
}

/** @internal Immutable request-local identity; never a root public cache/API. */
export interface ResolvedDefocusFocusProjection {
  readonly focalLengthMm: number;
  readonly focusDistanceM: number;
  readonly imageDistanceMm: number;
}

/** @internal Reuses a projection already calculated for this exact POC request. */
export function calculateDefocusCircleUsingFocusProjection(
  input: CalculateDefocusCircleInput,
  projection?: ResolvedDefocusFocusProjection
): CalculationResult<DefocusCircle> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);
  requirePositiveFinite("aperture", input.aperture);
  requirePositiveFinite("focusDistanceM", input.focusDistanceM);
  requirePositiveFinite("subjectDistanceM", input.subjectDistanceM);

  let focusImageDistanceMm: number;
  let subjectImageDistanceMm: number;
  try {
    if (projection !== undefined) {
      if (projection.focalLengthMm !== input.focalLengthMm ||
          projection.focusDistanceM !== input.focusDistanceM ||
          input.focusDistanceM * 1000 <= input.focalLengthMm) {
        throw new InvalidScientificInputError("Resolved focus projection identity differs from the request.");
      }
      requirePositiveFinite("resolvedFocusImageDistanceMm", projection.imageDistanceMm);
      focusImageDistanceMm = projection.imageDistanceMm;
    } else {
      focusImageDistanceMm = calculateThinLensImageDistance({
        focalLengthMm: input.focalLengthMm,
        objectDistanceM: input.focusDistanceM
      }).value.imageDistanceMm;
    }
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
