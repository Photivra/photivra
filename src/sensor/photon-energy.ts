// SPDX-License-Identifier: Apache-2.0

import {
  calculatedResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  SensorSpectralResponseScientificStatus,
  SensorSpectralResponseUncertainty,
  SpectralWavelengthBasis
} from "./spectral-response.js";

type UnknownRecord = Record<string, unknown>;

const PLANCK_CONSTANT_JOULE_SECONDS =
  6.62607015e-34;
const SPEED_OF_LIGHT_METERS_PER_SECOND =
  299_792_458;
const NANOMETERS_TO_METERS = 1e-9;

export interface AirRefractiveIndexReferenceConditions {
  temperatureC: number;
  pressurePascal: number;
  relativeHumidityFraction?: number;
  carbonDioxideMoleFraction?: number;
}

export interface SourcedAirPhaseRefractiveIndex {
  wavelengthNanometers: number;
  wavelengthBasis: "air";
  definition:
    "vacuum-wavelength-divided-by-air-wavelength";
  phaseRefractiveIndex: number;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  evidence: readonly EvidenceProvenance[];
  referenceConditions?:
    AirRefractiveIndexReferenceConditions;
}

export interface CalculatePhotonEnergyFromWavelengthInput {
  wavelengthNanometers: number;
  wavelengthBasis:
    SpectralWavelengthBasis;
  airPhaseRefractiveIndex?:
    SourcedAirPhaseRefractiveIndex;
}

export interface PhotonEnergyFromWavelength {
  inputWavelengthNanometers: number;
  inputWavelengthBasis:
    Exclude<SpectralWavelengthBasis, "unspecified">;
  vacuumWavelengthNanometers: number;
  frequencyHertz: number;
  photonEnergyJoules: number;
  wavelengthConversion:
    | "vacuum-identity"
    | "air-to-vacuum-via-phase-refractive-index";
  exactSiConstants: {
    planckConstantJouleSeconds:
      6.62607015e-34;
    speedOfLightMetersPerSecond:
      299792458;
  };
  phaseRefractiveIndexUsed?: number;
  airRefractiveIndexScientificStatus?:
    SensorSpectralResponseScientificStatus;
  airRefractiveIndexUncertainty?:
    SensorSpectralResponseUncertainty;
  airRefractiveIndexReferenceConditions?:
    AirRefractiveIndexReferenceConditions;
  airRefractiveIndexEvidence?:
    readonly EvidenceProvenance[];
  inputUncertaintyPropagated: false;
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

function requireFinite(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new InvalidConfigurationError(
      path + " must be finite."
    );
  }
  return value;
}

function requirePositiveFinite(
  value: unknown,
  path: string
): number {
  const parsed =
    requireFinite(value, path);
  if (parsed <= 0) {
    throw new InvalidConfigurationError(
      path +
        " must be greater than zero."
    );
  }
  return parsed;
}

function requireFraction(
  value: unknown,
  path: string
): number {
  const parsed =
    requireFinite(value, path);
  if (parsed < 0 || parsed > 1) {
    throw new InvalidConfigurationError(
      path +
        " must be a fraction from 0 through 1."
    );
  }
  return parsed;
}

