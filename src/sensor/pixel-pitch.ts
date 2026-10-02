// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Calculates horizontal pixel pitch from active sensor width and pixel count.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  requirePositiveFinite,
  requirePositiveInteger
} from "../core/validation.js";

export interface CalculatePixelPitchInput {
  /** Physical sensor width in millimetres. */
  sensorWidthMm: number;
  /** Horizontal active pixel count. */
  pixelWidth: number;
}

export interface PixelPitch {
  /** Horizontal pixel pitch in micrometres. */
  micrometers: number;
  /** Horizontal pixel pitch in millimetres. */
  millimeters: number;
}

/**
 * Calculates horizontal pixel pitch from active sensor width and pixel count.
 *
 * @param input Sensor width and horizontal active pixel count.
 * @returns Pixel pitch.
 */
export function calculatePixelPitch(
  input: CalculatePixelPitchInput
): CalculationResult<PixelPitch> {
  requirePositiveFinite("sensorWidthMm", input.sensorWidthMm);
  requirePositiveInteger("pixelWidth", input.pixelWidth);

  const millimeters = input.sensorWidthMm / input.pixelWidth;

  return calculatedResult(
    {
      millimeters,
      micrometers: millimeters * 1000
    },
    "pixel-pitch",
    "1.0.0"
  );
}
