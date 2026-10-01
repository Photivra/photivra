// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  parseSceneIlluminationProfile,
  type SceneIlluminationMagnitude,
  type SceneIlluminationProfile,
  type SceneIlluminationSource
} from "../schema/illumination.js";
import {
  parseSceneIlluminationTemporalProfile,
  type SceneIlluminationTemporalProfile,
  type SceneIlluminationTemporalRegistrationUncertainty,
  type SceneIlluminationTemporalWaveform
} from "../schema/illumination-temporal.js";
import type {
  ResolvedCaptureModeTiming
} from "../sensor/capture-mode-timing.js";

type UnknownRecord = Record<string, unknown>;

export const MANUAL_FLASH_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;
export const FLASH_SYNC_CAPABILITY_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;

export type NormalFlashSyncMode =
  | "front-curtain"
  | "rear-curtain";

export type FlashSyncMode =
  | NormalFlashSyncMode
  | "high-speed-sync";

export type FlashHssAvailability =
  | "supported"
  | "unsupported"
  | "unknown";

export interface ManualFlashProfile {
  schemaVersion:
    typeof MANUAL_FLASH_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus: "approximation";
  source:
    SceneIlluminationSource;
  waveform:
    Extract<
      SceneIlluminationTemporalWaveform,
      {
        kind:
          "aperiodic-relative-multiplier";
      }
    >;
  pulseSupportDurationSeconds:
    number;
  normalizedWaveformIntegralSeconds:
    number;
  manualOutputModel:
    "linear-source-magnitude-fraction-approximation";
  triggerTimingUncertainty:
    SceneIlluminationTemporalRegistrationUncertainty;
  ttlModeled: false;
  hssEmissionModeled: false;
  recycleModeled: false;
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface FlashSyncCapabilityProfile {
  schemaVersion:
    typeof FLASH_SYNC_CAPABILITY_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  captureModeId: string;
  ordinarySyncModes:
    readonly NormalFlashSyncMode[];
  hssAvailability:
    FlashHssAvailability;
  capabilityMeaning:
    "capture-mode-specific-flash-sync-capability";
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface ResolveManualFlashSyncInput {
  flashProfile:
    ManualFlashProfile;
  syncCapability:
    FlashSyncCapabilityProfile;
  timing:
    ResolvedCaptureModeTiming;
  syncMode:
    FlashSyncMode;
  manualOutputFraction:
    number;
}

export interface ResolvedManualFlashSync {
  flashProfileId: string;
  flashProfileVersion: string;
  syncCapabilityProfileId: string;
  syncCapabilityProfileVersion:
    string;
  captureModeId: string;
  sourceId: string;
  syncMode:
    NormalFlashSyncMode;
  manualOutputFraction: number;
  timeReference:
    "first-opening-boundary-phase";
  allFrameOpenWindow: {
    startSecondsFromCaptureReference:
      number;
    endSecondsFromCaptureReference:
      number;
    durationSeconds: number;
  };
  pulseSupportDurationSeconds:
    number;
  pulseStartSecondsFromCaptureReference:
    number;
  pulseEndSecondsFromCaptureReference:
    number;
  waveformTimeZeroSecondsFromCaptureReference:
    number;
  normalizedWaveformIntegralSeconds:
    number;
  ordinaryOnePulseFullFrameUniformExposureAuthorized:
    true;
  hssUsed: false;
  hssEmissionModeled: false;
  sensorReadoutTimingUsedAsExposureTiming:
    false;
  shutterDurationUsedAsFlashPulseDuration:
    false;
  automaticFlashExposureResolved:
    false;
}

export interface CreateManualFlashIlluminationCompositionInput {
  ambientIlluminationProfile:
    SceneIlluminationProfile;
  flashProfile:
    ManualFlashProfile;
  enabled: boolean;
  resolvedSync?:
    ResolvedManualFlashSync;
  outputIlluminationProfileId:
    string;
  temporalProfileId: string;
  sourceBindingId: string;
}

export interface ManualFlashIlluminationComposition {
  enabled: boolean;
  ambientIlluminationProfileId:
    string;
  illuminationProfile:
    SceneIlluminationProfile;
  temporalProfile:
    SceneIlluminationTemporalProfile | null;
  flashSourceId: string | null;
  flashSourceAdded: boolean;
  ambientSourcesPreserved:
    true;
  flashMagnitudeAppliedBeforeSceneTransport:
    boolean;
  flashTemporalWaveformAppliedThroughAuthoritativeIlluminationPath:
    boolean;
  postRenderBrightnessEffectApplied:
    false;
  cameraWhiteBalanceModified:
    false;
  focusModified: false;
  driveModeModified: false;
  ambientExposureMeterModified:
    false;
  ttlModeled: false;
}

const NORMAL_SYNC_MODES =
  new Set<NormalFlashSyncMode>([
    "front-curtain",
    "rear-curtain"
  ]);

const HSS_AVAILABILITIES =
  new Set<FlashHssAvailability>([
    "supported",
    "unsupported",
    "unknown"
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
      path +
        " must be a non-empty string."
    );
  }
  return value.trim();
}

function requireFraction(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 1
  ) {
    throw new InvalidScientificInputError(
      path +
        " must be finite, greater than zero, and at most one."
    );
  }
  return value;
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
  const parsed =
    value.map((entry, index) =>
      requireNonEmptyString(
        entry,
        path +
          "[" +
          index +
          "]"
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

function validateSource(
  source: unknown,
  evidence:
    readonly EvidenceProvenance[]
): SceneIlluminationSource {
  const illumination =
    parseSceneIlluminationProfile({
      schemaVersion: "0.1.0",
      profileId:
        "manual-flash-validation-illumination",
      sceneId:
        "manual-flash-validation-scene",
      evidence,
      sources: [source],
      sceneRadianceCalculated:
        false,
      materialResponseApplied:
        false,
      visibilityEvaluated:
        false,
      indirectTransportEvaluated:
        false,
      fluorescenceModeled:
        false,
      volumetricTransportModeled:
        false,
      polarizationModeled:
        false
    });
  const parsed =
    illumination.sources[0];
  if (parsed === undefined) {
    throw new InvalidConfigurationError(
      "manualFlashProfile.source is required."
    );
  }
  if (!parsed.enabled) {
    throw new InvalidConfigurationError(
      "manualFlashProfile.source must be enabled in the reusable flash profile; firing on/off is a capture decision."
    );
  }
  if (
    parsed.family !== "point" &&
    parsed.family !== "spot" &&
    parsed.family !== "area"
  ) {
    throw new InvalidConfigurationError(
      "manualFlashProfile.source must use point, spot, or area source geometry."
    );
  }
  return parsed;
}

function validateWaveform(
  waveform: unknown,
  source:
    SceneIlluminationSource,
  evidence:
    readonly EvidenceProvenance[],
  timingUncertainty:
    SceneIlluminationTemporalRegistrationUncertainty
): Extract<
  SceneIlluminationTemporalWaveform,
  {
    kind:
      "aperiodic-relative-multiplier";
  }
> {
  const temporal =
    parseSceneIlluminationTemporalProfile({
      schemaVersion: "0.1.0",
      profileId:
        "manual-flash-validation-temporal",
      sceneId:
        "manual-flash-validation-scene",
      illuminationProfileId:
        "manual-flash-validation-illumination",
      evidence,
      waveforms: [waveform],
      sourceBindings: [{
        bindingId:
          "manual-flash-validation-binding",
        sourceId:
          source.sourceId,
        waveformId:
          (
            requireRecord(
              waveform,
              "manualFlashProfile.waveform"
            )
          ).waveformId,
        captureTimeReference:
          "first-opening-boundary-phase",
        waveformTimeZeroSecondsFromCaptureReference:
          0,
        scientificStatus:
          "approximation",
        timingUncertainty,
        evidence
      }],
      baseIlluminationProfileRemainsAuthoritative:
        true,
      sensorReadoutTimingUsedAsExposureTiming:
        false,
      automaticExposurePolicyIncluded:
        false
    });
  const parsed =
    temporal.waveforms[0];
  if (
    parsed === undefined ||
    parsed.kind !==
      "aperiodic-relative-multiplier"
  ) {
    throw new InvalidConfigurationError(
      "manualFlashProfile.waveform must be an aperiodic relative multiplier."
    );
  }
  const first =
    parsed.samples[0]!;
  const last =
    parsed.samples[
      parsed.samples.length - 1
    ]!;
  if (
    first
      .timeSecondsFromWaveformReference !==
      0 ||
    last
      .timeSecondsFromWaveformReference <=
      0
  ) {
    throw new InvalidConfigurationError(
      "manualFlashProfile.waveform must start at t=0 and have positive support duration."
    );
  }
  if (
    first
      .relativeMagnitudeMultiplier !==
      0 ||
    last
      .relativeMagnitudeMultiplier !==
      0
  ) {
    throw new InvalidConfigurationError(
      "manualFlashProfile.waveform must begin and end at zero emission."
    );
  }
  const peak =
    Math.max(
      ...parsed.samples.map(
        (sample) =>
          sample
            .relativeMagnitudeMultiplier
      )
    );
  if (
    Math.abs(peak - 1) >
      1e-12 ||
    parsed.samples.some(
      (sample) =>
        sample
          .relativeMagnitudeMultiplier >
        1
    )
  ) {
    throw new InvalidConfigurationError(
      "manualFlashProfile.waveform must be normalized to a peak relative multiplier of one."
    );
  }
  return parsed;
}

function integrateNormalizedWaveform(
  waveform:
    Extract<
      SceneIlluminationTemporalWaveform,
      {
        kind:
          "aperiodic-relative-multiplier";
      }
    >
): number {
  let integral = 0;
  for (
    let index = 1;
    index < waveform.samples.length;
    index += 1
  ) {
    const left =
      waveform.samples[index - 1]!;
    const right =
      waveform.samples[index]!;
    integral +=
      (
        right
          .timeSecondsFromWaveformReference -
        left
          .timeSecondsFromWaveformReference
      ) *
      (
        left
          .relativeMagnitudeMultiplier +
        right
          .relativeMagnitudeMultiplier
      ) /
      2;
  }
  if (
    !Number.isFinite(integral) ||
    integral <= 0
  ) {
    throw new InvalidConfigurationError(
      "manualFlashProfile.waveform must have positive finite integrated emission."
    );
  }
  return integral;
}

function parseTimingUncertainty(
  value: unknown,
  evidence:
    readonly EvidenceProvenance[]
): SceneIlluminationTemporalRegistrationUncertainty {
  const source =
    validateSource(
      {
        sourceId:
          "timing-validation-source",
        family: "point",
        enabled: true,
        geometry: {
          kind:
            "point-position",
          positionM: {
            x: 0,
            y: 0,
            z: 0
          }
        },
        magnitude: {
          kind:
            "relative-linear-scale",
          scale: 1,
          scientificStatus:
            "approximation",
          limitation:
            "Validation-only source."
        },
        spectrum: {
          kind: "unresolved",
          limitation:
            "Validation-only spectrum."
        },
        temporalBehavior: {
          kind: "time-invariant"
        },
        evidence
      },
      evidence
    );
  const temporal =
    parseSceneIlluminationTemporalProfile({
      schemaVersion: "0.1.0",
      profileId:
        "timing-validation-temporal",
      sceneId:
        "manual-flash-validation-scene",
      illuminationProfileId:
        "manual-flash-validation-illumination",
      evidence,
      waveforms: [{
        waveformId:
          "timing-validation-waveform",
        kind:
          "aperiodic-relative-multiplier",
        timeUnit: "s",
        scientificStatus:
          "approximation",
        uncertainty: {
          kind:
            "not-quantified",
          limitation:
            "Validation-only waveform."
        },
        evidence,
        interpolation:
          "piecewise-linear",
        samples: [
          {
            timeSecondsFromWaveformReference:
              0,
            relativeMagnitudeMultiplier:
              0
          },
          {
            timeSecondsFromWaveformReference:
              1,
            relativeMagnitudeMultiplier:
              0
          }
        ],
        outsideSupportBehavior:
          "zero"
      }],
      sourceBindings: [{
        bindingId:
          "timing-validation-binding",
        sourceId:
          source.sourceId,
        waveformId:
          "timing-validation-waveform",
        captureTimeReference:
          "first-opening-boundary-phase",
        waveformTimeZeroSecondsFromCaptureReference:
          0,
        scientificStatus:
          "approximation",
        timingUncertainty:
          value,
        evidence
      }],
      baseIlluminationProfileRemainsAuthoritative:
        true,
      sensorReadoutTimingUsedAsExposureTiming:
        false,
      automaticExposurePolicyIncluded:
        false
    });
  return temporal
    .sourceBindings[0]!
    .timingUncertainty;
}

export function parseManualFlashProfile(
  value: unknown
): ManualFlashProfile {
  const record =
    requireRecord(
      value,
      "manualFlashProfile"
    );
  if (
    record.schemaVersion !==
    MANUAL_FLASH_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'manualFlashProfile.schemaVersion must be "' +
        MANUAL_FLASH_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.scientificStatus !==
      "approximation"
  ) {
    throw new InvalidConfigurationError(
      'manualFlashProfile.scientificStatus must be "approximation" in schema 0.1.0.'
    );
  }
  if (
    record.manualOutputModel !==
    "linear-source-magnitude-fraction-approximation" ||
    record.ttlModeled !== false ||
    record.hssEmissionModeled !==
      false ||
    record.recycleModeled !== false
  ) {
    throw new InvalidConfigurationError(
      "manualFlashProfile model-ownership flags are invalid."
    );
  }
  const evidence =
    parseEvidenceList(
      record.evidence,
      "manualFlashProfile.evidence"
    );
  const source =
    validateSource(
      record.source,
      evidence
    );
  const triggerTimingUncertainty =
    parseTimingUncertainty(
      record
        .triggerTimingUncertainty,
      evidence
    );
  const waveform =
    validateWaveform(
      record.waveform,
      source,
      evidence,
      triggerTimingUncertainty
    );
  const pulseSupportDurationSeconds =
    waveform.samples[
      waveform.samples.length - 1
    ]!
      .timeSecondsFromWaveformReference;

  return {
    schemaVersion:
      MANUAL_FLASH_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "manualFlashProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "manualFlashProfile.profileVersion"
      ),
    scientificStatus:
      "approximation",
    source,
    waveform,
    pulseSupportDurationSeconds,
    normalizedWaveformIntegralSeconds:
      integrateNormalizedWaveform(
        waveform
      ),
    manualOutputModel:
      "linear-source-magnitude-fraction-approximation",
    triggerTimingUncertainty,
    ttlModeled: false,
    hssEmissionModeled: false,
    recycleModeled: false,
    evidence,
    limitations:
      parseLimitations(
        record.limitations,
        "manualFlashProfile.limitations"
      )
  };
}

export function parseFlashSyncCapabilityProfile(
  value: unknown
): FlashSyncCapabilityProfile {
  const record =
    requireRecord(
      value,
      "flashSyncCapabilityProfile"
    );
  if (
    record.schemaVersion !==
    FLASH_SYNC_CAPABILITY_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'flashSyncCapabilityProfile.schemaVersion must be "' +
        FLASH_SYNC_CAPABILITY_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.capabilityMeaning !==
    "capture-mode-specific-flash-sync-capability"
  ) {
    throw new InvalidConfigurationError(
      "flashSyncCapabilityProfile.capabilityMeaning is invalid."
    );
  }
  if (
    !Array.isArray(
      record.ordinarySyncModes
    ) ||
    record.ordinarySyncModes
      .length === 0
  ) {
    throw new InvalidConfigurationError(
      "flashSyncCapabilityProfile.ordinarySyncModes must be a non-empty array."
    );
  }
  const ordinarySyncModes =
    record.ordinarySyncModes.map(
      (entry, index) => {
        if (
          typeof entry !== "string" ||
          !NORMAL_SYNC_MODES.has(
            entry as NormalFlashSyncMode
          )
        ) {
          throw new InvalidConfigurationError(
            "flashSyncCapabilityProfile.ordinarySyncModes[" +
              index +
              "] is invalid."
          );
        }
        return entry as
          NormalFlashSyncMode;
      }
    );
  if (
    new Set(
      ordinarySyncModes
    ).size !==
    ordinarySyncModes.length
  ) {
    throw new InvalidConfigurationError(
      "flashSyncCapabilityProfile.ordinarySyncModes must not contain duplicates."
    );
  }
  if (
    typeof record.hssAvailability !==
      "string" ||
    !HSS_AVAILABILITIES.has(
      record.hssAvailability as
        FlashHssAvailability
    )
  ) {
    throw new InvalidConfigurationError(
      "flashSyncCapabilityProfile.hssAvailability is invalid."
    );
  }

  return {
    schemaVersion:
      FLASH_SYNC_CAPABILITY_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "flashSyncCapabilityProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "flashSyncCapabilityProfile.profileVersion"
      ),
    captureModeId:
      requireNonEmptyString(
        record.captureModeId,
        "flashSyncCapabilityProfile.captureModeId"
      ),
    ordinarySyncModes,
    hssAvailability:
      record.hssAvailability as
        FlashHssAvailability,
    capabilityMeaning:
      "capture-mode-specific-flash-sync-capability",
    evidence:
      parseEvidenceList(
        record.evidence,
        "flashSyncCapabilityProfile.evidence"
      ),
    limitations:
      parseLimitations(
        record.limitations,
        "flashSyncCapabilityProfile.limitations"
      )
  };
}

function allFrameOpenWindow(
  timing:
    ResolvedCaptureModeTiming
): {
  startSecondsFromCaptureReference:
    number;
  endSecondsFromCaptureReference:
    number;
  durationSeconds: number;
} {
  const opening =
    timing.exposureWindows
      .opening.schedule;
  const latestOpening =
    opening.kind ===
      "simultaneous"
      ? 0
      : opening
          .traversalDurationSeconds
          .value;
  const earliestClosing =
    timing.exposureWindows
      .nominalExposureDurationSeconds
      .value;
  const duration =
    earliestClosing -
    latestOpening;

  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    throw new InvalidScientificInputError(
      "Ordinary one-pulse full-frame flash sync is unavailable because the #12 exposure schedule has no all-frame-open interval."
    );
  }

