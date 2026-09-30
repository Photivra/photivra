// SPDX-License-Identifier: Apache-2.0

import {
  parseEvidenceList,
  type EvidenceBackedFact,
  type EvidenceProvenance,
  type EvidenceReuseStatus,
  type EvidenceSourceOrigin
} from "../core/evidence-provenance.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";

type UnknownRecord = Record<string, unknown>;

export const SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION = "0.3.0" as const;
const LEGACY_SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION = "0.2.0" as const;

export type SensorTechnologyFamily = "cmos" | "ccd";

export type SensorIlluminationArchitecture = "fsi" | "bsi";

export type SensorIntegrationArchitecture =
  | "monolithic"
  | "partially-stacked"
  | "stacked";

export type SensorReadoutArchitecture = "rolling" | "global";

export type SensorColorSamplingFamily =
  | "bayer"
  | "quad-bayer"
  | "monochrome"
  | "custom-rgb-mosaic"
  | "layered-color";

export type SensorArchitectureSourceKind = EvidenceSourceOrigin;
export type SensorArchitectureReuseStatus = EvidenceReuseStatus;
export type SensorArchitectureFactProvenance = EvidenceProvenance;
export type SourcedSensorArchitectureFact<T> = EvidenceBackedFact<T>;

interface SensorArchitectureProfileBase {
  illumination?: SourcedSensorArchitectureFact<SensorIlluminationArchitecture>;
  integration?: SourcedSensorArchitectureFact<SensorIntegrationArchitecture>;
  /**
   * Hardware readout capabilities, not the readout mode selected for one
   * capture. Each capability carries its own evidence because different
   * readout modes may be documented by different sources.
   */
  readoutCapabilities?: readonly SourcedSensorArchitectureFact<SensorReadoutArchitecture>[];
  colorSamplingFamily?: SourcedSensorArchitectureFact<SensorColorSamplingFamily>;
}

/**
 * Legacy sensor-architecture schema.
 *
 * Schema 0.2.0 remains accepted and is preserved exactly when parsed. It does
 * not support technologyFamily; omission remains unknown/unasserted.
 */
export interface SensorArchitectureProfileV0_2
  extends SensorArchitectureProfileBase {
  schemaVersion: typeof LEGACY_SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION;
  technologyFamily?: never;
}

/**
 * Current descriptive sensor hardware/capability metadata.
 *
 * Omitted properties mean unknown/unasserted. These fields are not scientific
 * effect switches: no architecture value changes noise, dynamic range, FOV,
 * crop factor, exposure, readout timing, or sampling without a separate
 * downstream model that explicitly consumes that fact.
 */
export interface SensorArchitectureProfileV0_3
  extends SensorArchitectureProfileBase {
  schemaVersion: typeof SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION;
  /** Coarse detector technology identity only; never a performance switch. */
  technologyFamily?: SourcedSensorArchitectureFact<SensorTechnologyFamily>;
}

export type SensorArchitectureProfile =
  | SensorArchitectureProfileV0_2
  | SensorArchitectureProfileV0_3;

const TECHNOLOGY_FAMILY_VALUES = new Set<SensorTechnologyFamily>([
  "cmos",
  "ccd"
]);

const ILLUMINATION_VALUES = new Set<SensorIlluminationArchitecture>([
  "fsi",
  "bsi"
]);

const INTEGRATION_VALUES = new Set<SensorIntegrationArchitecture>([
  "monolithic",
  "partially-stacked",
  "stacked"
]);

const READOUT_VALUES = new Set<SensorReadoutArchitecture>([
  "rolling",
  "global"
]);

const COLOR_SAMPLING_VALUES = new Set<SensorColorSamplingFamily>([
  "bayer",
  "quad-bayer",
  "monochrome",
  "custom-rgb-mosaic",
  "layered-color"
]);

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidConfigurationError(`${path} must be an object.`);
  }
  return value as UnknownRecord;
}

