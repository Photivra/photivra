// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Parses one generic relative exposure-metering profile. Schema 0.1.0 is approximation-only and
 * consumes relative pre-exposure linear signal. It deliberately does not claim luminance, spectral
 * radiance, sensor-plane irradiance, or a specific manufacturer's meter calibration.
 * Meters relative pre-exposure linear signal over the actual oriented active capture frame. The first
 * contract is an educational/relative approximation. It is intentionally independent of final output
 * crop, display/tone mapping, exposure compensation, and automatic exposure setting resolution.
 * @see docs/USAGE.md for equations, coordinate/unit conventions, blockers and support limits.
 */

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  NormalizedRasterUv,
  ResolvedCaptureGeometry
} from "../output/capture-geometry.js";

type UnknownRecord = Record<string, unknown>;

export const EXPOSURE_METERING_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;

export type ExposureMeteringPolicy =
  | {
      kind: "multi-zone-uniform";
    }
  | {
      kind: "center-weighted-radial";
      edgeWeight: number;
      exponent: number;
    }
  | {
      kind: "spot";
      centerOrientedCaptureUv:
        NormalizedRasterUv;
      radiusFractionOfCaptureDiagonal:
        number;
    }
  | {
      kind: "highlight-weighted";
      minimumWeightFraction: number;
      exponent: number;
    };