  return {
    startSecondsFromCaptureReference:
      latestOpening,
    endSecondsFromCaptureReference:
      earliestClosing,
    durationSeconds:
      duration
  };
}

export function resolveManualFlashSync(
  input:
    ResolveManualFlashSyncInput
): ResolvedManualFlashSync {
  const flash =
    parseManualFlashProfile(
      input.flashProfile
    );
  const capability =
    parseFlashSyncCapabilityProfile(
      input.syncCapability
    );
  const manualOutputFraction =
    requireFraction(
      input.manualOutputFraction,
      "manualOutputFraction"
    );

  if (
    capability.captureModeId !==
      input.timing.captureModeId
  ) {
    throw new InvalidScientificInputError(
      "Flash sync capability captureModeId must exactly match the resolved #12 timing capture mode."
    );
  }

  if (
    input.syncMode ===
    "high-speed-sync"
  ) {
    throw new InvalidScientificInputError(
      capability.hssAvailability ===
        "supported"
        ? "High-speed sync is declared available by the equipment profile but the required extended/pulsed HSS emission model is not implemented in schema 0.1.0."
        : "High-speed sync is not available for this capture profile and is not silently approximated by ordinary one-pulse flash."
    );
  }

  if (
    !NORMAL_SYNC_MODES.has(
      input.syncMode
    ) ||
    !capability
      .ordinarySyncModes
      .includes(input.syncMode)
  ) {
    throw new InvalidScientificInputError(
      "Requested ordinary flash sync mode is not supported by the capture-mode flash capability."
    );
  }

  const fullOpen =
    allFrameOpenWindow(
      input.timing
    );
  if (
    flash
      .pulseSupportDurationSeconds >
      fullOpen.durationSeconds
  ) {
    throw new InvalidScientificInputError(
      "Flash pulse support does not fit entirely inside the #12 all-frame-open interval required for ordinary one-pulse full-frame sync."
    );
  }

  const pulseStart =
    input.syncMode ===
      "front-curtain"
      ? fullOpen
          .startSecondsFromCaptureReference
      : fullOpen
          .endSecondsFromCaptureReference -
        flash
          .pulseSupportDurationSeconds;
  const pulseEnd =
    pulseStart +
    flash
      .pulseSupportDurationSeconds;

  return {
    flashProfileId:
      flash.profileId,
    flashProfileVersion:
      flash.profileVersion,
    syncCapabilityProfileId:
      capability.profileId,
    syncCapabilityProfileVersion:
      capability.profileVersion,
    captureModeId:
      input.timing.captureModeId,
    sourceId:
      flash.source.sourceId,
    syncMode:
      input.syncMode,
    manualOutputFraction,
    timeReference:
      "first-opening-boundary-phase",
    allFrameOpenWindow:
      fullOpen,
    pulseSupportDurationSeconds:
      flash
        .pulseSupportDurationSeconds,
    pulseStartSecondsFromCaptureReference:
      pulseStart,
    pulseEndSecondsFromCaptureReference:
      pulseEnd,
    waveformTimeZeroSecondsFromCaptureReference:
      pulseStart,
    normalizedWaveformIntegralSeconds:
      flash
        .normalizedWaveformIntegralSeconds,
    ordinaryOnePulseFullFrameUniformExposureAuthorized:
      true,
    hssUsed: false,
    hssEmissionModeled: false,
    sensorReadoutTimingUsedAsExposureTiming:
      false,
    shutterDurationUsedAsFlashPulseDuration:
      false,
    automaticFlashExposureResolved:
      false
  };
}

