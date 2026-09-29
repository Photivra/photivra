// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceBackedFact,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import {
  InvalidScientificInputError,
  requirePositiveInteger
} from "../core/validation.js";
import type {
  NativeImageRaster,
  RasterDimensions
} from "./sensor-geometry.js";

type UnknownRecord = Record<string, unknown>;

export type CaptureModeSampleCombinationDomain =
  | "charge-domain"
  | "post-conversion-digital";

export type CaptureModeReconstructionStage =
  | "remosaic"
  | "pixel-shift-combination"
  | "multi-frame-computational-combination";

export type CaptureModeDependency =
  | "color-sampling-model"
  | "mode-specific-readout-timing"
  | "radiometric-calibration"
  | "inter-frame-registration";

export interface CaptureModeSensorOffsetNativeSamples {
  /**
   * Horizontal sensor displacement in units of the native effective sampling
   * pitch. This is not a claim about physical photodiode pitch.
   */
  x: number;
  /**
   * Vertical sensor displacement in units of the native effective sampling
   * pitch. This is not a claim about physical photodiode pitch.
   */
  y: number;
}

export type SourcedCaptureModeFact<T> = EvidenceBackedFact<T>;

export interface SingleFrameCaptureAcquisition {
  kind: "single-frame";
}

export interface FixedMultiFrameCaptureAcquisition {
  kind: "fixed-multi-frame";
  frameCount: SourcedCaptureModeFact<number>;
}

export interface VariableMultiFrameCaptureAcquisition {
  kind: "variable-multi-frame";
  /**
   * Evidence that the mode is variable/multi-frame, even when exact count
   * bounds are not published.
   */
  evidence: readonly EvidenceProvenance[];
  minimumFrameCount?: SourcedCaptureModeFact<number>;
  maximumFrameCount?: SourcedCaptureModeFact<number>;
}

export type CaptureModeAcquisition =
  | SingleFrameCaptureAcquisition
  | FixedMultiFrameCaptureAcquisition
  | VariableMultiFrameCaptureAcquisition;

export interface NativeEffectiveCaptureSampling {
  kind: "native-effective-raster";
}

export interface GroupedNativeCaptureSampling {
  kind: "grouped-native-samples";
  groupWidthSamples: SourcedCaptureModeFact<number>;
  groupHeightSamples: SourcedCaptureModeFact<number>;
  /**
   * Omitted means unknown/unasserted. Do not infer where combination occurs
   * from the word "binning" or from the raster ratio.
   */
  combinationDomain?: SourcedCaptureModeFact<CaptureModeSampleCombinationDomain>;
}

export interface DeclaredEffectiveCaptureSampling {
  kind: "declared-effective-raster";
  /**
   * Per-frame effective sampling raster for a mode whose sampling relationship
   * to the native grid is not safely expressible as simple integer grouping.
   */
  raster: SourcedCaptureModeFact<RasterDimensions>;
}

export type CaptureModePerFrameSampling =
  | NativeEffectiveCaptureSampling
  | GroupedNativeCaptureSampling
  | DeclaredEffectiveCaptureSampling;

export interface CaptureModeDefinition {
  modeId: string;
  /**
   * Evidence supporting the existence/overall acquisition behavior of this
   * mode. Field-level facts below retain their own evidence when needed.
   */
  evidence: readonly EvidenceProvenance[];
  acquisition: CaptureModeAcquisition;
  perFrameSampling: CaptureModePerFrameSampling;
  /**
   * Optional ordered sensor-displacement sequence for fixed multi-frame modes.
   * The whole sequence is one evidence-backed fact because published mode
   * documentation commonly describes the sequence as a unit.
   */
  interFrameSensorOffsetsNativeSamples?: SourcedCaptureModeFact<
    readonly CaptureModeSensorOffsetNativeSamples[]
  >;
  /**
   * Ordered reconstruction/combination stages owned by later reconstruction
   * work. These labels reserve semantics; they do not implement algorithms.
   */
  reconstructionStages?: readonly SourcedCaptureModeFact<CaptureModeReconstructionStage>[];
  /**
   * Image raster produced by the capture-mode/reconstruction pipeline before
   * final output crop/resampling.
   *
   * This raster does not redefine physical sensor geometry or field of view.
   */
  processedImageRaster: SourcedCaptureModeFact<RasterDimensions>;
  /**
   * Explicit downstream scientific/model dependencies for this mode.
   */
  dependencies?: readonly CaptureModeDependency[];
}

