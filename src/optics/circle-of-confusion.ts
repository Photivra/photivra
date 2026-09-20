// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { requirePositiveFinite } from "../core/validation.js";

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
 * Estimates a circle-of-confusion criterion for equivalent final viewing by
 * scaling a caller-supplied reference criterion in proportion to sensor
 * diagonal.
 *
 * This is a viewing/acceptability convention, not a physical blur threshold.
 */
export function estimateEquivalentViewingCircleOfConfusion(
  input: EstimateEquivalentViewingCircleOfConfusionInput
): CalculationResult<EquivalentViewingCircleOfConfusion> {
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

  const sensorDiagonalMm = Math.hypot(
    input.sensorWidthMm,
    input.sensorHeightMm
  );
  const referenceSensorDiagonalMm = Math.hypot(
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
