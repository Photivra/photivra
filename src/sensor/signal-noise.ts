// SPDX-License-Identifier: Apache-2.0

/**
 * Basic signal and noise: mean photoelectrons from photons and quantum efficiency (QE), and the
 * expected signal-to-noise ratio (SNR) from shot noise and read noise.
 *
 * These are expected (mean) values; no random noise is generated. Dark current, fixed-pattern noise,
 * quantization, clipping and later processing are deliberately left out.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { requireInputKeys } from "../core/record-validation.js";

function requireNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidScientificInputError(
      `${name} must be a finite number greater than or equal to zero.`
    );
  }
}

export interface CalculatePhotoelectronsInput {
  /** Mean number of photons reaching the photosite (or measurement region). */
  incidentPhotons: number;
  /** Quantum efficiency from 0 to 1 inclusive. */
  quantumEfficiency: number;
}

/**
 * Converts the mean incident photon count to the mean photoelectron count.
 *
 * This is an expected value. This deterministic calculation does not generate
 * random shot noise.
 */
export function calculatePhotoelectrons(
  input: CalculatePhotoelectronsInput
): CalculationResult<number> {
  requireInputKeys(input, "calculatePhotoelectrons", ["incidentPhotons", "quantumEfficiency"]);
  requireNonNegativeFinite("incidentPhotons", input.incidentPhotons);

  if (
    !Number.isFinite(input.quantumEfficiency) ||
    input.quantumEfficiency < 0 ||
    input.quantumEfficiency > 1
  ) {
    throw new InvalidScientificInputError(
      "quantumEfficiency must be a finite number from 0 through 1."
    );
  }

  return calculatedResult(
    input.incidentPhotons * input.quantumEfficiency,
    "mean-photoelectron-conversion",
    "1.0.0",
    ["Quantum efficiency is supplied by the caller"]
  );
}

export interface CalculateSignalToNoiseInput {
  /** Mean signal in electrons. */
  signalElectrons: number;
  /** RMS read noise in electrons. */
  readNoiseElectrons: number;
}

export interface SignalToNoise {
  shotNoiseStdElectrons: number;
  combinedNoiseStdElectrons: number;
  snrLinear: number;
  /** Null when the signal is zero, because -Infinity dB cannot be stored in JSON. */
  snrDb: number | null;
}

/**
 * Calculates the expected SNR from Poisson shot noise and independent RMS read
 * noise.
 *
 * Variances add: total variance = signalElectrons + readNoiseElectrons^2.
 * Dark current, fixed-pattern noise, quantization, clipping and later
 * processing are deliberately left out.
 */
export function calculateSignalToNoise(
  input: CalculateSignalToNoiseInput
): CalculationResult<SignalToNoise> {
  requireInputKeys(input, "calculateSignalToNoise", ["signalElectrons", "readNoiseElectrons"]);
  requireNonNegativeFinite("signalElectrons", input.signalElectrons);
  requireNonNegativeFinite("readNoiseElectrons", input.readNoiseElectrons);

  const shotNoiseStdElectrons = Math.sqrt(input.signalElectrons);
  const combinedNoiseStdElectrons = Math.sqrt(
    input.signalElectrons +
      input.readNoiseElectrons * input.readNoiseElectrons
  );
  const snrLinear =
    combinedNoiseStdElectrons === 0
      ? 0
      : input.signalElectrons / combinedNoiseStdElectrons;
  const snrDb = snrLinear === 0 ? null : 20 * Math.log10(snrLinear);

  return calculatedResult(
    {
      shotNoiseStdElectrons,
      combinedNoiseStdElectrons,
      snrLinear,
      snrDb
    },
    "poisson-shot-plus-read-noise-snr",
    "1.0.0",
    [
      "Photon shot noise is Poisson",
      "Read noise is supplied as independent RMS electrons",
      "Dark current and fixed-pattern noise are not included"
    ]
  );
}