export interface CaptureModeProfile {
  schemaVersion: "0.1.0";
  modes: readonly CaptureModeDefinition[];
}

export interface ResolveCaptureModeInput {
  nativeRaster: NativeImageRaster;
  profile: CaptureModeProfile;
  modeId: string;
}

export interface ResolvedCaptureMode {
  modeId: string;
  modeEvidence: readonly EvidenceProvenance[];
  nativeRaster: NativeImageRaster;
  nativeRasterSemantic:
    "effective-image-sampling-grid-not-photosite-count";
  acquisition:
    | {
        kind: "single-frame";
        frameCount: 1;
      }
    | {
        kind: "fixed-multi-frame";
        frameCount: SourcedCaptureModeFact<number>;
      }
    | {
        kind: "variable-multi-frame";
        evidence: readonly EvidenceProvenance[];
        minimumFrameCount?: SourcedCaptureModeFact<number>;
        maximumFrameCount?: SourcedCaptureModeFact<number>;
      };
  perFrameSampling:
    | {
        kind: "native-effective-raster";
        raster: NativeImageRaster;
      }
    | {
        kind: "grouped-native-samples";
        raster: RasterDimensions;
        groupWidthSamples: SourcedCaptureModeFact<number>;
        groupHeightSamples: SourcedCaptureModeFact<number>;
        combinationDomain?: SourcedCaptureModeFact<CaptureModeSampleCombinationDomain>;
      }
    | {
        kind: "declared-effective-raster";
        raster: SourcedCaptureModeFact<RasterDimensions>;
      };
  interFrameSensorOffsetsNativeSamples?: SourcedCaptureModeFact<
    readonly CaptureModeSensorOffsetNativeSamples[]
  >;
  reconstructionStages: readonly SourcedCaptureModeFact<CaptureModeReconstructionStage>[];
  processedImageRaster: SourcedCaptureModeFact<RasterDimensions>;
  processedImageMegapixels: number;
  dependencies: readonly CaptureModeDependency[];
  physicalSensorGeometryMutation: false;
  photositeCountInference:
    "not-permitted-from-native-or-processed-raster";
  finalOutputRasterOwnership:
    "downstream-capture-output-geometry";
}

const COMBINATION_DOMAINS =
  new Set<CaptureModeSampleCombinationDomain>([
    "charge-domain",
    "post-conversion-digital"
  ]);

const RECONSTRUCTION_STAGES =
  new Set<CaptureModeReconstructionStage>([
    "remosaic",
    "pixel-shift-combination",
    "multi-frame-computational-combination"
  ]);

const DEPENDENCIES = new Set<CaptureModeDependency>([
  "color-sampling-model",
  "mode-specific-readout-timing",
  "radiometric-calibration",
  "inter-frame-registration"
]);

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
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
  return value;
}

function requirePositiveSafeIntegerValue(
  value: unknown,
  path: string
): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new InvalidConfigurationError(
      path + " must be a positive safe integer."
    );
  }
  return value as number;
}

function parseIntegerFact(
  value: unknown,
  path: string
): SourcedCaptureModeFact<number> {
  const record = requireRecord(value, path);
  return {
    value: requirePositiveSafeIntegerValue(
      record.value,
      path + ".value"
    ),
    evidence: parseEvidenceList(
      record.evidence,
      path + ".evidence"
    )
  };
}

function parseRasterDimensions(
  value: unknown,
  path: string
): RasterDimensions {
  const record = requireRecord(value, path);
  const pixelWidth = requirePositiveSafeIntegerValue(
    record.pixelWidth,
    path + ".pixelWidth"
  );
  const pixelHeight = requirePositiveSafeIntegerValue(
    record.pixelHeight,
    path + ".pixelHeight"
  );
  const total = pixelWidth * pixelHeight;
  if (!Number.isSafeInteger(total)) {
    throw new InvalidConfigurationError(
      path + " total sample count must be a safe integer."
    );
  }
  return { pixelWidth, pixelHeight };
}