function scaleMagnitude(
  magnitude:
    SceneIlluminationMagnitude,
  fraction: number
): SceneIlluminationMagnitude {
  if (
    magnitude.kind ===
    "relative-linear-scale"
  ) {
    return {
      ...magnitude,
      scale:
        magnitude.scale *
        fraction
    };
  }
  if (fraction === 1) {
    return {
      ...magnitude
    };
  }
  const uncertainty = {
    kind:
      "not-quantified" as const,
    limitation:
      "Manual output fraction uses a linear source-magnitude scaling approximation; output-dependent flash efficiency/calibration is not modeled."
  };
  if (
    magnitude.kind ===
    "radiant-intensity"
  ) {
    return {
      ...magnitude,
      wattsPerSteradian:
        magnitude
          .wattsPerSteradian *
        fraction,
      scientificStatus:
        "approximation",
      uncertainty
    };
  }
  if (
    magnitude.kind ===
    "surface-radiance"
  ) {
    return {
      ...magnitude,
      wattsPerSquareMeterSteradian:
        magnitude
          .wattsPerSquareMeterSteradian *
        fraction,
      scientificStatus:
        "approximation",
      uncertainty
    };
  }
  return {
    ...magnitude,
    wattsPerSquareMeter:
      magnitude
        .wattsPerSquareMeter *
      fraction,
    scientificStatus:
      "approximation",
    uncertainty
  };
}

