// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceBackedFact,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import type { GenericCapabilityAvailability } from "./exposure-capabilities.js";

type UnknownRecord = Record<string, unknown>;

export const GENERIC_RELEASE_CAPABILITY_SCHEMA_VERSION =
  "0.1.0" as const;

export type GenericReleaseDriveMode =
  | "single"
  | "burst"
  | "self-timer";

export type GenericExposureBracketAxis =
  | "shutter"
  | "iso"
  | "aperture";

export interface GenericReleaseCapabilityProfile {
  schemaVersion:
    typeof GENERIC_RELEASE_CAPABILITY_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus: "approximation";
  evidence: readonly EvidenceProvenance[];
  supportedDriveModes:
    EvidenceBackedFact<
      readonly GenericReleaseDriveMode[]
    >;
  maximumLogicalFramesPerSequence:
    EvidenceBackedFact<number>;
  maximumCadenceFps:
    EvidenceBackedFact<number>;
  minimumInterFrameGapSeconds:
    EvidenceBackedFact<number>;
  overlappingOrdinaryStillExposures:
    false;
  exposureBracketing: {
    availability:
      EvidenceBackedFact<
        GenericCapabilityAvailability
      >;
    supportedAxes:
      readonly GenericExposureBracketAxis[];
  };
  focusBracketing: {
    availability:
      EvidenceBackedFact<
        GenericCapabilityAvailability
      >;
  };
}

const DRIVE_MODES =
  new Set<GenericReleaseDriveMode>([
    "single",
    "burst",
    "self-timer"
  ]);

const BRACKET_AXES =
  new Set<GenericExposureBracketAxis>([
    "shutter",
    "iso",
    "aperture"
  ]);

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
      path +
        " must be finite and greater than zero."
    );
  }
  return value;
}

function requireNonNegativeFinite(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new InvalidConfigurationError(
      path +
        " must be finite and greater than or equal to zero."
    );
  }
  return value;
}

function requirePositiveSafeInteger(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new InvalidConfigurationError(
      path +
        " must be a positive safe integer."
    );
  }
  return value;
}

function parseAvailability(
  value: unknown,
  path: string
): GenericCapabilityAvailability {
  if (
    value !== "supported" &&
    value !== "unsupported" &&
    value !== "unknown"
  ) {
    throw new InvalidConfigurationError(
      path + " is invalid."
    );
  }
  return value;
}

function parseFact<T>(
  value: unknown,
  path: string,
  parseValue: (
    value: unknown,
    path: string
  ) => T
): EvidenceBackedFact<T> {
  const record =
    requireRecord(value, path);
  return {
    value:
      parseValue(
        record.value,
        path + ".value"
      ),
    evidence:
      parseEvidenceList(
        record.evidence,
        path + ".evidence"
      )
  };
}

function parseDriveModes(
  value: unknown,
  path: string
): readonly GenericReleaseDriveMode[] {
  if (
    !Array.isArray(value) ||
    value.length === 0
  ) {
    throw new InvalidConfigurationError(
      path +
        " must be a non-empty array."
    );
  }
  const parsed =
    value.map((entry, index) => {
      if (
        typeof entry !== "string" ||
        !DRIVE_MODES.has(
          entry as GenericReleaseDriveMode
        )
      ) {
        throw new InvalidConfigurationError(
          path +
            "[" +
            index +
            "] is invalid."
        );
      }
      return entry as GenericReleaseDriveMode;
    });
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

function parseBracketAxes(
  value: unknown,
  path: string
): readonly GenericExposureBracketAxis[] {
  if (!Array.isArray(value)) {
    throw new InvalidConfigurationError(
      path + " must be an array."
    );
  }
  const parsed =
    value.map((entry, index) => {
      if (
        typeof entry !== "string" ||
        !BRACKET_AXES.has(
          entry as GenericExposureBracketAxis
        )
      ) {
        throw new InvalidConfigurationError(
          path +
            "[" +
            index +
            "] is invalid."
        );
      }
      return entry as GenericExposureBracketAxis;
    });
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
 * Parses generic logical-release/drive capabilities.
 *
 * The first schema deliberately models non-overlapping ordinary still
 * exposures only. Buffer/media/thermal slowdown and pre-release capture remain
 * outside this profile.
 */
export function parseGenericReleaseCapabilityProfile(
  value: unknown
): GenericReleaseCapabilityProfile {
  const record =
    requireRecord(
      value,
      "genericReleaseCapabilityProfile"
    );

  if (
    record.schemaVersion !==
    GENERIC_RELEASE_CAPABILITY_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'genericReleaseCapabilityProfile.schemaVersion must be "' +
        GENERIC_RELEASE_CAPABILITY_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.scientificStatus !==
    "approximation"
  ) {
    throw new InvalidConfigurationError(
      'genericReleaseCapabilityProfile.scientificStatus must be "approximation".'
    );
  }
  if (
    record.overlappingOrdinaryStillExposures !==
    false
  ) {
    throw new InvalidConfigurationError(
      "genericReleaseCapabilityProfile.overlappingOrdinaryStillExposures must be false in schema 0.1.0."
    );
  }

  const exposureBracketing =
    requireRecord(
      record.exposureBracketing,
      "genericReleaseCapabilityProfile.exposureBracketing"
    );
  const focusBracketing =
    requireRecord(
      record.focusBracketing,
      "genericReleaseCapabilityProfile.focusBracketing"
    );

  const exposureAvailability =
    parseFact(
      exposureBracketing.availability,
      "genericReleaseCapabilityProfile.exposureBracketing.availability",
      parseAvailability
    );
  const axes =
    parseBracketAxes(
      exposureBracketing.supportedAxes,
      "genericReleaseCapabilityProfile.exposureBracketing.supportedAxes"
    );

  if (
    exposureAvailability.value !==
      "supported" &&
    axes.length > 0
  ) {
    throw new InvalidConfigurationError(
      "Unsupported/unknown exposure bracketing must not declare supported axes."
    );
  }

  return {
    schemaVersion:
      GENERIC_RELEASE_CAPABILITY_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "genericReleaseCapabilityProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "genericReleaseCapabilityProfile.profileVersion"
      ),
    scientificStatus:
      "approximation",
    evidence:
      parseEvidenceList(
        record.evidence,
        "genericReleaseCapabilityProfile.evidence"
      ),
    supportedDriveModes:
      parseFact(
        record.supportedDriveModes,
        "genericReleaseCapabilityProfile.supportedDriveModes",
        parseDriveModes
      ),
    maximumLogicalFramesPerSequence:
      parseFact(
        record.maximumLogicalFramesPerSequence,
        "genericReleaseCapabilityProfile.maximumLogicalFramesPerSequence",
        requirePositiveSafeInteger
      ),
    maximumCadenceFps:
      parseFact(
        record.maximumCadenceFps,
        "genericReleaseCapabilityProfile.maximumCadenceFps",
        requirePositiveFinite
      ),
    minimumInterFrameGapSeconds:
      parseFact(
        record.minimumInterFrameGapSeconds,
        "genericReleaseCapabilityProfile.minimumInterFrameGapSeconds",
        requireNonNegativeFinite
      ),
    overlappingOrdinaryStillExposures:
      false,
    exposureBracketing: {
      availability:
        exposureAvailability,
      supportedAxes: axes
    },
    focusBracketing: {
      availability:
        parseFact(
          focusBracketing.availability,
          "genericReleaseCapabilityProfile.focusBracketing.availability",
          parseAvailability
        )
    }
  };
}
