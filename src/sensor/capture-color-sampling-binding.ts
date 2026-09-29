// SPDX-License-Identifier: Apache-2.0

import { InvalidConfigurationError } from "../core/configuration-error.js";
import {
  parseEvidenceList,
  type EvidenceProvenance
} from "../core/evidence-provenance.js";
import {
  InvalidScientificInputError,
  requirePositiveInteger
} from "../core/validation.js";
import {
  resolveCaptureMode,
  type CaptureModeProfile,
  type CaptureModeSampleCombinationDomain,
  type CaptureModeSensorOffsetNativeSamples,
  type SourcedCaptureModeFact
} from "./capture-mode.js";
import {
  parseSensorColorSamplingProfile,
  type SensorColorSamplingProfile
} from "./color-sampling.js";
import type { NativeImageRaster } from "./sensor-geometry.js";

type UnknownRecord = Record<string, unknown>;

export interface NativeEffectiveRasterColorSamplingBindingProfile {
  schemaVersion: "0.1.0";
  bindingId: string;
  colorSamplingProfileId: string;
  /**
   * Exact canonical native effective raster this binding was evidenced for.
   * The binding must not be reused against a different raster merely because
   * another sensor/mode has similar dimensions or a matching aspect ratio.
   */
  nativeRaster: NativeImageRaster;
  /**
   * Evidence supporting the native-effective-grid ↔ color-site-grid
   * relationship itself.
   *
   * Capture-mode and color-topology facts retain separate provenance.
   */
  evidence: readonly EvidenceProvenance[];
  relationship: {
    kind: "regular-native-effective-sample-blocks";
    /**
     * Number of abstract color-sampling sites spanned horizontally by one
     * native effective image sample.
     */
    sitesPerNativeSampleX: number;
    /**
     * Number of abstract color-sampling sites spanned vertically by one
     * native effective image sample.
     */
    sitesPerNativeSampleY: number;
    /**
     * Both grids are anchored to the same native sensor top-left.
     *
     * This keeps phase absolute across later active crops/orientation.
     */
    anchor: "shared-native-top-left";
  };
}

export interface ColorSamplingSiteGridDimensions {
  widthSites: number;
  heightSites: number;
}

export interface ResolvedNativeEffectiveRasterColorSamplingBinding {
  bindingId: string;
  colorSamplingProfileId: string;
  nativeRaster: NativeImageRaster;
  relationshipMeaning:
    | "one-native-effective-sample-to-one-color-site"
    | "one-native-effective-sample-to-rectangular-color-site-block";
  relationship: {
    kind: "regular-native-effective-sample-blocks";
    sitesPerNativeSampleX: number;
    sitesPerNativeSampleY: number;
    anchor: "shared-native-top-left";
  };
  colorSamplingSiteGrid: ColorSamplingSiteGridDimensions;
  totalColorSamplingSites: number;
  nativeImageRasterBindingEstablished: true;
  physicalPhotodiodeBindingEstablished: false;
  physicalPhotodiodeCountInference: "not-permitted";
  spectralResponseEstablished: false;
  componentEvidence: {
    binding: readonly EvidenceProvenance[];
    colorSamplingProfile: readonly EvidenceProvenance[];
  };
}

export interface NativeEffectiveSampleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColorSamplingSiteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureModeFullFrameSampleIndex {
  /**
   * Zero-based index in the selected mode's full-frame per-frame effective
   * sampling raster. Crop-local coordinates must be translated to absolute
   * full-frame mode indices before calling this API.
   */
  x: number;
  y: number;
}

export interface ColorSamplingChannelSiteCount {
  channelId: string;
  siteCount: number;
}

export type ColorSamplingChannelComposition =
  | {
      kind: "single-channel";
      channelId: string;
    }
  | {
      kind: "mixed-channels";
      channelIds: readonly string[];
    };

export interface GroupedCaptureModeSamplingAnchorDeclaration {
  anchor: "native-effective-raster-top-left";
  evidence: readonly EvidenceProvenance[];
}

