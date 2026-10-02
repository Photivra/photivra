// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
 * missing required fields and incompatible scientific data fail at this boundary. Sampled lens PSF
 * shapes bind exact generic optical state, field, wavelength and signed defocus support. Interpolation
 * stays within declared applicability and preserves normalized shape separately from throughput.
 * MTF-only data lacks phase/spatial information and does not authorize rendering a unique PSF.
 * Resolve the bounded sampled PSF for a declared optical state and support point without extrapolation
 * or silently inventing missing dimensions. Sampled lens PSF shapes bind exact generic optical state,
 * field, wavelength and signed defocus support. Interpolation stays within declared applicability and
 * preserves normalized shape separately from throughput. MTF-only data lacks phase/spatial information
 * and does not authorize rendering a unique PSF.
 * @see docs/PSF_FOUNDATION.md for equations, coordinate/unit conventions, blockers and support limits.
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
import {
  parseFocusPlane,
  type FocusPlane
} from "./focus-state.js";

type UnknownRecord = Record<string, unknown>;

export const LENS_SAMPLED_PSF_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;
export const LENS_MTF_DIAGNOSTIC_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;

export type LensPsfScientificStatus =
  | "calibrated"
  | "approximation";

export type LensPsfUncertainty =
  | {
      kind: "relative";
      fraction: number;
      basis: string;
    }
  | {
      kind: "not-quantified";
      limitation: string;
    };

export interface LensPsfKernel {
  widthSamples: number;
  heightSamples: number;
  samplePitchMicrometersX: number;
  samplePitchMicrometersY: number;
  centerSampleX: number;
  centerSampleY: number;
  normalizedIntensity:
    readonly number[];
}

export interface LensPsfGridAxes {
  focalLengthMm:
    readonly number[];
  focusDiopters:
    readonly number[];
  apertureFNumber:
    readonly number[];
  fieldXmm:
    readonly number[];
  fieldYmm:
    readonly number[];
  wavelengthNm:
    readonly number[];
  signedDefocusImagePlaneMicrometers:
    readonly number[];
}

export interface LensSampledPsfGridCoordinate {
  focalLengthMm: number;
  focusDiopters: number;
  apertureFNumber: number;
  fieldXmm: number;
  fieldYmm: number;
  wavelengthNm: number;
  signedDefocusImagePlaneMicrometers:
    number;
}

export interface LensSampledPsfGridNode {
  nodeId: string;
  coordinate:
    LensSampledPsfGridCoordinate;
  kernel: LensPsfKernel;
  bestFocusImagePlaneOffsetMicrometers:
    number;
  relativePupilThroughputFactor:
    number;
  evidence:
    readonly EvidenceProvenance[];
  uncertainty:
    LensPsfUncertainty;
}

