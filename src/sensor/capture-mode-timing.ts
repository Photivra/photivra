// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceBackedFact,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  RasterPoint,
  RasterRect
} from "../output/capture-geometry.js";
import {
  calculateCaptureExposureWindows,
  type CaptureExposureWindows,
  type ExposureBoundarySchedule,
  type SourcedCaptureBoundaryDirection,
  type SourcedCaptureTimingSeconds
} from "./exposure-window.js";
import type {
  ResolvedCaptureMode
} from "./capture-mode.js";
import {
  calculateSensorReadoutTiming,
  type CaptureShutterMechanism,
  type NativeSensorReadoutScanDirection,
  type SensorReadoutTiming,
  type SensorReadoutTimingDeclaration,
  type SourcedSensorReadoutFact,
  type SourcedSensorTimingSeconds
} from "./readout-timing.js";
import type {
  NativeImageRaster
} from "./sensor-geometry.js";

type UnknownRecord = Record<string, unknown>;

export const CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;

export interface CaptureModeTimingProfile {
  schemaVersion:
    typeof CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  captureModeId: string;
  scientificStatus: "approximation";
  scheduleFamily:
    "global-or-uniform-linear-native-scan";
  shutterMechanism:
    CaptureShutterMechanism;
  opening:
    ExposureBoundarySchedule;
  closing:
    ExposureBoundarySchedule;
  readout:
    SensorReadoutTimingDeclaration;
  nonUniformScheduleModeled: false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface ResolveCaptureModeTimingInput {
  captureMode:
    ResolvedCaptureMode;
  timingProfile:
    CaptureModeTimingProfile;
  nominalExposureDurationSeconds:
    SourcedCaptureTimingSeconds;
  activeCaptureRect?: RasterRect;
  samplePointsNative?:
    readonly RasterPoint[];
}

export interface ResolvedCaptureModeTiming {
  schemaVersion:
    typeof CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION;
  timingProfileId: string;
  timingProfileVersion: string;
  captureModeId: string;
  captureModeTimingIdentity:
    "exact-mode-and-profile";
  nativeRaster: NativeImageRaster;
  modeDeclaresTimingDependency:
    boolean;
  scheduleFamily:
    "global-or-uniform-linear-native-scan";
  exposureWindows:
    CaptureExposureWindows;
  readoutTiming:
    SensorReadoutTiming;
  timeReference:
    "first-opening-boundary-phase";
  readoutExposureSynchronization:
    "not-assumed";
  nonUniformScheduleModeled: false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

const SHUTTER_MECHANISMS =
  new Set<CaptureShutterMechanism>([
    "mechanical",
    "electronic-first-curtain",
    "electronic"
  ]);

const SCAN_DIRECTIONS =
  new Set<NativeSensorReadoutScanDirection>([
    "top-to-bottom",
    "bottom-to-top",
    "left-to-right",
    "right-to-left"
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

function parseSecondsFact(
  value: unknown,
  path: string
): SourcedSensorTimingSeconds {
  const record =
    requireRecord(value, path);
  if (record.unit !== "s") {
    throw new InvalidConfigurationError(
      path + '.unit must be "s".'
    );
  }
  return {
    value:
      requireNonNegativeFinite(
        record.value,
        path + ".value"
      ),
    unit: "s",
    evidence:
      parseEvidenceList(
        record.evidence,
        path + ".evidence"
      )
  };
}

function parseDirectionFact(
  value: unknown,
  path: string
): SourcedSensorReadoutFact<NativeSensorReadoutScanDirection> {
  const record =
    requireRecord(value, path);
  if (
    typeof record.value !== "string" ||
    !SCAN_DIRECTIONS.has(
      record.value as NativeSensorReadoutScanDirection
    )
  ) {
    throw new InvalidConfigurationError(
      path + ".value is invalid."
    );
  }
  return {
    value:
      record.value as NativeSensorReadoutScanDirection,
    evidence:
      parseEvidenceList(
        record.evidence,
        path + ".evidence"
      )
  };
}

function parseBoundarySchedule(
  value: unknown,
  path: string
): ExposureBoundarySchedule {
  const record =
    requireRecord(value, path);

  if (record.kind === "simultaneous") {
    if (
      record.directionNative !==
        undefined ||
      record.traversalDurationSeconds !==
        undefined
    ) {
      throw new InvalidConfigurationError(
        path +
          " simultaneous schedule must not include scan-only fields."
      );
    }
    return {
      kind: "simultaneous"
    };
  }

  if (
    record.kind ===
    "uniform-linear-native-scan"
  ) {
    return {
      kind:
        "uniform-linear-native-scan",
      directionNative:
        parseDirectionFact(
          record.directionNative,
          path + ".directionNative"
        ) as SourcedCaptureBoundaryDirection,
      traversalDurationSeconds:
        parseSecondsFact(
          record.traversalDurationSeconds,
          path +
            ".traversalDurationSeconds"
        )
    };
  }

  throw new InvalidConfigurationError(
    path +
      '.kind must be "simultaneous" or "uniform-linear-native-scan"; non-uniform schedules are not modeled.'
  );
}

function parseReadout(
  value: unknown,
  path: string
): SensorReadoutTimingDeclaration {
  const record =
    requireRecord(value, path);
  const duration =
    parseSecondsFact(
      record.captureReadoutDurationSeconds,
      path +
        ".captureReadoutDurationSeconds"
    );

  if (record.readoutMode === "global") {
    if (
      record.scanDirectionNative !==
        undefined ||
      record.spatialSamplingSkewSeconds !==
        undefined
    ) {
      throw new InvalidConfigurationError(
        path +
          " global readout must not include rolling-scan fields."
      );
    }
    return {
      readoutMode: "global",
      captureReadoutDurationSeconds:
        duration
    };
  }

  if (record.readoutMode === "rolling") {
    return {
      readoutMode: "rolling",
      captureReadoutDurationSeconds:
        duration,
      scanDirectionNative:
        parseDirectionFact(
          record.scanDirectionNative,
          path +
            ".scanDirectionNative"
        ),
      spatialSamplingSkewSeconds:
        parseSecondsFact(
          record.spatialSamplingSkewSeconds,
          path +
            ".spatialSamplingSkewSeconds"
        )
    };
  }

  throw new InvalidConfigurationError(
    path +
      '.readoutMode must be "global" or "rolling".'
  );
}

/**
 * Parses timing facts that are explicitly bound to one exact capture mode.
 *
 * Schema 0.1.0 intentionally admits only the timing schedule families already
 * owned by #12: simultaneous/global or uniform-linear native scans. Unsupported
 * non-uniform/segmented schedules fail closed instead of being approximated.
 */
export function parseCaptureModeTimingProfile(
  value: unknown
): CaptureModeTimingProfile {
  const record =
    requireRecord(
      value,
      "captureModeTimingProfile"
    );

  if (
    record.schemaVersion !==
    CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'captureModeTimingProfile.schemaVersion must be "' +
        CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.scientificStatus !==
    "approximation"
  ) {
    throw new InvalidConfigurationError(
      'captureModeTimingProfile.scientificStatus must be "approximation".'
    );
  }
  if (
    record.scheduleFamily !==
    "global-or-uniform-linear-native-scan"
  ) {
    throw new InvalidConfigurationError(
      'captureModeTimingProfile.scheduleFamily must be "global-or-uniform-linear-native-scan"; unsupported schedule families fail closed.'
    );
  }
  if (
    typeof record.shutterMechanism !==
      "string" ||
    !SHUTTER_MECHANISMS.has(
      record.shutterMechanism as CaptureShutterMechanism
    )
  ) {
    throw new InvalidConfigurationError(
      "captureModeTimingProfile.shutterMechanism is invalid."
    );
  }
  if (
    record.nonUniformScheduleModeled !==
    false
  ) {
    throw new InvalidConfigurationError(
      "captureModeTimingProfile.nonUniformScheduleModeled must be false in schema 0.1.0."
    );
  }

  return {
    schemaVersion:
      CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "captureModeTimingProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "captureModeTimingProfile.profileVersion"
      ),
    captureModeId:
      requireNonEmptyString(
        record.captureModeId,
        "captureModeTimingProfile.captureModeId"
      ),
    scientificStatus:
      "approximation",
    scheduleFamily:
      "global-or-uniform-linear-native-scan",
    shutterMechanism:
      record.shutterMechanism as CaptureShutterMechanism,
    opening:
      parseBoundarySchedule(
        record.opening,
        "captureModeTimingProfile.opening"
      ),
    closing:
      parseBoundarySchedule(
        record.closing,
        "captureModeTimingProfile.closing"
      ),
    readout:
      parseReadout(
        record.readout,
        "captureModeTimingProfile.readout"
      ),
    nonUniformScheduleModeled:
      false,
    evidence:
      parseEvidenceList(
        record.evidence,
        "captureModeTimingProfile.evidence"
      ),
    limitations:
      parseLimitations(
        record.limitations,
        "captureModeTimingProfile.limitations"
      )
  };
}

function sameRaster(
  a: NativeImageRaster,
  b: NativeImageRaster
): boolean {
  return (
    a.pixelWidth === b.pixelWidth &&
    a.pixelHeight === b.pixelHeight
  );
}

/**
 * Resolves the authoritative exposure/readout timing for one exact capture
 * mode and timing-profile identity.
 *
 * Readout timing remains distinct from exposure-boundary timing. No absolute
 * readout/exposure synchronization is inferred.
 */
export function resolveCaptureModeTiming(
  input:
    ResolveCaptureModeTimingInput
): ResolvedCaptureModeTiming {
  const profile =
    parseCaptureModeTimingProfile(
      input.timingProfile
    );

  if (
    profile.captureModeId !==
    input.captureMode.modeId
  ) {
    throw new InvalidScientificInputError(
      "captureModeTimingProfile.captureModeId must exactly match the resolved capture mode."
    );
  }
  if (
    !sameRaster(
      input.captureMode.nativeRaster,
      input.captureMode
        .nativeRaster
    )
  ) {
    throw new InvalidScientificInputError(
      "Resolved capture-mode raster identity is invalid."
    );
  }

  const exposureWindows =
    calculateCaptureExposureWindows({
      nativeRaster:
        input.captureMode.nativeRaster,
      ...(input.activeCaptureRect ===
      undefined
        ? {}
        : {
            activeCaptureRect:
              input.activeCaptureRect
          }),
      shutterMechanism:
        profile.shutterMechanism,
      nominalExposureDurationSeconds:
        input
          .nominalExposureDurationSeconds,
      opening: profile.opening,
      closing: profile.closing,
      ...(input.samplePointsNative ===
      undefined
        ? {}
        : {
            samplePointsNative:
              input.samplePointsNative
          })
    }).value;

  const readoutTiming =
    calculateSensorReadoutTiming({
      nativeRaster:
        input.captureMode.nativeRaster,
      ...(input.activeCaptureRect ===
      undefined
        ? {}
        : {
            activeCaptureRect:
              input.activeCaptureRect
          }),
      shutterMechanism:
        profile.shutterMechanism,
      readout: profile.readout,
      ...(input.samplePointsNative ===
      undefined
        ? {}
        : {
            samplePointsNative:
              input.samplePointsNative
          })
    }).value;

  return {
    schemaVersion:
      CAPTURE_MODE_TIMING_PROFILE_SCHEMA_VERSION,
    timingProfileId:
      profile.profileId,
    timingProfileVersion:
      profile.profileVersion,
    captureModeId:
      input.captureMode.modeId,
    captureModeTimingIdentity:
      "exact-mode-and-profile",
    nativeRaster: {
      ...input.captureMode.nativeRaster
    },
    modeDeclaresTimingDependency:
      input.captureMode
        .dependencies.includes(
          "mode-specific-readout-timing"
        ),
    scheduleFamily:
      profile.scheduleFamily,
    exposureWindows,
    readoutTiming,
    timeReference:
      "first-opening-boundary-phase",
    readoutExposureSynchronization:
      "not-assumed",
    nonUniformScheduleModeled:
      false,
    evidence: [
      ...input.captureMode.modeEvidence,
      ...profile.evidence
    ],
    limitations: [
      ...profile.limitations,
      "Sensor data readout timing and exposure-boundary timing remain independent unless a separate linkage/synchronization contract establishes a relationship.",
      "Capture-mode identity does not infer timing from CMOS/CCD, marketing labels, output raster size, or generic readout-speed names."
    ]
  };
}