export interface ResolveCaptureModeColorSamplingContributorsInput {
  nativeRaster: NativeImageRaster;
  captureModeProfile: CaptureModeProfile;
  modeId: string;
  colorSamplingProfile: SensorColorSamplingProfile;
  bindingProfile: NativeEffectiveRasterColorSamplingBindingProfile;
  modeSampleIndexFullFrame: CaptureModeFullFrameSampleIndex;
  /**
   * Required for grouped-native-samples modes because #68 declares grouping
   * factors but does not itself prove the grouping phase/origin.
   */
  groupedSamplingAnchor?: GroupedCaptureModeSamplingAnchorDeclaration;
}

export interface ResolvedCaptureModeColorSamplingContributors {
  modeId: string;
  modeSampleCoordinateSystem:
    "capture-mode-full-frame-effective-sample-index";
  modeSampleIndexFullFrame: CaptureModeFullFrameSampleIndex;
  modeSampleRaster: {
    pixelWidth: number;
    pixelHeight: number;
  };
  modeSamplingKind:
    | "native-effective-raster"
    | "grouped-native-samples";
  nativeEffectiveSampleRect: NativeEffectiveSampleRect;
  colorSamplingSiteRect: ColorSamplingSiteRect;
  colorSamplingSiteGrid: ColorSamplingSiteGridDimensions;
  totalContributorSites: number;
  channelSiteCounts: readonly ColorSamplingChannelSiteCount[];
  channelComposition: ColorSamplingChannelComposition;
  /**
   * Present only when the selected capture mode groups native effective
   * samples before producing one per-frame effective sample.
   */
  grouping:
    | {
        groupWidthSamples: SourcedCaptureModeFact<number>;
        groupHeightSamples: SourcedCaptureModeFact<number>;
        combinationDomain?: SourcedCaptureModeFact<CaptureModeSampleCombinationDomain>;
        anchor: "native-effective-raster-top-left";
        anchorEvidence: readonly EvidenceProvenance[];
      }
    | null;
  /**
   * Sensor-shift sequence remains attached to the sensor/capture mode.
   *
   * The sensor and its CFA move together, so these offsets must not be applied
   * as changes to color-site channel assignment.
   */
  interFrameSensorOffsetsNativeSamples?: SourcedCaptureModeFact<
    readonly CaptureModeSensorOffsetNativeSamples[]
  >;
  sensorShiftChangesColorSiteAssignment: false;
  sensorShiftOpticalRegistration:
    "outside-this-contract";
  signalCombinationWeightingEstablished: false;
  spectralResponseEstablished: false;
  physicalPhotodiodeBindingEstablished: false;
  physicalPhotodiodeCountInference: "not-permitted";
  componentEvidence: {
    binding: readonly EvidenceProvenance[];
    colorSamplingProfile: readonly EvidenceProvenance[];
    captureMode: readonly EvidenceProvenance[];
  };
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
  return value;
}

function requirePositiveSafeInteger(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new InvalidConfigurationError(
      path + " must be a positive safe integer."
    );
  }
  return value;
}

function safeProduct(
  values: readonly number[],
  path: string
): number {
  let result = 1;
  for (const value of values) {
    result *= value;
    if (!Number.isSafeInteger(result)) {
      throw new InvalidScientificInputError(
        path + " must remain a safe integer."
      );
    }
  }
  return result;
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
  safeProduct(
    [raster.pixelWidth, raster.pixelHeight],
    "nativeRaster total image-sample count"
  );
}

function requireFullFrameSampleIndex(
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
        " must be a non-negative safe integer full-frame mode sample index."
    );
  }
  return value;
}

/**
 * Parses the explicit relationship between the canonical native effective image
 * raster and the separate native sensor color-sampling-site lattice.
 *
 * This first binding supports only regular rectangular site blocks with a
 * shared native top-left anchor. Irregular mappings, sparse exceptions and
 * mode-specific declared-effective rasters require later explicit contracts.
 */
