// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceBackedFact,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";

type UnknownRecord = Record<string, unknown>;

export const WHITE_BALANCE_PROFILE_SCHEMA_VERSION = "0.1.0" as const;
export const WHITE_BALANCE_STATE_VERSION = "0.1.0" as const;
export const COLOR_TEMPERATURE_WHITE_BALANCE_INTENT_VERSION =
  "0.1.0" as const;

export type WhiteBalanceInputDomain =
  "relative-pre-wb-camera-linear-rgb";

export interface WhiteBalanceChannelGains {
  red: number;
  green: number;
  blue: number;
}

export type WhiteBalanceAwbIntent =
  | "neutral-priority"
  | "standard"
  | "ambience-preserving";

export interface WhiteBalancePresetDefinition {
  presetId: string;
  label: string;
  channelGains: EvidenceBackedFact<WhiteBalanceChannelGains>;
  nominalColorTemperatureKelvin?: number;
  nominalTint?: number;
  limitations?: readonly string[];
}

export interface WhiteBalanceAwbPolicy {
  policyId: string;
  intent: WhiteBalanceAwbIntent;
  /**
   * Fraction of a gray-world neutralizing correction applied in logarithmic
   * gain space. 1 is full neutral-priority correction; lower values preserve
   * more of the observed cast.
   */
  correctionStrength: EvidenceBackedFact<number>;
  limitations?: readonly string[];
}

export interface WhiteBalanceProfile {
  schemaVersion: typeof WHITE_BALANCE_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus: "approximation";
  inputDomain: WhiteBalanceInputDomain;
  presets: readonly WhiteBalancePresetDefinition[];
  awbPolicies: readonly WhiteBalanceAwbPolicy[];
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface PreWhiteBalanceRgbSample {
  sampleId: string;
  red: number;
  green: number;
  blue: number;
  weight: number;
  clipped: boolean;
}

export interface PreWhiteBalanceRgbSampleSet {
  imageStateId: string;
  inputDomain: WhiteBalanceInputDomain;
  samples: readonly PreWhiteBalanceRgbSample[];
}

export interface ResolvedWhiteBalanceState {
  version: typeof WHITE_BALANCE_STATE_VERSION;
  stateId: string;
  inputDomain: WhiteBalanceInputDomain;
  source:
    | "preset"
    | "manual-gains"
    | "custom-measurement"
    | "auto-white-balance";
  channelGains: WhiteBalanceChannelGains;
  locked: boolean;
  sourceProfile?: {
    profileId: string;
    profileVersion: string;
  };
  presetId?: string;
  awbPolicy?: {
    policyId: string;
    intent: WhiteBalanceAwbIntent;
    correctionStrength: number;
  };
  measurement?: {
    imageStateId: string;
    usableSampleCount: number;
    rejectedClippedSampleCount: number;
    weightedMeanPreWbSignal: {
      red: number;
      green: number;
      blue: number;
    };
  };
  sourceStateId?: string;
  trueIlluminantMetadataUsed: false;
  sceneIlluminationModified: false;
  rawCaptureDestructivelyModified: false;
  physicalExposureModified: false;
  focusModified: false;
  limitations: readonly string[];
}

export interface ColorTemperatureWhiteBalanceIntent {
  version: typeof COLOR_TEMPERATURE_WHITE_BALANCE_INTENT_VERSION;
  intentId: string;
  colorTemperatureKelvin: number;
  tint: number;
  channelGainsResolved: false;
  requiresCameraProfileColorimetry: true;
  sceneIlluminationModified: false;
}

export interface ResolvePresetWhiteBalanceInput {
  stateId: string;
  profile: WhiteBalanceProfile;
  presetId: string;
}

export interface ResolveManualWhiteBalanceInput {
  stateId: string;
  channelGains: WhiteBalanceChannelGains;
}

export interface CreateColorTemperatureWhiteBalanceIntentInput {
  intentId: string;
  colorTemperatureKelvin: number;
  tint: number;
}

export interface ResolveCustomWhiteBalanceInput {
  stateId: string;
  sampleSet: PreWhiteBalanceRgbSampleSet;
}

export interface EstimateAutoWhiteBalanceInput {
  stateId: string;
  profile: WhiteBalanceProfile;
  policyId: string;
  sampleSet: PreWhiteBalanceRgbSampleSet;
}

export interface CreateLockedWhiteBalanceStateInput {
  stateId: string;
  sourceState: ResolvedWhiteBalanceState;
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new InvalidConfigurationError(path + " must be an object.");
  }
  return value as UnknownRecord;
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidConfigurationError(
      path + " must be a non-empty string."
    );
  }
  return value.trim();
}

function requireFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidConfigurationError(path + " must be finite.");
  }
  return value;
}

function requirePositiveFinite(value: unknown, path: string): number {
  const parsed = requireFinite(value, path);
  if (parsed <= 0) {
    throw new InvalidConfigurationError(
      path + " must be greater than zero."
    );
  }
  return parsed;
}

function requireFraction(value: unknown, path: string): number {
  const parsed = requireFinite(value, path);
  if (parsed < 0 || parsed > 1) {
    throw new InvalidConfigurationError(
      path + " must be from zero through one."
    );
  }
  return parsed;
}

function parseChannelGains(
  value: unknown,
  path: string
): WhiteBalanceChannelGains {
  const record = requireRecord(value, path);
  return {
    red: requirePositiveFinite(record.red, path + ".red"),
    green: requirePositiveFinite(record.green, path + ".green"),
    blue: requirePositiveFinite(record.blue, path + ".blue")
  };
}

function parseLimitations(
  value: unknown,
  path: string
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new InvalidConfigurationError(path + " must be an array.");
  }
  const parsed = value.map((entry, index) =>
    requireNonEmptyString(entry, path + "[" + index + "]")
  );
  if (new Set(parsed).size !== parsed.length) {
    throw new InvalidConfigurationError(
      path + " must not contain duplicates."
    );
  }
  return parsed;
}

function parseOptionalLimitations(
  value: unknown,
  path: string
): readonly string[] | undefined {
  return value === undefined ? undefined : parseLimitations(value, path);
}

function parsePreset(
  value: unknown,
  path: string
): WhiteBalancePresetDefinition {
  const record = requireRecord(value, path);
  const gainsFact = requireRecord(record.channelGains, path + ".channelGains");
  const limitations = parseOptionalLimitations(
    record.limitations,
    path + ".limitations"
  );

  return {
    presetId: requireNonEmptyString(record.presetId, path + ".presetId"),
    label: requireNonEmptyString(record.label, path + ".label"),
    channelGains: {
      value: parseChannelGains(
        gainsFact.value,
        path + ".channelGains.value"
      ),
      evidence: parseEvidenceList(
        gainsFact.evidence,
        path + ".channelGains.evidence"
      )
    },
    ...(record.nominalColorTemperatureKelvin === undefined
      ? {}
      : {
          nominalColorTemperatureKelvin: requirePositiveFinite(
            record.nominalColorTemperatureKelvin,
            path + ".nominalColorTemperatureKelvin"
          )
        }),
    ...(record.nominalTint === undefined
      ? {}
      : {
          nominalTint: requireFinite(
            record.nominalTint,
            path + ".nominalTint"
          )
        }),
    ...(limitations === undefined
      ? {}
      : {
          limitations
        })
  };
}

function parseAwbIntent(
  value: unknown,
  path: string
): WhiteBalanceAwbIntent {
  if (
    value !== "neutral-priority" &&
    value !== "standard" &&
    value !== "ambience-preserving"
  ) {
    throw new InvalidConfigurationError(path + " is invalid.");
  }
  return value;
}