function parseUncertainty(
  value: unknown,
  path: string
): SensorSpectralResponseUncertainty {
  const record =
    requireRecord(value, path);

  if (record.kind === "relative") {
    const fraction =
      requireFinite(
        record.fraction,
        path + ".fraction"
      );
    if (fraction < 0) {
      throw new InvalidConfigurationError(
        path +
          ".fraction must be greater than or equal to zero."
      );
    }
    if (
      typeof record.basis !== "string" ||
      record.basis.trim().length === 0
    ) {
      throw new InvalidConfigurationError(
        path +
          ".basis must be a non-empty string."
      );
    }
    return {
      kind: "relative",
      fraction,
      basis: record.basis
    };
  }

  if (
    record.kind === "not-quantified"
  ) {
    if (
      typeof record.limitation !==
        "string" ||
      record.limitation.trim().length ===
        0
    ) {
      throw new InvalidConfigurationError(
        path +
          ".limitation must be a non-empty string."
      );
    }
    return {
      kind: "not-quantified",
      limitation:
        record.limitation
    };
  }

  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

function parseReferenceConditions(
  value: unknown,
  path: string
): AirRefractiveIndexReferenceConditions {
  const record =
    requireRecord(value, path);

  const temperatureC =
    requireFinite(
      record.temperatureC,
      path + ".temperatureC"
    );
  const pressurePascal =
    requirePositiveFinite(
      record.pressurePascal,
      path + ".pressurePascal"
    );

  const relativeHumidityFraction =
    record.relativeHumidityFraction ===
    undefined
      ? undefined
      : requireFraction(
          record.relativeHumidityFraction,
          path +
            ".relativeHumidityFraction"
        );

  const carbonDioxideMoleFraction =
    record.carbonDioxideMoleFraction ===
    undefined
      ? undefined
      : requireFraction(
          record.carbonDioxideMoleFraction,
          path +
            ".carbonDioxideMoleFraction"
        );

  return {
    temperatureC,
    pressurePascal,
    ...(relativeHumidityFraction ===
    undefined
      ? {}
      : {
          relativeHumidityFraction
        }),
    ...(carbonDioxideMoleFraction ===
    undefined
      ? {}
      : {
          carbonDioxideMoleFraction
        })
  };
}

export function parseSourcedAirPhaseRefractiveIndex(
  value: unknown
): SourcedAirPhaseRefractiveIndex {
  const record = requireRecord(
    value,
    "airPhaseRefractiveIndex"
  );

  if (
    record.wavelengthBasis !== "air"
  ) {
    throw new InvalidConfigurationError(
      'airPhaseRefractiveIndex.wavelengthBasis must be "air".'
    );
  }
  if (
    record.definition !==
    "vacuum-wavelength-divided-by-air-wavelength"
  ) {
    throw new InvalidConfigurationError(
      "airPhaseRefractiveIndex.definition is invalid."
    );
  }
  if (
    record.scientificStatus !==
      "calibrated" &&
    record.scientificStatus !==
      "approximation"
  ) {
    throw new InvalidConfigurationError(
      "airPhaseRefractiveIndex.scientificStatus is invalid."
    );
  }

  const uncertainty =
    parseUncertainty(
      record.uncertainty,
      "airPhaseRefractiveIndex.uncertainty"
    );
  const referenceConditions =
    record.referenceConditions ===
    undefined
      ? undefined
      : parseReferenceConditions(
          record.referenceConditions,
          "airPhaseRefractiveIndex.referenceConditions"
        );

  if (
    record.scientificStatus ===
      "calibrated" &&
    uncertainty.kind ===
      "not-quantified"
  ) {
    throw new InvalidConfigurationError(
      "A calibrated air phase refractive index must declare quantified relative uncertainty."
    );
  }
  if (
    record.scientificStatus ===
      "calibrated" &&
    referenceConditions === undefined
  ) {
    throw new InvalidConfigurationError(
      "A calibrated air phase refractive index must declare temperature and pressure reference conditions."
    );
  }

  return {
    wavelengthNanometers:
      requirePositiveFinite(
        record.wavelengthNanometers,
        "airPhaseRefractiveIndex.wavelengthNanometers"
      ),
    wavelengthBasis: "air",
    definition:
      "vacuum-wavelength-divided-by-air-wavelength",
    phaseRefractiveIndex:
      requirePositiveFinite(
        record.phaseRefractiveIndex,
        "airPhaseRefractiveIndex.phaseRefractiveIndex"
      ),
    scientificStatus:
      record.scientificStatus,
    uncertainty,
    evidence: parseEvidenceList(
      record.evidence,
      "airPhaseRefractiveIndex.evidence"
    ),
    ...(referenceConditions ===
    undefined
      ? {}
      : { referenceConditions })
  };
}

export function calculatePhotonEnergyFromWavelength(
  input:
    CalculatePhotonEnergyFromWavelengthInput
): CalculationResult<PhotonEnergyFromWavelength> {
  const wavelengthNanometers =
    requirePositiveFinite(
      input.wavelengthNanometers,
      "wavelengthNanometers"
    );

  if (
    input.wavelengthBasis ===
      "unspecified"
  ) {
    throw new InvalidScientificInputError(
      "wavelengthBasis must be resolved to air or vacuum before photon-energy calculation."
    );
  }

  if (
    input.wavelengthBasis !== "air" &&
    input.wavelengthBasis !== "vacuum"
  ) {
    throw new InvalidScientificInputError(
      "wavelengthBasis is invalid."
    );
  }

  let vacuumWavelengthNanometers:
    number;
  let wavelengthConversion:
    PhotonEnergyFromWavelength["wavelengthConversion"];
  let parsedAir:
    SourcedAirPhaseRefractiveIndex |
    undefined;

  if (
    input.wavelengthBasis ===
      "vacuum"
  ) {
    if (
      input.airPhaseRefractiveIndex !==
      undefined
    ) {
      throw new InvalidScientificInputError(
        "airPhaseRefractiveIndex must be omitted for vacuum-basis wavelengths."
      );
    }
    vacuumWavelengthNanometers =
      wavelengthNanometers;
    wavelengthConversion =
      "vacuum-identity";
  } else {
    if (
      input.airPhaseRefractiveIndex ===
      undefined
    ) {
      throw new InvalidScientificInputError(
        "airPhaseRefractiveIndex is required for air-basis photon-energy calculation."
      );
    }
    parsedAir =
      parseSourcedAirPhaseRefractiveIndex(
        input.airPhaseRefractiveIndex
      );

    if (
      parsedAir.wavelengthNanometers !==
      wavelengthNanometers
    ) {
      throw new InvalidScientificInputError(
        "airPhaseRefractiveIndex wavelength must exactly match wavelengthNanometers."
      );
    }

    vacuumWavelengthNanometers =
      wavelengthNanometers *
      parsedAir.phaseRefractiveIndex;
    wavelengthConversion =
      "air-to-vacuum-via-phase-refractive-index";
  }

  const vacuumWavelengthMeters =
    vacuumWavelengthNanometers *
    NANOMETERS_TO_METERS;
  const frequencyHertz =
    SPEED_OF_LIGHT_METERS_PER_SECOND /
    vacuumWavelengthMeters;
  const photonEnergyJoules =
    PLANCK_CONSTANT_JOULE_SECONDS *
    frequencyHertz;

  if (
    !Number.isFinite(
      vacuumWavelengthNanometers
    ) ||
    !Number.isFinite(frequencyHertz) ||
    !Number.isFinite(
      photonEnergyJoules
    )
  ) {
    throw new InvalidScientificInputError(
      "Photon-energy calculation must remain finite."
    );
  }

  return calculatedResult(
    {
      inputWavelengthNanometers:
        wavelengthNanometers,
      inputWavelengthBasis:
        input.wavelengthBasis,
      vacuumWavelengthNanometers,
      frequencyHertz,
      photonEnergyJoules,
      wavelengthConversion,
      exactSiConstants: {
        planckConstantJouleSeconds:
          PLANCK_CONSTANT_JOULE_SECONDS,
        speedOfLightMetersPerSecond:
          SPEED_OF_LIGHT_METERS_PER_SECOND
      },
      ...(parsedAir === undefined
        ? {}
        : {
            phaseRefractiveIndexUsed:
              parsedAir
                .phaseRefractiveIndex,
            airRefractiveIndexScientificStatus:
              parsedAir
                .scientificStatus,
            airRefractiveIndexUncertainty:
              parsedAir.uncertainty,
            ...(parsedAir
              .referenceConditions ===
            undefined
              ? {}
              : {
                  airRefractiveIndexReferenceConditions:
                    parsedAir
                      .referenceConditions
                }),
            airRefractiveIndexEvidence:
              parsedAir.evidence
          }),
      inputUncertaintyPropagated:
        false
    },
    "photon-energy-from-spectral-wavelength",
    "1.0.0",
    [
      "Planck constant h and vacuum speed of light c use their exact SI defining values.",
      "Photon energy is h times optical frequency; frequency is derived from vacuum wavelength.",
      "Vacuum-basis wavelength requires no refractive-index correction.",
      "Air-basis wavelength is converted with the phase refractive index definition n = lambda_vacuum / lambda_air at the exact requested wavelength.",
      "Air refractive index varies with wavelength and atmospheric conditions; this function never substitutes n = 1.",
      "Input refractive-index uncertainty is preserved as metadata but is not propagated into photon-energy uncertainty by this foundation.",
      "This calculation does not apply QE, calculate photon rate, generate electrons, integrate exposure time, or model saturation/noise."
    ]
  );
}
