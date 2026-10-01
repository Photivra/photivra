// SPDX-License-Identifier: Apache-2.0

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
  ResolvedCaptureModeColorSamplingContributors
} from "./capture-color-sampling-binding.js";
import type {
  SensorRawCodeSample
} from "./raw-readout.js";
import type {
  SensorSpectralResponseScientificStatus
} from "./spectral-response.js";

type UnknownRecord = Record<string, unknown>;

export const SENSOR_RAW_CAPTURE_SAMPLE_VERSION =
  "0.1.0" as const;
export const SENSOR_RAW_RECONSTRUCTION_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;

export interface CreateSensorRawCaptureSampleInput {
  rawCode:
    SensorRawCodeSample;
  contributors:
    ResolvedCaptureModeColorSamplingContributors;
}

export interface SensorRawCaptureSample {
  version:
    typeof SENSOR_RAW_CAPTURE_SAMPLE_VERSION;
  captureModeId: string;
  modeSampleCoordinateSystem:
    "capture-mode-full-frame-effective-sample-index";
  modeSampleIndexFullFrame: {
    x: number;
    y: number;
  };
  colorSamplingProfileId: string;
  colorSamplingSite: {
    x: number;
    y: number;
  };
  channelId: string;
  rawCode: number;
  blackLevelCode: number;
  digitalSaturationCode: number;
  blackSubtractedNormalizedCode:
    number;
  readoutProfileId: string;
  readoutRegimeId: string;
  sourceChargeSeedUint32: number;
  sourceReadNoiseSeedUint32: number;
  physicalScalarSaturationApplied:
    boolean;
  digitalSaturationApplied:
    boolean;
  cfaPhasePreservedInNativeCoordinates:
    true;
  physicalOrientationApplied:
    false;
  outputRotationApplied:
    false;
  groupedModeCombinationApplied:
    false;
  reconstructionApplied: false;
  aliasingModeled: false;
  moireModeled: false;
}

export interface SensorRawReconstructionKernelContribution {
  offsetX: number;
  offsetY: number;
  sourceChannelId: string;
  weight: number;
}

export interface SensorRawReconstructionChannelKernel {
  outputChannelId: string;
  contributions:
    readonly SensorRawReconstructionKernelContribution[];
}

export interface SensorRawReconstructionProfile {
  schemaVersion:
    typeof SENSOR_RAW_RECONSTRUCTION_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  captureModeId: string;
  colorSamplingProfileId: string;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  method:
    "explicit-linear-native-neighborhood";
  normalization:
    "weights-sum-to-one-per-output-channel";
  negativeBlackSubtractedValuesAllowed:
    true;
  kernels:
    readonly SensorRawReconstructionChannelKernel[];
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface ReconstructSensorRawNeighborhoodInput {
  profile:
    SensorRawReconstructionProfile;
  centerSite: {
    x: number;
    y: number;
  };
  samples:
    readonly SensorRawCaptureSample[];
}

export interface SensorRawReconstructedPixel {
  reconstructionProfileId:
    string;
  reconstructionProfileVersion:
    string;
  captureModeId: string;
  colorSamplingProfileId: string;
  centerSite: {
    x: number;
    y: number;
  };
  outputChannels:
    readonly {
      channelId: string;
      linearBlackSubtractedNormalizedValue:
        number;
      sourceContributions:
        readonly {
          site: {
            x: number;
            y: number;
          };
          sourceChannelId: string;
          weight: number;
          sourceValue: number;
        }[];
    }[];
  method:
    "explicit-linear-native-neighborhood";
  cfaAware: true;
  captureModeAware: true;
  physicalOrientationApplied:
    false;
  outputRotationApplied: false;
  sharpeningApplied: false;
  denoisingApplied: false;
  aliasingModeled: false;
  moireModeled: false;
  preSamplingOpticalTransferAdequacyEstablished:
    false;
  reconstructionDoesNotModifyRawSamples:
    true;
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

function requireSafeInteger(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value)
  ) {
    throw new InvalidConfigurationError(
      path + " must be a safe integer."
    );
  }
  return value;
}