function parseRasterFact(
  value: unknown,
  path: string
): SourcedCaptureModeFact<RasterDimensions> {
  const record = requireRecord(value, path);
  return {
    value: parseRasterDimensions(
      record.value,
      path + ".value"
    ),
    evidence: parseEvidenceList(
      record.evidence,
      path + ".evidence"
    )
  };
}

function parseCombinationDomainFact(
  value: unknown,
  path: string
): SourcedCaptureModeFact<CaptureModeSampleCombinationDomain> {
  const record = requireRecord(value, path);
  if (
    typeof record.value !== "string" ||
    !COMBINATION_DOMAINS.has(
      record.value as CaptureModeSampleCombinationDomain
    )
  ) {
    throw new InvalidConfigurationError(
      path + ".value is invalid."
    );
  }
  return {
    value: record.value as CaptureModeSampleCombinationDomain,
    evidence: parseEvidenceList(
      record.evidence,
      path + ".evidence"
    )
  };
}

function parseAcquisition(
  value: unknown,
  path: string
): CaptureModeAcquisition {
  const record = requireRecord(value, path);

  if (record.kind === "single-frame") {
    if (
      record.frameCount !== undefined ||
      record.minimumFrameCount !== undefined ||
      record.maximumFrameCount !== undefined ||
      record.evidence !== undefined
    ) {
      throw new InvalidConfigurationError(
        path +
          " single-frame acquisition must omit frame-count and evidence fields."
      );
    }
    return { kind: "single-frame" };
  }

  if (record.kind === "fixed-multi-frame") {
    if (
      record.minimumFrameCount !== undefined ||
      record.maximumFrameCount !== undefined ||
      record.evidence !== undefined
    ) {
      throw new InvalidConfigurationError(
        path +
          " fixed-multi-frame acquisition must use frameCount only."
      );
    }
    const frameCount = parseIntegerFact(
      record.frameCount,
      path + ".frameCount"
    );
    if (frameCount.value < 2) {
      throw new InvalidConfigurationError(
        path +
          ".frameCount.value must be at least 2 for fixed-multi-frame acquisition."
      );
    }
    return {
      kind: "fixed-multi-frame",
      frameCount
    };
  }

  if (record.kind === "variable-multi-frame") {
    if (record.frameCount !== undefined) {
      throw new InvalidConfigurationError(
        path +
          ".frameCount must be omitted for variable-multi-frame acquisition."
      );
    }

    const evidence = parseEvidenceList(
      record.evidence,
      path + ".evidence"
    );
    const minimumFrameCount =
      record.minimumFrameCount === undefined
        ? undefined
        : parseIntegerFact(
            record.minimumFrameCount,
            path + ".minimumFrameCount"
          );
    const maximumFrameCount =
      record.maximumFrameCount === undefined
        ? undefined
        : parseIntegerFact(
            record.maximumFrameCount,
            path + ".maximumFrameCount"
          );

    if (
      minimumFrameCount !== undefined &&
      minimumFrameCount.value < 2
    ) {
      throw new InvalidConfigurationError(
        path +
          ".minimumFrameCount.value must be at least 2 for variable-multi-frame acquisition."
      );
    }
    if (
      maximumFrameCount !== undefined &&
      maximumFrameCount.value < 2
    ) {
      throw new InvalidConfigurationError(
        path +
          ".maximumFrameCount.value must be at least 2 for variable-multi-frame acquisition."
      );
    }
    if (
      minimumFrameCount !== undefined &&
      maximumFrameCount !== undefined &&
      minimumFrameCount.value > maximumFrameCount.value
    ) {
      throw new InvalidConfigurationError(
        path +
          ".minimumFrameCount.value must not exceed maximumFrameCount.value."
      );
    }

    return {
      kind: "variable-multi-frame",
      evidence,
      ...(minimumFrameCount === undefined
        ? {}
        : { minimumFrameCount }),
      ...(maximumFrameCount === undefined
        ? {}
        : { maximumFrameCount })
    };
  }

  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

function parsePerFrameSampling(
  value: unknown,
  path: string
): CaptureModePerFrameSampling {
  const record = requireRecord(value, path);

  if (record.kind === "native-effective-raster") {
    if (
      record.groupWidthSamples !== undefined ||
      record.groupHeightSamples !== undefined ||
      record.combinationDomain !== undefined ||
      record.raster !== undefined
    ) {
      throw new InvalidConfigurationError(
        path +
          " native-effective-raster sampling must omit grouping/raster fields."
      );
    }
    return { kind: "native-effective-raster" };
  }

  if (record.kind === "grouped-native-samples") {
    if (record.raster !== undefined) {
      throw new InvalidConfigurationError(
        path +
          ".raster must be omitted for grouped-native-samples sampling."
      );
    }

    return {
      kind: "grouped-native-samples",
      groupWidthSamples: parseIntegerFact(
        record.groupWidthSamples,
        path + ".groupWidthSamples"
      ),
      groupHeightSamples: parseIntegerFact(
        record.groupHeightSamples,
        path + ".groupHeightSamples"
      ),
      ...(record.combinationDomain === undefined
        ? {}
        : {
            combinationDomain:
              parseCombinationDomainFact(
                record.combinationDomain,
                path + ".combinationDomain"
              )
          })
    };
  }

  if (record.kind === "declared-effective-raster") {
    if (
      record.groupWidthSamples !== undefined ||
      record.groupHeightSamples !== undefined ||
      record.combinationDomain !== undefined
    ) {
      throw new InvalidConfigurationError(
        path +
          " declared-effective-raster sampling must omit grouping fields."
      );
    }

    return {
      kind: "declared-effective-raster",
      raster: parseRasterFact(
        record.raster,
        path + ".raster"
      )
    };
  }

  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
}

function parseOffsetsFact(
  value: unknown,
  path: string
): SourcedCaptureModeFact<
  readonly CaptureModeSensorOffsetNativeSamples[]
> {
  const record = requireRecord(value, path);
  if (
    !Array.isArray(record.value) ||
    record.value.length === 0
  ) {
    throw new InvalidConfigurationError(
      path + ".value must be a non-empty array."
    );
  }

  const offsets = record.value.map((entry, index) => {
    const item = requireRecord(
      entry,
      path + ".value[" + index + "]"
    );
    if (
      typeof item.x !== "number" ||
      !Number.isFinite(item.x) ||
      typeof item.y !== "number" ||
      !Number.isFinite(item.y)
    ) {
      throw new InvalidConfigurationError(
        path +
          ".value[" +
          index +
          "] x/y must be finite numbers."
      );
    }
    return {
      x: item.x,
      y: item.y
    };
  });

  return {
    value: offsets,
    evidence: parseEvidenceList(
      record.evidence,
      path + ".evidence"
    )
  };
}

function parseReconstructionStages(
  value: unknown,
  path: string
): readonly SourcedCaptureModeFact<CaptureModeReconstructionStage>[] {
  if (!Array.isArray(value)) {
    throw new InvalidConfigurationError(
      path + " must be an array."
    );
  }

  const stages = value.map((entry, index) => {
    const record = requireRecord(
      entry,
      path + "[" + index + "]"
    );
    if (
      typeof record.value !== "string" ||
      !RECONSTRUCTION_STAGES.has(
        record.value as CaptureModeReconstructionStage
      )
    ) {
      throw new InvalidConfigurationError(
        path + "[" + index + "].value is invalid."
      );
    }
    return {
      value: record.value as CaptureModeReconstructionStage,
      evidence: parseEvidenceList(
        record.evidence,
        path + "[" + index + "].evidence"
      )
    };
  });

  const values = stages.map((stage) => stage.value);
  if (new Set(values).size !== values.length) {
    throw new InvalidConfigurationError(
      path + " must not contain duplicate stages."
    );
  }

  return stages;
}

function parseDependencies(
  value: unknown,
  path: string
): readonly CaptureModeDependency[] {
  if (!Array.isArray(value)) {
    throw new InvalidConfigurationError(
      path + " must be an array."
    );
  }

  const dependencies = value.map((entry, index) => {
    if (
      typeof entry !== "string" ||
      !DEPENDENCIES.has(entry as CaptureModeDependency)
    ) {
      throw new InvalidConfigurationError(
        path + "[" + index + "] is invalid."
      );
    }
    return entry as CaptureModeDependency;
  });

  if (new Set(dependencies).size !== dependencies.length) {
    throw new InvalidConfigurationError(
      path + " must not contain duplicates."
    );
  }

  return dependencies;
}

function parseModeDefinition(
  value: unknown,
  path: string
): CaptureModeDefinition {
  const record = requireRecord(value, path);
  const modeId = requireNonEmptyString(
    record.modeId,
    path + ".modeId"
  );
  const acquisition = parseAcquisition(
    record.acquisition,
    path + ".acquisition"
  );
  const interFrameSensorOffsetsNativeSamples =
    record.interFrameSensorOffsetsNativeSamples === undefined
      ? undefined
      : parseOffsetsFact(
          record.interFrameSensorOffsetsNativeSamples,
          path + ".interFrameSensorOffsetsNativeSamples"
        );

  if (
    interFrameSensorOffsetsNativeSamples !== undefined &&
    acquisition.kind !== "fixed-multi-frame"
  ) {
    throw new InvalidConfigurationError(
      path +
        ".interFrameSensorOffsetsNativeSamples is supported only for fixed-multi-frame acquisition."
    );
  }

  if (
    interFrameSensorOffsetsNativeSamples !== undefined &&
    acquisition.kind === "fixed-multi-frame" &&
    interFrameSensorOffsetsNativeSamples.value.length !==
      acquisition.frameCount.value
  ) {
    throw new InvalidConfigurationError(
      path +
        ".interFrameSensorOffsetsNativeSamples.value length must equal acquisition.frameCount.value."
    );
  }

  return {
    modeId,
    evidence: parseEvidenceList(
      record.evidence,
      path + ".evidence"
    ),
    acquisition,
    perFrameSampling: parsePerFrameSampling(
      record.perFrameSampling,
      path + ".perFrameSampling"
    ),
    ...(interFrameSensorOffsetsNativeSamples === undefined
      ? {}
      : { interFrameSensorOffsetsNativeSamples }),
    reconstructionStages:
      record.reconstructionStages === undefined
        ? []
        : parseReconstructionStages(
            record.reconstructionStages,
            path + ".reconstructionStages"
          ),
    processedImageRaster: parseRasterFact(
      record.processedImageRaster,
      path + ".processedImageRaster"
    ),
    dependencies:
      record.dependencies === undefined
        ? []
        : parseDependencies(
            record.dependencies,
            path + ".dependencies"
          )
  };
}

/**
 * Parses a capture-mode profile without inferring sensor physics from output
 * resolution or marketing mode names.
 *
 * The profile is intentionally orthogonal: acquisition frame sequence,
 * per-frame sampling, optional inter-frame sensor shift, reconstruction stages,
 * processed raster and downstream dependencies are independent axes.
 */
export function parseCaptureModeProfile(
  value: unknown
): CaptureModeProfile {
  const profile = requireRecord(value, "captureModes");

  if (profile.schemaVersion !== "0.1.0") {
    throw new InvalidConfigurationError(
      'captureModes.schemaVersion must be "0.1.0".'
    );
  }

  if (
    !Array.isArray(profile.modes) ||
    profile.modes.length === 0
  ) {
    throw new InvalidConfigurationError(
      "captureModes.modes must be a non-empty array."
    );
  }

  const modes = profile.modes.map((mode, index) =>
    parseModeDefinition(
      mode,
      "captureModes.modes[" + index + "]"
    )
  );
  const ids = modes.map((mode) => mode.modeId);
  if (new Set(ids).size !== ids.length) {
    throw new InvalidConfigurationError(
      "captureModes.modes must not contain duplicate modeId values."
    );
  }

  return {
    schemaVersion: "0.1.0",
    modes
  };
}

function validateNativeRaster(
  raster: NativeImageRaster
): void {
  requirePositiveInteger(
    "nativeRaster.pixelWidth",
    raster.pixelWidth
  );
  requirePositiveInteger(
    "nativeRaster.pixelHeight",
    raster.pixelHeight
  );
  const total =
    raster.pixelWidth * raster.pixelHeight;
  if (!Number.isSafeInteger(total)) {
    throw new InvalidScientificInputError(
      "nativeRaster total image-sample count must be a safe integer."
    );
  }
}

function resolvePerFrameSampling(
  sampling: CaptureModePerFrameSampling,
  nativeRaster: NativeImageRaster
): ResolvedCaptureMode["perFrameSampling"] {
  if (sampling.kind === "native-effective-raster") {
    return {
      kind: "native-effective-raster",
      raster: { ...nativeRaster }
    };
  }

  if (sampling.kind === "declared-effective-raster") {
    return {
      kind: "declared-effective-raster",
      raster: {
        value: { ...sampling.raster.value },
        evidence: sampling.raster.evidence
      }
    };
  }

  const groupWidth = sampling.groupWidthSamples.value;
  const groupHeight = sampling.groupHeightSamples.value;

  if (
    nativeRaster.pixelWidth % groupWidth !== 0 ||
    nativeRaster.pixelHeight % groupHeight !== 0
  ) {
    throw new InvalidScientificInputError(
      "Grouped native sampling requires nativeRaster dimensions to be exactly divisible by the declared grouping factors."
    );
  }

  return {
    kind: "grouped-native-samples",
    raster: {
      pixelWidth:
        nativeRaster.pixelWidth / groupWidth,
      pixelHeight:
        nativeRaster.pixelHeight / groupHeight
    },
    groupWidthSamples: sampling.groupWidthSamples,
    groupHeightSamples: sampling.groupHeightSamples,
    ...(sampling.combinationDomain === undefined
      ? {}
      : {
          combinationDomain:
            sampling.combinationDomain
        })
  };
}

/**
 * Resolves one capture mode against the selected sensor's native effective
 * image-sampling raster.
 *
 * Resolution changes do not mutate physical sensor geometry. The returned
 * processed raster is pre-output geometry and must not be used to infer crop
 * factor, field of view or physical photosite count.
 */
export function resolveCaptureMode(
  input: ResolveCaptureModeInput
): ResolvedCaptureMode {
  validateNativeRaster(input.nativeRaster);
  const profile = parseCaptureModeProfile(input.profile);

  const mode = profile.modes.find(
    (candidate) => candidate.modeId === input.modeId
  );
  if (mode === undefined) {
    throw new InvalidScientificInputError(
      "modeId does not exist in the supplied capture-mode profile."
    );
  }

  const processedTotal =
    mode.processedImageRaster.value.pixelWidth *
    mode.processedImageRaster.value.pixelHeight;
  if (!Number.isSafeInteger(processedTotal)) {
    throw new InvalidScientificInputError(
      "processedImageRaster total image-sample count must be a safe integer."
    );
  }

  const acquisition: ResolvedCaptureMode["acquisition"] =
    mode.acquisition.kind === "single-frame"
      ? {
          kind: "single-frame",
          frameCount: 1
        }
      : mode.acquisition.kind === "fixed-multi-frame"
        ? {
            kind: "fixed-multi-frame",
            frameCount: mode.acquisition.frameCount
          }
        : {
            kind: "variable-multi-frame",
            evidence: mode.acquisition.evidence,
            ...(mode.acquisition.minimumFrameCount === undefined
              ? {}
              : {
                  minimumFrameCount:
                    mode.acquisition.minimumFrameCount
                }),
            ...(mode.acquisition.maximumFrameCount === undefined
              ? {}
              : {
                  maximumFrameCount:
                    mode.acquisition.maximumFrameCount
                })
          };

  return {
    modeId: mode.modeId,
    modeEvidence: mode.evidence,
    nativeRaster: { ...input.nativeRaster },
    nativeRasterSemantic:
      "effective-image-sampling-grid-not-photosite-count",
    acquisition,
    perFrameSampling: resolvePerFrameSampling(
      mode.perFrameSampling,
      input.nativeRaster
    ),
    ...(mode.interFrameSensorOffsetsNativeSamples === undefined
      ? {}
      : {
          interFrameSensorOffsetsNativeSamples:
            mode.interFrameSensorOffsetsNativeSamples
        }),
    reconstructionStages:
      mode.reconstructionStages ?? [],
    processedImageRaster: {
      value: {
        ...mode.processedImageRaster.value
      },
      evidence: mode.processedImageRaster.evidence
    },
    processedImageMegapixels:
      processedTotal / 1_000_000,
    dependencies: mode.dependencies ?? [],
    physicalSensorGeometryMutation: false,
    photositeCountInference:
      "not-permitted-from-native-or-processed-raster",
    finalOutputRasterOwnership:
      "downstream-capture-output-geometry"
  };
}
