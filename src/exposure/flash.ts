// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  ResolvedReleaseFrame
} from "../capture/release-sequence.js";
import {
  parseSceneIlluminationProfile,
  type SceneIlluminationProfile,
  type SceneIlluminationSource
} from "../schema/illumination.js";
import {
  parseSceneIlluminationTemporalProfile,
  type SceneIlluminationTemporalProfile,
  type SceneIlluminationTemporalWaveformSample
} from "../schema/illumination-temporal.js";
import type {
  ResolvedCaptureModeTiming
} from "../sensor/capture-mode-timing.js";

type UnknownRecord = Record<string, unknown>;

export const MANUAL_FLASH_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;
export const FLASH_SYNC_CAPABILITY_SCHEMA_VERSION =
  "0.1.0" as const;

export type ManualFlashSyncMode =
  | "front-curtain"
  | "rear-curtain";

export type RequestedFlashSyncMode =
  | ManualFlashSyncMode
  | "high-speed-sync";

export interface ManualFlashPulseProfile {
  waveformId: string;
  scientificStatus: "approximation";
  supportDurationSeconds: number;
  interpolation: "piecewise-linear";
  samples:
    readonly SceneIlluminationTemporalWaveformSample[];
  normalization:
    "relative-peak-one";
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface ManualFlashProfile {
  schemaVersion:
    typeof MANUAL_FLASH_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  sourceTemplate:
    Omit<
      SceneIlluminationSource,
      "enabled" |
      "temporalBehavior"
    >;
  pulse:
    ManualFlashPulseProfile;
  outputControl: {
    kind:
      "relative-linear-source-scale";
    scale: number;
    flashExposureCompensationStops:
      0;
  };
  ttlModeled: false;
  highSpeedSyncModeled: false;
  recycleBehaviorModeled: false;
  redEyePreflashModeled: false;
  modelingLightModeled: false;
  afAssistModeled: false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface FlashSyncCapabilityProfile {
  schemaVersion:
    typeof FLASH_SYNC_CAPABILITY_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  captureModeId: string;
  timingProfileId: string;
  supportedOrdinarySyncModes:
    readonly ManualFlashSyncMode[];
  highSpeedSyncSupported: false;
  ordinarySyncRequiresWholeActiveFrameSimultaneouslyExposed:
    true;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface ResolveManualFlashSyncInput {
  flashEnabled: boolean;
  flashProfile:
    ManualFlashProfile;
  syncCapabilities:
    FlashSyncCapabilityProfile;
  timing:
    ResolvedCaptureModeTiming;
  syncMode:
    RequestedFlashSyncMode;
  releaseFrame?:
    ResolvedReleaseFrame;
}

export interface ResolvedManualFlashSync {
  flashEnabled: boolean;
  flashProfileId: string;
  flashProfileVersion: string;
  sourceId: string;
  captureModeId: string;
  timingProfileId: string;
  syncCapabilityProfileId:
    string;
  syncMode:
    RequestedFlashSyncMode;
  syncStatus:
    | "disabled"
    | "ordinary-sync-resolved";
  timeReference:
    "first-opening-boundary-phase";
  wholeActiveFrameOpenInterval:
    {
      startSecondsFromCaptureReference:
        number;
      endSecondsFromCaptureReference:
        number;
      durationSeconds: number;
    };
  pulseSupportDurationSeconds:
    number;
  pulseStartSecondsFromCaptureReference:
    number | null;
  pulseEndSecondsFromCaptureReference:
    number | null;
  waveformTimeZeroSecondsFromCaptureReference:
    number | null;
  releaseFrameBinding:
    | {
        sequenceId: string;
        releaseFrameId: string;
        frameIndex: number;
        sceneTimeSecondsFromSequenceStartAtPulseStart:
          number;
        sceneTimeSecondsFromSequenceStartAtPulseEnd:
          number;
      }
    | null;
  hssModeled: false;
  ttlModeled: false;
  sensorReadoutTimingUsedAsExposureTiming:
    false;
  whiteBalanceModified: false;
  focusModified: false;
  exposureSettingsModified: false;
  driveModeModified: false;
  supportStateModified: false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface CreateManualFlashIlluminationOverlayInput {
  baseIlluminationProfile:
    SceneIlluminationProfile;
  flashProfile:
    ManualFlashProfile;
  resolvedSync:
    ResolvedManualFlashSync;
  illuminationProfileId: string;
  temporalProfileId: string;
}

export interface ManualFlashIlluminationOverlay {
  flashApplied: boolean;
  illuminationProfile:
    SceneIlluminationProfile;
  temporalProfile:
    SceneIlluminationTemporalProfile | null;
  sourceId: string;
  waveformId: string;
  timeReference:
    "first-opening-boundary-phase";
  sourceMagnitudeAppliedBySceneTransport:
    true;
  materialTransportOwnedBySceneRadiance:
    true;
  visibilityOwnedBySceneRadiance:
    true;
  indirectTransportOwnedBySceneRadiance:
    true;
  postRenderBrightnessMultiplierUsed:
    false;
  whiteBalanceModified: false;
  ambientMeteringModified: false;
  ttlMeteringIncluded: false;
}

const ORDINARY_SYNC_MODES =
  new Set<ManualFlashSyncMode>([
    "front-curtain",
    "rear-curtain"
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

function parsePulseSamples(
  value: unknown,
  supportDurationSeconds:
    number,
  path: string
): readonly SceneIlluminationTemporalWaveformSample[] {
  if (
    !Array.isArray(value) ||
    value.length < 2
  ) {
    throw new InvalidConfigurationError(
      path +
        " must contain at least two waveform samples."
    );
  }
  const samples =
    value.map((entry, index) => {
      const samplePath =
        path +
        "[" +
        index +
        "]";
      const record =
        requireRecord(
          entry,
          samplePath
        );
      const time =
        requireFinite(
          record
            .timeSecondsFromWaveformReference,
          samplePath +
            ".timeSecondsFromWaveformReference"
        );
      const magnitude =
        requireFinite(
          record
            .relativeMagnitudeMultiplier,
          samplePath +
            ".relativeMagnitudeMultiplier"
        );
      if (
        time < 0 ||
        time >
          supportDurationSeconds
      ) {
        throw new InvalidConfigurationError(
          samplePath +
            ".timeSecondsFromWaveformReference must lie within the declared pulse support."
        );
      }
      if (magnitude < 0) {
        throw new InvalidConfigurationError(
          samplePath +
            ".relativeMagnitudeMultiplier must be nonnegative."
        );
      }
      return {
        timeSecondsFromWaveformReference:
          time,
        relativeMagnitudeMultiplier:
          magnitude
      };
    });

  for (
    let index = 1;
    index < samples.length;
    index += 1
  ) {
    if (
      !(
        samples[index]!
          .timeSecondsFromWaveformReference >
        samples[index - 1]!
          .timeSecondsFromWaveformReference
      )
    ) {
      throw new InvalidConfigurationError(
        path +
          " times must be strictly increasing."
      );
    }
  }
  if (
    samples[0]!
      .timeSecondsFromWaveformReference !==
      0 ||
    samples[
      samples.length - 1
    ]!
      .timeSecondsFromWaveformReference !==
      supportDurationSeconds
  ) {
    throw new InvalidConfigurationError(
      path +
        " must start at waveform time 0 and end exactly at supportDurationSeconds."
    );
  }
  const peak =
    Math.max(
      ...samples.map(
        (sample) =>
          sample
            .relativeMagnitudeMultiplier
      )
    );
  if (
    Math.abs(peak - 1) >
    1e-12
  ) {
    throw new InvalidConfigurationError(
      path +
        " peak relative magnitude must equal one for relative-peak-one normalization."
    );
  }

  return samples;
}

function validateSourceTemplate(
  sourceTemplate:
    ManualFlashProfile["sourceTemplate"]
): ManualFlashProfile["sourceTemplate"] {
  const probe =
    parseSceneIlluminationProfile({
      schemaVersion: "0.1.0",
      profileId:
        "manual-flash-source-validation",
      sceneId:
        "manual-flash-source-validation",
      evidence:
        sourceTemplate.evidence,
      sources: [{
        ...sourceTemplate,
        enabled: true,
        temporalBehavior: {
          kind:
            "time-invariant"
        }
      }],
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
  const source =
    probe.sources[0];
  if (source === undefined) {
    throw new InvalidConfigurationError(
      "manualFlashProfile.sourceTemplate must produce one valid illumination source."
    );
  }
  const {
    enabled: _enabled,
    temporalBehavior:
      _temporalBehavior,
    ...validated
  } = source;
  return validated;
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
  for (
    const [key, expected] of [
      ["ttlModeled", false],
      ["highSpeedSyncModeled", false],
      ["recycleBehaviorModeled", false],
      ["redEyePreflashModeled", false],
      ["modelingLightModeled", false],
      ["afAssistModeled", false]
    ] as const
  ) {
    if (record[key] !== expected) {
      throw new InvalidConfigurationError(
        "manualFlashProfile." +
          key +
          " must be false in schema 0.1.0."
      );
    }
  }

  const pulse =
    requireRecord(
      record.pulse,
      "manualFlashProfile.pulse"
    );
  const supportDurationSeconds =
    requirePositiveFinite(
      pulse.supportDurationSeconds,
      "manualFlashProfile.pulse.supportDurationSeconds"
    );
  if (
    pulse.scientificStatus !==
      "approximation" ||
    pulse.interpolation !==
      "piecewise-linear" ||
    pulse.normalization !==
      "relative-peak-one"
  ) {
    throw new InvalidConfigurationError(
      "manualFlashProfile.pulse scientificStatus/interpolation/normalization is invalid."
    );
  }

  const output =
    requireRecord(
      record.outputControl,
      "manualFlashProfile.outputControl"
    );
  if (
    output.kind !==
      "relative-linear-source-scale" ||
    output
      .flashExposureCompensationStops !==
      0
  ) {
    throw new InvalidConfigurationError(
      "manualFlashProfile.outputControl must use relative-linear-source-scale with zero flash exposure compensation in the manual-only schema."
    );
  }

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
    sourceTemplate:
      validateSourceTemplate(
        record.sourceTemplate as
          ManualFlashProfile["sourceTemplate"]
      ),
    pulse: {
      waveformId:
        requireNonEmptyString(
          pulse.waveformId,
          "manualFlashProfile.pulse.waveformId"
        ),
      scientificStatus:
        "approximation",
      supportDurationSeconds,
      interpolation:
        "piecewise-linear",
      samples:
        parsePulseSamples(
          pulse.samples,
          supportDurationSeconds,
          "manualFlashProfile.pulse.samples"
        ),
      normalization:
        "relative-peak-one",
      evidence:
        parseEvidenceList(
          pulse.evidence,
          "manualFlashProfile.pulse.evidence"
        ),
      limitations:
        parseLimitations(
          pulse.limitations,
          "manualFlashProfile.pulse.limitations"
        )
    },
    outputControl: {
      kind:
        "relative-linear-source-scale",
      scale:
        requirePositiveFinite(
          output.scale,
          "manualFlashProfile.outputControl.scale"
        ),
      flashExposureCompensationStops:
        0
    },
    ttlModeled: false,
    highSpeedSyncModeled: false,
    recycleBehaviorModeled:
      false,
    redEyePreflashModeled:
      false,
    modelingLightModeled:
      false,
    afAssistModeled: false,
    evidence:
      parseEvidenceList(
        record.evidence,
        "manualFlashProfile.evidence"
      ),
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
    FLASH_SYNC_CAPABILITY_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'flashSyncCapabilityProfile.schemaVersion must be "' +
        FLASH_SYNC_CAPABILITY_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.highSpeedSyncSupported !==
      false ||
    record
      .ordinarySyncRequiresWholeActiveFrameSimultaneouslyExposed !==
      true
  ) {
    throw new InvalidConfigurationError(
      "flashSyncCapabilityProfile schema 0.1.0 supports ordinary whole-frame sync only and must not claim HSS."
    );
  }
  if (
    !Array.isArray(
      record.supportedOrdinarySyncModes
    ) ||
    record
      .supportedOrdinarySyncModes
      .length === 0
  ) {
    throw new InvalidConfigurationError(
      "flashSyncCapabilityProfile.supportedOrdinarySyncModes must be a non-empty array."
    );
  }
  const modes =
    record
      .supportedOrdinarySyncModes
      .map((entry, index) => {
        if (
          typeof entry !==
            "string" ||
          !ORDINARY_SYNC_MODES.has(
            entry as ManualFlashSyncMode
          )
        ) {
          throw new InvalidConfigurationError(
            "flashSyncCapabilityProfile.supportedOrdinarySyncModes[" +
              index +
              "] is invalid."
          );
        }
        return entry as
          ManualFlashSyncMode;
      });
  if (
    new Set(modes).size !==
    modes.length
  ) {
    throw new InvalidConfigurationError(
      "flashSyncCapabilityProfile.supportedOrdinarySyncModes must not contain duplicates."
    );
  }

  return {
    schemaVersion:
      FLASH_SYNC_CAPABILITY_SCHEMA_VERSION,
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
    timingProfileId:
      requireNonEmptyString(
        record.timingProfileId,
        "flashSyncCapabilityProfile.timingProfileId"
      ),
    supportedOrdinarySyncModes:
      modes,
    highSpeedSyncSupported:
      false,
    ordinarySyncRequiresWholeActiveFrameSimultaneouslyExposed:
      true,
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

function wholeFrameOpenInterval(
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
    timing.exposureWindows.opening
      .schedule;
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
  return {
    startSecondsFromCaptureReference:
      latestOpening,
    endSecondsFromCaptureReference:
      earliestClosing,
    durationSeconds:
      Math.max(0, duration)
  };
}

function validateReleaseBinding(
  release:
    ResolvedReleaseFrame,
  timing:
    ResolvedCaptureModeTiming
): void {
  const nominal =
    timing.exposureWindows
      .nominalExposureDurationSeconds
      .value;
  const scale =
    Math.max(
      1,
      Math.abs(nominal),
      Math.abs(
        release.exposure
          .shutterSeconds
      )
    );
  if (
    Math.abs(
      release.exposure
        .shutterSeconds -
      nominal
    ) >
    Number.EPSILON *
      16 *
      scale
  ) {
    throw new InvalidScientificInputError(
      "releaseFrame shutter duration must match the #12 capture-mode timing exposure duration."
    );
  }
}

export function resolveManualFlashSync(
  input:
    ResolveManualFlashSyncInput
): ResolvedManualFlashSync {
  const flash =
    parseManualFlashProfile(
      input.flashProfile
    );
  const capabilities =
    parseFlashSyncCapabilityProfile(
      input.syncCapabilities
    );

  if (
    capabilities.captureModeId !==
      input.timing.captureModeId ||
    capabilities.timingProfileId !==
      input.timing.timingProfileId
  ) {
    throw new InvalidScientificInputError(
      "Flash sync capability profile must exactly match the resolved capture-mode and timing-profile identities."
    );
  }
  if (
    input.releaseFrame !==
    undefined
  ) {
    validateReleaseBinding(
      input.releaseFrame,
      input.timing
    );
  }

  const openInterval =
    wholeFrameOpenInterval(
      input.timing
    );
  const base = {
    flashProfileId:
      flash.profileId,
    flashProfileVersion:
      flash.profileVersion,
    sourceId:
      flash.sourceTemplate.sourceId,
    captureModeId:
      input.timing.captureModeId,
    timingProfileId:
      input.timing.timingProfileId,
    syncCapabilityProfileId:
      capabilities.profileId,
    syncMode:
      input.syncMode,
    timeReference:
      "first-opening-boundary-phase" as const,
    wholeActiveFrameOpenInterval:
      openInterval,
    pulseSupportDurationSeconds:
      flash.pulse
        .supportDurationSeconds,
    hssModeled: false as const,
    ttlModeled: false as const,
    sensorReadoutTimingUsedAsExposureTiming:
      false as const,
    whiteBalanceModified:
      false as const,
    focusModified: false as const,
    exposureSettingsModified:
      false as const,
    driveModeModified:
      false as const,
    supportStateModified:
      false as const,
    evidence: [
      ...flash.evidence,
      ...capabilities.evidence,
      ...input.timing.evidence
    ],
    limitations: [
      ...flash.limitations,
      ...capabilities.limitations,
      "Ordinary flash synchronization is registered to exposure-boundary timing, never sensor data-readout timing.",
      "Schema 0.1.0 does not model HSS, TTL/preflash metering, recycle/thermal limits, red-eye preflash, modeling lights, AF-assist or branded flash protocols."
    ]
  };

  if (!input.flashEnabled) {
    return {
      flashEnabled: false,
      ...base,
      syncStatus:
        "disabled",
      pulseStartSecondsFromCaptureReference:
        null,
      pulseEndSecondsFromCaptureReference:
        null,
      waveformTimeZeroSecondsFromCaptureReference:
        null,
      releaseFrameBinding:
        null
    };
  }

  if (
    input.syncMode ===
    "high-speed-sync"
  ) {
    throw new InvalidScientificInputError(
      "High-speed sync is not modeled in manual flash schema 0.1.0; ordinary single-pulse flash cannot be used as an HSS substitute."
    );
  }
  if (
    !capabilities
      .supportedOrdinarySyncModes
      .includes(
        input.syncMode
      )
  ) {
    throw new InvalidScientificInputError(
      "Requested ordinary flash sync mode is not supported by the capability profile."
    );
  }
  if (
    openInterval.durationSeconds <=
      0
  ) {
    throw new InvalidScientificInputError(
      "Ordinary one-pulse flash cannot uniformly expose the active frame because the #12 timing has no whole-frame-open interval."
    );
  }
  if (
    flash.pulse
      .supportDurationSeconds >
    openInterval.durationSeconds
  ) {
    throw new InvalidScientificInputError(
      "Ordinary flash pulse support does not fit inside the whole-active-frame-open interval."
    );
  }

  const pulseStart =
    input.syncMode ===
    "front-curtain"
      ? openInterval
          .startSecondsFromCaptureReference
      : openInterval
          .endSecondsFromCaptureReference -
        flash.pulse
          .supportDurationSeconds;
  const pulseEnd =
    pulseStart +
    flash.pulse
      .supportDurationSeconds;

  const releaseBinding =
    input.releaseFrame ===
    undefined
      ? null
      : {
          sequenceId:
            input.releaseFrame
              .sequenceId,
          releaseFrameId:
            input.releaseFrame
              .releaseFrameId,
          frameIndex:
            input.releaseFrame
              .frameIndex,
          sceneTimeSecondsFromSequenceStartAtPulseStart:
            input.releaseFrame
              .sceneTimeSecondsFromSequenceStart +
            pulseStart,
          sceneTimeSecondsFromSequenceStartAtPulseEnd:
            input.releaseFrame
              .sceneTimeSecondsFromSequenceStart +
            pulseEnd
        };

  return {
    flashEnabled: true,
    ...base,
    syncStatus:
      "ordinary-sync-resolved",
    pulseStartSecondsFromCaptureReference:
      pulseStart,
    pulseEndSecondsFromCaptureReference:
      pulseEnd,
    waveformTimeZeroSecondsFromCaptureReference:
      pulseStart,
    releaseFrameBinding:
      releaseBinding
  };
}

function scaledFlashSource(
  flash:
    ManualFlashProfile
): SceneIlluminationSource {
  const template =
    flash.sourceTemplate;
  const magnitude =
    template.magnitude;
  if (
    magnitude.kind !==
    "relative-linear-scale"
  ) {
    throw new InvalidScientificInputError(
      "Manual flash schema 0.1.0 relative output control requires a relative-linear-scale illumination source magnitude; calibrated physical flash energy belongs to a later profile."
    );
  }

  return {
    ...template,
    magnitude: {
      ...magnitude,
      scale:
        magnitude.scale *
        flash.outputControl.scale
    },
    enabled: true,
    temporalBehavior: {
      kind:
        "time-invariant"
    }
  };
}

export function createManualFlashIlluminationOverlay(
  input:
    CreateManualFlashIlluminationOverlayInput
): ManualFlashIlluminationOverlay {
  const base =
    parseSceneIlluminationProfile(
      input
        .baseIlluminationProfile
    );
  const flash =
    parseManualFlashProfile(
      input.flashProfile
    );
  const sync =
    input.resolvedSync;

  if (
    sync.flashProfileId !==
      flash.profileId ||
    sync.flashProfileVersion !==
      flash.profileVersion ||
    sync.sourceId !==
      flash.sourceTemplate.sourceId
  ) {
    throw new InvalidScientificInputError(
      "Resolved flash sync identity must match the manual flash profile."
    );
  }
  if (
    base.sources.some(
      (source) =>
        source.sourceId ===
        flash.sourceTemplate
          .sourceId
    )
  ) {
    throw new InvalidScientificInputError(
      "Flash sourceId must be unique within the base illumination profile."
    );
  }

  if (!sync.flashEnabled) {
    return {
      flashApplied: false,
      illuminationProfile:
        base,
      temporalProfile: null,
      sourceId:
        flash.sourceTemplate
          .sourceId,
      waveformId:
        flash.pulse.waveformId,
      timeReference:
        "first-opening-boundary-phase",
      sourceMagnitudeAppliedBySceneTransport:
        true,
      materialTransportOwnedBySceneRadiance:
        true,
      visibilityOwnedBySceneRadiance:
        true,
      indirectTransportOwnedBySceneRadiance:
        true,
      postRenderBrightnessMultiplierUsed:
        false,
      whiteBalanceModified:
        false,
      ambientMeteringModified:
        false,
      ttlMeteringIncluded:
        false
    };
  }
  if (
    sync
      .waveformTimeZeroSecondsFromCaptureReference ===
      null
  ) {
    throw new InvalidScientificInputError(
      "Enabled flash sync must provide an authoritative waveform time-zero registration."
    );
  }

  const flashSource =
    scaledFlashSource(
      flash
    );
  const illumination =
    parseSceneIlluminationProfile({
      ...base,
      profileId:
        requireNonEmptyString(
          input.illuminationProfileId,
          "illuminationProfileId"
        ),
      sources: [
        ...base.sources,
        flashSource
      ]
    });

  const temporal =
    parseSceneIlluminationTemporalProfile({
      schemaVersion: "0.1.0",
      profileId:
        requireNonEmptyString(
          input.temporalProfileId,
          "temporalProfileId"
        ),
      sceneId:
        illumination.sceneId,
      illuminationProfileId:
        illumination.profileId,
      evidence: [
        ...flash.evidence,
        ...sync.evidence
      ],
      waveforms: [{
        waveformId:
          flash.pulse.waveformId,
        kind:
          "aperiodic-relative-multiplier",
        timeUnit: "s",
        scientificStatus:
          "approximation",
        uncertainty: {
          kind:
            "not-quantified",
          limitation:
            "Manual flash pulse timing/shape is an explicit approximation."
        },
        evidence:
          flash.pulse.evidence,
        interpolation:
          "piecewise-linear",
        samples:
          flash.pulse.samples,
        outsideSupportBehavior:
          "zero"
      }],
      sourceBindings: [{
        bindingId:
          flash.profileId +
          ":sync",
        sourceId:
          flashSource.sourceId,
        waveformId:
          flash.pulse.waveformId,
        captureTimeReference:
          "first-opening-boundary-phase",
        waveformTimeZeroSecondsFromCaptureReference:
          sync
            .waveformTimeZeroSecondsFromCaptureReference,
        scientificStatus:
          "approximation",
        timingUncertainty: {
          kind:
            "not-quantified",
          limitation:
            "Schema 0.1.0 uses ideal deterministic flash trigger registration within the declared #12 exposure-window schedule."
        },
        evidence:
          sync.evidence
      }],
      baseIlluminationProfileRemainsAuthoritative:
        true,
      sensorReadoutTimingUsedAsExposureTiming:
        false,
      automaticExposurePolicyIncluded:
        false
    });

  return {
    flashApplied: true,
    illuminationProfile:
      illumination,
    temporalProfile:
      temporal,
    sourceId:
      flashSource.sourceId,
    waveformId:
      flash.pulse.waveformId,
    timeReference:
      "first-opening-boundary-phase",
    sourceMagnitudeAppliedBySceneTransport:
      true,
    materialTransportOwnedBySceneRadiance:
      true,
    visibilityOwnedBySceneRadiance:
      true,
    indirectTransportOwnedBySceneRadiance:
      true,
    postRenderBrightnessMultiplierUsed:
      false,
    whiteBalanceModified:
      false,
    ambientMeteringModified:
      false,
    ttlMeteringIncluded:
      false
  };
}
