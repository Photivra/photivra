// SPDX-License-Identifier: Apache-2.0

/**
 * Estimates a circle-of-confusion (CoC) criterion for equivalent final viewing. It scales a
 * caller-supplied reference criterion in proportion to the sensor diagonal.
 *
 * This is a viewing (acceptable-sharpness) convention, not a physical blur threshold.
 * @see docs/PHYSICS_FOUNDATION.md for the equations, units, coordinate conventions, known blockers
 * and support limits.
 */

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { requirePositiveFinite } from "../core/validation.js";
import { portableHypot } from "../core/portable-math.js";
import { requireInputKeys } from "../core/record-validation.js";

export interface EstimateEquivalentViewingCircleOfConfusionInput {
  sensorWidthMm: number;
  sensorHeightMm: number;
  referenceSensorWidthMm: number;
  referenceSensorHeightMm: number;
  referenceCircleOfConfusionMm: number;
}

export interface EquivalentViewingCircleOfConfusion {
  circleOfConfusionMm: number;
  sensorDiagonalMm: number;
  referenceSensorDiagonalMm: number;
  scaleFactor: number;
}

/**
 * Estimates a circle-of-confusion criterion for equivalent final viewing. It
 * scales a caller-supplied reference criterion in proportion to the sensor
 * diagonal.
 *
 * This is a viewing (acceptable-sharpness) convention, not a physical blur
 * threshold.
 */
export function estimateEquivalentViewingCircleOfConfusion(
  input: EstimateEquivalentViewingCircleOfConfusionInput
): CalculationResult<EquivalentViewingCircleOfConfusion> {
  requireInputKeys(input, "estimateEquivalentViewingCircleOfConfusion", ["sensorWidthMm", "sensorHeightMm", "referenceSensorWidthMm", "referenceSensorHeightMm", "referenceCircleOfConfusionMm"]);
  requirePositiveFinite("sensorWidthMm", input.sensorWidthMm);
  requirePositiveFinite("sensorHeightMm", input.sensorHeightMm);
  requirePositiveFinite(
    "referenceSensorWidthMm",
    input.referenceSensorWidthMm
  );
  requirePositiveFinite(
    "referenceSensorHeightMm",
    input.referenceSensorHeightMm
  );
  requirePositiveFinite(
    "referenceCircleOfConfusionMm",
    input.referenceCircleOfConfusionMm
  );

  const sensorDiagonalMm = portableHypot(
    input.sensorWidthMm,
    input.sensorHeightMm
  );
  const referenceSensorDiagonalMm = portableHypot(
    input.referenceSensorWidthMm,
    input.referenceSensorHeightMm
  );
  const scaleFactor = sensorDiagonalMm / referenceSensorDiagonalMm;

  return approximationResult(
    {
      circleOfConfusionMm:
        input.referenceCircleOfConfusionMm * scaleFactor,
      sensorDiagonalMm,
      referenceSensorDiagonalMm,
      scaleFactor
    },
    "equivalent-viewing-circle-of-confusion",
    "1.0.0",
    [
      "Reference and target images are compared at equivalent final display/print size",
      "Viewing distance and visual-acuity criterion are treated as equivalent",
      "Acceptable circle of confusion scales linearly with sensor diagonal",
      "This is a viewing convention, not a physical lens/sensor blur threshold"
    ]
  );
}