export function parseNativeEffectiveRasterColorSamplingBindingProfile(
  value: unknown
): NativeEffectiveRasterColorSamplingBindingProfile {
  const profile = requireRecord(
    value,
    "colorSamplingBinding"
  );

  if (profile.schemaVersion !== "0.1.0") {
    throw new InvalidConfigurationError(
      'colorSamplingBinding.schemaVersion must be "0.1.0".'
    );
  }

  const relationship = requireRecord(
    profile.relationship,
    "colorSamplingBinding.relationship"
  );

  if (
    relationship.kind !==
    "regular-native-effective-sample-blocks"
  ) {
    throw new InvalidConfigurationError(
      "colorSamplingBinding.relationship.kind is invalid."
    );
  }

  if (
    relationship.anchor !==
    "shared-native-top-left"
  ) {
    throw new InvalidConfigurationError(
      'colorSamplingBinding.relationship.anchor must be "shared-native-top-left".'
    );
  }

  return {
    schemaVersion: "0.1.0",
    bindingId: requireNonEmptyString(
      profile.bindingId,
      "colorSamplingBinding.bindingId"
    ),
    colorSamplingProfileId:
      requireNonEmptyString(
        profile.colorSamplingProfileId,
        "colorSamplingBinding.colorSamplingProfileId"
      ),
    nativeRaster: (() => {
      const nativeRaster = requireRecord(
        profile.nativeRaster,
        "colorSamplingBinding.nativeRaster"
      );
      const pixelWidth =
        requirePositiveSafeInteger(
          nativeRaster.pixelWidth,
          "colorSamplingBinding.nativeRaster.pixelWidth"
        );
      const pixelHeight =
        requirePositiveSafeInteger(
          nativeRaster.pixelHeight,
          "colorSamplingBinding.nativeRaster.pixelHeight"
        );
      safeProduct(
        [pixelWidth, pixelHeight],
        "colorSamplingBinding.nativeRaster total image-sample count"
      );
      return {
        pixelWidth,
        pixelHeight
      };
    })(),
    evidence: parseEvidenceList(
      profile.evidence,
      "colorSamplingBinding.evidence"
    ),
    relationship: {
      kind:
        "regular-native-effective-sample-blocks",
      sitesPerNativeSampleX:
        requirePositiveSafeInteger(
          relationship.sitesPerNativeSampleX,
          "colorSamplingBinding.relationship.sitesPerNativeSampleX"
        ),
      sitesPerNativeSampleY:
        requirePositiveSafeInteger(
          relationship.sitesPerNativeSampleY,
          "colorSamplingBinding.relationship.sitesPerNativeSampleY"
        ),
      anchor: "shared-native-top-left"
    }
  };
}

/**
 * Validates and resolves the sensor-level binding between NativeImageRaster and
 * an exact monochrome/periodic color-sampling topology.
 *
 * Matching dimensions are never treated as proof of a 1:1 relationship. The
 * relationship exists only because the caller supplied this evidence-backed
 * binding profile.
 */
export function resolveNativeEffectiveRasterColorSamplingBinding(
  input: {
    nativeRaster: NativeImageRaster;
    colorSamplingProfile: SensorColorSamplingProfile;
    bindingProfile: NativeEffectiveRasterColorSamplingBindingProfile;
  }
): ResolvedNativeEffectiveRasterColorSamplingBinding {
  validateNativeRaster(input.nativeRaster);

  const colorSamplingProfile =
    parseSensorColorSamplingProfile(
      input.colorSamplingProfile
    );
  const bindingProfile =
    parseNativeEffectiveRasterColorSamplingBindingProfile(
      input.bindingProfile
    );

  if (
    bindingProfile.colorSamplingProfileId !==
    colorSamplingProfile.profileId
  ) {
    throw new InvalidScientificInputError(
      "Binding colorSamplingProfileId must match colorSamplingProfile.profileId."
    );
  }

  if (
    bindingProfile.nativeRaster.pixelWidth !==
      input.nativeRaster.pixelWidth ||
    bindingProfile.nativeRaster.pixelHeight !==
      input.nativeRaster.pixelHeight
  ) {
    throw new InvalidScientificInputError(
      "Binding nativeRaster must exactly match the supplied canonical native effective raster."
    );
  }

  if (colorSamplingProfile.layout.kind === "layered") {
    throw new InvalidScientificInputError(
      "Layered color sampling cannot be bound to NativeImageRaster until its per-layer spatial sampling relationship is explicitly modeled."
    );
  }

  if (
    colorSamplingProfile.coordinateSystem !==
    "native-sensor-color-sampling-site-index"
  ) {
    throw new InvalidScientificInputError(
      "Resolvable color sampling binding requires the native sensor color-sampling-site coordinate system."
    );
  }

  const widthSites = safeProduct(
    [
      input.nativeRaster.pixelWidth,
      bindingProfile.relationship
        .sitesPerNativeSampleX
    ],
    "color-sampling site-grid width"
  );
  const heightSites = safeProduct(
    [
      input.nativeRaster.pixelHeight,
      bindingProfile.relationship
        .sitesPerNativeSampleY
    ],
    "color-sampling site-grid height"
  );
  const totalColorSamplingSites =
    safeProduct(
      [widthSites, heightSites],
      "color-sampling site-grid total site count"
    );

  const oneToOne =
    bindingProfile.relationship
      .sitesPerNativeSampleX === 1 &&
    bindingProfile.relationship
      .sitesPerNativeSampleY === 1;

  return {
    bindingId: bindingProfile.bindingId,
    colorSamplingProfileId:
      bindingProfile.colorSamplingProfileId,
    nativeRaster: {
      ...input.nativeRaster
    },
    relationshipMeaning: oneToOne
      ? "one-native-effective-sample-to-one-color-site"
      : "one-native-effective-sample-to-rectangular-color-site-block",
    relationship: {
      ...bindingProfile.relationship
    },
    colorSamplingSiteGrid: {
      widthSites,
      heightSites
    },
    totalColorSamplingSites,
    nativeImageRasterBindingEstablished: true,
    physicalPhotodiodeBindingEstablished: false,
    physicalPhotodiodeCountInference:
      "not-permitted",
    spectralResponseEstablished: false,
    componentEvidence: {
      binding: bindingProfile.evidence,
      colorSamplingProfile:
        colorSamplingProfile.evidence
    }
  };
}