export interface LensSampledPsfProfile {
  schemaVersion:
    typeof LENS_SAMPLED_PSF_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus:
    LensPsfScientificStatus;
  opticalDomain:
    "lens-primary-optical-path-only";
  coordinateSystem:
    "image-plane-metric";
  fieldAxes:
    "+X right, +Y up";
  kernelEnergyNormalization:
    "unit-energy-shape";
  interpolation:
    "bounded-regular-grid-multilinear";
  throughputOwnership:
    "separate-relative-pupil-throughput-factor";
  responseIncludes: {
    diffraction: boolean;
    aberration: boolean;
    defocus: boolean;
    pupilClippingShape:
      boolean;
  };
  sensorOpticalStackIncluded:
    false;
  sensorSamplingIncluded:
    false;
  reconstructionIncluded:
    false;
  strayLightIncluded: false;
  axes: LensPsfGridAxes;
  nodes:
    readonly LensSampledPsfGridNode[];
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface ResolveLensSampledPsfInput {
  profile:
    LensSampledPsfProfile;
  focalLengthMm: number;
  focus: FocusPlane;
  apertureFNumber: number;
  fieldPointMm: {
    x: number;
    y: number;
  };
  wavelengthNm: number;
  signedDefocusImagePlaneMicrometers:
    number;
}

export interface ResolvedLensSampledPsf {
  profileId: string;
  profileVersion: string;
  scientificStatus:
    LensPsfScientificStatus;
  resolutionStatus:
    | "exact-grid-sample"
    | "interpolated";
  coordinate:
    LensSampledPsfGridCoordinate;
  focus: FocusPlane;
  kernel: LensPsfKernel;
  bestFocusImagePlaneOffsetMicrometers:
    number;
  relativePupilThroughputFactor:
    number;
  sourceNodes:
    readonly {
      nodeId: string;
      weight: number;
      evidence:
        readonly EvidenceProvenance[];
      uncertainty:
        LensPsfUncertainty;
    }[];
  responseIncludes:
    LensSampledPsfProfile["responseIncludes"];
  throughputOwnership:
    "separate-relative-pupil-throughput-factor";
  longitudinalChromaticFocusMayVaryWithWavelength:
    true;
  fieldCurvatureMayVaryWithFieldPosition:
    true;
  geometricDistortionModified:
    false;
  lateralChromaticPositionShiftApplied:
    false;
  sensorOpticalStackIncluded:
    false;
  sensorSamplingIncluded: false;
  reconstructionIncluded: false;
  strayLightIncluded: false;
  scalarSharpnessScoreProduced:
    false;
}

export interface LensMtfDiagnosticSample {
  spatialFrequencyCyclesPerMm:
    number;
  sagittalMagnitude: number;
  tangentialMagnitude: number;
}

export interface LensMtfDiagnosticProfile {
  schemaVersion:
    typeof LENS_MTF_DIAGNOSTIC_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  opticalDomain:
    "lens-primary-optical-path-only";
  phaseInformationAvailable:
    false;
  magnitudeMeaning:
    "mtf-magnitude-only";
  fieldPointMm: {
    x: number;
    y: number;
  };
  focalLengthMm: number;
  focus: FocusPlane;
  apertureFNumber: number;
  wavelengthNm: number | null;
  samples:
    readonly LensMtfDiagnosticSample[];
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}

export interface MtfOnlyPsfRenderabilityAssessment {
  profileId: string;
  psfReconstructionAuthorized:
    false;
  reason:
    "mtf-magnitude-lacks-phase-and-does-not-uniquely-determine-psf";
  diagnosticUseAuthorized: true;
}

interface AxisBracket {
  lower: number;
  upper: number;
  fraction: number;
  exact: boolean;
}

interface WeightedNode {
  node:
    LensSampledPsfGridNode;
  weight: number;
}

const AXIS_KEYS = [
  "focalLengthMm",
  "focusDiopters",
  "apertureFNumber",
  "fieldXmm",
  "fieldYmm",
  "wavelengthNm",
  "signedDefocusImagePlaneMicrometers"
] as const;

type AxisKey =
  typeof AXIS_KEYS[number];

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

function requireNonNegativeFinite(
  value: unknown,
  path: string
): number {
  const parsed =
    requireFinite(value, path);
  if (parsed < 0) {
    throw new InvalidConfigurationError(
      path +
        " must be greater than or equal to zero."
    );
  }
  return parsed;
}

function requireUnitInterval(
  value: unknown,
  path: string
): number {
  const parsed =
    requireFinite(value, path);
  if (
    parsed < 0 ||
    parsed > 1
  ) {
    throw new InvalidConfigurationError(
      path +
        " must lie from zero through one."
    );
  }
  return parsed;
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
      path +
        " must be a positive safe integer."
    );
  }
  return value;
}

function requireNonNegativeSafeInteger(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new InvalidConfigurationError(
      path +
        " must be a non-negative safe integer."
    );
  }
  return value;
}

