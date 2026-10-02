// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Parses a generic educational/product exposure program line. A program line is control policy, not
 * physics. Nodes declare desired aperture/shutter pairs at explicit optical-exposure stops relative to
 * the resolver's reference exposure. Resolution later verifies that every node is physically
 * consistent with that reference and current equipment capability.
 * @see docs/USAGE.md for equations, coordinate/unit conventions, blockers and support limits.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";

type UnknownRecord = Record<string, unknown>;

export const EXPOSURE_PROGRAM_LINE_SCHEMA_VERSION =
  "0.1.0" as const;

export interface ExposureProgramLineNode {
  nodeId: string;
  opticalExposureStopsFromReference: number;
  aperture: number;
  shutterSeconds: number;
}

export interface ExposureProgramLineProfile {
  schemaVersion:
    typeof EXPOSURE_PROGRAM_LINE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus: "approximation";
  policyKind:
    "generic-program-line";
  interpolation:
    "log2-aperture-shutter";
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
  nodes:
    readonly ExposureProgramLineNode[];
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

function requireNonEmptyString(
  value: unknown,
  path: string
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new InvalidConfigurationError(
      path + " must be a non-empty string."
    );
  }
  return value.trim();
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

function parseLimitations(
  value: unknown,
  path: string
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new InvalidConfigurationError(
      path + " must be an array."
    );
  }
  const parsed = value.map(
    (entry, index) =>
      requireNonEmptyString(
        entry,
        path + "[" + index + "]"
      )
  );
  if (
    new Set(parsed).size !==
    parsed.length
  ) {
    throw new InvalidConfigurationError(
      path +
        " must not contain duplicates."
    );
  }
  return parsed;
}

/**
 * Parses a generic educational/product exposure program line.
 *
 * A program line is control policy, not physics. Nodes declare desired
 * aperture/shutter pairs at explicit optical-exposure stops relative to the
 * resolver's reference exposure. Resolution later verifies that every node is
 * physically consistent with that reference and current equipment capability.
 */
export function parseExposureProgramLineProfile(
  value: unknown
): ExposureProgramLineProfile {
  const record = requireRecord(
    value,
    "exposureProgramLineProfile"
  );

  if (
    record.schemaVersion !==
    EXPOSURE_PROGRAM_LINE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'exposureProgramLineProfile.schemaVersion must be "' +
        EXPOSURE_PROGRAM_LINE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.scientificStatus !==
    "approximation"
  ) {
    throw new InvalidConfigurationError(
      'exposureProgramLineProfile.scientificStatus must be "approximation".'
    );
  }
  if (
    record.policyKind !==
    "generic-program-line"
  ) {
    throw new InvalidConfigurationError(
      'exposureProgramLineProfile.policyKind must be "generic-program-line".'
    );
  }
  if (
    record.interpolation !==
    "log2-aperture-shutter"
  ) {
    throw new InvalidConfigurationError(
      'exposureProgramLineProfile.interpolation must be "log2-aperture-shutter".'
    );
  }
  if (
    !Array.isArray(record.nodes) ||
    record.nodes.length < 2
  ) {
    throw new InvalidConfigurationError(
      "exposureProgramLineProfile.nodes must contain at least two nodes."
    );
  }

  let previousStops =
    Number.NEGATIVE_INFINITY;
  const ids: string[] = [];

  const nodes = record.nodes.map(
    (entry, index) => {
      const path =
        "exposureProgramLineProfile.nodes[" +
        index +
        "]";
      const node =
        requireRecord(entry, path);
      const nodeId =
        requireNonEmptyString(
          node.nodeId,
          path + ".nodeId"
        );
      const stops =
        requireFinite(
          node
            .opticalExposureStopsFromReference,
          path +
            ".opticalExposureStopsFromReference"
        );
      if (stops <= previousStops) {
        throw new InvalidConfigurationError(
          "exposureProgramLineProfile.nodes opticalExposureStopsFromReference must be strictly increasing."
        );
      }
      previousStops = stops;
      ids.push(nodeId);

      return {
        nodeId,
        opticalExposureStopsFromReference:
          stops,
        aperture:
          requirePositiveFinite(
            node.aperture,
            path + ".aperture"
          ),
        shutterSeconds:
          requirePositiveFinite(
            node.shutterSeconds,
            path +
              ".shutterSeconds"
          )
      };
    }
  );

  if (
    new Set(ids).size !== ids.length
  ) {
    throw new InvalidConfigurationError(
      "exposureProgramLineProfile.nodes[].nodeId must not contain duplicates."
    );
  }

  return {
    schemaVersion:
      EXPOSURE_PROGRAM_LINE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "exposureProgramLineProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "exposureProgramLineProfile.profileVersion"
      ),
    scientificStatus:
      "approximation",
    policyKind:
      "generic-program-line",
    interpolation:
      "log2-aperture-shutter",
    evidence: parseEvidenceList(
      record.evidence,
      "exposureProgramLineProfile.evidence"
    ),
    limitations:
      parseLimitations(
        record.limitations,
        "exposureProgramLineProfile.limitations"
      ),
    nodes
  };
}
