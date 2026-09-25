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

/**
 * Descriptive sensor hardware/capability metadata.
 *
 * Omitted properties mean unknown/unasserted. These fields are not scientific
 * effect switches: no architecture value changes noise, dynamic range, FOV,
 * crop factor, exposure, or sampling without a separate downstream model.
 */
export interface SensorArchitectureProfile {
  schemaVersion: "0.2.0";
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

/**
 * Parses untrusted descriptive sensor-architecture metadata.
 *
 * Unknown facts should be omitted instead of inferred. The parser validates
 * structure, supported vocabulary, and field-level evidence only; it does not
 * verify that a cited real-world claim is factually true.
 *
 * @param value Unknown external data.
 * @returns Validated sensor architecture profile.
 */
export function parseSensorArchitectureProfile(
  value: unknown
): SensorArchitectureProfile {
  const profile = requireRecord(value, "sensorArchitecture");

  if (profile.schemaVersion !== "0.2.0") {
    throw new InvalidConfigurationError(
      'sensorArchitecture.schemaVersion must be "0.2.0".'
    );
  }

  return {
    schemaVersion: "0.2.0",
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