function countResidueInRange(
  start: number,
  length: number,
  period: number,
  residue: number
): number {
  const startResidue = start % period;
  const delta =
    (residue - startResidue + period) %
    period;

  if (delta >= length) {
    return 0;
  }

  return (
    1 +
    Math.floor(
      (length - 1 - delta) / period
    )
  );
}

function channelCountsForSiteRect(
  profile: SensorColorSamplingProfile,
  rect: ColorSamplingSiteRect
): readonly ColorSamplingChannelSiteCount[] {
  const totalSites = safeProduct(
    [rect.width, rect.height],
    "color-sampling contributor site count"
  );

  if (profile.layout.kind === "layered") {
    throw new InvalidScientificInputError(
      "Layered color sampling does not have resolvable site contributors in schema 0.1.0."
    );
  }

  if (profile.layout.kind === "monochrome") {
    return [
      {
        channelId: profile.layout.channelId,
        siteCount: totalSites
      }
    ];
  }

  const counts =
    new Map<string, number>();

  for (
    let tileY = 0;
    tileY < profile.layout.repeatHeightSites;
    tileY += 1
  ) {
    const countY = countResidueInRange(
      rect.y,
      rect.height,
      profile.layout.repeatHeightSites,
      tileY
    );
    if (countY === 0) {
      continue;
    }

    for (
      let tileX = 0;
      tileX < profile.layout.repeatWidthSites;
      tileX += 1
    ) {
      const countX = countResidueInRange(
        rect.x,
        rect.width,
        profile.layout.repeatWidthSites,
        tileX
      );
      if (countX === 0) {
        continue;
      }

      const tileIndex =
        tileY *
          profile.layout.repeatWidthSites +
        tileX;
      const channelId =
        profile.layout.siteChannelIds[
          tileIndex
        ];

      if (channelId === undefined) {
        throw new InvalidScientificInputError(
          "Periodic color-sampling tile resolution failed while calculating contributor counts."
        );
      }

      const siteCount = safeProduct(
        [countX, countY],
        "per-channel contributor site count"
      );
      const prior = counts.get(channelId) ?? 0;
      const next = prior + siteCount;
      if (!Number.isSafeInteger(next)) {
        throw new InvalidScientificInputError(
          "Per-channel contributor site count must remain a safe integer."
        );
      }
      counts.set(channelId, next);
    }
  }

  const result = Array.from(
    counts,
    ([channelId, siteCount]) => ({
      channelId,
      siteCount
    })
  );
  const countedTotal = result.reduce(
    (sum, entry) => sum + entry.siteCount,
    0
  );

  if (countedTotal !== totalSites) {
    throw new InvalidScientificInputError(
      "Color-sampling contributor channel counts do not cover the complete contributor site rectangle."
    );
  }

  return result;
}