function requireNonEmptyString(
  record: UnknownRecord,
  key: string,
  path: string
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidConfigurationError(
      `${path}.${key} must be a non-empty string.`
    );
  }
  return value;
}

function parseScalarFact<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>
): SourcedSensorArchitectureFact<T> {
  const record = requireRecord(value, path);
  const factValue = requireNonEmptyString(record, "value", path);
  if (!allowed.has(factValue as T)) {
    throw new InvalidConfigurationError(`${path}.value is invalid.`);
  }

  return {
    value: factValue as T,
    evidence: parseEvidenceList(record.evidence, `${path}.evidence`)
  };
}

function parseReadoutCapabilities(
  value: unknown,
  path: string
): readonly SourcedSensorArchitectureFact<SensorReadoutArchitecture>[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidConfigurationError(
      `${path} must be a non-empty array.`
    );
  }

  const parsed = value.map((entry, index) =>
    parseScalarFact(
      entry,
      `${path}[${index}]`,
      READOUT_VALUES
    )
  );

  const values = parsed.map((fact) => fact.value);
  if (new Set(values).size !== values.length) {
    throw new InvalidConfigurationError(
      `${path} must not contain duplicate capability values.`
    );
  }

  return parsed;
}

function parseSharedArchitectureFields(
  profile: UnknownRecord
): SensorArchitectureProfileBase {
  return {
    ...(profile.illumination === undefined
      ? {}
      : {
          illumination: parseScalarFact(
            profile.illumination,
            "sensorArchitecture.illumination",
            ILLUMINATION_VALUES
          )
        }),
    ...(profile.integration === undefined
      ? {}
      : {
          integration: parseScalarFact(
            profile.integration,
            "sensorArchitecture.integration",
            INTEGRATION_VALUES
          )
        }),
    ...(profile.readoutCapabilities === undefined
      ? {}
      : {
          readoutCapabilities: parseReadoutCapabilities(
            profile.readoutCapabilities,
            "sensorArchitecture.readoutCapabilities"
          )
        }),
    ...(profile.colorSamplingFamily === undefined
      ? {}
      : {
          colorSamplingFamily: parseScalarFact(
            profile.colorSamplingFamily,
            "sensorArchitecture.colorSamplingFamily",
            COLOR_SAMPLING_VALUES
          )
        })
  };
}

/**
 * Parses untrusted descriptive sensor-architecture metadata.
 *
 * Schema 0.2.0 remains accepted and returns a 0.2.0 profile unchanged in
 * semantic identity. Schema 0.3.0 adds optional evidence-backed CMOS/CCD
 * technology-family metadata. Unknown facts should be omitted instead of
 * inferred.
 *
 * The parser validates structure, supported vocabulary, and field-level
 * evidence only; it does not verify that a cited real-world claim is
 * factually true and technology family does not activate hidden physics.
 *
 * @param value Unknown external data.
 * @returns Validated sensor architecture profile preserving input schema identity.
 */
export function parseSensorArchitectureProfile(
  value: unknown
): SensorArchitectureProfile {
  const profile = requireRecord(value, "sensorArchitecture");
  const shared = parseSharedArchitectureFields(profile);

  if (
    profile.schemaVersion ===
    LEGACY_SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION
  ) {
    if (profile.technologyFamily !== undefined) {
      throw new InvalidConfigurationError(
        "sensorArchitecture schema 0.2.0 does not support technologyFamily; use schema 0.3.0."
      );
    }

    return {
      schemaVersion: LEGACY_SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION,
      ...shared
    };
  }

  if (profile.schemaVersion === SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION) {
    return {
      schemaVersion: SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION,
      ...shared,
      ...(profile.technologyFamily === undefined
        ? {}
        : {
            technologyFamily: parseScalarFact(
              profile.technologyFamily,
              "sensorArchitecture.technologyFamily",
              TECHNOLOGY_FAMILY_VALUES
            )
          })
    };
  }

  throw new InvalidConfigurationError(
    'sensorArchitecture.schemaVersion must be "0.2.0" or "0.3.0".'
  );
}