export interface ExposureMeteringProfile {
  schemaVersion:
    typeof EXPOSURE_METERING_PROFILE_SCHEMA_VERSION;
  profileId: string;
  scientificStatus: "approximation";
  inputDomain:
    "relative-pre-exposure-linear-signal";
  captureRegion:
    "oriented-active-capture";
  policy: ExposureMeteringPolicy;
  target: {
    kind: "relative-signal-reference";
    targetRelativeSignal: number;
    evidence: readonly EvidenceProvenance[];
  };
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface ExposureMeteringZoneSample {
  sampleId: string;
  positionOrientedCaptureUv:
    NormalizedRasterUv;
  relativeLinearSignal: number;
  areaWeight: number;
}

export interface ExposureMeteringSampleSet {
  measurementId: string;
  sceneStateId: string;
  inputDomain:
    "relative-pre-exposure-linear-signal";
  captureRegion:
    "oriented-active-capture";
  captureGeometry:
    ResolvedCaptureGeometry;
  processingState: {
    exposureSettingsApplied: false;
    whiteBalanceApplied: false;
    toneMappingApplied: false;
    displayGammaApplied: false;
    sharpeningApplied: false;
  };
  samples:
    readonly ExposureMeteringZoneSample[];
}

interface ExposureMeteringResultBase {
  measurementId: string;
  sceneStateId: string;
  profileId: string;
  scientificStatus: "approximation";
  inputDomain:
    "relative-pre-exposure-linear-signal";
  captureRegion:
    "oriented-active-capture";
  orientation:
    ResolvedCaptureGeometry["orientedCapture"]["orientation"];
  activeCaptureImagingAreaMm: {
    width: number;
    height: number;
  };
  policyKind:
    ExposureMeteringPolicy["kind"];
  targetRelativeSignal: number;
  meteredRelativeSignal: number;
  totalSampleCount: number;
  selectedSampleCount: number;
  normalizedWeightSum: number;
  outputCropUsedForMetering: false;
  exposureCompensationApplied: false;
  finalToneMappingUsed: false;
  displayGammaUsed: false;
  calibratedLuminanceClaimAuthorized: false;
  calibratedSceneRadianceClaimAuthorized: false;
  automaticExposureResolved: false;
  resultReusableForAeLock: true;
}

export type ExposureMeteringResult =
  | (ExposureMeteringResultBase & {
      status: "resolved";
      requiredExposureScaleToTarget:
        number;
      exposureOffsetStopsToTarget:
        number;
    })
  | (ExposureMeteringResultBase & {
      status: "no-signal";
      requiredExposureScaleResolved:
        false;
      exposureOffsetStopsResolved:
        false;
    });

export interface MeterRelativeExposureInput {
  profile: ExposureMeteringProfile;
  sampleSet: ExposureMeteringSampleSet;
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
  const parsed = requireFinite(
    value,
    path
  );
  if (parsed <= 0) {
    throw new InvalidConfigurationError(
      path + " must be greater than zero."
    );
  }
  return parsed;
}

function requireFraction(
  value: unknown,
  path: string
): number {
  const parsed = requireFinite(
    value,
    path
  );
  if (parsed < 0 || parsed > 1) {
    throw new InvalidConfigurationError(
      path +
        " must be a finite fraction from 0 through 1."
    );
  }
  return parsed;
}

function parseUv(
  value: unknown,
  path: string
): NormalizedRasterUv {
  const record = requireRecord(
    value,
    path
  );
  const u = requireFinite(
    record.u,
    path + ".u"
  );
  const v = requireFinite(
    record.v,
    path + ".v"
  );
  if (
    u < 0 ||
    u > 1 ||
    v < 0 ||
    v > 1
  ) {
    throw new InvalidConfigurationError(
      path +
        " coordinates must lie within [0, 1]."
    );
  }
  return { u, v };
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
  const limitations = value.map(
    (entry, index) =>
      requireNonEmptyString(
        entry,
        path + "[" + index + "]"
      )
  );
  if (
    new Set(limitations).size !==
    limitations.length
  ) {
    throw new InvalidConfigurationError(
      path + " must not contain duplicates."
    );
  }
  return limitations;
}

function parsePolicy(
  value: unknown,
  path: string
): ExposureMeteringPolicy {
  const record = requireRecord(
    value,
    path
  );

  if (
    record.kind ===
    "multi-zone-uniform"
  ) {
    return {
      kind: "multi-zone-uniform"
    };
  }

  if (
    record.kind ===
    "center-weighted-radial"
  ) {
    return {
      kind:
        "center-weighted-radial",
      edgeWeight: requireFraction(
        record.edgeWeight,
        path + ".edgeWeight"
      ),
      exponent:
        requirePositiveFinite(
          record.exponent,
          path + ".exponent"
        )
    };
  }

  if (record.kind === "spot") {
    const radius =
      requirePositiveFinite(
        record
          .radiusFractionOfCaptureDiagonal,
        path +
          ".radiusFractionOfCaptureDiagonal"
      );
    if (radius > 1) {
      throw new InvalidConfigurationError(
        path +
          ".radiusFractionOfCaptureDiagonal must be at most 1."
      );
    }
    return {
      kind: "spot",
      centerOrientedCaptureUv:
        parseUv(
          record
            .centerOrientedCaptureUv,
          path +
            ".centerOrientedCaptureUv"
        ),
      radiusFractionOfCaptureDiagonal:
        radius
    };
  }

  if (
    record.kind ===
    "highlight-weighted"
  ) {
    return {
      kind: "highlight-weighted",
      minimumWeightFraction:
        requireFraction(
          record
            .minimumWeightFraction,
          path +
            ".minimumWeightFraction"
        ),
      exponent:
        requirePositiveFinite(
          record.exponent,
          path + ".exponent"
        )
    };
  }

  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

/**
 * Parses one generic relative exposure-metering profile.
 *
 * Schema 0.1.0 is approximation-only and consumes relative pre-exposure
 * linear signal. It deliberately does not claim luminance, spectral radiance,
 * sensor-plane irradiance, or a specific manufacturer's meter calibration.
 */
export function parseExposureMeteringProfile(
  value: unknown
): ExposureMeteringProfile {
  const record = requireRecord(
    value,
    "exposureMeteringProfile"
  );

  if (
    record.schemaVersion !==
    EXPOSURE_METERING_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'exposureMeteringProfile.schemaVersion must be "' +
        EXPOSURE_METERING_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.scientificStatus !==
    "approximation"
  ) {
    throw new InvalidConfigurationError(
      'exposureMeteringProfile.scientificStatus must be "approximation" in schema 0.1.0.'
    );
  }
  if (
    record.inputDomain !==
    "relative-pre-exposure-linear-signal"
  ) {
    throw new InvalidConfigurationError(
      'exposureMeteringProfile.inputDomain must be "relative-pre-exposure-linear-signal".'
    );
  }
  if (
    record.captureRegion !==
    "oriented-active-capture"
  ) {
    throw new InvalidConfigurationError(
      'exposureMeteringProfile.captureRegion must be "oriented-active-capture".'
    );
  }

  const target = requireRecord(
    record.target,
    "exposureMeteringProfile.target"
  );
  if (
    target.kind !==
    "relative-signal-reference"
  ) {
    throw new InvalidConfigurationError(
      'exposureMeteringProfile.target.kind must be "relative-signal-reference".'
    );
  }

  return {
    schemaVersion:
      EXPOSURE_METERING_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "exposureMeteringProfile.profileId"
      ),
    scientificStatus: "approximation",
    inputDomain:
      "relative-pre-exposure-linear-signal",
    captureRegion:
      "oriented-active-capture",
    policy: parsePolicy(
      record.policy,
      "exposureMeteringProfile.policy"
    ),
    target: {
      kind:
        "relative-signal-reference",
      targetRelativeSignal:
        requirePositiveFinite(
          target.targetRelativeSignal,
          "exposureMeteringProfile.target.targetRelativeSignal"
        ),
      evidence: parseEvidenceList(
        target.evidence,
        "exposureMeteringProfile.target.evidence"
      )
    },
    evidence: parseEvidenceList(
      record.evidence,
      "exposureMeteringProfile.evidence"
    ),
    limitations: parseLimitations(
      record.limitations,
      "exposureMeteringProfile.limitations"
    )
  };
}

function requireInputString(
  value: unknown,
  path: string
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new InvalidScientificInputError(
      path + " must be a non-empty string."
    );
  }
  return value.trim();
}