/**
 * Resolves which color-sampling sites structurally contribute to one selected
 * capture-mode effective sample.
 *
 * The mode sample index is always absolute in the selected mode's full-frame
 * per-frame raster. The API intentionally does not accept crop-local indices,
 * preventing active-crop origins from silently resetting CFA phase.
 *
 * For grouped-native-sample modes, the returned site rectangle covers all
 * native effective samples in the declared regular group. The engine reports
 * channel-site counts but never invents signal-combination weights, sum/average
 * semantics, spectral response or photon/electron values.
 *
 * Declared-effective-raster modes fail closed because #68 explicitly says
 * their relationship to the native effective grid is not safely expressible as
 * simple integer grouping.
 *
 * Inter-frame sensor shifts are preserved as capture-mode metadata only. The
 * sensor and CFA move together, so those offsets do not change site channel
 * assignment; their optical-registration effect belongs to a later spatial
 * sampling/image-formation contract.
 */
export function resolveCaptureModeColorSamplingContributors(
  input: ResolveCaptureModeColorSamplingContributorsInput
): ResolvedCaptureModeColorSamplingContributors {
  const colorSamplingProfile =
    parseSensorColorSamplingProfile(
      input.colorSamplingProfile
    );
  const binding =
    resolveNativeEffectiveRasterColorSamplingBinding(
      {
        nativeRaster: input.nativeRaster,
        colorSamplingProfile,
        bindingProfile: input.bindingProfile
      }
    );
  const captureMode = resolveCaptureMode({
    nativeRaster: input.nativeRaster,
    profile: input.captureModeProfile,
    modeId: input.modeId
  });

  if (
    !captureMode.dependencies.includes(
      "color-sampling-model"
    )
  ) {
    throw new InvalidScientificInputError(
      "Selected capture mode must declare the color-sampling-model dependency before color-site contributors can be resolved."
    );
  }

  const modeX = requireFullFrameSampleIndex(
    input.modeSampleIndexFullFrame.x,
    "modeSampleIndexFullFrame.x"
  );
  const modeY = requireFullFrameSampleIndex(
    input.modeSampleIndexFullFrame.y,
    "modeSampleIndexFullFrame.y"
  );

  if (
    captureMode.perFrameSampling.kind ===
    "declared-effective-raster"
  ) {
    throw new InvalidScientificInputError(
      "declared-effective-raster capture modes require a separate mode-specific color-site binding; no relationship may be inferred from raster dimensions alone."
    );
  }

  const modeSampleRaster =
    captureMode.perFrameSampling.raster;

  if (
    modeX >= modeSampleRaster.pixelWidth ||
    modeY >= modeSampleRaster.pixelHeight
  ) {
    throw new InvalidScientificInputError(
      "modeSampleIndexFullFrame must lie within the selected mode's full-frame per-frame sampling raster."
    );
  }

  let nativeEffectiveSampleRect:
    NativeEffectiveSampleRect;
  let grouping:
    ResolvedCaptureModeColorSamplingContributors["grouping"];

  if (
    captureMode.perFrameSampling.kind ===
    "native-effective-raster"
  ) {
    if (input.groupedSamplingAnchor !== undefined) {
      throw new InvalidScientificInputError(
        "groupedSamplingAnchor must be omitted for native-effective-raster capture modes."
      );
    }

    nativeEffectiveSampleRect = {
      x: modeX,
      y: modeY,
      width: 1,
      height: 1
    };
    grouping = null;
  } else {
    if (
      input.groupedSamplingAnchor === undefined ||
      input.groupedSamplingAnchor.anchor !==
        "native-effective-raster-top-left"
    ) {
      throw new InvalidScientificInputError(
        "grouped-native-samples capture modes require an explicit native-effective-raster-top-left grouping anchor declaration."
      );
    }
    const groupingAnchorEvidence =
      parseEvidenceList(
        input.groupedSamplingAnchor.evidence,
        "groupedSamplingAnchor.evidence"
      );

    const groupWidth =
      captureMode.perFrameSampling
        .groupWidthSamples.value;
    const groupHeight =
      captureMode.perFrameSampling
        .groupHeightSamples.value;

    nativeEffectiveSampleRect = {
      x: safeProduct(
        [modeX, groupWidth],
        "native effective sample rectangle x"
      ),
      y: safeProduct(
        [modeY, groupHeight],
        "native effective sample rectangle y"
      ),
      width: groupWidth,
      height: groupHeight
    };
    grouping = {
      groupWidthSamples:
        captureMode.perFrameSampling
          .groupWidthSamples,
      groupHeightSamples:
        captureMode.perFrameSampling
          .groupHeightSamples,
      ...(captureMode.perFrameSampling
        .combinationDomain === undefined
        ? {}
        : {
            combinationDomain:
              captureMode.perFrameSampling
                .combinationDomain
          }),
      anchor:
        "native-effective-raster-top-left",
      anchorEvidence:
        groupingAnchorEvidence
    };
  }

  const sitesPerNativeX =
    binding.relationship
      .sitesPerNativeSampleX;
  const sitesPerNativeY =
    binding.relationship
      .sitesPerNativeSampleY;

  const colorSamplingSiteRect:
    ColorSamplingSiteRect = {
      x: safeProduct(
        [
          nativeEffectiveSampleRect.x,
          sitesPerNativeX
        ],
        "color-sampling contributor rectangle x"
      ),
      y: safeProduct(
        [
          nativeEffectiveSampleRect.y,
          sitesPerNativeY
        ],
        "color-sampling contributor rectangle y"
      ),
      width: safeProduct(
        [
          nativeEffectiveSampleRect.width,
          sitesPerNativeX
        ],
        "color-sampling contributor rectangle width"
      ),
      height: safeProduct(
        [
          nativeEffectiveSampleRect.height,
          sitesPerNativeY
        ],
        "color-sampling contributor rectangle height"
      )
    };

  if (
    colorSamplingSiteRect.x +
      colorSamplingSiteRect.width >
      binding.colorSamplingSiteGrid.widthSites ||
    colorSamplingSiteRect.y +
      colorSamplingSiteRect.height >
      binding.colorSamplingSiteGrid.heightSites
  ) {
    throw new InvalidScientificInputError(
      "Resolved color-sampling contributor rectangle exceeds the bound color-site grid."
    );
  }

  const totalContributorSites =
    safeProduct(
      [
        colorSamplingSiteRect.width,
        colorSamplingSiteRect.height
      ],
      "total contributor site count"
    );
  const channelSiteCounts =
    channelCountsForSiteRect(
      colorSamplingProfile,
      colorSamplingSiteRect
    );

  const channelComposition:
    ColorSamplingChannelComposition =
    channelSiteCounts.length === 1
      ? {
          kind: "single-channel",
          channelId:
            channelSiteCounts[0]?.channelId ??
            ""
        }
      : {
          kind: "mixed-channels",
          channelIds:
            channelSiteCounts.map(
              (entry) => entry.channelId
            )
        };

  if (
    channelComposition.kind ===
      "single-channel" &&
    channelComposition.channelId.length === 0
  ) {
    throw new InvalidScientificInputError(
      "Resolved single-channel contributor set must contain a channel ID."
    );
  }

  return {
    modeId: captureMode.modeId,
    modeSampleCoordinateSystem:
      "capture-mode-full-frame-effective-sample-index",
    modeSampleIndexFullFrame: {
      x: modeX,
      y: modeY
    },
    modeSampleRaster: {
      ...modeSampleRaster
    },
    modeSamplingKind:
      captureMode.perFrameSampling.kind,
    nativeEffectiveSampleRect,
    colorSamplingSiteRect,
    colorSamplingSiteGrid: {
      ...binding.colorSamplingSiteGrid
    },
    totalContributorSites,
    channelSiteCounts,
    channelComposition,
    grouping,
    ...(captureMode
      .interFrameSensorOffsetsNativeSamples ===
    undefined
      ? {}
      : {
          interFrameSensorOffsetsNativeSamples:
            captureMode
              .interFrameSensorOffsetsNativeSamples
        }),
    sensorShiftChangesColorSiteAssignment:
      false,
    sensorShiftOpticalRegistration:
      "outside-this-contract",
    signalCombinationWeightingEstablished:
      false,
    spectralResponseEstablished: false,
    physicalPhotodiodeBindingEstablished:
      false,
    physicalPhotodiodeCountInference:
      "not-permitted",
    componentEvidence: {
      binding:
        binding.componentEvidence.binding,
      colorSamplingProfile:
        binding.componentEvidence
          .colorSamplingProfile,
      captureMode: captureMode.modeEvidence
    }
  };
}
