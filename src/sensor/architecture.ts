// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../schema/validation.js";

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

export type SensorArchitectureSourceKind =
  | "manufacturer-published"
  | "openly-reusable"
  | "photivra-generated";

export type SensorArchitectureReuseStatus =
  | "factual-reference-only"
  | "reusable-data"
  | "photivra-owned";

export interface SensorArchitectureFactProvenance {
  sourceKind: SensorArchitectureSourceKind;
  /**
   * Public/stable source reference or Photivra evidence identifier.
   *
   * The engine does not fetch this reference at runtime.
   */
  sourceReference: string;
  reuseStatus: SensorArchitectureReuseStatus;
  /** Required when reuseStatus is reusable-data. */
  license?: string;
  note?: string;
}

export interface SourcedSensorArchitectureFact<T> {
  value: T;
  provenance: SensorArchitectureFactProvenance;
}

/**
 * Descriptive sensor hardware/capability metadata.
 *
 * Omitted properties mean unknown/unasserted. These fields are not scientific
 * effect switches: no architecture value changes noise, dynamic range, FOV,
 * crop factor, exposure, or sampling without a separate downstream model.
 */
export interface SensorArchitectureProfile {
  schemaVersion: "0.1.0";
  illumination?: SourcedSensorArchitectureFact<SensorIlluminationArchitecture>;
  integration?: SourcedSensorArchitectureFact<SensorIntegrationArchitecture>;
  /**
   * Hardware readout capabilities, not the readout mode selected for one
   * capture. Capture-mode selection belongs to later readout/mode modeling.
   */
  readoutCapabilities?: SourcedSensorArchitectureFact<
    readonly SensorReadoutArchitecture[]
  >;
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

const SOURCE_KIND_VALUES = new Set<SensorArchitectureSourceKind>([
  "manufacturer-published",
  "openly-reusable",
  "photivra-generated"
]);

const REUSE_STATUS_VALUES = new Set<SensorArchitectureReuseStatus>([
  "factual-reference-only",
  "reusable-data",
  "photivra-owned"
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

function parseProvenance(
  value: unknown,
  path: string
): SensorArchitectureFactProvenance {
  const record = requireRecord(value, path);
  const sourceKind = requireNonEmptyString(record, "sourceKind", path);
  const sourceReference = requireNonEmptyString(
    record,
    "sourceReference",
    path
  );
  const reuseStatus = requireNonEmptyString(record, "reuseStatus", path);

  if (!SOURCE_KIND_VALUES.has(sourceKind as SensorArchitectureSourceKind)) {
    throw new InvalidConfigurationError(
      `${path}.sourceKind is invalid.`
    );
  }
  if (!REUSE_STATUS_VALUES.has(reuseStatus as SensorArchitectureReuseStatus)) {
    throw new InvalidConfigurationError(
      `${path}.reuseStatus is invalid.`
    );
  }

  const license = record.license;
  if (
    license !== undefined &&
    (typeof license !== "string" || license.trim().length === 0)
  ) {
    throw new InvalidConfigurationError(
      `${path}.license must be a non-empty string when supplied.`
    );
  }
  if (reuseStatus === "reusable-data" && license === undefined) {
    throw new InvalidConfigurationError(
      `${path}.license is required for reusable-data provenance.`
    );
  }

  const note = record.note;
  if (
    note !== undefined &&
    (typeof note !== "string" || note.trim().length === 0)
  ) {
    throw new InvalidConfigurationError(
      `${path}.note must be a non-empty string when supplied.`
    );
  }

  return {
    sourceKind: sourceKind as SensorArchitectureSourceKind,
    sourceReference,
    reuseStatus: reuseStatus as SensorArchitectureReuseStatus,
    ...(license === undefined ? {} : { license }),
    ...(note === undefined ? {} : { note })
  };
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
    provenance: parseProvenance(record.provenance, `${path}.provenance`)
  };
}

function parseReadoutFact(
  value: unknown,
  path: string
): SourcedSensorArchitectureFact<readonly SensorReadoutArchitecture[]> {
  const record = requireRecord(value, path);
  const values = record.value;
  if (!Array.isArray(values) || values.length === 0) {
    throw new InvalidConfigurationError(
      `${path}.value must be a non-empty array.`
    );
  }

  const parsed = values.map((entry, index) => {
    if (typeof entry !== "string" || !READOUT_VALUES.has(entry as SensorReadoutArchitecture)) {
      throw new InvalidConfigurationError(
        `${path}.value[${index}] is invalid.`
      );
    }
    return entry as SensorReadoutArchitecture;
  });

  if (new Set(parsed).size !== parsed.length) {
    throw new InvalidConfigurationError(
      `${path}.value must not contain duplicates.`
    );
  }

  return {
    value: parsed,
    provenance: parseProvenance(record.provenance, `${path}.provenance`)
  };
}

/**
 * Parses untrusted descriptive sensor-architecture metadata.
 *
 * Unknown facts should be omitted instead of inferred. The parser validates
 * structure, supported vocabulary, and field-level provenance only; it does
 * not verify that a cited real-world claim is factually true.
 *
 * @param value Unknown external data.
 * @returns Validated sensor architecture profile.
 */
export function parseSensorArchitectureProfile(
  value: unknown
): SensorArchitectureProfile {
  const profile = requireRecord(value, "sensorArchitecture");

  if (profile.schemaVersion !== "0.1.0") {
    throw new InvalidConfigurationError(
      'sensorArchitecture.schemaVersion must be "0.1.0".'
    );
  }

  return {
    schemaVersion: "0.1.0",
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
          readoutCapabilities: parseReadoutFact(
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
