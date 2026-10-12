// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Calculates dimensions remaining after a centered, same-aspect-ratio crop.
 * @see docs/PROCESSED_OUTPUT.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite,
  requirePositiveInteger
} from "../core/validation.js";

/**
 * Largest whole-pixel count not exceeding `length` (at least 1). A value within
 * floating-point noise of an integer counts as that integer, so 4480 / (7 / 3)
 * = 1919.9999999999998 gives 1920 rather than dropping a pixel.
 * Repository-internal helper; not a root package export.
 */
export function floorWholePixels(length: number): number {
  const nearest = Math.round(length);
  return Math.max(
    1,
    Math.abs(length - nearest) <= 1e-9 * Math.max(1, length)
      ? nearest
      : Math.floor(length)
  );
}

export interface CalculateCenteredCropInput {
  /** Original image width in pixels. */
  pixelWidth: number;
  /** Original image height in pixels. */
  pixelHeight: number;
  /**
   * Linear crop factor. 1 means no crop; 1.5 retains at most 1 / 1.5 of each
   * dimension. The shorter axis is floor(dimension / cropFactor); the longer
   * axis is the integer nearest the source aspect ratio, capped at
   * floor(dimension / cropFactor), so the aspect ratio is preserved as closely
   * as whole pixels allow.
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

  // Floor the shorter axis (never exceeding 1 / cropFactor of it), then derive
  // the longer axis from that integer so the ratio is as close as integers
  // allow. The derived axis is also capped at floor(longer / cropFactor), so a
  // crop never keeps more than 1 / cropFactor of either dimension.
  const landscape = input.pixelWidth >= input.pixelHeight;
  const shortSource = landscape ? input.pixelHeight : input.pixelWidth;
  const longSource = landscape ? input.pixelWidth : input.pixelHeight;
  const shortAxis = floorWholePixels(shortSource / input.cropFactor);
  const longAxis = Math.max(
    1,
    Math.min(
      floorWholePixels(longSource / input.cropFactor),
      Math.round((shortAxis * longSource) / shortSource)
    )
  );
  const pixelWidth = landscape ? longAxis : shortAxis;
  const pixelHeight = landscape ? shortAxis : longAxis;

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
    [
      "Centered crop",
      "Original aspect ratio is preserved to integer-pixel precision: the shorter axis is floor(dimension / cropFactor) and the longer axis is the nearest integer to the source ratio, capped at floor(dimension / cropFactor)"
    ]
  );
}
