// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite
} from "../core/validation.js";
import type { LensFieldPointMm } from "./radial-distortion.js";

export interface IlluminationVignettingCoefficients {
  /** Coefficient on normalized radius squared. */
  r2: number;
  /** Coefficient on normalized radius to the fourth power. */
  r4: number;
  /** Coefficient on normalized radius to the sixth power. */
  r6: number;
}

export interface IlluminationVignettingProfile {
  /** Physical image-plane radius used to normalize field position, in mm. */
  normalizationRadiusMm: number;
  /** Maximum normalized image-plane radius over which the profile is valid. */
  maximumNormalizedRadius: number;
  /**
   * Generic radial relative-illumination coefficients.
   *
   * Relative linear throughput is:
   *   1 + r2 * rho^2 + r4 * rho^4 + r6 * rho^6
   *
   * where rho is physical image-plane radius / normalizationRadiusMm.
   */
  coefficients: IlluminationVignettingCoefficients;
}

export interface CalculateIlluminationVignettingInput {
  /**
   * Ideal image-plane field position relative to the optical axis, in mm.
   *
   * This slice evaluates throughput from the declared ideal field coordinate;
   * it does not apply or invert geometric distortion.
   */
  imagePointMm: LensFieldPointMm;
  profile: IlluminationVignettingProfile;
}

export interface IlluminationVignetting {
  imagePointMm: LensFieldPointMm;
  normalizedRadius: number;
  /**
   * Multiplicative factor for scene-linear/channel-linear signal.
   *
   * 1 means no attenuation; values are required to remain in (0, 1].
   */
  linearThroughputFactor: number;
  /** Positive exposure loss relative to the optical axis, in stops. */
  attenuationStops: number;
  profileMinimumThroughputFactor: number;
  profileMaximumThroughputFactor: number;
}

interface ValidatedIlluminationProfile {
  normalizationRadiusMm: number;
  maximumNormalizedRadius: number;
  coefficients: IlluminationVignettingCoefficients;
  minimumThroughputFactor: number;
  maximumThroughputFactor: number;
}

function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new InvalidScientificInputError(`${name} must be finite.`);
  }
}

function throughputFromSquaredRadius(
  squaredRadius: number,
  coefficients: IlluminationVignettingCoefficients
): number {
  return (
    1 +
    coefficients.r2 * squaredRadius +
    coefficients.r4 * squaredRadius * squaredRadius +
    coefficients.r6 *
      squaredRadius *
      squaredRadius *
      squaredRadius
  );
}

function throughputCriticalSquaredRadii(
  coefficients: IlluminationVignettingCoefficients
): number[] {
  // For s = rho²:
  // T(s) = 1 + r2*s + r4*s² + r6*s³
  // dT/ds = r2 + 2*r4*s + 3*r6*s²
  const a = 3 * coefficients.r6;
  const b = 2 * coefficients.r4;
  const c = coefficients.r2;

  if (a === 0) {
    return b === 0 ? [] : [-c / b];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return [];
  }

  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

function validateProfile(
  profile: IlluminationVignettingProfile
): ValidatedIlluminationProfile {
  requirePositiveFinite(
    "profile.normalizationRadiusMm",
    profile.normalizationRadiusMm
  );
  requirePositiveFinite(
    "profile.maximumNormalizedRadius",
    profile.maximumNormalizedRadius
  );
  requireFinite("profile.coefficients.r2", profile.coefficients.r2);
  requireFinite("profile.coefficients.r4", profile.coefficients.r4);
  requireFinite("profile.coefficients.r6", profile.coefficients.r6);

  const maximumSquaredRadius =
    profile.maximumNormalizedRadius * profile.maximumNormalizedRadius;
  const candidates = [
    0,
    maximumSquaredRadius,
    ...throughputCriticalSquaredRadii(profile.coefficients).filter(
      (value) => value > 0 && value < maximumSquaredRadius
    )
  ];
  const throughputs = candidates.map((squaredRadius) =>
    throughputFromSquaredRadius(squaredRadius, profile.coefficients)
  );
  const minimumThroughputFactor = Math.min(...throughputs);
  const maximumThroughputFactor = Math.max(...throughputs);

  if (
    !Number.isFinite(minimumThroughputFactor) ||
    minimumThroughputFactor <= 0
  ) {
    throw new InvalidScientificInputError(
      "Illumination vignetting profile must keep relative linear throughput strictly greater than zero over maximumNormalizedRadius."
    );
  }

  if (
    !Number.isFinite(maximumThroughputFactor) ||
    maximumThroughputFactor > 1
  ) {
    throw new InvalidScientificInputError(
      "Illumination vignetting profile must not amplify relative linear throughput above the optical-axis value of 1."
    );
  }

  return {
    normalizationRadiusMm: profile.normalizationRadiusMm,
    maximumNormalizedRadius: profile.maximumNormalizedRadius,
    coefficients: { ...profile.coefficients },
    minimumThroughputFactor,
    maximumThroughputFactor
  };
}

function assumptions(): readonly string[] {
  return [
    "Generic rotationally symmetric illumination-vignetting approximation evaluated from ideal image-plane field radius",
    "Relative linear throughput is normalized to 1 on the optical axis",
    "The model attenuates scene-linear/channel-linear signal only and must be applied before display/gamma encoding",
    "The model changes throughput only; it does not alter field coordinates, pupil shape, PSF shape, bokeh, or focus",
    "Mechanical/pupil vignetting and cat's-eye bokeh are separate pupil/PSF effects",
    "The profile is a generic caller-supplied radial approximation, not calibrated radiometry or a named-lens measurement"
  ];
}

/**
 * Calculates generic field-dependent illumination falloff as a multiplicative
 * linear-light throughput factor.
 *
 * The profile is accepted only when its relative throughput remains strictly
 * positive and never exceeds the optical-axis normalization of 1 throughout
 * the complete declared operating envelope.
 */
export function calculateIlluminationVignetting(
  input: CalculateIlluminationVignettingInput
): CalculationResult<IlluminationVignetting> {
  requireFinite("imagePointMm.x", input.imagePointMm.x);
  requireFinite("imagePointMm.y", input.imagePointMm.y);

  const profile = validateProfile(input.profile);
  const radiusMm = Math.hypot(input.imagePointMm.x, input.imagePointMm.y);
  const normalizedRadius = radiusMm / profile.normalizationRadiusMm;

  if (normalizedRadius > profile.maximumNormalizedRadius) {
    throw new InvalidScientificInputError(
      "imagePointMm lies outside the illumination vignetting profile maximumNormalizedRadius."
    );
  }

  const squaredRadius = normalizedRadius * normalizedRadius;
  const linearThroughputFactor = throughputFromSquaredRadius(
    squaredRadius,
    profile.coefficients
  );

  return approximationResult(
    {
      imagePointMm: { ...input.imagePointMm },
      normalizedRadius,
      linearThroughputFactor,
      attenuationStops: -Math.log2(linearThroughputFactor),
      profileMinimumThroughputFactor: profile.minimumThroughputFactor,
      profileMaximumThroughputFactor: profile.maximumThroughputFactor
    },
    "generic-radial-illumination-vignetting",
    "1.0.0",
    assumptions()
  );
}
