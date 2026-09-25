// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../schema/validation.js";

type UnknownRecord = Record<string, unknown>;

export type EvidenceSourceKind =
  | "manufacturer-published"
  | "openly-reusable"
  | "photivra-generated";

export type EvidenceReuseStatus =
  | "factual-reference-only"
  | "reusable-data"
  | "photivra-owned";

export interface EvidenceProvenance {
  sourceKind: EvidenceSourceKind;
  /**
   * Public/stable source reference or Photivra evidence identifier.
   *
   * The engine does not fetch this reference at runtime.
   */
  sourceReference: string;
  reuseStatus: EvidenceReuseStatus;
  /** Required when reuseStatus is reusable-data. */
  license?: string;
  note?: string;
}

const SOURCE_KIND_VALUES = new Set<EvidenceSourceKind>([
  "manufacturer-published",
  "openly-reusable",
  "photivra-generated"
]);

const REUSE_STATUS_VALUES = new Set<EvidenceReuseStatus>([
  "factual-reference-only",
  "reusable-data",
  "photivra-owned"
]);

const EXPECTED_REUSE_STATUS: Record<
  EvidenceSourceKind,
  EvidenceReuseStatus
> = {
  "manufacturer-published": "factual-reference-only",
  "openly-reusable": "reusable-data",
  "photivra-generated": "photivra-owned"
};

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

/**
 * Internal shared parser for evidence/source provenance used by public
 * higher-level configuration parsers.
 */
export function parseEvidenceProvenance(
  value: unknown,
  path: string
): EvidenceProvenance {
  const record = requireRecord(value, path);
  const sourceKind = requireNonEmptyString(record, "sourceKind", path);
  const sourceReference = requireNonEmptyString(
    record,
    "sourceReference",
    path
  );
  const reuseStatus = requireNonEmptyString(record, "reuseStatus", path);

  if (!SOURCE_KIND_VALUES.has(sourceKind as EvidenceSourceKind)) {
    throw new InvalidConfigurationError(`${path}.sourceKind is invalid.`);
  }
  if (!REUSE_STATUS_VALUES.has(reuseStatus as EvidenceReuseStatus)) {
    throw new InvalidConfigurationError(`${path}.reuseStatus is invalid.`);
  }

  const typedSourceKind = sourceKind as EvidenceSourceKind;
  const typedReuseStatus = reuseStatus as EvidenceReuseStatus;
  if (typedReuseStatus !== EXPECTED_REUSE_STATUS[typedSourceKind]) {
    throw new InvalidConfigurationError(
      `${path}.reuseStatus is inconsistent with sourceKind.`
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
  if (typedReuseStatus === "reusable-data" && license === undefined) {
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
    sourceKind: typedSourceKind,
    sourceReference,
    reuseStatus: typedReuseStatus,
    ...(license === undefined ? {} : { license }),
    ...(note === undefined ? {} : { note })
  };
}