function requireNonNegativeSafeIntegerInput(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new InvalidScientificInputError(
      path +
        " must be a non-negative safe integer."
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

function parseStatus(
  value: unknown,
  path: string
): SensorSpectralResponseScientificStatus {
  if (
    value !== "calibrated" &&
    value !== "approximation"
  ) {
    throw new InvalidConfigurationError(
      path + " is invalid."
    );
  }
  return value;
}

function parseContribution(
  value: unknown,
  path: string
): SensorRawReconstructionKernelContribution {
  const record =
    requireRecord(value, path);
  return {
    offsetX:
      requireSafeInteger(
        record.offsetX,
        path + ".offsetX"
      ),
    offsetY:
      requireSafeInteger(
        record.offsetY,
        path + ".offsetY"
      ),
    sourceChannelId:
      requireNonEmptyString(
        record.sourceChannelId,
        path + ".sourceChannelId"
      ),
    weight:
      requireFinite(
        record.weight,
        path + ".weight"
      )
  };
}

function parseKernel(
  value: unknown,
  path: string
): SensorRawReconstructionChannelKernel {
  const record =
    requireRecord(value, path);
  if (
    !Array.isArray(
      record.contributions
    ) ||
    record.contributions
      .length === 0
  ) {
    throw new InvalidConfigurationError(
      path +
        ".contributions must be a non-empty array."
    );
  }
  const contributions =
    record.contributions.map(
      (entry, index) =>
        parseContribution(
          entry,
          path +
            ".contributions[" +
            index +
            "]"
        )
    );
  const keys =
    contributions.map(
      (entry) =>
        entry.offsetX +
        ":" +
        entry.offsetY +
        ":" +
        entry.sourceChannelId
    );
  if (
    new Set(keys).size !==
    keys.length
  ) {
    throw new InvalidConfigurationError(
      path +
        ".contributions must not contain duplicate site/channel references."
    );
  }

  const sum =
    contributions.reduce(
      (valueSum, entry) =>
        valueSum + entry.weight,
      0
    );
  if (
    !Number.isFinite(sum) ||
    Math.abs(sum - 1) >
      1e-12
  ) {
    throw new InvalidConfigurationError(
      path +
        ".contribution weights must sum to one."
    );
  }

  return {
    outputChannelId:
      requireNonEmptyString(
        record.outputChannelId,
        path +
          ".outputChannelId"
      ),
    contributions
  };
}

export function parseSensorRawReconstructionProfile(
  value: unknown
): SensorRawReconstructionProfile {
  const record =
    requireRecord(
      value,
      "sensorRawReconstructionProfile"
    );
  if (
    record.schemaVersion !==
    SENSOR_RAW_RECONSTRUCTION_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'sensorRawReconstructionProfile.schemaVersion must be "' +
        SENSOR_RAW_RECONSTRUCTION_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.method !==
    "explicit-linear-native-neighborhood"
  ) {
    throw new InvalidConfigurationError(
      'sensorRawReconstructionProfile.method must be "explicit-linear-native-neighborhood".'
    );
  }
  if (
    record.normalization !==
    "weights-sum-to-one-per-output-channel"
  ) {
    throw new InvalidConfigurationError(
      "sensorRawReconstructionProfile.normalization is invalid."
    );
  }
  if (
    record
      .negativeBlackSubtractedValuesAllowed !==
    true
  ) {
    throw new InvalidConfigurationError(
      "sensorRawReconstructionProfile.negativeBlackSubtractedValuesAllowed must be true."
    );
  }
  if (
    !Array.isArray(
      record.kernels
    ) ||
    record.kernels.length === 0
  ) {
    throw new InvalidConfigurationError(
      "sensorRawReconstructionProfile.kernels must be a non-empty array."
    );
  }

  const kernels =
    record.kernels.map(
      (entry, index) =>
        parseKernel(
          entry,
          "sensorRawReconstructionProfile.kernels[" +
            index +
            "]"
        )
    );
  const outputIds =
    kernels.map(
      (kernel) =>
        kernel.outputChannelId
    );
  if (
    new Set(outputIds).size !==
    outputIds.length
  ) {
    throw new InvalidConfigurationError(
      "sensorRawReconstructionProfile.kernels must not contain duplicate outputChannelId values."
    );
  }

  return {
    schemaVersion:
      SENSOR_RAW_RECONSTRUCTION_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "sensorRawReconstructionProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "sensorRawReconstructionProfile.profileVersion"
      ),
    captureModeId:
      requireNonEmptyString(
        record.captureModeId,
        "sensorRawReconstructionProfile.captureModeId"
      ),
    colorSamplingProfileId:
      requireNonEmptyString(
        record.colorSamplingProfileId,
        "sensorRawReconstructionProfile.colorSamplingProfileId"
      ),
    scientificStatus:
      parseStatus(
        record.scientificStatus,
        "sensorRawReconstructionProfile.scientificStatus"
      ),
    method:
      "explicit-linear-native-neighborhood",
    normalization:
      "weights-sum-to-one-per-output-channel",
    negativeBlackSubtractedValuesAllowed:
      true,
    kernels,
    evidence:
      parseEvidenceList(
        record.evidence,
        "sensorRawReconstructionProfile.evidence"
      ),
    limitations:
      parseLimitations(
        record.limitations,
        "sensorRawReconstructionProfile.limitations"
      )
  };
}

export function createSensorRawCaptureSample(
  input:
    CreateSensorRawCaptureSampleInput
): SensorRawCaptureSample {
  const raw =
    input.rawCode;
  const contributors =
    input.contributors;

  if (
    contributors
      .modeSamplingKind !==
      "native-effective-raster" ||
    contributors.grouping !==
      null ||
    contributors
      .totalContributorSites !==
      1 ||
    contributors
      .colorSamplingSiteRect
      .width !== 1 ||
    contributors
      .colorSamplingSiteRect
      .height !== 1
  ) {
    throw new InvalidScientificInputError(
      "RAW site creation schema 0.1.0 requires one ungrouped native-effective capture-mode sample bound to exactly one color-sampling site; grouped/remosaic modes need explicit signal-combination weights."
    );
  }

  if (
    contributors
      .channelComposition.kind !==
      "single-channel" ||
    contributors
      .channelComposition
      .channelId !==
      raw.channelId
  ) {
    throw new InvalidScientificInputError(
      "RAW readout channel must match the capture-mode color-sampling contributor channel."
    );
  }

  if (
    raw.site.x !==
      contributors
        .colorSamplingSiteRect.x ||
    raw.site.y !==
      contributors
        .colorSamplingSiteRect.y
  ) {
    throw new InvalidScientificInputError(
      "RAW readout site must match the exact capture-mode color-sampling contributor site."
    );
  }

  const denominator =
    raw.digitalSaturationCode -
    raw.blackLevelCode;
  if (denominator <= 0) {
    throw new InvalidScientificInputError(
      "RAW black/white code span must be positive."
    );
  }

  return {
    version:
      SENSOR_RAW_CAPTURE_SAMPLE_VERSION,
    captureModeId:
      contributors.modeId,
    modeSampleCoordinateSystem:
      "capture-mode-full-frame-effective-sample-index",
    modeSampleIndexFullFrame: {
      ...contributors
        .modeSampleIndexFullFrame
    },
    colorSamplingProfileId:
      raw.colorSamplingProfileId,
    colorSamplingSite: {
      ...raw.site
    },
    channelId:
      raw.channelId,
    rawCode:
      raw.rawCode,
    blackLevelCode:
      raw.blackLevelCode,
    digitalSaturationCode:
      raw.digitalSaturationCode,
    blackSubtractedNormalizedCode:
      (
        raw.rawCode -
        raw.blackLevelCode
      ) /
      denominator,
    readoutProfileId:
      raw.readoutProfileId,
    readoutRegimeId:
      raw.regimeId,
    sourceChargeSeedUint32:
      raw.chargeSeedUint32,
    sourceReadNoiseSeedUint32:
      raw.readNoiseSeedUint32,
    physicalScalarSaturationApplied:
      raw
        .physicalScalarSaturationApplied,
    digitalSaturationApplied:
      raw
        .digitalSaturationApplied,
    cfaPhasePreservedInNativeCoordinates:
      true,
    physicalOrientationApplied:
      false,
    outputRotationApplied:
      false,
    groupedModeCombinationApplied:
      false,
    reconstructionApplied:
      false,
    aliasingModeled:
      false,
    moireModeled: false
  };
}

function requireCenterSite(
  value: {
    x: number;
    y: number;
  }
): {
  x: number;
  y: number;
} {
  return {
    x:
      requireNonNegativeSafeIntegerInput(
        value.x,
        "centerSite.x"
      ),
    y:
      requireNonNegativeSafeIntegerInput(
        value.y,
        "centerSite.y"
      )
  };
}

export function reconstructSensorRawNeighborhood(
  input:
    ReconstructSensorRawNeighborhoodInput
): CalculationResult<SensorRawReconstructedPixel> {
  const profile =
    parseSensorRawReconstructionProfile(
      input.profile
    );
  const center =
    requireCenterSite(
      input.centerSite
    );

  if (
    !Array.isArray(input.samples) ||
    input.samples.length === 0
  ) {
    throw new InvalidScientificInputError(
      "samples must be a non-empty RAW neighborhood."
    );
  }

  for (
    const sample of
    input.samples
  ) {
    if (
      sample.captureModeId !==
        profile.captureModeId ||
      sample
        .colorSamplingProfileId !==
        profile
          .colorSamplingProfileId
    ) {
      throw new InvalidScientificInputError(
        "Every RAW neighborhood sample must match the reconstruction profile capture-mode and color-sampling identities."
      );
    }
  }

  const sampleMap =
    new Map(
      input.samples.map(
        (sample) => [
          sample.colorSamplingSite.x +
            ":" +
            sample.colorSamplingSite.y +
            ":" +
            sample.channelId,
          sample
        ] as const
      )
    );
  if (
    sampleMap.size !==
    input.samples.length
  ) {
    throw new InvalidScientificInputError(
      "RAW neighborhood must not contain duplicate site/channel samples."
    );
  }

  const outputChannels =
    profile.kernels.map(
      (kernel) => {
        let value = 0;
        const sourceContributions =
          kernel.contributions.map(
            (contribution) => {
              const x =
                center.x +
                contribution.offsetX;
              const y =
                center.y +
                contribution.offsetY;
              if (
                x < 0 ||
                y < 0
              ) {
                throw new InvalidScientificInputError(
                  "RAW reconstruction kernel references a site outside the non-negative native sensor coordinate domain."
                );
              }
              const key =
                x +
                ":" +
                y +
                ":" +
                contribution
                  .sourceChannelId;
              const sample =
                sampleMap.get(key);
              if (
                sample ===
                undefined
              ) {
                throw new InvalidScientificInputError(
                  "RAW reconstruction neighborhood is missing a required site/channel contribution."
                );
              }

              value +=
                sample
                  .blackSubtractedNormalizedCode *
                contribution.weight;

              return {
                site: {
                  x,
                  y
                },
                sourceChannelId:
                  contribution
                    .sourceChannelId,
                weight:
                  contribution.weight,
                sourceValue:
                  sample
                    .blackSubtractedNormalizedCode
              };
            }
          );

        if (
          !Number.isFinite(value)
        ) {
          throw new InvalidScientificInputError(
            "Reconstructed linear channel value must remain finite."
          );
        }

        return {
          channelId:
            kernel.outputChannelId,
          linearBlackSubtractedNormalizedValue:
            value,
          sourceContributions
        };
      }
    );

  return approximationResult(
    {
      reconstructionProfileId:
        profile.profileId,
      reconstructionProfileVersion:
        profile.profileVersion,
      captureModeId:
        profile.captureModeId,
      colorSamplingProfileId:
        profile
          .colorSamplingProfileId,
      centerSite:
        center,
      outputChannels,
      method:
        "explicit-linear-native-neighborhood",
      cfaAware: true,
      captureModeAware:
        true,
      physicalOrientationApplied:
        false,
      outputRotationApplied:
        false,
      sharpeningApplied:
        false,
      denoisingApplied: false,
      aliasingModeled: false,
      moireModeled: false,
      preSamplingOpticalTransferAdequacyEstablished:
        false,
      reconstructionDoesNotModifyRawSamples:
        true
    },
    "sensor-raw-explicit-linear-reconstruction",
    "1.0.0",
    [
      "Reconstruction uses only explicitly declared linear native-neighborhood weights tied to exact capture-mode and color-sampling identities.",
      "No manufacturer-specific CFA algorithm or branded demosaic behavior is inferred from topology labels.",
      "RAW samples remain in invariant native sensor/CFA coordinates; physical orientation and final output rotation are downstream.",
      "Negative black-subtracted values are preserved through the linear reconstruction instead of being silently clamped.",
      "Sharpening and denoising are not part of RAW reconstruction.",
      "Aliasing and moire are explicitly not modeled because this reconstruction contract does not establish an adequate pre-sampling optical transfer/scene-frequency model."
    ]
  );
}
