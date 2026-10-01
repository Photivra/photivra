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
import {
  parseFocusPlane,
  type FocusPlane
} from "./focus-state.js";
import type {
  LensPsfKernel,
  LensPsfScientificStatus,
  LensPsfUncertainty
} from "./lens-psf-profile.js";

type UnknownRecord = Record<string, unknown>;

export const LENS_COMPLEX_PUPIL_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const;

export interface LensComplexPupilGrid {
  widthSamples: number;
  heightSamples: number;
  pupilSamplePitchMmX: number;
  pupilSamplePitchMmY: number;
  centerSampleX: number;
  centerSampleY: number;
  relativeAmplitude:
    readonly number[];
  opticalPathDifferenceMicrometers:
    readonly number[];
}

export interface LensComplexPupilProfile {
  schemaVersion:
    typeof LENS_COMPLEX_PUPIL_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus:
    LensPsfScientificStatus;
  opticalDomain:
    "lens-primary-optical-path-only";
  representation:
    "complex-pupil-amplitude-plus-opd";
  pupilCoordinateSystem:
    "pupil-plane-metric-aligned-to-image-plane";
  imageFieldAxes:
    "+X right, +Y up";
  amplitudeMeaning:
    "relative-complex-pupil-amplitude-shape";
  wavefrontMeaning:
    "optical-path-difference-micrometers";
  throughputOwnership:
    "separate-relative-pupil-throughput-factor";
  kernelEnergyNormalization:
    "unit-energy-shape";
  propagationModel:
    "scalar-fraunhofer-discrete-reference";
  context: {
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
  };
  responseIncludes: {
    diffraction: true;
    aberration: boolean;
    defocus: boolean;
    pupilClippingShape:
      boolean;
  };
  relativePupilThroughputFactor:
    number;
  grid: LensComplexPupilGrid;
  sensorOpticalStackIncluded:
    false;
  sensorSamplingIncluded:
    false;
  reconstructionIncluded:
    false;
  strayLightIncluded: false;
  evidence:
    readonly EvidenceProvenance[];
  uncertainty:
    LensPsfUncertainty;
  limitations: readonly string[];
}

export interface CalculateLensComplexPupilPsfInput {
  profile:
    LensComplexPupilProfile;
}

