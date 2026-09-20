// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite,
  requirePositiveInteger
} from "../core/validation.js";

export interface CalculateCenteredCropInput {
  /** Original image width in pixels. */
  pixelWidth: number;
  /** Original image height in pixels. */
  pixelHeight: number;
  /**
   * Linear crop factor. 1 means no crop; 1.5 retains 1 / 1.5 of each
   * dimension while preserving aspect ratio.
   */
  cropFactor: number;
}

export interface CenteredCrop {
  pixelWidth: number;
  pixelHeight: number;
  megapixels: number;
  /** Fraction of original pixel area retained, from 0 to 1. */
  retainedAreaFraction: number;
}

/**
 * Calculates dimensions remaining after a centered, same-aspect-ratio crop.
 *
 * @param input Original dimensions and linear crop factor.
 * @returns Remaining pixel dimensions and area fraction.
 */
export function calculateCenteredCrop(
  input: CalculateCenteredCropInput
): CalculationResult<CenteredCrop> {
  requirePositiveInteger("pixelWidth", input.pixelWidth);
  requirePositiveInteger("pixelHeight", input.pixelHeight);
  requirePositiveFinite("cropFactor", input.cropFactor);

  if (input.cropFactor < 1) {
    throw new InvalidScientificInputError(
      "cropFactor must be greater than or equal to 1."
    );
  }

  const pixelWidth = Math.max(1, Math.floor(input.pixelWidth / input.cropFactor));
  const pixelHeight = Math.max(
    1,
    Math.floor(input.pixelHeight / input.cropFactor)
  );

  return calculatedResult(
    {
      pixelWidth,
      pixelHeight,
      megapixels: (pixelWidth * pixelHeight) / 1_000_000,
      retainedAreaFraction:
        (pixelWidth * pixelHeight) / (input.pixelWidth * input.pixelHeight)
    },
    "centered-same-aspect-crop",
    "1.0.0",
    ["Centered crop", "Original aspect ratio is preserved"]
  );
}
