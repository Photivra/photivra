// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { requirePositiveFinite } from "../core/validation.js";

export interface CalculateAiryDiskInput {
  /** F-number. */
  aperture: number;
  /** Wavelength in nanometres. Defaults are intentionally left to callers. */
  wavelengthNm: number;
}

export interface AiryDisk {
  /**
   * Diameter from the center of the diffraction pattern to the first dark-ring
   * diameter, in micrometres: 2.44 * wavelength * f-number.
   */
  firstZeroDiameterMicrometers: number;
}

/**
 * Calculates the first-zero Airy-disk diameter for an ideal circular aperture.
 *
 * This uses the established diffraction relation d = 2.44 * lambda * N.
 * It is an independent implementation of the mathematical relation and does
 * not model lens aberrations or non-circular pupil geometry.
 *
 * @param input F-number and wavelength.
 * @returns Diffraction diameter at the image plane.
 */
export function calculateAiryDisk(
  input: CalculateAiryDiskInput
): CalculationResult<AiryDisk> {
  requirePositiveFinite("aperture", input.aperture);
  requirePositiveFinite("wavelengthNm", input.wavelengthNm);

  return calculatedResult(
    {
      firstZeroDiameterMicrometers:
        2.44 * (input.wavelengthNm / 1000) * input.aperture
    },
    "ideal-circular-aperture-airy-disk",
    "1.0.0",
    ["Ideal circular aperture", "Monochromatic wavelength"]
  );
}
