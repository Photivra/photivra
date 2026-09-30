// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  parseExposureMeteringProfile,
  type ExposureMeteringPolicy,
  type ExposureMeteringProfile
} from "../exposure/metering.js";
import type { GenericCapabilityAvailability } from "./exposure-capabilities.js";

type UnknownRecord = Record<string, unknown>;

export const GENERIC_BODY_METERING_CAPABILITY_SCHEMA_VERSION =
  "0.1.0" as const;

export interface GenericSupportedMeteringProfile {
  meteringProfileId: string;
  policyKind: ExposureMeteringPolicy["kind"];
  evidence: readonly EvidenceProvenance[];
}

export interface GenericBodyMeteringCapabilityProfile {
  schemaVersion:
    typeof GENERIC_BODY_METERING_CAPABILITY_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus: "approximation";
  evidence: readonly EvidenceProvenance[];
  supportedMeteringProfiles:
    readonly GenericSupportedMeteringProfile[];
  spotFocusPointLinkage: {
    availability: GenericCapabilityAvailability;
    evidence: readonly EvidenceProvenance[];
  };
}

export type MeteringCapabilityCompatibilityBlocker =
  | "metering-profile-unsupported"
  | "metering-policy-mismatch";

export interface MeteringCapabilityCompatibilityAssessment {
  schemaVersion:
    typeof GENERIC_BODY_METERING_CAPABILITY_SCHEMA_VERSION;
  status: "compatible" | "blocked";
  bodyProfile: {
    profileId: string;
    profileVersion: string;
  };
  meteringProfile: {
    profileId: string;
    policyKind: ExposureMeteringPolicy["kind"];
  };
  targetPolicyOwnership: "metering-profile";
  targetCalibrationDuplicatedInEquipmentProfile: false;
  spotFocusPointLinkageAvailability:
    GenericCapabilityAvailability;
  blockers:
    readonly MeteringCapabilityCompatibilityBlocker[];
}

export interface AssessExposureMeteringProfileCompatibilityInput {
  bodyCapabilities:
    GenericBodyMeteringCapabilityProfile;
  meteringProfile:
    ExposureMeteringProfile;
}