export interface LensComplexPupilPsf {
  profileId: string;
  profileVersion: string;
  scientificStatus:
    LensPsfScientificStatus;
  context:
    LensComplexPupilProfile["context"];
  kernel: LensPsfKernel;
  relativePupilThroughputFactor:
    number;
  throughputOwnership:
    "separate-relative-pupil-throughput-factor";
  diffractionAndAberrationJointlyEvaluated:
    true;
  pupilClippingShapeIncluded:
    boolean;
  pupilClippingThroughputAppliedToKernel:
    false;
  scalarFraunhoferReference:
    true;
  full2dOrientationPreserved:
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
  componentEvidence: {
    pupilProfile:
      readonly EvidenceProvenance[];
  };
  uncertainty:
    LensPsfUncertainty;
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
    const fraction =
      requireFinite(
        record.fraction,
        path + ".fraction"
      );
    if (fraction < 0) {
      throw new InvalidConfigurationError(
        path +
          ".fraction must be nonnegative."
      );
    }
    return {
      kind: "relative",
      fraction,
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

function parseGrid(
  value: unknown
): LensComplexPupilGrid {
  const record =
    requireRecord(
      value,
      "lensComplexPupil.grid"
    );
  const widthSamples =
    requirePositiveSafeInteger(
      record.widthSamples,
      "lensComplexPupil.grid.widthSamples"
    );
  const heightSamples =
    requirePositiveSafeInteger(
      record.heightSamples,
      "lensComplexPupil.grid.heightSamples"
    );
  const total =
    widthSamples *
    heightSamples;
  if (
    !Number.isSafeInteger(total) ||
    total > 4096
  ) {
    throw new InvalidConfigurationError(
      "lensComplexPupil grid must contain at most 4096 samples."
    );
  }
  const centerSampleX =
    requireNonNegativeSafeInteger(
      record.centerSampleX,
      "lensComplexPupil.grid.centerSampleX"
    );
  const centerSampleY =
    requireNonNegativeSafeInteger(
      record.centerSampleY,
      "lensComplexPupil.grid.centerSampleY"
    );
  if (
    centerSampleX >=
      widthSamples ||
    centerSampleY >=
      heightSamples
  ) {
    throw new InvalidConfigurationError(
      "lensComplexPupil grid center must lie within the pupil array."
    );
  }
  if (
    !Array.isArray(
      record.relativeAmplitude
    ) ||
    record.relativeAmplitude
      .length !== total
  ) {
    throw new InvalidConfigurationError(
      "lensComplexPupil.grid.relativeAmplitude length must equal widthSamples × heightSamples."
    );
  }
  if (
    !Array.isArray(
      record
        .opticalPathDifferenceMicrometers
    ) ||
    record
      .opticalPathDifferenceMicrometers
      .length !== total
  ) {
    throw new InvalidConfigurationError(
      "lensComplexPupil.grid.opticalPathDifferenceMicrometers length must equal widthSamples × heightSamples."
    );
  }

  const relativeAmplitude =
    record.relativeAmplitude.map(
      (entry, index) =>
        requireUnitInterval(
          entry,
          "lensComplexPupil.grid.relativeAmplitude[" +
            index +
            "]"
        )
    );
  if (
    !relativeAmplitude.some(
      (value) =>
        value > 0
    )
  ) {
    throw new InvalidConfigurationError(
      "lensComplexPupil must contain at least one non-zero pupil-amplitude sample."
    );
  }
  const opd =
    record
      .opticalPathDifferenceMicrometers
      .map(
        (entry, index) =>
          requireFinite(
            entry,
            "lensComplexPupil.grid.opticalPathDifferenceMicrometers[" +
              index +
              "]"
          )
      );

  return {
    widthSamples,
    heightSamples,
    pupilSamplePitchMmX:
      requirePositiveFinite(
        record
          .pupilSamplePitchMmX,
        "lensComplexPupil.grid.pupilSamplePitchMmX"
      ),
    pupilSamplePitchMmY:
      requirePositiveFinite(
        record
          .pupilSamplePitchMmY,
        "lensComplexPupil.grid.pupilSamplePitchMmY"
      ),
    centerSampleX,
    centerSampleY,
    relativeAmplitude,
    opticalPathDifferenceMicrometers:
      opd
  };
}

export function parseLensComplexPupilProfile(
  value: unknown
): LensComplexPupilProfile {
  const record =
    requireRecord(
      value,
      "lensComplexPupil"
    );
  if (
    record.schemaVersion !==
    LENS_COMPLEX_PUPIL_PROFILE_SCHEMA_VERSION
  ) {
    throw new InvalidConfigurationError(
      'lensComplexPupil.schemaVersion must be "' +
        LENS_COMPLEX_PUPIL_PROFILE_SCHEMA_VERSION +
        '".'
    );
  }
  if (
    record.opticalDomain !==
      "lens-primary-optical-path-only" ||
    record.representation !==
      "complex-pupil-amplitude-plus-opd" ||
    record.pupilCoordinateSystem !==
      "pupil-plane-metric-aligned-to-image-plane" ||
    record.imageFieldAxes !==
      "+X right, +Y up" ||
    record.amplitudeMeaning !==
      "relative-complex-pupil-amplitude-shape" ||
    record.wavefrontMeaning !==
      "optical-path-difference-micrometers" ||
    record.throughputOwnership !==
      "separate-relative-pupil-throughput-factor" ||
    record.kernelEnergyNormalization !==
      "unit-energy-shape" ||
    record.propagationModel !==
      "scalar-fraunhofer-discrete-reference"
  ) {
    throw new InvalidConfigurationError(
      "lensComplexPupil representation/coordinate/energy semantics are invalid."
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
      "V1 complex pupil profiles must exclude sensor/reconstruction/stray-light effects."
    );
  }
  const status =
    parseStatus(
      record.scientificStatus,
      "lensComplexPupil.scientificStatus"
    );
  const uncertainty =
    parseUncertainty(
      record.uncertainty,
      "lensComplexPupil.uncertainty"
    );
  if (
    status === "calibrated" &&
    uncertainty.kind ===
      "not-quantified"
  ) {
    throw new InvalidConfigurationError(
      "Calibrated complex-pupil profiles must declare quantified relative uncertainty."
    );
  }
  const context =
    requireRecord(
      record.context,
      "lensComplexPupil.context"
    );
  const field =
    requireRecord(
      context.fieldPointMm,
      "lensComplexPupil.context.fieldPointMm"
    );
  const response =
    requireRecord(
      record.responseIncludes,
      "lensComplexPupil.responseIncludes"
    );
  if (
    response.diffraction !==
    true ||
    typeof response.aberration !==
      "boolean" ||
    typeof response.defocus !==
      "boolean" ||
    typeof response.pupilClippingShape !==
      "boolean"
  ) {
    throw new InvalidConfigurationError(
      "lensComplexPupil.responseIncludes is invalid; diffraction must be included in this pupil propagation path."
    );
  }

  return {
    schemaVersion:
      LENS_COMPLEX_PUPIL_PROFILE_SCHEMA_VERSION,
    profileId:
      requireNonEmptyString(
        record.profileId,
        "lensComplexPupil.profileId"
      ),
    profileVersion:
      requireNonEmptyString(
        record.profileVersion,
        "lensComplexPupil.profileVersion"
      ),
    scientificStatus:
      status,
    opticalDomain:
      "lens-primary-optical-path-only",
    representation:
      "complex-pupil-amplitude-plus-opd",
    pupilCoordinateSystem:
      "pupil-plane-metric-aligned-to-image-plane",
    imageFieldAxes:
      "+X right, +Y up",
    amplitudeMeaning:
      "relative-complex-pupil-amplitude-shape",
    wavefrontMeaning:
      "optical-path-difference-micrometers",
    throughputOwnership:
      "separate-relative-pupil-throughput-factor",
    kernelEnergyNormalization:
      "unit-energy-shape",
    propagationModel:
      "scalar-fraunhofer-discrete-reference",
    context: {
      focalLengthMm:
        requirePositiveFinite(
          context.focalLengthMm,
          "lensComplexPupil.context.focalLengthMm"
        ),
      focus:
        parseFocusPlane(
          context.focus
        ),
      apertureFNumber:
        requirePositiveFinite(
          context.apertureFNumber,
          "lensComplexPupil.context.apertureFNumber"
        ),
      fieldPointMm: {
        x:
          requireFinite(
            field.x,
            "lensComplexPupil.context.fieldPointMm.x"
          ),
        y:
          requireFinite(
            field.y,
            "lensComplexPupil.context.fieldPointMm.y"
          )
      },
      wavelengthNm:
        requirePositiveFinite(
          context.wavelengthNm,
          "lensComplexPupil.context.wavelengthNm"
        ),
      signedDefocusImagePlaneMicrometers:
        requireFinite(
          context
            .signedDefocusImagePlaneMicrometers,
          "lensComplexPupil.context.signedDefocusImagePlaneMicrometers"
        )
    },
    responseIncludes: {
      diffraction: true,
      aberration:
        response.aberration as boolean,
      defocus:
        response.defocus as boolean,
      pupilClippingShape:
        response
          .pupilClippingShape as boolean
    },
    relativePupilThroughputFactor:
      requireUnitInterval(
        record
          .relativePupilThroughputFactor,
        "lensComplexPupil.relativePupilThroughputFactor"
      ),
    grid:
      parseGrid(record.grid),
    sensorOpticalStackIncluded:
      false,
    sensorSamplingIncluded:
      false,
    reconstructionIncluded:
      false,
    strayLightIncluded:
      false,
    evidence:
      parseEvidenceList(
        record.evidence,
        "lensComplexPupil.evidence"
      ),
    uncertainty,
    limitations:
      parseLimitations(
        record.limitations,
        "lensComplexPupil.limitations"
      )
  };
}

interface ComplexValue {
  re: number;
  im: number;
}

function pupilComplexValue(
  amplitude: number,
  opdMicrometers: number,
  wavelengthMicrometers:
    number
): ComplexValue {
  const phase =
    2 *
    Math.PI *
    opdMicrometers /
    wavelengthMicrometers;
  return {
    re:
      amplitude *
      Math.cos(phase),
    im:
      amplitude *
      Math.sin(phase)
  };
}

function calculateDiscreteFraunhoferKernel(
  profile:
    LensComplexPupilProfile
): LensPsfKernel {
  const grid =
    profile.grid;
  const width =
    grid.widthSamples;
  const height =
    grid.heightSamples;
  const wavelengthMicrometers =
    profile.context
      .wavelengthNm /
    1000;
  const wavelengthMm =
    profile.context
      .wavelengthNm /
    1_000_000;
  const pupil: ComplexValue[] =
    grid.relativeAmplitude.map(
      (amplitude, index) =>
        pupilComplexValue(
          amplitude,
          grid
            .opticalPathDifferenceMicrometers[
              index
            ]!,
          wavelengthMicrometers
        )
    );

  const intensity =
    new Array<number>(
      width * height
    ).fill(0);

  for (
    let outY = 0;
    outY < height;
    outY += 1
  ) {
    const ky =
      outY -
      grid.centerSampleY;
    for (
      let outX = 0;
      outX < width;
      outX += 1
    ) {
      const kx =
        outX -
        grid.centerSampleX;
      let re = 0;
      let im = 0;

      for (
        let y = 0;
        y < height;
        y += 1
      ) {
        const py =
          y -
          grid.centerSampleY;
        for (
          let x = 0;
          x < width;
          x += 1
        ) {
          const px =
            x -
            grid.centerSampleX;
          const source =
            pupil[
              y * width +
              x
            ]!;
          const angle =
            -2 *
            Math.PI *
            (
              kx * px /
                width +
              ky * py /
                height
            );
          const cos =
            Math.cos(angle);
          const sin =
            Math.sin(angle);
          re +=
            source.re *
              cos -
            source.im *
              sin;
          im +=
            source.re *
              sin +
            source.im *
              cos;
        }
      }

      intensity[
        outY * width +
        outX
      ] =
        re * re +
        im * im;
    }
  }

  const sum =
    intensity.reduce(
      (acc, value) =>
        acc + value,
      0
    );
  if (
    !Number.isFinite(sum) ||
    sum <= 0
  ) {
    throw new InvalidScientificInputError(
      "Complex-pupil propagation must produce finite positive PSF energy."
    );
  }
  const normalized =
    intensity.map(
      (value) =>
        value / sum
    );

  const samplePitchMmX =
    wavelengthMm *
    profile.context
      .focalLengthMm /
    (
      width *
      grid
        .pupilSamplePitchMmX
    );
  const samplePitchMmY =
    wavelengthMm *
    profile.context
      .focalLengthMm /
    (
      height *
      grid
        .pupilSamplePitchMmY
    );

  if (
    !Number.isFinite(
      samplePitchMmX
    ) ||
    !Number.isFinite(
      samplePitchMmY
    ) ||
    samplePitchMmX <= 0 ||
    samplePitchMmY <= 0
  ) {
    throw new InvalidScientificInputError(
      "Complex-pupil PSF sample pitch must remain finite and positive."
    );
  }

  return {
    widthSamples:
      width,
    heightSamples:
      height,
    samplePitchMicrometersX:
      samplePitchMmX *
      1000,
    samplePitchMicrometersY:
      samplePitchMmY *
      1000,
    centerSampleX:
      grid.centerSampleX,
    centerSampleY:
      grid.centerSampleY,
    normalizedIntensity:
      normalized
  };
}

export function calculateLensComplexPupilPsf(
  input:
    CalculateLensComplexPupilPsfInput
): CalculationResult<LensComplexPupilPsf> {
  const profile =
    parseLensComplexPupilProfile(
      input.profile
    );
  const kernel =
    calculateDiscreteFraunhoferKernel(
      profile
    );

  return approximationResult(
    {
      profileId:
        profile.profileId,
      profileVersion:
        profile.profileVersion,
      scientificStatus:
        profile.scientificStatus,
      context: {
        ...profile.context,
        focus: {
          ...profile.context.focus
        },
        fieldPointMm: {
          ...profile.context
            .fieldPointMm
        }
      },
      kernel,
      relativePupilThroughputFactor:
        profile
          .relativePupilThroughputFactor,
      throughputOwnership:
        "separate-relative-pupil-throughput-factor",
      diffractionAndAberrationJointlyEvaluated:
        true,
      pupilClippingShapeIncluded:
        profile
          .responseIncludes
          .pupilClippingShape,
      pupilClippingThroughputAppliedToKernel:
        false,
      scalarFraunhoferReference:
        true,
      full2dOrientationPreserved:
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
        false,
      componentEvidence: {
        pupilProfile:
          profile.evidence
      },
      uncertainty:
        profile.uncertainty
    },
    "lens-complex-pupil-fraunhofer-psf",
    "1.0.0",
    [
      "The reference evaluator performs deterministic scalar Fraunhofer propagation of one explicit complex pupil amplitude plus optical-path-difference grid.",
      "Diffraction and aberration phase are evaluated together in the same pupil propagation; callers must not stack an independent diffraction blur over this result.",
      "The output PSF is unit-energy normalized. The explicit relativePupilThroughputFactor is not multiplied into the kernel and remains owned by the separate optical-throughput path.",
      "Pupil amplitude shape can represent mechanical clipping/cat-eye geometry without silently encoding unknown transmission loss.",
      "The pupil and image-plane axes preserve full 2D orientation; no radial or sagittal/tangential averaging is imposed.",
      "This scalar Fraunhofer grid is a bounded reference approximation, not a full vector electromagnetic, polarization, stray-light or sensor-system model.",
      "Sensor OLPF, microlens, CFA, sampling and reconstruction are downstream and excluded."
    ]
  );
}
