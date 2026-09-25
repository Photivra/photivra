// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { requirePositiveFinite } from "../core/validation.js";
import {
  calculateImagingAreaMetrics,
  type SensorImagingArea
} from "../sensor/sensor-geometry.js";

export interface CalculateEquivalentFocalLength35MmInput {
  /** Physical optical focal length in millimetres. */
  focalLengthMm: number;
  /** Effective physical active-capture imaging area. */
  activeImagingArea: SensorImagingArea;
}

export interface EquivalentFocalLength35Mm {
  /** Physical optical focal length supplied by the caller. */
  actualFocalLengthMm: number;
  /** Conventional diagonal-based 35 mm-equivalent focal length. */
  equivalentFocalLength35Mm: number;
  /** Diagonal crop factor of the active physical capture area. */
  cropFactor35Mm: number;
  /** Physical active-capture diagonal in millimetres. */
  activeImagingAreaDiagonalMm: number;
  /** Declares the equivalence convention used by this result. */
  basis: "diagonal";
}

/**
 * Calculates conventional 35 mm-equivalent focal length from physical focal
 * length and the effective active-capture diagonal.
 *
 * The physical focal length remains unchanged and continues to be the optical
 * input for projection and depth-of-field calculations. Focus distance and
 * later digital/output crops are deliberately excluded from this conventional
 * equivalence quantity.
 *
 * @param input Physical focal length and active physical capture area.
 * @returns Actual and diagonal-based 35 mm-equivalent focal lengths.
 */
export function calculateEquivalentFocalLength35Mm(
  input: CalculateEquivalentFocalLength35MmInput
): CalculationResult<EquivalentFocalLength35Mm> {
  requirePositiveFinite("focalLengthMm", input.focalLengthMm);

  const imagingAreaMetrics = calculateImagingAreaMetrics(
    input.activeImagingArea
  ).value;

  return calculatedResult(
    {
      actualFocalLengthMm: input.focalLengthMm,
      equivalentFocalLength35Mm:
        input.focalLengthMm * imagingAreaMetrics.cropFactor35Mm,
      cropFactor35Mm: imagingAreaMetrics.cropFactor35Mm,
      activeImagingAreaDiagonalMm: imagingAreaMetrics.diagonalMm,
      basis: "diagonal"
    },
    "35mm-equivalent-focal-length",
    "1.0.0",
    [
      "35 mm reference frame is 36 × 24 mm and equivalence is diagonal-based.",
      "Actual focal length remains the physical optical focal length.",
      "Focus distance is excluded from conventional 35 mm-equivalent focal length.",
      "Digital/output cropping and output resolution are excluded; they must be described separately as output framing."
    ]
  );
}
