// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
 * missing required fields and incompatible scientific data fail at this boundary. Reconstruction
 * consumes explicitly bound native post-ADC samples and declared normalized channel kernels. Native
 * CFA phase is absolute and orientation/crop remain downstream. This structural linear reconstruction
 * does not infer spectral sensor primaries, calibrated color or a complete arbitrary demosaic
 * algorithm.
 * Commit one validated native RAW sample with exact site/channel/event identity for declared
 * reconstruction. Reconstruction consumes explicitly bound native post-ADC samples and declared
 * normalized channel kernels. Native CFA phase is absolute and orientation/crop remain downstream.
 * This structural linear reconstruction does not infer spectral sensor primaries, calibrated color or
 * a complete arbitrary demosaic algorithm.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { calculateEffectiveSaturationCode } from "../capture/raw-white-level.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  ResolvedCaptureModeColorSamplingContributors
} from "./capture-color-sampling-binding.js";
import {
  parseSensorColorSamplingProfile,
  resolveColorSamplingSite,
  type SensorColorSamplingProfile
} from "./color-sampling.js";
import type {
  SensorAdcIntegralNonLinearity,
  SensorRawCodeSample
} from "./raw-readout.js";
import type {
  SensorSpectralResponseScientificStatus
} from "./spectral-response.js";
import { requireInputObject } from "../core/record-validation.js";

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
  /**
   * The selected readout regime's declared ADC integral non-linearity, when it has one. The code
   * sample records INL only at its own code; the effective white level needs it at saturation.
   */
  adcIntegralNonLinearity?:
    SensorAdcIntegralNonLinearity;
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
  /** Full-saturation code from `calculateEffectiveSaturationCode`; constant per CFA phase. */
  effectiveSaturationCode: number;
  /** Regime system conversion gain, e⁻ per code (DNG NoiseProfile input). */
  systemConversionGainElectronsPerCode: number;
  /** sqrt of the summed squared regime read-noise RMS components, e⁻ (DNG NoiseProfile input). */
  readNoiseRmsElectrons: number;
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

