// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
 * missing required fields and incompatible scientific data fail at this boundary. ISO is an
 * exposure-index/control capability, not a source of photons or evidence of read noise.
 * Standard/expanded settings, capture-mode restrictions and Auto ISO availability are explicit;
 * unknown availability cannot authorize automatic control.
 * Resolve one standard/expanded/Auto ISO request under declared profile/capture-mode availability and
 * report explicit unavailable/unknown state. ISO is an exposure-index/control capability, not a source
 * of photons or evidence of read noise. Standard/expanded settings, capture-mode restrictions and Auto
 * ISO availability are explicit; unknown availability cannot authorize automatic control.
 * @see docs/GENERIC_TIER_PRESETS.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  ResolvedGenericEquipmentExposureCapabilities,
  ResolvedNumericSettingGrid
} from "./exposure-capabilities.js";

type UnknownRecord = Record<string, unknown>;

export const ISO_CAPABILITY_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;

export type IsoCapabilityAvailability =
  | "supported"
  | "unsupported"
  | "unknown";

export interface IsoExposureIndexRange {
  minimum: number;
  maximum: number;
}

export type IsoStandardSettingGrid =
  | {
      kind: "continuous-within-range";
    }
  | {
      kind: "discrete-values";
      values: readonly number[];
    };

export interface IsoExpandedSetting {
  settingId: string;
  label: string;
  direction: "low" | "high";
  exposureIndexEquivalent: number;
  autoIsoEligible: boolean;
  evidence: readonly EvidenceProvenance[];
}

export type IsoAutoIsoCapability =
  | {
      availability: "supported";
      standardExposureIndexRange:
        IsoExposureIndexRange;
      evidence: readonly EvidenceProvenance[];
    }
  | {
      availability:
        | "unsupported"
        | "unknown";
      evidence: readonly EvidenceProvenance[];
    };

export interface IsoCaptureModePolicy {
  captureModeId: string;
  standardExposureIndexRange:
    IsoExposureIndexRange;
  expandedSettingIds:
    readonly string[];
  autoIso:
    IsoAutoIsoCapability;
  evidence: readonly EvidenceProvenance[];
}

export interface IsoCapabilityProfile {
  schemaVersion:
    typeof ISO_CAPABILITY_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  capabilityMeaning:
    "reported-exposure-index-capability-not-physical-gain";
  standard: {
    exposureIndexRange:
      IsoExposureIndexRange;
    settingGrid:
      IsoStandardSettingGrid;
  };
  expandedSettings:
    readonly IsoExpandedSetting[];
  autoIso:
    IsoAutoIsoCapability;
  captureModePolicies:
    readonly IsoCaptureModePolicy[];
  evidence:
    readonly EvidenceProvenance[];
}

export type RequestedIsoSetting =
  | {
      kind: "standard";
      exposureIndex: number;
    }
  | {
      kind: "expanded";
      settingId: string;
    };

export interface ResolveIsoCapabilityInput {
  profile:
    IsoCapabilityProfile;
  setting:
    RequestedIsoSetting;
  captureModeId?: string;
}

