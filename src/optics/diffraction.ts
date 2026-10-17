// SPDX-License-Identifier: Apache-2.0

/**
 * Diameter of the Airy disk (the central diffraction spot) out to its first dark ring, for an ideal
 * circular aperture. It uses the standard relation d = 2.44 * lambda * N.
 *
 * This is an independent implementation of that relation. It does not model lens aberrations or
 * non-circular pupils.
 * @see docs/PHYSICS_FOUNDATION.md for the equations, units, coordinate conventions, known blockers
 * and support limits.
 */

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { requirePositiveFinite } from "../core/validation.js";
import { requireInputKeys } from "../core/record-validation.js";

export interface CalculateAiryDiskInput {
  /** F-number. */
  aperture: number;
  /** Wavelength in nanometres. Defaults are intentionally left to callers. */
  wavelengthNm: number;
}

export interface AiryDisk {
  /**
   * Diameter of the first dark ring of the diffraction pattern, in
   * micrometres: 2.44 * wavelength * f-number.
   */
  firstZeroDiameterMicrometers: number;
}

/**
 * Calculates the Airy-disk diameter to the first dark ring for an ideal
 * circular aperture.
 *
 * It uses the standard diffraction relation d = 2.44 * lambda * N. This is an
 * independent implementation of that relation. It does not model lens
 * aberrations or non-circular pupils.
 *
 * @param input F-number and wavelength.
 * @returns Diffraction diameter at the image plane.
 */
export function calculateAiryDisk(
  input: CalculateAiryDiskInput
): CalculationResult<AiryDisk> {
  requireInputKeys(input, "calculateAiryDisk", ["aperture", "wavelengthNm"]);
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