function parseStatus(
  value: unknown,
  path: string
): LensPsfScientificStatus {
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

function parseUncertainty(
  value: unknown,
  path: string
): LensPsfUncertainty {
  const record =
    requireRecord(value, path);
  if (record.kind === "relative") {
    return {
      kind: "relative",
      fraction:
        requireNonNegativeFinite(
          record.fraction,
          path + ".fraction"
        ),
      basis:
        requireNonEmptyString(
          record.basis,
          path + ".basis"
        )
    };
  }
  if (
    record.kind ===
    "not-quantified"
  ) {
    return {
      kind: "not-quantified",
      limitation:
        requireNonEmptyString(
          record.limitation,
          path +
            ".limitation"
        )
    };
  }
  throw new InvalidConfigurationError(
    path + ".kind is invalid."
  );
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
    value.map(
      (entry, index) =>
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

function parseAxis(
  value: unknown,
  path: string,
  options: {
    positive?: boolean;
    nonNegative?: boolean;
  } = {}
): readonly number[] {
  if (
    !Array.isArray(value) ||
    value.length === 0
  ) {
    throw new InvalidConfigurationError(
      path +
        " must be a non-empty array."
    );
  }
  const parsed =
    value.map(
      (entry, index) => {
        const itemPath =
          path +
          "[" +
          index +
          "]";
        if (options.positive) {
          return requirePositiveFinite(
            entry,
            itemPath
          );
        }
        if (
          options.nonNegative
        ) {
          return requireNonNegativeFinite(
            entry,
            itemPath
          );
        }
        return requireFinite(
          entry,
          itemPath
        );
      }
    );
  for (
    let index = 1;
    index < parsed.length;
    index += 1
  ) {
    if (
      parsed[index]! <=
      parsed[index - 1]!
    ) {
      throw new InvalidConfigurationError(
        path +
          " must be strictly increasing with unique values."
      );
    }
  }
  return parsed;
}

function parseKernel(
  value: unknown,
  path: string
): LensPsfKernel {
  const record =
    requireRecord(value, path);
  const widthSamples =
    requirePositiveSafeInteger(
      record.widthSamples,
      path + ".widthSamples"
    );
  const heightSamples =
    requirePositiveSafeInteger(
      record.heightSamples,
      path + ".heightSamples"
    );
  const total =
    widthSamples *
    heightSamples;
  if (!Number.isSafeInteger(total)) {
    throw new InvalidConfigurationError(
      path +
        " sample count must remain a safe integer."
    );
  }
  const centerSampleX =
    requireNonNegativeSafeInteger(
      record.centerSampleX,
      path + ".centerSampleX"
    );
  const centerSampleY =
    requireNonNegativeSafeInteger(
      record.centerSampleY,
      path + ".centerSampleY"
    );
  if (
    centerSampleX >=
      widthSamples ||
    centerSampleY >=
      heightSamples
  ) {
    throw new InvalidConfigurationError(
      path +
        " center sample must lie within the kernel grid."
    );
  }
  if (
    !Array.isArray(
      record.normalizedIntensity
    ) ||
    record
      .normalizedIntensity
      .length !== total
  ) {
    throw new InvalidConfigurationError(
      path +
        ".normalizedIntensity length must equal widthSamples × heightSamples."
    );
  }
  const normalizedIntensity =
    record
      .normalizedIntensity
      .map(
        (entry, index) =>
          requireNonNegativeFinite(
            entry,
            path +
              ".normalizedIntensity[" +
              index +
              "]"
          )
      );
  const sum =
    normalizedIntensity.reduce(
      (acc, entry) =>
        acc + entry,
      0
    );
  if (
    !Number.isFinite(sum) ||
    Math.abs(sum - 1) >
      1e-10
  ) {
    throw new InvalidConfigurationError(
      path +
        ".normalizedIntensity must sum to one."
    );
  }

  return {
    widthSamples,
    heightSamples,
    samplePitchMicrometersX:
      requirePositiveFinite(
        record
          .samplePitchMicrometersX,
        path +
          ".samplePitchMicrometersX"
      ),
    samplePitchMicrometersY:
      requirePositiveFinite(
        record
          .samplePitchMicrometersY,
        path +
          ".samplePitchMicrometersY"
      ),
    centerSampleX,
    centerSampleY,
    normalizedIntensity
  };
}

function parseAxes(
  value: unknown
): LensPsfGridAxes {
  const record =
    requireRecord(
      value,
      "lensPsfProfile.axes"
    );
  return {
    focalLengthMm:
      parseAxis(
        record.focalLengthMm,
        "lensPsfProfile.axes.focalLengthMm",
        {
          positive: true
        }
      ),
    focusDiopters:
      parseAxis(
        record.focusDiopters,
        "lensPsfProfile.axes.focusDiopters",
        {
          nonNegative: true
        }
      ),
    apertureFNumber:
      parseAxis(
        record.apertureFNumber,
        "lensPsfProfile.axes.apertureFNumber",
        {
          positive: true
        }
      ),
    fieldXmm:
      parseAxis(
        record.fieldXmm,
        "lensPsfProfile.axes.fieldXmm"
      ),
    fieldYmm:
      parseAxis(
        record.fieldYmm,
        "lensPsfProfile.axes.fieldYmm"
      ),
    wavelengthNm:
      parseAxis(
        record.wavelengthNm,
        "lensPsfProfile.axes.wavelengthNm",
        {
          positive: true
        }
      ),
    signedDefocusImagePlaneMicrometers:
      parseAxis(
        record
          .signedDefocusImagePlaneMicrometers,
        "lensPsfProfile.axes.signedDefocusImagePlaneMicrometers"
      )
  };
}

function parseCoordinate(
  value: unknown,
  path: string
): LensSampledPsfGridCoordinate {
  const record =
    requireRecord(value, path);
  return {
    focalLengthMm:
      requirePositiveFinite(
        record.focalLengthMm,
        path + ".focalLengthMm"
      ),
    focusDiopters:
      requireNonNegativeFinite(
        record.focusDiopters,
        path + ".focusDiopters"
      ),
    apertureFNumber:
      requirePositiveFinite(
        record.apertureFNumber,
        path +
          ".apertureFNumber"
      ),
    fieldXmm:
      requireFinite(
        record.fieldXmm,
        path + ".fieldXmm"
      ),
    fieldYmm:
      requireFinite(
        record.fieldYmm,
        path + ".fieldYmm"
      ),
    wavelengthNm:
      requirePositiveFinite(
        record.wavelengthNm,
        path + ".wavelengthNm"
      ),
    signedDefocusImagePlaneMicrometers:
      requireFinite(
        record
          .signedDefocusImagePlaneMicrometers,
        path +
          ".signedDefocusImagePlaneMicrometers"
      )
  };
}

function coordinateKey(
  coordinate:
    LensSampledPsfGridCoordinate
): string {
  return AXIS_KEYS.map(
    (key) =>
      coordinate[key]
        .toString()
  ).join("|");
}

function axisContains(
  values:
    readonly number[],
  target: number
): boolean {
  return values.some(
    (value) =>
      value === target
  );
}

function validateNodeCoordinate(
  axes: LensPsfGridAxes,
  coordinate:
    LensSampledPsfGridCoordinate,
  path: string
): void {
  for (
    const key of AXIS_KEYS
  ) {
    if (
      !axisContains(
        axes[key],
        coordinate[key]
      )
    ) {
      throw new InvalidConfigurationError(
        path +
          "." +
          key +
          " must exactly match one declared grid-axis value."
      );
    }
  }
}

function parseNode(
  value: unknown,
  index: number,
  axes: LensPsfGridAxes,
  status:
    LensPsfScientificStatus
): LensSampledPsfGridNode {
  const path =
    "lensPsfProfile.nodes[" +
    index +
    "]";
  const record =
    requireRecord(value, path);
  const coordinate =
    parseCoordinate(
      record.coordinate,
      path + ".coordinate"
    );
  validateNodeCoordinate(
    axes,
    coordinate,
    path + ".coordinate"
  );
  const uncertainty =
    parseUncertainty(
      record.uncertainty,
      path + ".uncertainty"
    );
  if (
    status === "calibrated" &&
    uncertainty.kind ===
      "not-quantified"
  ) {
    throw new InvalidConfigurationError(
      path +
        " calibrated PSF data must declare quantified relative uncertainty."
    );
  }

  return {
    nodeId:
      requireNonEmptyString(
        record.nodeId,
        path + ".nodeId"
      ),
    coordinate,
    kernel:
      parseKernel(
        record.kernel,
        path + ".kernel"
      ),
    bestFocusImagePlaneOffsetMicrometers:
      requireFinite(
        record
          .bestFocusImagePlaneOffsetMicrometers,
        path +
          ".bestFocusImagePlaneOffsetMicrometers"
      ),
    relativePupilThroughputFactor:
      requireUnitInterval(
        record
          .relativePupilThroughputFactor,
        path +
          ".relativePupilThroughputFactor"
      ),
    evidence:
      parseEvidenceList(
        record.evidence,
        path + ".evidence"
      ),
    uncertainty
  };
}

function expectedNodeCount(
  axes: LensPsfGridAxes
): number {
  let count = 1;
  for (
    const key of AXIS_KEYS
  ) {
    count *= axes[key].length;
    if (
      !Number.isSafeInteger(count) ||
      count > 100_000
    ) {
      throw new InvalidConfigurationError(
        "lensPsfProfile regular grid must contain at most 100000 nodes."
      );
    }
  }
  return count;
}

function sameKernelGeometry(
  first: LensPsfKernel,
  second: LensPsfKernel
): boolean {
  return (
    first.widthSamples ===
      second.widthSamples &&
    first.heightSamples ===
      second.heightSamples &&
    first
      .samplePitchMicrometersX ===
      second
        .samplePitchMicrometersX &&
    first
      .samplePitchMicrometersY ===
      second
        .samplePitchMicrometersY &&
    first.centerSampleX ===
      second.centerSampleX &&
    first.centerSampleY ===
      second.centerSampleY
  );
}

/**
 * Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
 * missing required fields and incompatible scientific data fail at this boundary.
 *
 * Sampled lens PSF shapes bind exact generic optical state, field, wavelength and signed defocus
 * support. Interpolation stays within declared applicability and preserves normalized shape separately
 * from throughput. MTF-only data lacks phase/spatial information and does not authorize rendering a
 * unique PSF.
 * @param value - unknown. Treated as untrusted data; static typing alone is not validation.
 * @returns LensSampledPsfProfile. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function parseLensSampledPsfProfile(
  value: unknown
): LensSampledPsfProfile {
  const record =
    requireRecord(
      value,
      "lensPsfProfile"
    );
  if (
    record.schemaVersion !==
    LENS_SAMPLED_PSF_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'lensPsfProfile.schemaVersion must be "' +
        LENS_SAMPLED_PSF_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.opticalDomain !==
    "lens-primary-optical-path-only"
  ) {
    throw new InvalidConfigurationError(
      'lensPsfProfile.opticalDomain must be "lens-primary-optical-path-only".'
    );
  }
  if (
    record.coordinateSystem !==
      "image-plane-metric" ||
    record.fieldAxes !==
      "+X right, +Y up"
  ) {
    throw new InvalidConfigurationError(
      "lensPsfProfile image-plane coordinate semantics are invalid."
    );
  }
  if (
    record.kernelEnergyNormalization !==
      "unit-energy-shape" ||
    record.interpolation !==
      "bounded-regular-grid-multilinear" ||
    record.throughputOwnership !==
      "separate-relative-pupil-throughput-factor"
  ) {
    throw new InvalidConfigurationError(
      "lensPsfProfile normalization/interpolation/throughput ownership is invalid."
    );
  }
  if (
    record.sensorOpticalStackIncluded !==
      false ||
    record.sensorSamplingIncluded !==
      false ||
    record.reconstructionIncluded !==
      false ||
    record.strayLightIncluded !==
      false
  ) {
    throw new InvalidConfigurationError(
      "V1 lens PSF profiles must remain lens-primary-optical-path-only and exclude sensor/reconstruction/stray-light effects."
    );
  }

  const status =
    parseStatus(
      record.scientificStatus,
      "lensPsfProfile.scientificStatus"
    );
  const response =
    requireRecord(
      record.responseIncludes,
      "lensPsfProfile.responseIncludes"
    );
  for (
    const key of [
      "diffraction",
      "aberration",
      "defocus",
      "pupilClippingShape"
    ] as const
  ) {
    if (
      typeof response[key] !==
      "boolean"
    ) {
      throw new InvalidConfigurationError(
        "lensPsfProfile.responseIncludes." +
          key +
          " must be boolean."
      );
    }
  }
  const axes =
    parseAxes(record.axes);
  if (
    !Array.isArray(
      record.nodes
    )
  ) {
    throw new InvalidConfigurationError(
      "lensPsfProfile.nodes must be an array."
    );
  }
  if (
    record.nodes.length !==
    expectedNodeCount(axes)
  ) {
    throw new InvalidConfigurationError(
      "lensPsfProfile.nodes must contain exactly one node for every regular-grid coordinate."
    );
  }
  const nodes =
    record.nodes.map(
      (node, index) =>
        parseNode(
          node,
          index,
          axes,
          status
        )
    );
  const ids =
    nodes.map(
      (node) =>
        node.nodeId
    );
  if (
    new Set(ids).size !==
    ids.length
  ) {
    throw new InvalidConfigurationError(
      "lensPsfProfile.nodes must not contain duplicate nodeId values."
    );
  }
  const coordinateKeys =
    nodes.map(
      (node) =>
        coordinateKey(
          node.coordinate
        )
    );
  if (
    new Set(coordinateKeys).size !==
    coordinateKeys.length
  ) {
    throw new InvalidConfigurationError(
      "lensPsfProfile.nodes must not contain duplicate grid coordinates."
    );
  }

  const firstKernel =
    nodes[0]?.kernel;
  if (firstKernel === undefined) {
    throw new InvalidConfigurationError(
      "lensPsfProfile.nodes must not be empty."
    );
  }
  for (
    const node of nodes
  ) {
    if (
      !sameKernelGeometry(
        firstKernel,
        node.kernel
      )
    ) {
      throw new InvalidConfigurationError(
        "Every lensPsfProfile node must use identical PSF kernel grid geometry for multilinear interpolation."
      );
    }
  }

  return {
    schemaVersion:
      LENS_SAMPLED_PSF_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "lensPsfProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "lensPsfProfile.profileVersion"
      ),
    scientificStatus:
      status,
    opticalDomain:
      "lens-primary-optical-path-only",
    coordinateSystem:
      "image-plane-metric",
    fieldAxes:
      "+X right, +Y up",
    kernelEnergyNormalization:
      "unit-energy-shape",
    interpolation:
      "bounded-regular-grid-multilinear",
    throughputOwnership:
      "separate-relative-pupil-throughput-factor",
    responseIncludes: {
      diffraction:
        response.diffraction as boolean,
      aberration:
        response.aberration as boolean,
      defocus:
        response.defocus as boolean,
      pupilClippingShape:
        response
          .pupilClippingShape as boolean
    },
    sensorOpticalStackIncluded:
      false,
    sensorSamplingIncluded:
      false,
    reconstructionIncluded:
      false,
    strayLightIncluded:
      false,
    axes,
    nodes,
    evidence:
      parseEvidenceList(
        record.evidence,
        "lensPsfProfile.evidence"
      ),
    limitations:
      parseLimitations(
        record.limitations,
        "lensPsfProfile.limitations"
      )
  };
}

function focusDiopters(
  focus: FocusPlane
): number {
  const parsed =
    parseFocusPlane(focus);
  return parsed.kind ===
    "infinity"
    ? 0
    : 1 /
      parsed.distanceM;
}

function requireScientificFinite(
  value: number,
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

function requireScientificPositiveFinite(
  value: number,
  path: string
): number {
  const parsed =
    requireScientificFinite(
      value,
      path
    );
  if (parsed <= 0) {
    throw new InvalidScientificInputError(
      path +
        " must be greater than zero."
    );
  }
  return parsed;
}

function bracketAxis(
  values:
    readonly number[],
  target: number,
  path: string
): AxisBracket {
  const minimum =
    values[0]!;
  const maximum =
    values[
      values.length - 1
    ]!;
  const scale =
    Math.max(
      1,
      Math.abs(target),
      Math.abs(minimum),
      Math.abs(maximum)
    );
  const tolerance =
    Number.EPSILON *
    64 *
    scale;
  if (
    target <
      minimum - tolerance ||
    target >
      maximum + tolerance
  ) {
    throw new InvalidScientificInputError(
      path +
        " lies outside the declared PSF profile grid; extrapolation is not permitted."
    );
  }

  for (
    const value of values
  ) {
    if (
      Math.abs(
        target - value
      ) <= tolerance
    ) {
      return {
        lower: value,
        upper: value,
        fraction: 0,
        exact: true
      };
    }
  }

  for (
    let index = 0;
    index <
      values.length - 1;
    index += 1
  ) {
    const lower =
      values[index]!;
    const upper =
      values[index + 1]!;
    if (
      target > lower &&
      target < upper
    ) {
      return {
        lower,
        upper,
        fraction:
          (target - lower) /
          (upper - lower),
        exact: false
      };
    }
  }

  throw new InvalidScientificInputError(
    path +
      " could not be bracketed inside the declared PSF profile grid."
  );
}

function queryCoordinate(
  input:
    ResolveLensSampledPsfInput
): {
  coordinate:
    LensSampledPsfGridCoordinate;
  focus: FocusPlane;
} {
  const focus =
    parseFocusPlane(
      input.focus
    );
  return {
    coordinate: {
      focalLengthMm:
        requireScientificPositiveFinite(
          input.focalLengthMm,
          "focalLengthMm"
        ),
      focusDiopters:
        focusDiopters(focus),
      apertureFNumber:
        requireScientificPositiveFinite(
          input.apertureFNumber,
          "apertureFNumber"
        ),
      fieldXmm:
        requireScientificFinite(
          input.fieldPointMm.x,
          "fieldPointMm.x"
        ),
      fieldYmm:
        requireScientificFinite(
          input.fieldPointMm.y,
          "fieldPointMm.y"
        ),
      wavelengthNm:
        requireScientificPositiveFinite(
          input.wavelengthNm,
          "wavelengthNm"
        ),
      signedDefocusImagePlaneMicrometers:
        requireScientificFinite(
          input
            .signedDefocusImagePlaneMicrometers,
          "signedDefocusImagePlaneMicrometers"
        )
    },
    focus
  };
}

function bracketCoordinate(
  axes: LensPsfGridAxes,
  coordinate:
    LensSampledPsfGridCoordinate
): Record<AxisKey, AxisBracket> {
  return {
    focalLengthMm:
      bracketAxis(
        axes.focalLengthMm,
        coordinate.focalLengthMm,
        "focalLengthMm"
      ),
    focusDiopters:
      bracketAxis(
        axes.focusDiopters,
        coordinate.focusDiopters,
        "focus"
      ),
    apertureFNumber:
      bracketAxis(
        axes.apertureFNumber,
        coordinate.apertureFNumber,
        "apertureFNumber"
      ),
    fieldXmm:
      bracketAxis(
        axes.fieldXmm,
        coordinate.fieldXmm,
        "fieldPointMm.x"
      ),
    fieldYmm:
      bracketAxis(
        axes.fieldYmm,
        coordinate.fieldYmm,
        "fieldPointMm.y"
      ),
    wavelengthNm:
      bracketAxis(
        axes.wavelengthNm,
        coordinate.wavelengthNm,
        "wavelengthNm"
      ),
    signedDefocusImagePlaneMicrometers:
      bracketAxis(
        axes
          .signedDefocusImagePlaneMicrometers,
        coordinate
          .signedDefocusImagePlaneMicrometers,
        "signedDefocusImagePlaneMicrometers"
      )
  };
}

function cornerCoordinates(
  brackets:
    Record<
      AxisKey,
      AxisBracket
    >
): readonly {
  coordinate:
    LensSampledPsfGridCoordinate;
  weight: number;
}[] {
  let corners: {
    partial:
      Partial<
        LensSampledPsfGridCoordinate
      >;
    weight: number;
  }[] = [{
    partial: {},
    weight: 1
  }];

  for (
    const key of AXIS_KEYS
  ) {
    const bracket =
      brackets[key];
    const values =
      bracket.exact
        ? [{
            value:
              bracket.lower,
            weight: 1
          }]
        : [
            {
              value:
                bracket.lower,
              weight:
                1 -
                bracket.fraction
            },
            {
              value:
                bracket.upper,
              weight:
                bracket.fraction
            }
          ];

    const next: typeof corners =
      [];
    for (
      const corner of corners
    ) {
      for (
        const option of values
      ) {
        if (
          option.weight === 0
        ) {
          continue;
        }
        next.push({
          partial: {
            ...corner.partial,
            [key]:
              option.value
          },
          weight:
            corner.weight *
            option.weight
        });
      }
    }
    corners = next;
  }

  return corners.map(
    (corner) => ({
      coordinate:
        corner.partial as
          LensSampledPsfGridCoordinate,
      weight:
        corner.weight
    })
  );
}

function resolveWeightedNodes(
  profile:
    LensSampledPsfProfile,
  brackets:
    Record<
      AxisKey,
      AxisBracket
    >
): readonly WeightedNode[] {
  const byKey =
    new Map(
      profile.nodes.map(
        (node) => [
          coordinateKey(
            node.coordinate
          ),
          node
        ] as const
      )
    );
  return cornerCoordinates(
    brackets
  ).map((corner) => {
    const node =
      byKey.get(
        coordinateKey(
          corner.coordinate
        )
      );
    if (node === undefined) {
      throw new InvalidScientificInputError(
        "PSF profile grid is missing a required interpolation corner."
      );
    }
    return {
      node,
      weight:
        corner.weight
    };
  });
}

function interpolateKernel(
  weighted:
    readonly WeightedNode[]
): LensPsfKernel {
  const first =
    weighted[0]?.node.kernel;
  if (first === undefined) {
    throw new InvalidScientificInputError(
      "PSF interpolation requires at least one source node."
    );
  }
  const values =
    new Array<number>(
      first
        .normalizedIntensity
        .length
    ).fill(0);

  for (
    const entry of weighted
  ) {
    for (
      let index = 0;
      index < values.length;
      index += 1
    ) {
      values[index]! +=
        entry.weight *
        entry.node.kernel
          .normalizedIntensity[index]!;
    }
  }

  const sum =
    values.reduce(
      (acc, value) =>
        acc + value,
      0
    );
  if (
    !Number.isFinite(sum) ||
    sum <= 0
  ) {
    throw new InvalidScientificInputError(
      "Interpolated PSF energy must remain finite and positive."
    );
  }
  const normalized =
    values.map(
      (value) =>
        value / sum
    );

  return {
    widthSamples:
      first.widthSamples,
    heightSamples:
      first.heightSamples,
    samplePitchMicrometersX:
      first
        .samplePitchMicrometersX,
    samplePitchMicrometersY:
      first
        .samplePitchMicrometersY,
    centerSampleX:
      first.centerSampleX,
    centerSampleY:
      first.centerSampleY,
    normalizedIntensity:
      normalized
  };
}

function weightedScalar(
  weighted:
    readonly WeightedNode[],
  select:
    (
      node:
        LensSampledPsfGridNode
    ) => number
): number {
  return weighted.reduce(
    (sum, entry) =>
      sum +
      entry.weight *
        select(entry.node),
    0
  );
}

/**
 * Resolve the bounded sampled PSF for a declared optical state and support point without extrapolation
 * or silently inventing missing dimensions.
 *
 * Sampled lens PSF shapes bind exact generic optical state, field, wavelength and signed defocus
 * support. Interpolation stays within declared applicability and preserves normalized shape separately
 * from throughput. MTF-only data lacks phase/spatial information and does not authorize rendering a
 * unique PSF.
 * @param input - ResolveLensSampledPsfInput. See the linked contract for coordinate, unit and profile binding semantics.
 * @returns CalculationResult<ResolvedLensSampledPsf>. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function resolveLensSampledPsf(
  input:
    ResolveLensSampledPsfInput
): CalculationResult<ResolvedLensSampledPsf> {
  const profile =
    parseLensSampledPsfProfile(
      input.profile
    );
  const query =
    queryCoordinate(input);
  const brackets =
    bracketCoordinate(
      profile.axes,
      query.coordinate
    );
  const weighted =
    resolveWeightedNodes(
      profile,
      brackets
    );
  const exact =
    AXIS_KEYS.every(
      (key) =>
        brackets[key].exact
    );
  const kernel =
    interpolateKernel(
      weighted
    );
  const bestFocus =
    weightedScalar(
      weighted,
      (node) =>
        node
          .bestFocusImagePlaneOffsetMicrometers
    );
  const throughput =
    weightedScalar(
      weighted,
      (node) =>
        node
          .relativePupilThroughputFactor
    );
  if (
    !Number.isFinite(
      bestFocus
    ) ||
    !Number.isFinite(
      throughput
    ) ||
    throughput < 0 ||
    throughput > 1
  ) {
    throw new InvalidScientificInputError(
      "Interpolated PSF metadata must remain finite and physically bounded."
    );
  }

  return approximationResult(
    {
      profileId:
        profile.profileId,
      profileVersion:
        profile.profileVersion,
      scientificStatus:
        profile.scientificStatus,
      resolutionStatus:
        exact
          ? "exact-grid-sample"
          : "interpolated",
      coordinate:
        query.coordinate,
      focus:
        query.focus,
      kernel,
      bestFocusImagePlaneOffsetMicrometers:
        bestFocus,
      relativePupilThroughputFactor:
        throughput,
      sourceNodes:
        weighted.map(
          (entry) => ({
            nodeId:
              entry.node.nodeId,
            weight:
              entry.weight,
            evidence:
              entry.node.evidence,
            uncertainty:
              entry.node
                .uncertainty
          })
        ),
      responseIncludes: {
        ...profile
          .responseIncludes
      },
      throughputOwnership:
        "separate-relative-pupil-throughput-factor",
      longitudinalChromaticFocusMayVaryWithWavelength:
        true,
      fieldCurvatureMayVaryWithFieldPosition:
        true,
      geometricDistortionModified:
        false,
      lateralChromaticPositionShiftApplied:
        false,
      sensorOpticalStackIncluded:
        false,
      sensorSamplingIncluded:
        false,
      reconstructionIncluded:
        false,
      strayLightIncluded:
        false,
      scalarSharpnessScoreProduced:
        false
    },
    "lens-sampled-psf-bounded-interpolation",
    "1.0.0",
    [
      "PSF intensity is a unit-energy shape; relative pupil throughput remains a separate factor for the optical-throughput path.",
      "Regular-grid interpolation is bounded and never extrapolates beyond declared focal-length, focus, aperture, field, wavelength or signed-defocus axes.",
      "Full 2D image-plane kernel orientation is preserved in +X right, +Y up coordinates; no radial or sagittal/tangential averaging is forced.",
      "bestFocusImagePlaneOffsetMicrometers may vary with field and wavelength, representing field-curvature and longitudinal-chromatic-focus behavior without changing geometric distortion or lateral chromatic position.",
      "Lens PSF remains upstream of sensor optical stack, sampling and reconstruction, and excludes stray-light/ghosting contributions.",
      "No scalar lens-quality, sharpness or bokeh-quality score is produced."
    ]
  );
}

/**
 * Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
 * missing required fields and incompatible scientific data fail at this boundary.
 *
 * Sampled lens PSF shapes bind exact generic optical state, field, wavelength and signed defocus
 * support. Interpolation stays within declared applicability and preserves normalized shape separately
 * from throughput. MTF-only data lacks phase/spatial information and does not authorize rendering a
 * unique PSF.
 * @param value - unknown. Treated as untrusted data; static typing alone is not validation.
 * @returns LensMtfDiagnosticProfile. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function parseLensMtfDiagnosticProfile(
  value: unknown
): LensMtfDiagnosticProfile {
  const record =
    requireRecord(
      value,
      "lensMtfProfile"
    );
  if (
    record.schemaVersion !==
    LENS_MTF_DIAGNOSTIC_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'lensMtfProfile.schemaVersion must be "' +
        LENS_MTF_DIAGNOSTIC_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.opticalDomain !==
      "lens-primary-optical-path-only" ||
    record.phaseInformationAvailable !==
      false ||
    record.magnitudeMeaning !==
      "mtf-magnitude-only"
  ) {
    throw new InvalidConfigurationError(
      "lensMtfProfile optical/phase semantics are invalid."
    );
  }
  if (
    !Array.isArray(
      record.samples
    ) ||
    record.samples.length ===
      0
  ) {
    throw new InvalidConfigurationError(
      "lensMtfProfile.samples must be a non-empty array."
    );
  }
  let priorFrequency =
    -1;
  const samples =
    record.samples.map(
      (entry, index) => {
        const path =
          "lensMtfProfile.samples[" +
          index +
          "]";
        const sample =
          requireRecord(
            entry,
            path
          );
        const frequency =
          requireNonNegativeFinite(
            sample
              .spatialFrequencyCyclesPerMm,
            path +
              ".spatialFrequencyCyclesPerMm"
          );
        if (
          frequency <=
          priorFrequency
        ) {
          throw new InvalidConfigurationError(
            "lensMtfProfile sample frequencies must be strictly increasing."
          );
        }
        priorFrequency =
          frequency;
        return {
          spatialFrequencyCyclesPerMm:
            frequency,
          sagittalMagnitude:
            requireUnitInterval(
              sample
                .sagittalMagnitude,
              path +
                ".sagittalMagnitude"
            ),
          tangentialMagnitude:
            requireUnitInterval(
              sample
                .tangentialMagnitude,
              path +
                ".tangentialMagnitude"
            )
        };
      }
    );
  const field =
    requireRecord(
      record.fieldPointMm,
      "lensMtfProfile.fieldPointMm"
    );
  const wavelength =
    record.wavelengthNm ===
      null
      ? null
      : requirePositiveFinite(
          record.wavelengthNm,
          "lensMtfProfile.wavelengthNm"
        );

  return {
    schemaVersion:
      LENS_MTF_DIAGNOSTIC_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "lensMtfProfile.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "lensMtfProfile.profileVersion"
      ),
    opticalDomain:
      "lens-primary-optical-path-only",
    phaseInformationAvailable:
      false,
    magnitudeMeaning:
      "mtf-magnitude-only",
    fieldPointMm: {
      x:
        requireFinite(
          field.x,
          "lensMtfProfile.fieldPointMm.x"
        ),
      y:
        requireFinite(
          field.y,
          "lensMtfProfile.fieldPointMm.y"
        )
    },
    focalLengthMm:
      requirePositiveFinite(
        record.focalLengthMm,
        "lensMtfProfile.focalLengthMm"
      ),
    focus:
      parseFocusPlane(
        record.focus
      ),
    apertureFNumber:
      requirePositiveFinite(
        record.apertureFNumber,
        "lensMtfProfile.apertureFNumber"
      ),
    wavelengthNm:
      wavelength,
    samples,
    evidence:
      parseEvidenceList(
        record.evidence,
        "lensMtfProfile.evidence"
      ),
    limitations:
      parseLimitations(
        record.limitations,
        "lensMtfProfile.limitations"
      )
  };
}

/**
 * Explain why MTF-only evidence cannot determine a unique renderable PSF; return blockers instead of
 * fabricating phase information.
 *
 * Sampled lens PSF shapes bind exact generic optical state, field, wavelength and signed defocus
 * support. Interpolation stays within declared applicability and preserves normalized shape separately
 * from throughput. MTF-only data lacks phase/spatial information and does not authorize rendering a
 * unique PSF.
 * @param profile - LensMtfDiagnosticProfile. See the linked contract for coordinate, unit and profile binding semantics.
 * @returns MtfOnlyPsfRenderabilityAssessment. Read structured blockers before consuming an authorization.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function assessMtfOnlyPsfRenderability(
  profile:
    LensMtfDiagnosticProfile
): MtfOnlyPsfRenderabilityAssessment {
  const parsed =
    parseLensMtfDiagnosticProfile(
      profile
    );
  return {
    profileId:
      parsed.profileId,
    psfReconstructionAuthorized:
      false,
    reason:
      "mtf-magnitude-lacks-phase-and-does-not-uniquely-determine-psf",
    diagnosticUseAuthorized:
      true
  };
}