function scaledFlashSource(
  flash:
    ManualFlashProfile,
  fraction: number
): SceneIlluminationSource {
  return {
    ...flash.source,
    magnitude:
      scaleMagnitude(
        flash.source.magnitude,
        fraction
      )
  };
}

export function createManualFlashIlluminationComposition(
  input:
    CreateManualFlashIlluminationCompositionInput
): ManualFlashIlluminationComposition {
  const ambient =
    parseSceneIlluminationProfile(
      input
        .ambientIlluminationProfile
    );
  const flash =
    parseManualFlashProfile(
      input.flashProfile
    );

  if (!input.enabled) {
    return {
      enabled: false,
      ambientIlluminationProfileId:
        ambient.profileId,
      illuminationProfile:
        ambient,
      temporalProfile: null,
      flashSourceId: null,
      flashSourceAdded: false,
      ambientSourcesPreserved:
        true,
      flashMagnitudeAppliedBeforeSceneTransport:
        false,
      flashTemporalWaveformAppliedThroughAuthoritativeIlluminationPath:
        false,
      postRenderBrightnessEffectApplied:
        false,
      cameraWhiteBalanceModified:
        false,
      focusModified: false,
      driveModeModified: false,
      ambientExposureMeterModified:
        false,
      ttlModeled: false
    };
  }

  const sync =
    input.resolvedSync;
  if (sync === undefined) {
    throw new InvalidScientificInputError(
      "Enabled manual flash composition requires a resolved normal-sync result."
    );
  }
  if (
    sync.flashProfileId !==
      flash.profileId ||
    sync.flashProfileVersion !==
      flash.profileVersion ||
    sync.sourceId !==
      flash.source.sourceId
  ) {
    throw new InvalidScientificInputError(
      "Resolved flash sync identity must match the manual flash profile."
    );
  }

  const outputProfileId =
    requireNonEmptyString(
      input
        .outputIlluminationProfileId,
      "outputIlluminationProfileId"
    );
  const temporalProfileId =
    requireNonEmptyString(
      input.temporalProfileId,
      "temporalProfileId"
    );
  const sourceBindingId =
    requireNonEmptyString(
      input.sourceBindingId,
      "sourceBindingId"
    );
  const source =
    scaledFlashSource(
      flash,
      sync.manualOutputFraction
    );
  const illumination =
    parseSceneIlluminationProfile({
      ...ambient,
      profileId:
        outputProfileId,
      sources: [
        ...ambient.sources,
        source
      ]
    });
  const temporal =
    parseSceneIlluminationTemporalProfile({
      schemaVersion: "0.1.0",
      profileId:
        temporalProfileId,
      sceneId:
        illumination.sceneId,
      illuminationProfileId:
        illumination.profileId,
      evidence: [
        ...flash.evidence
      ],
      waveforms: [
        flash.waveform
      ],
      sourceBindings: [{
        bindingId:
          sourceBindingId,
        sourceId:
          source.sourceId,
        waveformId:
          flash
            .waveform
            .waveformId,
        captureTimeReference:
          "first-opening-boundary-phase",
        waveformTimeZeroSecondsFromCaptureReference:
          sync
            .waveformTimeZeroSecondsFromCaptureReference,
        scientificStatus:
          "approximation",
        timingUncertainty:
          flash
            .triggerTimingUncertainty,
        evidence: [
          ...flash.evidence
        ]
      }],
      baseIlluminationProfileRemainsAuthoritative:
        true,
      sensorReadoutTimingUsedAsExposureTiming:
        false,
      automaticExposurePolicyIncluded:
        false
    });

  return {
    enabled: true,
    ambientIlluminationProfileId:
      ambient.profileId,
    illuminationProfile:
      illumination,
    temporalProfile:
      temporal,
    flashSourceId:
      source.sourceId,
    flashSourceAdded: true,
    ambientSourcesPreserved:
      true,
    flashMagnitudeAppliedBeforeSceneTransport:
      true,
    flashTemporalWaveformAppliedThroughAuthoritativeIlluminationPath:
      true,
    postRenderBrightnessEffectApplied:
      false,
    cameraWhiteBalanceModified:
      false,
    focusModified: false,
    driveModeModified: false,
    ambientExposureMeterModified:
      false,
    ttlModeled: false
  };
}