export interface ResolveSensorRawReconstructionInput {
  profile:
    SensorRawReconstructionProfile;
  colorSamplingProfile:
    SensorColorSamplingProfile;
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

/**
 * Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
 * missing required fields and incompatible scientific data fail at this boundary.
 *
 * Reconstruction consumes explicitly bound native post-ADC samples and declared normalized channel
 * kernels. Native CFA phase is absolute and orientation/crop remain downstream. This structural linear
 * reconstruction does not infer spectral sensor primaries, calibrated color or a complete arbitrary
 * demosaic algorithm.
 * @param value - unknown. Treated as untrusted data; static typing alone is not validation.
 * @returns SensorRawReconstructionProfile. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
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

/**
 * Commit one validated native RAW sample with exact site/channel/event identity for declared
 * reconstruction.
 *
 * Reconstruction consumes explicitly bound native post-ADC samples and declared normalized channel
 * kernels. Native CFA phase is absolute and orientation/crop remain downstream. This structural linear
 * reconstruction does not infer spectral sensor primaries, calibrated color or a complete arbitrary
 * demosaic algorithm.
 * @param input - CreateSensorRawCaptureSampleInput. See the linked contract for coordinate, unit and profile binding semantics.
 * @returns SensorRawCaptureSample. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function createSensorRawCaptureSample(
  input:
    CreateSensorRawCaptureSampleInput
): SensorRawCaptureSample {
  requireInputObject(input, "createSensorRawCaptureSample input");
  const raw =
    input.rawCode;
  const contributors =
    input.contributors;

  requireInputObject(contributors, "contributors input");
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
      .colorSamplingProfileId !==
      raw.colorSamplingProfileId
  ) {
    throw new InvalidScientificInputError(
      "RAW readout color-sampling profile identity must match the capture-mode contributor binding."
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
    effectiveSaturationCode:
      calculateEffectiveSaturationCode(
        input.adcIntegralNonLinearity ===
          undefined
          ? raw
          : {
              ...raw,
              integralNonLinearity:
                input.adcIntegralNonLinearity
            }
      ),
    systemConversionGainElectronsPerCode:
      raw.systemConversionGainElectronsPerCode,
    readNoiseRmsElectrons:
      Math.sqrt(
        raw.electronicReadNoiseComponents.reduce(
          (sum, component) =>
            sum +
            component.rmsElectrons *
              component.rmsElectrons,
          0
        )
      ),
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

/**
 * Gather exactly supplied native channel contributions through explicit normalized kernels while
 * preserving CFA identity and signed black-subtracted values.
 *
 * Reconstruction consumes explicitly bound native post-ADC samples and declared normalized channel
 * kernels. Native CFA phase is absolute and orientation/crop remain downstream. This structural linear
 * reconstruction does not infer spectral sensor primaries, calibrated color or a complete arbitrary
 * demosaic algorithm.
 * @param input - ResolveSensorRawReconstructionInput. See the linked contract for coordinate, unit and profile binding semantics.
 * @returns CalculationResult<SensorRawReconstructedPixel>. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function resolveSensorRawReconstruction(
  input:
    ResolveSensorRawReconstructionInput
): CalculationResult<SensorRawReconstructedPixel> {
  requireInputObject(input, "resolveSensorRawReconstruction input");
  const profile =
    parseSensorRawReconstructionProfile(
      input.profile
    );
  const center =
    requireCenterSite(
      input.centerSite
    );
  const colorSamplingProfile =
    parseSensorColorSamplingProfile(
      input.colorSamplingProfile
    );
  if (
    colorSamplingProfile.profileId !==
    profile.colorSamplingProfileId
  ) {
    throw new InvalidScientificInputError(
      "Reconstruction color-sampling profile identity must match the reconstruction profile."
    );
  }

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
    const resolvedSite =
      resolveColorSamplingSite({
        profile:
          colorSamplingProfile,
        site:
          sample
            .colorSamplingSite
      });
    if (
      resolvedSite.mapping
        .channelId !==
      sample.channelId
    ) {
      throw new InvalidScientificInputError(
        "RAW neighborhood sample channelId must match the declared color-sampling topology at its native site."
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

  const outputChannels = profile.kernels.map(kernel => calculateRawReconstructionChannel(kernel, center, (x, y, channelId) => {
    const sample = sampleMap.get(x + ":" + y + ":" + channelId);
    if (sample === undefined) throw new InvalidScientificInputError("RAW reconstruction neighborhood is missing a required site/channel contribution.");
    return sample.blackSubtractedNormalizedCode;
  }));

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

/**
 * Internal prepared scalar accumulation; reference and packed execution share operation order.
 * With `mirrorBounds`, a contribution site outside the native frame is read at its whole-sample
 * (reflect-101) mirror image `reflectRawSiteIndex`; without it (the default) such a site fails closed.
 */
export function calculateRawReconstructionChannel(kernel: SensorRawReconstructionChannelKernel,
  center: {x:number;y:number}, read: (x:number,y:number,channelId:string)=>number,
  mirrorBounds?: {width:number;height:number}): SensorRawReconstructedPixel["outputChannels"][number] {
  let value = 0;
  const sourceContributions = kernel.contributions.map(contribution => {
    let x = center.x + contribution.offsetX, y = center.y + contribution.offsetY;
    if (mirrorBounds !== undefined) { x = reflectRawSiteIndex(x, mirrorBounds.width); y = reflectRawSiteIndex(y, mirrorBounds.height); }
    if (x < 0 || y < 0) throw new InvalidScientificInputError("RAW reconstruction kernel references a site outside the non-negative native sensor coordinate domain.");
    const sourceValue = read(x,y,contribution.sourceChannelId);
    value += sourceValue*contribution.weight;
    return {site:{x,y},sourceChannelId:contribution.sourceChannelId,weight:contribution.weight,sourceValue};
  });
  if (!Number.isFinite(value)) throw new InvalidScientificInputError("Reconstructed linear channel value must remain finite.");
  return {channelId:kernel.outputChannelId,linearBlackSubtractedNormalizedValue:value,sourceContributions};
}

// ------------------------------------------------------------------ built-in Bayer kernels and borders

/** How a reconstruction neighbourhood that leaves the native frame is handled. */
export type RawReconstructionBorderHandling = "reject" | "mirror";

/**
 * Whole-sample symmetric ("reflect-101") index: −1 → 1, −2 → 2, n → n−2. The edge site itself is
 * not repeated, so for a period-2 CFA (Bayer) every reflected site keeps the channel of the virtual
 * periodic site it replaces. Requires size ≥ 1; for size 1 every index maps to 0.
 */
export function reflectRawSiteIndex(index: number, size: number): number {
  if (index >= 0 && index < size) return index;
  if (size === 1) return 0;
  const period = 2 * size - 2, m = ((index % period) + period) % period;
  return m < size ? m : period - m;
}

/**
 * Internal: proves that mirror (reflect-101) border reads return the channel the periodic CFA would
 * place at every virtual site within `reach` of each frame edge, for every row/column phase. Mirroring
 * acts per axis, so per-axis checks over every phase also cover corners. Throws otherwise.
 */
export function validateMirrorBorderCfaConsistency(layout: { repeatWidthSites: number; repeatHeightSites: number;
  siteChannelIds: readonly string[] }, width: number, height: number, reach: number): void {
  const rw = layout.repeatWidthSites, rh = layout.repeatHeightSites, ids = layout.siteChannelIds;
  const at = (x: number, y: number): string => ids[(((y % rh) + rh) % rh) * rw + ((x % rw) + rw) % rw]!;
  if (reach >= width || reach >= height) {
    throw new InvalidConfigurationError("Mirror border handling requires a native frame larger than the kernel reach.");
  }
  for (let d = 1; d <= reach; d++) {
    for (let p = 0; p < Math.max(rw, rh); p++) {
      if (at(-d, p) !== at(reflectRawSiteIndex(-d, width), p) || at(width - 1 + d, p) !== at(reflectRawSiteIndex(width - 1 + d, width), p) ||
          at(p, -d) !== at(p, reflectRawSiteIndex(-d, height)) || at(p, height - 1 + d) !== at(p, reflectRawSiteIndex(height - 1 + d, height))) {
        throw new InvalidConfigurationError("Mirror border handling would change the CFA channel of a reflected site; this CFA/frame size needs reject handling or a smaller region.");
      }
    }
  }
}

/** Internal: largest absolute site offset of any contribution (the neighbourhood reach). */
export function rawReconstructionKernelReach(profiles: readonly { profile: SensorRawReconstructionProfile }[]): number {
  let reach = 0;
  for (const { profile } of profiles) for (const kernel of profile.kernels) for (const c of kernel.contributions) {
    reach = Math.max(reach, Math.abs(c.offsetX), Math.abs(c.offsetY));
  }
  return reach;
}

export type BuiltInBayerDemosaicKernel = "bilinear" | "malvar-he-cutler-2004";
export const BUILT_IN_BAYER_DEMOSAIC_MODEL_VERSION = "1.0.0" as const;

export interface CreateBuiltInBayerDemosaicProfilesInput {
  kernel: BuiltInBayerDemosaicKernel;
  /** Capture mode the RAW frame belongs to; copied into every phase profile. */
  captureModeId: string;
  /** Must be a 2×2 periodic Bayer mosaic: one red, one blue and two diagonal green sites. */
  colorSamplingProfile: SensorColorSamplingProfile;
  /** CFA channel ids playing the red, green and blue roles; also the output channel order. */
  channelRoles: { red: string; green: string; blue: string };
}

export interface BuiltInBayerDemosaicProfiles {
  kernel: BuiltInBayerDemosaicKernel;
  /** One profile per absolute CFA phase, row-major (`phaseY`, then `phaseX`). */
  phaseProfiles: { phaseX: number; phaseY: number; profile: SensorRawReconstructionProfile }[];
  outputChannelIds: [string, string, string];
  /** Largest |offset| of any contribution: 1 for bilinear, 2 for Malvar–He–Cutler. */
  kernelReachSites: number;
}

type BayerRole = "R" | "G" | "B";
type BayerTap = readonly [dx: number, dy: number, role: BayerRole, weight: number];
const CROSS1 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const, CROSS2 = [[2, 0], [-2, 0], [0, 2], [0, -2]] as const;
const DIAG1 = [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const;
function bayerTaps(points: readonly (readonly [number, number])[], role: BayerRole, weight: number): BayerTap[] {
  return points.map(([x, y]) => [x, y, role, weight] as const);
}

/**
 * Kernels at one site kind. `own` is the site's channel; `horizontal` is the chroma channel on the same
 * row for a green site. Bilinear: average of the nearest same-channel sites. Malvar–He–Cutler (ICASSP
 * 2004): bilinear estimate plus a gain-scaled discrete Laplacian of the site's own channel, with gains
 * α = 1/2 (green at red/blue), β = 5/8 (red/blue at green) and γ = 3/4 (red at blue / blue at red).
 * Every kernel sums to one and reproduces affine channel signals exactly.
 */
function bayerSiteKernels(kernel: BuiltInBayerDemosaicKernel, own: BayerRole, horizontal: BayerRole | null): Record<BayerRole, BayerTap[]> {
  const mhc = kernel === "malvar-he-cutler-2004";
  if (own !== "G") {
    const other: BayerRole = own === "R" ? "B" : "R";
    const green: BayerTap[] = mhc ? [[0, 0, own, 4 / 8], ...bayerTaps(CROSS1, "G", 2 / 8), ...bayerTaps(CROSS2, own, -1 / 8)] : bayerTaps(CROSS1, "G", 1 / 4);
    const opposite: BayerTap[] = mhc ? [[0, 0, own, 6 / 8], ...bayerTaps(DIAG1, other, 2 / 8), ...bayerTaps(CROSS2, own, -3 / 16)] : bayerTaps(DIAG1, other, 1 / 4);
    const result = { G: green } as Record<BayerRole, BayerTap[]>;
    result[own] = [[0, 0, own, 1]]; result[other] = opposite;
    return result;
  }
  const h = horizontal!, v: BayerRole = h === "R" ? "B" : "R";
  const along = (role: BayerRole, horizontalAxis: boolean): BayerTap[] => {
    const near = horizontalAxis ? [[1, 0], [-1, 0]] as const : [[0, 1], [0, -1]] as const;
    const far = horizontalAxis ? [[2, 0], [-2, 0]] as const : [[0, 2], [0, -2]] as const;
    const across = horizontalAxis ? [[0, 2], [0, -2]] as const : [[2, 0], [-2, 0]] as const;
    return mhc ? [[0, 0, "G", 5 / 8], ...bayerTaps(near, role, 4 / 8), ...bayerTaps(DIAG1, "G", -1 / 8), ...bayerTaps(far, "G", -1 / 8),
      ...bayerTaps(across, "G", 1 / 16)] : bayerTaps(near, role, 1 / 2);
  };
  const identity: BayerTap[] = [[0, 0, "G", 1]];
  const result = { G: identity } as Record<BayerRole, BayerTap[]>;
  result[h] = along(h, true); result[v] = along(v, false);
  return result;
}

const BAYER_DEMOSAIC_EVIDENCE: Readonly<Record<BuiltInBayerDemosaicKernel, readonly EvidenceProvenance[]>> = {
  bilinear: [{ sourceOrigin: "third-party", reuseStatus: "factual-reference-only",
    sourceReference: "Gunturk, Glotzbach, Altunbasak, Schafer & Mersereau, Demosaicking: color filter array interpolation, IEEE Signal Processing Magazine 22(1), 2005",
    note: "Bilinear interpolation of each Bayer channel from its nearest same-channel sites; weights derived in Photivra from that published definition." }],
  "malvar-he-cutler-2004": [{ sourceOrigin: "third-party", reuseStatus: "factual-reference-only",
    sourceReference: "Malvar, He & Cutler, High-quality linear interpolation for demosaicing of Bayer-patterned color images, Proc. IEEE ICASSP 2004, vol. 3, pp. 485-488",
    note: "5x5 gradient-corrected linear filters rebuilt in Photivra from the published gains alpha=1/2, beta=5/8, gamma=3/4 and Laplacian correction structure." }]
};

/**
 * Builds the explicit per-phase linear reconstruction profiles of a built-in Bayer demosaic kernel:
 * bilinear, or the Malvar–He–Cutler (2004) gradient-corrected 5×5 linear filters. The result is the
 * ordinary `explicit-linear-native-neighborhood` contract consumed by RAW frame reconstruction, native
 * RAW development and `createCfaPlaneReconstructionTask`, so it gains no special execution path. Edge
 * pixels need either a region whose neighbourhood stays inside the frame or mirror border handling.
 *
 * Approximation: fixed linear interpolation, not a calibrated or adaptive demosaic. Bilinear blurs
 * and zippers at edges; Malvar–He–Cutler reduces but does not remove colour fringes. Aliasing and
 * moiré are not modelled.
 */
export function createBuiltInBayerDemosaicProfiles(input: CreateBuiltInBayerDemosaicProfilesInput): CalculationResult<BuiltInBayerDemosaicProfiles> {
  requireInputObject(input, "createBuiltInBayerDemosaicProfiles input");
  const kernel = input.kernel;
  if (kernel !== "bilinear" && kernel !== "malvar-he-cutler-2004") throw new InvalidConfigurationError("Unknown built-in Bayer demosaic kernel.");
  const captureModeId = requireNonEmptyString(input.captureModeId, "captureModeId");
  const cfa = parseSensorColorSamplingProfile(input.colorSamplingProfile), layout = cfa.layout;
  const roles = requireRecord(input.channelRoles, "channelRoles");
  const ids: Record<BayerRole, string> = { R: requireNonEmptyString(roles.red, "channelRoles.red"),
    G: requireNonEmptyString(roles.green, "channelRoles.green"), B: requireNonEmptyString(roles.blue, "channelRoles.blue") };
  if (new Set(Object.values(ids)).size !== 3) throw new InvalidConfigurationError("channelRoles must name three distinct channels.");
  if (layout.kind !== "periodic-mosaic" || layout.repeatWidthSites !== 2 || layout.repeatHeightSites !== 2) {
    throw new InvalidScientificInputError("Built-in Bayer kernels require a 2×2 periodic mosaic.");
  }
  const tile = layout.siteChannelIds.map((id): BayerRole => {
    const found = (["R", "G", "B"] as const).find((r) => ids[r] === id);
    if (found === undefined) throw new InvalidScientificInputError("Bayer CFA channel is not one of channelRoles.");
    return found;
  });
  const red = tile.indexOf("R"), blue = tile.indexOf("B");
  if (tile.filter((r) => r === "G").length !== 2 || red < 0 || blue < 0 || red + blue !== 3) {
    throw new InvalidScientificInputError("Built-in Bayer kernels require one red, one blue and two diagonal green sites.");
  }
  const phaseProfiles = [0, 1, 2, 3].map((i) => {
    const phaseX = i % 2, phaseY = (i - phaseX) / 2, own = tile[i]!;
    const byRole = bayerSiteKernels(kernel, own, own === "G" ? tile[phaseY * 2 + (1 - phaseX)]! : null);
    const profile = parseSensorRawReconstructionProfile({
      schemaVersion: SENSOR_RAW_RECONSTRUCTION_PROFILE_SCHEMA_VERSION, profileId: "photivra-builtin-" + kernel + "-phase-" + phaseX + "-" + phaseY,
      profileVersion: BUILT_IN_BAYER_DEMOSAIC_MODEL_VERSION, captureModeId, colorSamplingProfileId: cfa.profileId, scientificStatus: "approximation",
      method: "explicit-linear-native-neighborhood", normalization: "weights-sum-to-one-per-output-channel", negativeBlackSubtractedValuesAllowed: true,
      kernels: (["R", "G", "B"] as const).map((r) => ({ outputChannelId: ids[r], contributions: byRole[r].map(([offsetX, offsetY, source, weight]) =>
        ({ offsetX, offsetY, sourceChannelId: ids[source], weight })) })),
      evidence: BAYER_DEMOSAIC_EVIDENCE[kernel].map((e) => ({ ...e })),
      limitations: ["Fixed linear Bayer interpolation; not adaptive, calibrated or manufacturer-specific.", "Aliasing, moire and colour fringing are not modelled or suppressed."]
    });
    return { phaseX, phaseY, profile };
  });
  return approximationResult({ kernel, phaseProfiles, outputChannelIds: [ids.R, ids.G, ids.B], kernelReachSites: kernel === "bilinear" ? 1 : 2 },
    "built-in-bayer-demosaic-" + kernel, BUILT_IN_BAYER_DEMOSAIC_MODEL_VERSION, [
      kernel === "bilinear" ? "Nearest same-channel bilinear interpolation." :
        "Malvar–He–Cutler (2004) gradient-corrected linear interpolation: gains 1/2, 5/8, 3/4 on the own-channel Laplacian.",
      "Weights sum to one per output channel and reproduce affine channel signals exactly.",
      "Linear kernels only; adaptive (edge-directed) reconstruction is a separate non-linear path."
    ]);
}