const POLICY_KINDS =
  new Set<ExposureMeteringPolicy["kind"]>([
    "multi-zone-uniform",
    "center-weighted-radial",
    "spot",
    "highlight-weighted"
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

function parsePolicyKind(
  value: unknown,
  path: string
): ExposureMeteringPolicy["kind"] {
  if (
    typeof value !== "string" ||
    !POLICY_KINDS.has(
      value as ExposureMeteringPolicy["kind"]
    )
  ) {
    throw new InvalidConfigurationError(
      path + " is invalid."
    );
  }
  return value as ExposureMeteringPolicy["kind"];
}

/**
 * Parses generic body metering capability metadata.
 *
 * This profile declares which engine-owned metering profiles/modes a generic
 * body can select. It deliberately does not duplicate target/calibration
 * values from those metering profiles.
 */
export function parseGenericBodyMeteringCapabilityProfile(
  value: unknown
): GenericBodyMeteringCapabilityProfile {
  const record = requireRecord(
    value,
    "genericBodyMeteringCapabilityProfile"
  );

  if (
    record.schemaVersion !==
    GENERIC_BODY_METERING_CAPABILITY_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'genericBodyMeteringCapabilityProfile.schemaVersion must be "' +
        GENERIC_BODY_METERING_CAPABILITY_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.scientificStatus !==
    "approximation"
  ) {
    throw new InvalidConfigurationError(
      'genericBodyMeteringCapabilityProfile.scientificStatus must be "approximation".'
    );
  }

  if (
    !Array.isArray(
      record.supportedMeteringProfiles
    ) ||
    record.supportedMeteringProfiles
      .length === 0
  ) {
    throw new InvalidConfigurationError(
      "genericBodyMeteringCapabilityProfile.supportedMeteringProfiles must be a non-empty array."
    );
  }

  const supported =
    record.supportedMeteringProfiles.map(
      (entry, index) => {
        const path =
          "genericBodyMeteringCapabilityProfile.supportedMeteringProfiles[" +
          index +
          "]";
        const item =
          requireRecord(entry, path);
        return {
          meteringProfileId:
            requireNonEmptyString(
              item.meteringProfileId,
              path + ".meteringProfileId"
            ),
          policyKind:
            parsePolicyKind(
              item.policyKind,
              path + ".policyKind"
            ),
          evidence:
            parseEvidenceList(
              item.evidence,
              path + ".evidence"
            )
        };
      }
    );

  const ids =
    supported.map(
      (entry) =>
        entry.meteringProfileId
    );
  if (
    new Set(ids).size !==
    ids.length
  ) {
    throw new InvalidConfigurationError(
      "genericBodyMeteringCapabilityProfile.supportedMeteringProfiles must not contain duplicate meteringProfileId values."
    );
  }

  const spotLink =
    requireRecord(
      record.spotFocusPointLinkage,
      "genericBodyMeteringCapabilityProfile.spotFocusPointLinkage"
    );

  return {
    schemaVersion:
      GENERIC_BODY_METERING_CAPABILITY_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "genericBodyMeteringCapabilityProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "genericBodyMeteringCapabilityProfile.profileVersion"
      ),
    scientificStatus:
      "approximation",
    evidence:
      parseEvidenceList(
        record.evidence,
        "genericBodyMeteringCapabilityProfile.evidence"
      ),
    supportedMeteringProfiles:
      supported,
    spotFocusPointLinkage: {
      availability:
        parseAvailability(
          spotLink.availability,
          "genericBodyMeteringCapabilityProfile.spotFocusPointLinkage.availability"
        ),
      evidence:
        parseEvidenceList(
          spotLink.evidence,
          "genericBodyMeteringCapabilityProfile.spotFocusPointLinkage.evidence"
        )
    }
  };
}

/**
 * Checks whether one engine metering profile is selectable on a generic body.
 *
 * Calibration/target policy remains authoritative in the metering profile and
 * is never copied into equipment capability metadata.
 */
export function assessExposureMeteringProfileCompatibility(
  input:
    AssessExposureMeteringProfileCompatibilityInput
): MeteringCapabilityCompatibilityAssessment {
  const body =
    parseGenericBodyMeteringCapabilityProfile(
      input.bodyCapabilities
    );
  const metering =
    parseExposureMeteringProfile(
      input.meteringProfile
    );

  const declared =
    body.supportedMeteringProfiles.find(
      (entry) =>
        entry.meteringProfileId ===
        metering.profileId
    );

  const blockers:
    MeteringCapabilityCompatibilityBlocker[] =
      [];

  if (declared === undefined) {
    blockers.push(
      "metering-profile-unsupported"
    );
  } else if (
    declared.policyKind !==
    metering.policy.kind
  ) {
    blockers.push(
      "metering-policy-mismatch"
    );
  }

  if (
    blockers.length >
    new Set(blockers).size
  ) {
    throw new InvalidScientificInputError(
      "Metering capability compatibility blockers must remain unique."
    );
  }

  return {
    schemaVersion:
      GENERIC_BODY_METERING_CAPABILITY_SCHEMA_VERSION,
    status:
      blockers.length === 0
        ? "compatible"
        : "blocked",
    bodyProfile: {
      profileId: body.profileId,
      profileVersion:
        body.profileVersion
    },
    meteringProfile: {
      profileId:
        metering.profileId,
      policyKind:
        metering.policy.kind
    },
    targetPolicyOwnership:
      "metering-profile",
    targetCalibrationDuplicatedInEquipmentProfile:
      false,
    spotFocusPointLinkageAvailability:
      body.spotFocusPointLinkage
        .availability,
    blockers
  };
}