function requireInputFinite(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new InvalidScientificInputError(
      path + " must be finite."
    );
  }
  return value;
}

function requireInputPositiveFinite(
  value: unknown,
  path: string
): number {
  const parsed = requireInputFinite(
    value,
    path
  );
  if (parsed <= 0) {
    throw new InvalidScientificInputError(
      path + " must be greater than zero."
    );
  }
  return parsed;
}

function requireInputNonNegativeFinite(
  value: unknown,
  path: string
): number {
  const parsed = requireInputFinite(
    value,
    path
  );
  if (parsed < 0) {
    throw new InvalidScientificInputError(
      path +
        " must be greater than or equal to zero."
    );
  }
  return parsed;
}

function validateSampleUv(
  uv: NormalizedRasterUv,
  path: string
): void {
  const u = requireInputFinite(
    uv.u,
    path + ".u"
  );
  const v = requireInputFinite(
    uv.v,
    path + ".v"
  );
  if (
    u < 0 ||
    u > 1 ||
    v < 0 ||
    v > 1
  ) {
    throw new InvalidScientificInputError(
      path +
        " coordinates must lie within [0, 1]."
    );
  }
}

function validateCaptureGeometry(
  geometry:
    ResolvedCaptureGeometry
): void {
  const width =
    requireInputPositiveFinite(
      geometry.orientedCapture
        .imagingArea.widthMm,
      "sampleSet.captureGeometry.orientedCapture.imagingArea.widthMm"
    );
  const height =
    requireInputPositiveFinite(
      geometry.orientedCapture
        .imagingArea.heightMm,
      "sampleSet.captureGeometry.orientedCapture.imagingArea.heightMm"
    );
  const diagonal = Math.hypot(
    width,
    height
  );
  if (!Number.isFinite(diagonal)) {
    throw new InvalidScientificInputError(
      "sampleSet.captureGeometry oriented capture diagonal must remain finite."
    );
  }
}

function validateProcessingState(
  sampleSet:
    ExposureMeteringSampleSet
): void {
  const state =
    sampleSet.processingState;
  if (
    state.exposureSettingsApplied !==
      false ||
    state.whiteBalanceApplied !==
      false ||
    state.toneMappingApplied !==
      false ||
    state.displayGammaApplied !==
      false ||
    state.sharpeningApplied !==
      false
  ) {
    throw new InvalidScientificInputError(
      "Relative exposure metering requires pre-exposure linear samples before exposure settings, white balance, tone mapping, display gamma, and sharpening."
    );
  }
}

function physicalNormalizedDistanceFromCenter(
  uv: NormalizedRasterUv,
  widthMm: number,
  heightMm: number
): number {
  const x =
    (uv.u - 0.5) * widthMm;
  const y =
    (uv.v - 0.5) * heightMm;
  const halfDiagonal =
    Math.hypot(
      widthMm,
      heightMm
    ) / 2;
  return Math.hypot(x, y) /
    halfDiagonal;
}