export interface ResolvedIsoCapability {
  profileId: string;
  profileVersion: string;
  captureModeId: string | null;
  setting:
    | {
        kind: "standard";
        exposureIndex: number;
      }
    | {
        kind: "expanded";
        settingId: string;
        label: string;
        direction:
          "low" | "high";
        exposureIndexEquivalent:
          number;
      };
  reportedExposureIndex: number;
  expandedSetting: boolean;
  autoIsoEligible:
    boolean;
  standardExposureIndexRange:
    IsoExposureIndexRange;
  standardSettingGrid:
    IsoStandardSettingGrid;
  autoIso:
    IsoAutoIsoCapability;
  capturedPhotonExpectationModified:
    false;
  photonShotNoiseStatisticsModified:
    false;
  physicalGainInferred:
    false;
  conversionGainInferred:
    false;
  readNoiseInferred: false;
  saturationInferred: false;
  exactCommercialCameraBehaviorClaimed:
    false;
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
      path +
        " must be a non-empty string."
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

function parseRange(
  value: unknown,
  path: string
): IsoExposureIndexRange {
  const record =
    requireRecord(value, path);
  const minimum =
    requirePositiveFinite(
      record.minimum,
      path + ".minimum"
    );
  const maximum =
    requirePositiveFinite(
      record.maximum,
      path + ".maximum"
    );
  if (minimum > maximum) {
    throw new InvalidConfigurationError(
      path +
        ".minimum must be less than or equal to maximum."
    );
  }
  return {
    minimum,
    maximum
  };
}

function rangeWithin(
  inner:
    IsoExposureIndexRange,
  outer:
    IsoExposureIndexRange
): boolean {
  return (
    inner.minimum >=
      outer.minimum &&
    inner.maximum <=
      outer.maximum
  );
}

function parseGrid(
  value: unknown,
  range:
    IsoExposureIndexRange,
  path: string
): IsoStandardSettingGrid {
  const record =
    requireRecord(value, path);
  if (
    record.kind ===
    "continuous-within-range"
  ) {
    return {
      kind:
        "continuous-within-range"
    };
  }
  if (
    record.kind ===
    "discrete-values"
  ) {
    if (
      !Array.isArray(
        record.values
      ) ||
      record.values.length === 0
    ) {
      throw new InvalidConfigurationError(
        path +
          ".values must be a non-empty array."
      );
    }
    let previous =
      Number.NEGATIVE_INFINITY;
    const values =
      record.values.map(
        (entry, index) => {
          const parsed =
            requirePositiveFinite(
              entry,
              path +
                ".values[" +
                index +
                "]"
            );
          if (
            parsed <= previous
          ) {
            throw new InvalidConfigurationError(
              path +
                ".values must be strictly increasing."
            );
          }
          if (
            parsed <
              range.minimum ||
            parsed >
              range.maximum
          ) {
            throw new InvalidConfigurationError(
              path +
                ".values must remain inside the standard ISO range."
            );
          }
          previous = parsed;
          return parsed;
        }
      );
    if (
      values[0] !==
        range.minimum ||
      values[
        values.length - 1
      ] !== range.maximum
    ) {
      throw new InvalidConfigurationError(
        path +
          ".values must include the exact standard range endpoints."
      );
    }
    return {
      kind:
        "discrete-values",
      values
    };
  }
  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

function parseAvailability(
  value: unknown,
  path: string
): IsoCapabilityAvailability {
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

function parseAutoIso(
  value: unknown,
  standardRange:
    IsoExposureIndexRange,
  path: string
): IsoAutoIsoCapability {
  const record =
    requireRecord(value, path);
  const availability =
    parseAvailability(
      record.availability,
      path + ".availability"
    );
  const evidence =
    parseEvidenceList(
      record.evidence,
      path + ".evidence"
    );

  if (
    availability ===
    "supported"
  ) {
    const autoRange =
      parseRange(
        record
          .standardExposureIndexRange,
        path +
          ".standardExposureIndexRange"
      );
    if (
      !rangeWithin(
        autoRange,
        standardRange
      )
    ) {
      throw new InvalidConfigurationError(
        path +
          ".standardExposureIndexRange must lie inside the standard ISO range."
      );
    }
    return {
      availability:
        "supported",
      standardExposureIndexRange:
        autoRange,
      evidence
    };
  }

  if (
    record
      .standardExposureIndexRange !==
    undefined
  ) {
    throw new InvalidConfigurationError(
      path +
        ".standardExposureIndexRange must be omitted unless Auto ISO is supported."
    );
  }

  return {
    availability,
    evidence
  };
}

function parseExpandedSetting(
  value: unknown,
  standardRange:
    IsoExposureIndexRange,
  path: string
): IsoExpandedSetting {
  const record =
    requireRecord(value, path);
  const direction =
    record.direction;
  if (
    direction !== "low" &&
    direction !== "high"
  ) {
    throw new InvalidConfigurationError(
      path +
        ".direction must be low or high."
    );
  }
  const exposureIndexEquivalent =
    requirePositiveFinite(
      record
        .exposureIndexEquivalent,
      path +
        ".exposureIndexEquivalent"
    );
  if (
    (
      direction === "low" &&
      exposureIndexEquivalent >=
        standardRange.minimum
    ) ||
    (
      direction === "high" &&
      exposureIndexEquivalent <=
        standardRange.maximum
    )
  ) {
    throw new InvalidConfigurationError(
      path +
        ".exposureIndexEquivalent must lie outside the standard range in the declared direction."
    );
  }
  if (
    typeof record.autoIsoEligible !==
    "boolean"
  ) {
    throw new InvalidConfigurationError(
      path +
        ".autoIsoEligible must be boolean."
    );
  }

  return {
    settingId:
      requireNonEmptyString(
        record.settingId,
        path + ".settingId"
      ),
    label:
      requireNonEmptyString(
        record.label,
        path + ".label"
      ),
    direction,
    exposureIndexEquivalent,
    autoIsoEligible:
      record.autoIsoEligible,
    evidence:
      parseEvidenceList(
        record.evidence,
        path + ".evidence"
      )
  };
}

function parseCaptureModePolicy(
  value: unknown,
  standardRange:
    IsoExposureIndexRange,
  expandedIds:
    ReadonlySet<string>,
  path: string
): IsoCaptureModePolicy {
  const record =
    requireRecord(value, path);
  const modeRange =
    parseRange(
      record
        .standardExposureIndexRange,
      path +
        ".standardExposureIndexRange"
    );
  if (
    !rangeWithin(
      modeRange,
      standardRange
    )
  ) {
    throw new InvalidConfigurationError(
      path +
        ".standardExposureIndexRange must lie inside the global standard range."
    );
  }
  if (
    !Array.isArray(
      record.expandedSettingIds
    )
  ) {
    throw new InvalidConfigurationError(
      path +
        ".expandedSettingIds must be an array."
    );
  }
  const expandedSettingIds =
    record.expandedSettingIds.map(
      (entry, index) => {
        const id =
          requireNonEmptyString(
            entry,
            path +
              ".expandedSettingIds[" +
              index +
              "]"
          );
        if (!expandedIds.has(id)) {
          throw new InvalidConfigurationError(
            path +
              ".expandedSettingIds contains an unknown settingId."
          );
        }
        return id;
      }
    );
  if (
    new Set(
      expandedSettingIds
    ).size !==
    expandedSettingIds.length
  ) {
    throw new InvalidConfigurationError(
      path +
        ".expandedSettingIds must not contain duplicates."
    );
  }

  return {
    captureModeId:
      requireNonEmptyString(
        record.captureModeId,
        path + ".captureModeId"
      ),
    standardExposureIndexRange:
      modeRange,
    expandedSettingIds,
    autoIso:
      parseAutoIso(
        record.autoIso,
        modeRange,
        path + ".autoIso"
      ),
    evidence:
      parseEvidenceList(
        record.evidence,
        path + ".evidence"
      )
  };
}

/**
 * Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
 * missing required fields and incompatible scientific data fail at this boundary.
 *
 * ISO is an exposure-index/control capability, not a source of photons or evidence of read noise.
 * Standard/expanded settings, capture-mode restrictions and Auto ISO availability are explicit;
 * unknown availability cannot authorize automatic control.
 * @param value - unknown. Treated as untrusted data; static typing alone is not validation.
 * @returns IsoCapabilityProfile. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function parseIsoCapabilityProfile(
  value: unknown
): IsoCapabilityProfile {
  const record =
    requireRecord(
      value,
      "isoCapabilityProfile"
    );
  if (
    record.schemaVersion !==
    ISO_CAPABILITY_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'isoCapabilityProfile.schemaVersion must be "' +
        ISO_CAPABILITY_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.capabilityMeaning !==
    "reported-exposure-index-capability-not-physical-gain"
  ) {
    throw new InvalidConfigurationError(
      "isoCapabilityProfile.capabilityMeaning is invalid."
    );
  }
  const standard =
    requireRecord(
      record.standard,
      "isoCapabilityProfile.standard"
    );
  const standardRange =
    parseRange(
      standard
        .exposureIndexRange,
      "isoCapabilityProfile.standard.exposureIndexRange"
    );
  const settingGrid =
    parseGrid(
      standard.settingGrid,
      standardRange,
      "isoCapabilityProfile.standard.settingGrid"
    );

  if (
    !Array.isArray(
      record.expandedSettings
    )
  ) {
    throw new InvalidConfigurationError(
      "isoCapabilityProfile.expandedSettings must be an array."
    );
  }
  const expandedSettings =
    record.expandedSettings.map(
      (entry, index) =>
        parseExpandedSetting(
          entry,
          standardRange,
          "isoCapabilityProfile.expandedSettings[" +
            index +
            "]"
        )
    );
  const expandedIds =
    expandedSettings.map(
      (entry) =>
        entry.settingId
    );
  if (
    new Set(expandedIds).size !==
    expandedIds.length
  ) {
    throw new InvalidConfigurationError(
      "isoCapabilityProfile.expandedSettings must not contain duplicate settingId values."
    );
  }
  const expandedIdSet =
    new Set(expandedIds);

  if (
    !Array.isArray(
      record.captureModePolicies
    )
  ) {
    throw new InvalidConfigurationError(
      "isoCapabilityProfile.captureModePolicies must be an array."
    );
  }
  const captureModePolicies =
    record.captureModePolicies.map(
      (entry, index) =>
        parseCaptureModePolicy(
          entry,
          standardRange,
          expandedIdSet,
          "isoCapabilityProfile.captureModePolicies[" +
            index +
            "]"
        )
    );
  const modeIds =
    captureModePolicies.map(
      (entry) =>
        entry.captureModeId
    );
  if (
    new Set(modeIds).size !==
    modeIds.length
  ) {
    throw new InvalidConfigurationError(
      "isoCapabilityProfile.captureModePolicies must not contain duplicate captureModeId values."
    );
  }

  return {
    schemaVersion:
      ISO_CAPABILITY_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "isoCapabilityProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "isoCapabilityProfile.profileVersion"
      ),
    capabilityMeaning:
      "reported-exposure-index-capability-not-physical-gain",
    standard: {
      exposureIndexRange:
        standardRange,
      settingGrid
    },
    expandedSettings,
    autoIso:
      parseAutoIso(
        record.autoIso,
        standardRange,
        "isoCapabilityProfile.autoIso"
      ),
    captureModePolicies,
    evidence:
      parseEvidenceList(
        record.evidence,
        "isoCapabilityProfile.evidence"
      )
  };
}

function isStandardValueSupported(
  value: number,
  range:
    IsoExposureIndexRange,
  grid:
    IsoStandardSettingGrid
): boolean {
  if (
    value < range.minimum ||
    value > range.maximum
  ) {
    return false;
  }
  return (
    grid.kind ===
      "continuous-within-range" ||
    grid.values.includes(value)
  );
}

function resolveModePolicy(
  profile:
    IsoCapabilityProfile,
  captureModeId:
    string | undefined
): {
  range:
    IsoExposureIndexRange;
  expandedSettingIds:
    ReadonlySet<string>;
  autoIso:
    IsoAutoIsoCapability;
} {
  if (
    captureModeId ===
    undefined
  ) {
    return {
      range:
        profile.standard
          .exposureIndexRange,
      expandedSettingIds:
        new Set(
          profile
            .expandedSettings
            .map(
              (entry) =>
                entry.settingId
            )
        ),
      autoIso:
        profile.autoIso
    };
  }
  if (
    captureModeId.trim()
      .length === 0
  ) {
    throw new InvalidScientificInputError(
      "captureModeId must be a non-empty string when provided."
    );
  }
  const policy =
    profile.captureModePolicies.find(
      (entry) =>
        entry.captureModeId ===
        captureModeId
    );
  if (policy === undefined) {
    return {
      range:
        profile.standard
          .exposureIndexRange,
      expandedSettingIds:
        new Set(
          profile
            .expandedSettings
            .map(
              (entry) =>
                entry.settingId
            )
        ),
      autoIso:
        profile.autoIso
    };
  }
  return {
    range:
      policy
        .standardExposureIndexRange,
    expandedSettingIds:
      new Set(
        policy
          .expandedSettingIds
      ),
    autoIso:
      policy.autoIso
  };
}

/**
 * Resolve one standard/expanded/Auto ISO request under declared profile/capture-mode availability and
 * report explicit unavailable/unknown state.
 *
 * ISO is an exposure-index/control capability, not a source of photons or evidence of read noise.
 * Standard/expanded settings, capture-mode restrictions and Auto ISO availability are explicit;
 * unknown availability cannot authorize automatic control.
 * @param input - ResolveIsoCapabilityInput. See the linked contract for coordinate, unit and profile binding semantics.
 * @returns ResolvedIsoCapability. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function resolveIsoCapability(
  input:
    ResolveIsoCapabilityInput
): ResolvedIsoCapability {
  const profile =
    parseIsoCapabilityProfile(
      input.profile
    );
  const modePolicy =
    resolveModePolicy(
      profile,
      input.captureModeId
    );

  if (
    input.setting.kind ===
    "standard"
  ) {
    if (
      typeof input.setting
        .exposureIndex !==
        "number" ||
      !Number.isFinite(
        input.setting
          .exposureIndex
      ) ||
      input.setting
        .exposureIndex <= 0
    ) {
      throw new InvalidScientificInputError(
        "standard exposureIndex must be finite and greater than zero."
      );
    }
    if (
      !isStandardValueSupported(
        input.setting
          .exposureIndex,
        modePolicy.range,
        profile.standard
          .settingGrid
      )
    ) {
      throw new InvalidScientificInputError(
        "Requested standard exposure index is not supported by the selected ISO capability/mode."
      );
    }

    const autoEligible =
      modePolicy.autoIso
        .availability ===
        "supported" &&
      input.setting
        .exposureIndex >=
        modePolicy.autoIso
          .standardExposureIndexRange
          .minimum &&
      input.setting
        .exposureIndex <=
        modePolicy.autoIso
          .standardExposureIndexRange
          .maximum;

    return {
      profileId:
        profile.profileId,
      profileVersion:
        profile.profileVersion,
      captureModeId:
        input.captureModeId ??
        null,
      setting: {
        kind: "standard",
        exposureIndex:
          input.setting
            .exposureIndex
      },
      reportedExposureIndex:
        input.setting
          .exposureIndex,
      expandedSetting: false,
      autoIsoEligible:
        autoEligible,
      standardExposureIndexRange: {
        ...modePolicy.range
      },
      standardSettingGrid:
        profile.standard
          .settingGrid.kind ===
          "continuous-within-range"
          ? {
              kind:
                "continuous-within-range"
            }
          : {
              kind:
                "discrete-values",
              values: [
                ...profile.standard
                  .settingGrid
                  .values
              ]
            },
      autoIso:
        modePolicy.autoIso,
      capturedPhotonExpectationModified:
        false,
      photonShotNoiseStatisticsModified:
        false,
      physicalGainInferred:
        false,
      conversionGainInferred:
        false,
      readNoiseInferred:
        false,
      saturationInferred:
        false,
      exactCommercialCameraBehaviorClaimed:
        false
    };
  }

  if (
    input.setting.kind !==
    "expanded"
  ) {
    throw new InvalidScientificInputError(
      "ISO setting must be a valid standard or expanded setting."
    );
  }
  const expandedSettingId =
    input.setting.settingId;
  if (
    typeof expandedSettingId !==
      "string" ||
    expandedSettingId.trim()
      .length === 0
  ) {
    throw new InvalidScientificInputError(
      "ISO setting must be a valid standard or expanded setting."
    );
  }

  const setting =
    profile.expandedSettings.find(
      (entry) =>
        entry.settingId ===
        expandedSettingId
    );
  if (
    setting === undefined ||
    !modePolicy
      .expandedSettingIds
      .has(setting.settingId)
  ) {
    throw new InvalidScientificInputError(
      "Requested expanded ISO setting is not supported by the selected ISO capability/mode."
    );
  }

  return {
    profileId:
      profile.profileId,
    profileVersion:
      profile.profileVersion,
    captureModeId:
      input.captureModeId ??
      null,
    setting: {
      kind: "expanded",
      settingId:
        setting.settingId,
      label: setting.label,
      direction:
        setting.direction,
      exposureIndexEquivalent:
        setting
          .exposureIndexEquivalent
    },
    reportedExposureIndex:
      setting
        .exposureIndexEquivalent,
    expandedSetting: true,
    autoIsoEligible:
      modePolicy.autoIso
        .availability ===
        "supported" &&
      setting.autoIsoEligible,
    standardExposureIndexRange: {
      ...modePolicy.range
    },
    standardSettingGrid:
      profile.standard
        .settingGrid.kind ===
        "continuous-within-range"
        ? {
            kind:
              "continuous-within-range"
          }
        : {
            kind:
              "discrete-values",
            values: [
              ...profile.standard
                .settingGrid.values
            ]
          },
    autoIso:
      modePolicy.autoIso,
    capturedPhotonExpectationModified:
      false,
    photonShotNoiseStatisticsModified:
      false,
    physicalGainInferred:
      false,
    conversionGainInferred:
      false,
    readNoiseInferred: false,
    saturationInferred: false,
    exactCommercialCameraBehaviorClaimed:
      false
  };
}


export interface BindIsoCapabilityToExposureCapabilitiesInput {
  isoCapabilityProfile:
    IsoCapabilityProfile;
  equipmentCapabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  captureModeId?: string;
}

export interface BoundIsoExposureCapabilities {
  isoCapabilityProfileId: string;
  isoCapabilityProfileVersion: string;
  captureModeId: string | null;
  capabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  expandedSettingsExcludedFromNumericExposureGrid:
    true;
  physicalGainInferred: false;
  readNoiseInferred: false;
}

function sameResolvedGrid(
  resolved:
    ResolvedNumericSettingGrid,
  detailed:
    IsoStandardSettingGrid
): boolean {
  if (
    resolved.kind !==
    detailed.kind
  ) {
    return false;
  }
  if (
    resolved.kind ===
      "continuous-within-range" ||
    detailed.kind ===
      "continuous-within-range"
  ) {
    return true;
  }
  return (
    resolved.values.length ===
      detailed.values.length &&
    resolved.values.every(
      (value, index) =>
        value ===
        detailed.values[index]
    )
  );
}

function gridWithinRange(
  grid:
    ResolvedNumericSettingGrid,
  range:
    IsoExposureIndexRange
): ResolvedNumericSettingGrid {
  if (
    grid.kind ===
    "continuous-within-range"
  ) {
    return {
      kind:
        "continuous-within-range"
    };
  }
  const values =
    grid.values.filter(
      (value) =>
        value >= range.minimum &&
        value <= range.maximum
    );
  if (values.length === 0) {
    throw new InvalidScientificInputError(
      "Selected capture-mode ISO range contains no values from the resolved equipment ISO grid."
    );
  }
  return {
    kind: "discrete-values",
    values
  };
}

/**
 * Binds the detailed #7 ISO/EI capability contract into the numeric capability
 * envelope consumed by #99.
 *
 * The existing equipment capability must agree exactly with the profile's
 * global standard ISO range/grid. An evidenced capture-mode policy may narrow
 * the standard manual envelope for that mode. Auto ISO may then be narrower
 * still. Expanded L/H-style settings remain outside #99's ordinary numeric
 * ISO grid and are resolved through resolveIsoCapability().
 */
export function bindIsoCapabilityToExposureCapabilities(
  input:
    BindIsoCapabilityToExposureCapabilitiesInput
): BoundIsoExposureCapabilities {
  const profile =
    parseIsoCapabilityProfile(
      input.isoCapabilityProfile
    );
  const source =
    input.equipmentCapabilities;

  if (
    source.iso.minimum !==
      profile.standard
        .exposureIndexRange
        .minimum ||
    source.iso.maximum !==
      profile.standard
        .exposureIndexRange
        .maximum ||
    !sameResolvedGrid(
      source.iso.settingGrid,
      profile.standard
        .settingGrid
    )
  ) {
    throw new InvalidScientificInputError(
      "Detailed ISO capability standard range/grid must exactly match the existing resolved equipment ISO capability."
    );
  }

  const modePolicy =
    resolveModePolicy(
      profile,
      input.captureModeId
    );
  const settingGrid =
    gridWithinRange(
      source.iso.settingGrid,
      modePolicy.range
    );

  const iso =
    modePolicy.autoIso
      .availability ===
      "supported"
      ? {
          minimum:
            modePolicy.range.minimum,
          maximum:
            modePolicy.range.maximum,
          settingGrid,
          autoIsoAvailability:
            "supported" as const,
          autoIsoMinimum:
            modePolicy.autoIso
              .standardExposureIndexRange
              .minimum,
          autoIsoMaximum:
            modePolicy.autoIso
              .standardExposureIndexRange
              .maximum
        }
      : {
          minimum:
            modePolicy.range.minimum,
          maximum:
            modePolicy.range.maximum,
          settingGrid,
          autoIsoAvailability:
            modePolicy.autoIso
              .availability
        };

  return {
    isoCapabilityProfileId:
      profile.profileId,
    isoCapabilityProfileVersion:
      profile.profileVersion,
    captureModeId:
      input.captureModeId ??
      null,
    capabilities: {
      ...source,
      iso
    },
    expandedSettingsExcludedFromNumericExposureGrid:
      true,
    physicalGainInferred:
      false,
    readNoiseInferred:
      false
  };
}
