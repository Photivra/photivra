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

export interface CalculateSubjectFramingCropInput {
  /** Source image width in pixels. */
  pixelWidth: number;
  /** Source image height in pixels. */
  pixelHeight: number;
  /** Projected subject height in source-image pixels. */
  subjectHeightPixels: number;
  /** Desired subject height as a fraction of output frame height, >0 and <=1. */
  targetSubjectHeightFraction: number;
}

export interface SubjectFramingCrop {
  cropFactor: number;
  pixelWidth: number;
  pixelHeight: number;
  megapixels: number;
  /**
   * Actual subject height divided by cropped frame height.
   * Values greater than 1 mean the subject is taller than the output frame.
   */
  subjectHeightFraction: number;
  /** Whether the projected subject exceeds the cropped frame height. */
  subjectClipped: boolean;
  /** Whether achieving the target required an additional crop. */
  cropped: boolean;
}

/**
 * Calculates the same-aspect-ratio crop needed for a subject to occupy a
 * requested fraction of frame height.
 *
 * This calculation assumes a centered/positionable crop with enough spatial
 * margin around the subject. It does not validate subject position against
 * image edges.
 */
export function calculateSubjectFramingCrop(
  input: CalculateSubjectFramingCropInput
): CalculationResult<SubjectFramingCrop> {
  requirePositiveInteger("pixelWidth", input.pixelWidth);
  requirePositiveInteger("pixelHeight", input.pixelHeight);
  requirePositiveFinite("subjectHeightPixels", input.subjectHeightPixels);
  requirePositiveFinite(
    "targetSubjectHeightFraction",
    input.targetSubjectHeightFraction
  );

  if (input.targetSubjectHeightFraction > 1) {
    throw new InvalidScientificInputError(
      "targetSubjectHeightFraction must be less than or equal to 1."
    );
  }

  const requestedCropHeight =
    input.subjectHeightPixels / input.targetSubjectHeightFraction;
  const cropFactor =
    requestedCropHeight >= input.pixelHeight
      ? 1
      : input.pixelHeight / requestedCropHeight;

  const pixelHeight = Math.max(
    1,
    Math.floor(input.pixelHeight / cropFactor)
  );
  const pixelWidth = Math.max(
    1,
    Math.floor(input.pixelWidth / cropFactor)
  );
  const subjectHeightFraction =
    input.subjectHeightPixels / pixelHeight;

  return calculatedResult(
    {
      cropFactor,
      pixelWidth,
      pixelHeight,
      megapixels: (pixelWidth * pixelHeight) / 1_000_000,
      subjectHeightFraction,
      subjectClipped: subjectHeightFraction > 1,
      cropped: cropFactor > 1
    },
    "subject-height-framing-crop",
    "1.0.0",
    [
      "Original aspect ratio is preserved",
      "Crop can be positioned around the subject",
      "Subject edge/margin constraints are not modeled",
      "subjectHeightFraction may exceed 1 when the subject is clipped by frame height"
    ]
  );
}