function physicalDistanceFractionOfDiagonal(
  a: NormalizedRasterUv,
  b: NormalizedRasterUv,
  widthMm: number,
  heightMm: number
): number {
  const dx =
    (a.u - b.u) * widthMm;
  const dy =
    (a.v - b.v) * heightMm;
  const diagonal =
    Math.hypot(
      widthMm,
      heightMm
    );
  return Math.hypot(dx, dy) /
    diagonal;
}

function policyWeight(
  policy: ExposureMeteringPolicy,
  sample:
    ExposureMeteringZoneSample,
  widthMm: number,
  heightMm: number,
  maximumSignal: number
): number {
  if (
    policy.kind ===
    "multi-zone-uniform"
  ) {
    return 1;
  }

  if (
    policy.kind ===
    "center-weighted-radial"
  ) {
    const radialPhase = Math.min(
      1,
      physicalNormalizedDistanceFromCenter(
        sample
          .positionOrientedCaptureUv,
        widthMm,
        heightMm
      )
    );
    return (
      policy.edgeWeight +
      (1 - policy.edgeWeight) *
        Math.pow(
          1 - radialPhase,
          policy.exponent
        )
    );
  }

  if (policy.kind === "spot") {
    const distance =
      physicalDistanceFractionOfDiagonal(
        sample
          .positionOrientedCaptureUv,
        policy
          .centerOrientedCaptureUv,
        widthMm,
        heightMm
      );
    return distance <=
      policy
        .radiusFractionOfCaptureDiagonal
      ? 1
      : 0;
  }

  if (maximumSignal <= 0) {
    return policy
      .minimumWeightFraction;
  }
  const normalizedHighlight =
    sample.relativeLinearSignal /
    maximumSignal;
  return (
    policy.minimumWeightFraction +
    (1 -
      policy.minimumWeightFraction) *
      Math.pow(
        normalizedHighlight,
        policy.exponent
      )
  );
}

/**
 * Meters relative pre-exposure linear signal over the actual oriented active
 * capture frame.
 *
 * The first contract is an educational/relative approximation. It is
 * intentionally independent of final output crop, display/tone mapping,
 * exposure compensation, and automatic exposure setting resolution.
 */