function parseAwbPolicy(
  value: unknown,
  path: string
): WhiteBalanceAwbPolicy {
  const record = requireRecord(value, path);
  const strengthFact = requireRecord(
    record.correctionStrength,
    path + ".correctionStrength"
  );
  const limitations = parseOptionalLimitations(
    record.limitations,
    path + ".limitations"
  );

  return {
    policyId: requireNonEmptyString(record.policyId, path + ".policyId"),
    intent: parseAwbIntent(record.intent, path + ".intent"),
    correctionStrength: {
      value: requireFraction(
        strengthFact.value,
        path + ".correctionStrength.value"
      ),
      evidence: parseEvidenceList(
        strengthFact.evidence,
        path + ".correctionStrength.evidence"
      )
    },
    ...(limitations === undefined ? {} : { limitations })
  };
}

/**
 * Parses generic WB presets and AWB policies.
 *
 * Preset gains and AWB correction strength are profile-owned. Labels are not
 * treated as universal Kelvin aliases or manufacturer-specific behavior.
 */
export function parseWhiteBalanceProfile(
  value: unknown
): WhiteBalanceProfile {
  const record = requireRecord(value, "whiteBalanceProfile");

  if (record.schemaVersion !== WHITE_BALANCE_PROFILE_SCHEMA_VERSION) {
    throw new InvalidConfigurationError(
      'whiteBalanceProfile.schemaVersion must be "' +
        WHITE_BALANCE_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (record.scientificStatus !== "approximation") {
    throw new InvalidConfigurationError(
      'whiteBalanceProfile.scientificStatus must be "approximation".'
    );
  }
  if (record.inputDomain !== "relative-pre-wb-camera-linear-rgb") {
    throw new InvalidConfigurationError(
      'whiteBalanceProfile.inputDomain must be "relative-pre-wb-camera-linear-rgb".'
    );
  }
  if (!Array.isArray(record.presets)) {
    throw new InvalidConfigurationError(
      "whiteBalanceProfile.presets must be an array."
    );
  }
  if (!Array.isArray(record.awbPolicies) || record.awbPolicies.length === 0) {
    throw new InvalidConfigurationError(
      "whiteBalanceProfile.awbPolicies must be a non-empty array."
    );
  }

  const presets = record.presets.map((entry, index) =>
    parsePreset(entry, "whiteBalanceProfile.presets[" + index + "]")
  );
  const policies = record.awbPolicies.map((entry, index) =>
    parseAwbPolicy(entry, "whiteBalanceProfile.awbPolicies[" + index + "]")
  );

  const presetIds = presets.map((entry) => entry.presetId);
  const policyIds = policies.map((entry) => entry.policyId);
  if (new Set(presetIds).size !== presetIds.length) {
    throw new InvalidConfigurationError(
      "whiteBalanceProfile.presets must not contain duplicate presetId values."
    );
  }
  if (new Set(policyIds).size !== policyIds.length) {
    throw new InvalidConfigurationError(
      "whiteBalanceProfile.awbPolicies must not contain duplicate policyId values."
    );
  }

  return {
    schemaVersion: WHITE_BALANCE_PROFILE_SCHEMA_VERSION,
    profileId: requireNonEmptyString(
      record.profileId,
      "whiteBalanceProfile.profileId"
    ),
    profileVersion: requireNonEmptyString(
      record.profileVersion,
      "whiteBalanceProfile.profileVersion"
    ),
    scientificStatus: "approximation",
    inputDomain: "relative-pre-wb-camera-linear-rgb",
    presets,
    awbPolicies: policies,
    evidence: parseEvidenceList(record.evidence, "whiteBalanceProfile.evidence"),
    limitations: parseLimitations(
      record.limitations,
      "whiteBalanceProfile.limitations"
    )
  };
}

function requireScientificNonEmptyString(
  value: string,
  path: string
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidScientificInputError(
      path + " must be a non-empty string."
    );
  }
  return value.trim();
}

function requireScientificFinite(
  value: number,
  path: string
): number {
  if (!Number.isFinite(value)) {
    throw new InvalidScientificInputError(path + " must be finite.");
  }
  return value;
}

function requireScientificPositiveFinite(
  value: number,
  path: string
): number {
  const parsed = requireScientificFinite(value, path);
  if (parsed <= 0) {
    throw new InvalidScientificInputError(
      path + " must be greater than zero."
    );
  }
  return parsed;
}

function requireScientificNonNegativeFinite(
  value: number,
  path: string
): number {
  const parsed = requireScientificFinite(value, path);
  if (parsed < 0) {
    throw new InvalidScientificInputError(
      path + " must be greater than or equal to zero."
    );
  }
  return parsed;
}

function validateResolvedGains(
  gains: WhiteBalanceChannelGains,
  path: string
): WhiteBalanceChannelGains {
  return {
    red: requireScientificPositiveFinite(gains.red, path + ".red"),
    green: requireScientificPositiveFinite(gains.green, path + ".green"),
    blue: requireScientificPositiveFinite(gains.blue, path + ".blue")
  };
}

function immutableState(
  state: ResolvedWhiteBalanceState
): ResolvedWhiteBalanceState {
  return Object.freeze({
    ...state,
    channelGains: Object.freeze({ ...state.channelGains }),
    limitations: Object.freeze([...state.limitations]),
    ...(state.sourceProfile === undefined
      ? {}
      : { sourceProfile: Object.freeze({ ...state.sourceProfile }) }),
    ...(state.awbPolicy === undefined
      ? {}
      : { awbPolicy: Object.freeze({ ...state.awbPolicy }) }),
    ...(state.measurement === undefined
      ? {}
      : {
          measurement: Object.freeze({
            ...state.measurement,
            weightedMeanPreWbSignal: Object.freeze({
              ...state.measurement.weightedMeanPreWbSignal
            })
          })
        })
  });
}

function stateBase(
  stateId: string,
  source: ResolvedWhiteBalanceState["source"],
  gains: WhiteBalanceChannelGains,
  limitations: readonly string[]
): Pick<
  ResolvedWhiteBalanceState,
  | "version"
  | "stateId"
  | "inputDomain"
  | "source"
  | "channelGains"
  | "locked"
  | "trueIlluminantMetadataUsed"
  | "sceneIlluminationModified"
  | "rawCaptureDestructivelyModified"
  | "physicalExposureModified"
  | "focusModified"
  | "limitations"
> {
  return {
    version: WHITE_BALANCE_STATE_VERSION,
    stateId: requireScientificNonEmptyString(stateId, "stateId"),
    inputDomain: "relative-pre-wb-camera-linear-rgb",
    source,
    channelGains: validateResolvedGains(gains, "channelGains"),
    locked: false,
    trueIlluminantMetadataUsed: false,
    sceneIlluminationModified: false,
    rawCaptureDestructivelyModified: false,
    physicalExposureModified: false,
    focusModified: false,
    limitations: [...limitations]
  };
}

/** Resolves a profile-owned WB preset without universal label/Kelvin rules. */
export function resolvePresetWhiteBalance(
  input: ResolvePresetWhiteBalanceInput
): ResolvedWhiteBalanceState {
  const profile = parseWhiteBalanceProfile(input.profile);
  const presetId = requireScientificNonEmptyString(
    input.presetId,
    "presetId"
  );
  const preset = profile.presets.find((entry) => entry.presetId === presetId);
  if (preset === undefined) {
    throw new InvalidScientificInputError(
      "presetId is not declared by the selected white-balance profile."
    );
  }

  return immutableState({
    ...stateBase(
      input.stateId,
      "preset",
      preset.channelGains.value,
      [
        ...profile.limitations,
        ...(preset.limitations ?? [])
      ]
    ),
    sourceProfile: {
      profileId: profile.profileId,
      profileVersion: profile.profileVersion
    },
    presetId
  });
}

/** Resolves explicit manual camera-linear channel gains. */
export function resolveManualWhiteBalance(
  input: ResolveManualWhiteBalanceInput
): ResolvedWhiteBalanceState {
  return immutableState(
    stateBase(
      input.stateId,
      "manual-gains",
      input.channelGains,
      [
        "Manual gains are caller-selected WB intent, not a measured physical illuminant."
      ]
    )
  );
}

/**
 * Records independent color-temperature and tint intent.
 *
 * No channel gains are fabricated here; mapping CCT+tint into a camera's
 * channel/color space belongs to a profile/colorimetry contract.
 */
export function createColorTemperatureWhiteBalanceIntent(
  input: CreateColorTemperatureWhiteBalanceIntentInput
): ColorTemperatureWhiteBalanceIntent {
  return Object.freeze({
    version: COLOR_TEMPERATURE_WHITE_BALANCE_INTENT_VERSION,
    intentId: requireScientificNonEmptyString(input.intentId, "intentId"),
    colorTemperatureKelvin: requireScientificPositiveFinite(
      input.colorTemperatureKelvin,
      "colorTemperatureKelvin"
    ),
    tint: requireScientificFinite(input.tint, "tint"),
    channelGainsResolved: false,
    requiresCameraProfileColorimetry: true,
    sceneIlluminationModified: false
  });
}

function reduceSampleSet(
  sampleSet: PreWhiteBalanceRgbSampleSet,
  clippedPolicy: "reject-any" | "exclude"
): {
  imageStateId: string;
  usableSampleCount: number;
  rejectedClippedSampleCount: number;
  weightedMean: {
    red: number;
    green: number;
    blue: number;
  };
} {
  if (sampleSet.inputDomain !== "relative-pre-wb-camera-linear-rgb") {
    throw new InvalidScientificInputError(
      'sampleSet.inputDomain must be "relative-pre-wb-camera-linear-rgb".'
    );
  }
  const imageStateId = requireScientificNonEmptyString(
    sampleSet.imageStateId,
    "sampleSet.imageStateId"
  );
  if (!Array.isArray(sampleSet.samples) || sampleSet.samples.length === 0) {
    throw new InvalidScientificInputError(
      "sampleSet.samples must be a non-empty array."
    );
  }

  let weightSum = 0;
  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;
  let rejectedClippedSampleCount = 0;
  const ids = new Set<string>();

  sampleSet.samples.forEach((sample, index) => {
    const path = "sampleSet.samples[" + index + "]";
    const sampleId = requireScientificNonEmptyString(
      sample.sampleId,
      path + ".sampleId"
    );
    if (ids.has(sampleId)) {
      throw new InvalidScientificInputError(
        "sampleSet.samples must not contain duplicate sampleId values."
      );
    }
    ids.add(sampleId);

    const red = requireScientificNonNegativeFinite(sample.red, path + ".red");
    const green = requireScientificNonNegativeFinite(
      sample.green,
      path + ".green"
    );
    const blue = requireScientificNonNegativeFinite(
      sample.blue,
      path + ".blue"
    );
    const weight = requireScientificPositiveFinite(
      sample.weight,
      path + ".weight"
    );

    if (sample.clipped) {
      rejectedClippedSampleCount += 1;
      if (clippedPolicy === "reject-any") {
        throw new InvalidScientificInputError(
          "Custom white-balance measurement must not contain clipped samples."
        );
      }
      return;
    }

    weightSum += weight;
    redSum += red * weight;
    greenSum += green * weight;
    blueSum += blue * weight;
  });

  if (weightSum <= 0) {
    throw new InvalidScientificInputError(
      "White-balance estimation requires at least one usable unclipped sample."
    );
  }

  const weightedMean = {
    red: redSum / weightSum,
    green: greenSum / weightSum,
    blue: blueSum / weightSum
  };

  if (
    weightedMean.red <= 0 ||
    weightedMean.green <= 0 ||
    weightedMean.blue <= 0
  ) {
    throw new InvalidScientificInputError(
      "White-balance estimation requires positive signal in every camera-linear channel."
    );
  }

  return {
    imageStateId,
    usableSampleCount:
      sampleSet.samples.length - rejectedClippedSampleCount,
    rejectedClippedSampleCount,
    weightedMean
  };
}

function neutralizingGains(
  mean: {
    red: number;
    green: number;
    blue: number;
  }
): WhiteBalanceChannelGains {
  return {
    red: mean.green / mean.red,
    green: 1,
    blue: mean.green / mean.blue
  };
}

/**
 * Resolves a user-declared neutral/gray custom-WB measurement.
 *
 * The engine validates and reduces the selected pre-WB sample, but it does not
 * claim the selected object is spectrally neutral in the real scene.
 */
export function resolveCustomWhiteBalance(
  input: ResolveCustomWhiteBalanceInput
): ResolvedWhiteBalanceState {
  const reduced = reduceSampleSet(input.sampleSet, "reject-any");

  return immutableState({
    ...stateBase(
      input.stateId,
      "custom-measurement",
      neutralizingGains(reduced.weightedMean),
      [
        "Custom WB assumes the caller-selected measurement target is intended to be neutral.",
        "Resolved gains are camera-linear relative corrections, not a recovered physical illuminant spectrum."
      ]
    ),
    measurement: {
      imageStateId: reduced.imageStateId,
      usableSampleCount: reduced.usableSampleCount,
      rejectedClippedSampleCount: reduced.rejectedClippedSampleCount,
      weightedMeanPreWbSignal: reduced.weightedMean
    }
  });
}

/**
 * Estimates one global AWB state from declared pre-WB camera-linear samples.
 *
 * It intentionally does not accept true illuminant metadata. A gray-world
 * neutralizing estimate is softened by the profile's correctionStrength so
 * different generic AWB priorities can preserve different amounts of cast.
 */
export function estimateAutoWhiteBalance(
  input: EstimateAutoWhiteBalanceInput
): ResolvedWhiteBalanceState {
  const profile = parseWhiteBalanceProfile(input.profile);
  const policyId = requireScientificNonEmptyString(
    input.policyId,
    "policyId"
  );
  const policy = profile.awbPolicies.find(
    (entry) => entry.policyId === policyId
  );
  if (policy === undefined) {
    throw new InvalidScientificInputError(
      "policyId is not declared by the selected white-balance profile."
    );
  }

  const reduced = reduceSampleSet(input.sampleSet, "exclude");
  const neutral = neutralizingGains(reduced.weightedMean);
  const strength = policy.correctionStrength.value;
  const gains = {
    red: Math.pow(neutral.red, strength),
    green: 1,
    blue: Math.pow(neutral.blue, strength)
  };

  return immutableState({
    ...stateBase(
      input.stateId,
      "auto-white-balance",
      gains,
      [
        ...profile.limitations,
        ...(policy.limitations ?? []),
        "AWB is a deterministic gray-world-style global estimate over camera-observable pre-WB signal.",
        "One global WB may leave local color casts under mixed illumination."
      ]
    ),
    sourceProfile: {
      profileId: profile.profileId,
      profileVersion: profile.profileVersion
    },
    awbPolicy: {
      policyId: policy.policyId,
      intent: policy.intent,
      correctionStrength: strength
    },
    measurement: {
      imageStateId: reduced.imageStateId,
      usableSampleCount: reduced.usableSampleCount,
      rejectedClippedSampleCount: reduced.rejectedClippedSampleCount,
      weightedMeanPreWbSignal: reduced.weightedMean
    }
  });
}

/**
 * Freezes a resolved WB state under a new stable identity.
 *
 * Locking changes neither the scene nor the gains; later AWB estimates may
 * differ while this locked state remains unchanged.
 */
export function createLockedWhiteBalanceState(
  input: CreateLockedWhiteBalanceStateInput
): ResolvedWhiteBalanceState {
  const stateId = requireScientificNonEmptyString(input.stateId, "stateId");
  const source = input.sourceState;

  return immutableState({
    ...source,
    stateId,
    channelGains: validateResolvedGains(
      source.channelGains,
      "sourceState.channelGains"
    ),
    locked: true,
    sourceStateId: requireScientificNonEmptyString(
      source.stateId,
      "sourceState.stateId"
    ),
    limitations: [...source.limitations]
  });
}
