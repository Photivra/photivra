// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { requirePositiveFinite } from "../core/validation.js";

export interface CalculateExposureValue100Input {
  /** F-number. */
  aperture: number;
  /** Shutter duration in seconds. */
  shutterSeconds: number;
}

/**
 * Calculates EV100 from aperture and shutter duration.
 *
 * @param input Aperture and shutter duration.
 * @returns EV100 value.
 */
export function calculateExposureValue100(
  input: CalculateExposureValue100Input
): CalculationResult<number> {
  requirePositiveFinite("aperture", input.aperture);
  requirePositiveFinite("shutterSeconds", input.shutterSeconds);

  return calculatedResult(
    Math.log2((input.aperture * input.aperture) / input.shutterSeconds),
    "exposure-value-100",
    "1.0.0",
    ["Lens transmission (T-stop) is not modeled"]
  );
}

export interface CalculateRelativeOpticalExposureInput {
  aperture: number;
  shutterSeconds: number;
  referenceAperture: number;
  referenceShutterSeconds: number;
}

export interface RelativeOpticalExposure {
  /** Relative light exposure at the image plane; 1 equals the reference. */
  factor: number;
  /** Difference from the reference in stops. Positive means more light exposure. */
  stops: number;
}

/**
 * Compares image-plane optical exposure using the proportional relation
 * shutterSeconds / aperture^2.
 *
 * This does not include scene light, lens transmission, vignetting, or sensor
 * response and therefore must not be interpreted as a photon-count result.
 */
export function calculateRelativeOpticalExposure(
  input: CalculateRelativeOpticalExposureInput
): CalculationResult<RelativeOpticalExposure> {
  requirePositiveFinite("aperture", input.aperture);
  requirePositiveFinite("shutterSeconds", input.shutterSeconds);
  requirePositiveFinite("referenceAperture", input.referenceAperture);
  requirePositiveFinite(
    "referenceShutterSeconds",
    input.referenceShutterSeconds
  );

  const current =
    input.shutterSeconds / (input.aperture * input.aperture);
  const reference =
    input.referenceShutterSeconds /
    (input.referenceAperture * input.referenceAperture);
  const factor = current / reference;

  return calculatedResult(
    {
      factor,
      stops: Math.log2(factor)
    },
    "relative-optical-exposure",
    "1.0.0",
    [
      "Constant scene illumination",
      "Lens transmission is not modeled",
      "Sensor response is not modeled"
    ]
  );
}

export interface CalculateRelativeRenderedExposureInput {
  aperture: number;
  shutterSeconds: number;
  iso: number;
  referenceAperture: number;
  referenceShutterSeconds: number;
  referenceIso: number;
}

export interface RelativeRenderedExposure {
  /** Nominal linear rendering multiplier; 1 equals the reference settings. */
  factor: number;
  /** Difference from the reference in stops. Positive means a brighter rendering. */
  stops: number;
  /** Image-plane optical exposure ratio before nominal ISO gain. */
  opticalFactor: number;
  /** Nominal ISO gain ratio relative to the reference ISO. */
  isoGainFactor: number;
}

/**
 * Calculates a relative linear rendering exposure from aperture, shutter, and
 * nominal ISO gain.
 *
 * This relation is intended for deterministic educational rendering relative to
 * a declared reference exposure. ISO is treated as a brightness/gain control;
 * it does not create photons and this function does not model sensor noise,
 * clipping, tone mapping, lens transmission, or absolute scene luminance.
 *
 * @param input Current and reference aperture/shutter/ISO settings.
 * @returns Relative rendering factor and stop difference.
 */
export function calculateRelativeRenderedExposure(
  input: CalculateRelativeRenderedExposureInput
): CalculationResult<RelativeRenderedExposure> {
  requirePositiveFinite("iso", input.iso);
  requirePositiveFinite("referenceIso", input.referenceIso);

  const optical = calculateRelativeOpticalExposure({
    aperture: input.aperture,
    shutterSeconds: input.shutterSeconds,
    referenceAperture: input.referenceAperture,
    referenceShutterSeconds: input.referenceShutterSeconds
  });
  const isoGainFactor = input.iso / input.referenceIso;
  const factor = optical.value.factor * isoGainFactor;

  return calculatedResult(
    {
      factor,
      stops: Math.log2(factor),
      opticalFactor: optical.value.factor,
      isoGainFactor
    },
    "relative-rendered-exposure",
    "1.0.0",
    [
      "Constant scene illumination",
      "ISO is treated as nominal rendering gain, not photon creation",
      "Lens transmission and sensor-specific gain behavior are not modeled",
      "Clipping and display tone mapping are not modeled"
    ]
  );
}

export interface CalculateEquivalentIsoInput {
  baseIso: number;
  baseAperture: number;
  baseShutterSeconds: number;
  aperture: number;
  shutterSeconds: number;
}

/**
 * Calculates the ISO/gain setting that preserves nominal rendered exposure
 * after changing aperture and/or shutter, assuming all other factors remain
 * constant.
 *
 * This is an exposure-compensation relation, not a sensor-noise model.
 */
export function calculateEquivalentIso(
  input: CalculateEquivalentIsoInput
): CalculationResult<number> {
  requirePositiveFinite("baseIso", input.baseIso);
  requirePositiveFinite("baseAperture", input.baseAperture);
  requirePositiveFinite("baseShutterSeconds", input.baseShutterSeconds);
  requirePositiveFinite("aperture", input.aperture);
  requirePositiveFinite("shutterSeconds", input.shutterSeconds);

  const baseLight =
    input.baseShutterSeconds /
    (input.baseAperture * input.baseAperture);
  const newLight =
    input.shutterSeconds / (input.aperture * input.aperture);

  return calculatedResult(
    input.baseIso * (baseLight / newLight),
    "equivalent-iso-compensation",
    "1.0.0",
    [
      "Constant scene illumination",
      "ISO is treated as gain/brightness compensation, not photon creation",
      "Lens transmission and sensor-specific gain behavior are not modeled"
    ]
  );
}