export function meterRelativeExposure(
  input:
    MeterRelativeExposureInput
): CalculationResult<ExposureMeteringResult> {
  const profile =
    parseExposureMeteringProfile(
      input.profile
    );
  const sampleSet = input.sampleSet;

  requireInputString(
    sampleSet.measurementId,
    "sampleSet.measurementId"
  );
  requireInputString(
    sampleSet.sceneStateId,
    "sampleSet.sceneStateId"
  );

  if (
    sampleSet.inputDomain !==
    profile.inputDomain
  ) {
    throw new InvalidScientificInputError(
      "sampleSet.inputDomain must match the metering profile."
    );
  }
  if (
    sampleSet.captureRegion !==
    profile.captureRegion
  ) {
    throw new InvalidScientificInputError(
      "sampleSet.captureRegion must match the metering profile."
    );
  }

  validateCaptureGeometry(
    sampleSet.captureGeometry
  );
  validateProcessingState(
    sampleSet
  );

  if (
    !Array.isArray(
      sampleSet.samples
    ) ||
    sampleSet.samples.length === 0
  ) {
    throw new InvalidScientificInputError(
      "sampleSet.samples must be a non-empty array."
    );
  }

  const sampleIds: string[] = [];
  let maximumSignal = 0;
  for (
    let index = 0;
    index < sampleSet.samples.length;
    index += 1
  ) {
    const sample =
      sampleSet.samples[index]!;
    const path =
      "sampleSet.samples[" +
      index +
      "]";
    sampleIds.push(
      requireInputString(
        sample.sampleId,
        path + ".sampleId"
      )
    );
    validateSampleUv(
      sample
        .positionOrientedCaptureUv,
      path +
        ".positionOrientedCaptureUv"
    );
    const signal =
      requireInputNonNegativeFinite(
        sample.relativeLinearSignal,
        path +
          ".relativeLinearSignal"
      );
    requireInputPositiveFinite(
      sample.areaWeight,
      path + ".areaWeight"
    );
    maximumSignal = Math.max(
      maximumSignal,
      signal
    );
  }

  if (
    new Set(sampleIds).size !==
    sampleIds.length
  ) {
    throw new InvalidScientificInputError(
      "sampleSet.samples[].sampleId must not contain duplicates."
    );
  }

  const widthMm =
    sampleSet.captureGeometry
      .orientedCapture.imagingArea
      .widthMm;
  const heightMm =
    sampleSet.captureGeometry
      .orientedCapture.imagingArea
      .heightMm;

  let weightedSignal = 0;
  let weightSum = 0;
  let selectedSampleCount = 0;

  for (const sample of sampleSet.samples) {
    const policyMultiplier =
      policyWeight(
        profile.policy,
        sample,
        widthMm,
        heightMm,
        maximumSignal
      );
    if (policyMultiplier <= 0) {
      continue;
    }
    const weight =
      sample.areaWeight *
      policyMultiplier;
    weightedSignal +=
      sample.relativeLinearSignal *
      weight;
    weightSum += weight;
    selectedSampleCount += 1;
  }

  if (
    !Number.isFinite(
      weightedSignal
    ) ||
    !Number.isFinite(weightSum)
  ) {
    throw new InvalidScientificInputError(
      "Metering weighted sums must remain finite."
    );
  }
  if (weightSum <= 0) {
    throw new InvalidScientificInputError(
      "Metering policy selected no samples with positive weight."
    );
  }

  const meteredRelativeSignal =
    weightedSignal / weightSum;
  if (
    !Number.isFinite(
      meteredRelativeSignal
    ) ||
    meteredRelativeSignal < 0
  ) {
    throw new InvalidScientificInputError(
      "Metered relative signal must remain finite and non-negative."
    );
  }

  const base = {
    measurementId:
      sampleSet.measurementId,
    sceneStateId:
      sampleSet.sceneStateId,
    profileId: profile.profileId,
    scientificStatus:
      "approximation" as const,
    inputDomain:
      "relative-pre-exposure-linear-signal" as const,
    captureRegion:
      "oriented-active-capture" as const,
    orientation:
      sampleSet.captureGeometry
        .orientedCapture.orientation,
    activeCaptureImagingAreaMm: {
      width: widthMm,
      height: heightMm
    },
    policyKind:
      profile.policy.kind,
    targetRelativeSignal:
      profile.target
        .targetRelativeSignal,
    meteredRelativeSignal,
    totalSampleCount:
      sampleSet.samples.length,
    selectedSampleCount,
    normalizedWeightSum: 1,
    outputCropUsedForMetering:
      false as const,
    exposureCompensationApplied:
      false as const,
    finalToneMappingUsed:
      false as const,
    displayGammaUsed: false as const,
    calibratedLuminanceClaimAuthorized:
      false as const,
    calibratedSceneRadianceClaimAuthorized:
      false as const,
    automaticExposureResolved:
      false as const,
    resultReusableForAeLock:
      true as const
  };

  const value:
    ExposureMeteringResult =
    meteredRelativeSignal === 0
      ? {
          ...base,
          status: "no-signal",
          requiredExposureScaleResolved:
            false,
          exposureOffsetStopsResolved:
            false
        }
      : {
          ...base,
          status: "resolved",
          requiredExposureScaleToTarget:
            profile.target
              .targetRelativeSignal /
            meteredRelativeSignal,
          exposureOffsetStopsToTarget:
            Math.log2(
              profile.target
                .targetRelativeSignal /
                meteredRelativeSignal
            )
        };

  return approximationResult(
    value,
    "relative-pre-exposure-metering",
    "1.0.0",
    [
      "Input samples are relative pre-exposure linear signal, not calibrated luminance, scene spectral radiance, sensor-plane irradiance, or final rendered output.",
      "Sample areaWeight is supplied by the producer and is assumed to represent the active capture frame consistently.",
      "Metering coordinates are normalized over the physically oriented active capture frame, not the final output crop or CSS/display box.",
      "Multi-zone, center-weighted, spot, and highlight-weighted policies are generic explicit approximations and do not claim to reproduce a specific commercial camera.",
      "The declared relative target is profile policy, not a universal 18% gray truth.",
      "Exposure compensation is not applied by the meter.",
      "Automatic aperture, shutter, and ISO resolution remains downstream.",
      "White balance, tone mapping, display gamma, sharpening, and final output crop do not participate in this metering calculation.",
      "A no-signal result does not fabricate an infinite exposure correction."
    ]
  );
}
