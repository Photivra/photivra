// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "./configuration-error.js";

type UnknownRecord = Record<string, unknown>;

/**
 * Explicit wavelength coordinate basis used by renderer-neutral spectral data.
 *
 * "unspecified" is permitted only where a downstream contract explicitly
 * allows unresolved/approximate wavelength coordinates. Calibrated physical
 * composition must resolve the basis before use.
 */
export type SpectralWavelengthBasis =
  | "air"
  | "vacuum"
  | "unspecified";

/**
 * One wavelength coordinate expressed in nanometres.
 */
export interface SpectralWavelengthSample {
  wavelengthNanometers: number;
}

/**
 * Closed wavelength interval expressed in nanometres.
 */
export interface SpectralWavelengthRangeNanometers {
  minimum: number;
  maximum: number;
}

function requireRecord(
  value: unknown,
  path: string
): UnknownRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new InvalidConfigurationError(
      path + " must be an object."
    );
  }
  return value as UnknownRecord;
}

function requirePositiveFinite(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new InvalidConfigurationError(
      path + " must be finite and greater than zero."
    );
  }
  return value;
}

/**
 * Parses a wavelength basis without inferring air/vacuum conversion.
 */
export function parseSpectralWavelengthBasis(
  value: unknown,
  path = "wavelengthBasis"
): SpectralWavelengthBasis {
  if (
    value !== "air" &&
    value !== "vacuum" &&
    value !== "unspecified"
  ) {
    throw new InvalidConfigurationError(
      path + " is invalid."
    );
  }
  return value;
}

/**
 * Parses one positive wavelength coordinate in nanometres.
 */
export function parseSpectralWavelengthSample(
  value: unknown,
  path = "spectralSample"
): SpectralWavelengthSample {
  const record = requireRecord(value, path);
  return {
    wavelengthNanometers:
      requirePositiveFinite(
        record.wavelengthNanometers,
        path + ".wavelengthNanometers"
      )
  };
}

/**
 * Parses a positive non-empty wavelength interval in nanometres.
 */
export function parseSpectralWavelengthRangeNanometers(
  value: unknown,
  path = "wavelengthRangeNanometers"
): SpectralWavelengthRangeNanometers {
  const record = requireRecord(value, path);
  const minimum = requirePositiveFinite(
    record.minimum,
    path + ".minimum"
  );
  const maximum = requirePositiveFinite(
    record.maximum,
    path + ".maximum"
  );

  if (!(minimum < maximum)) {
    throw new InvalidConfigurationError(
      path + ".minimum must be less than maximum."
    );
  }

  return { minimum, maximum };
}
