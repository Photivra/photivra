// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveFinite,
  requirePositiveInteger
} from "../core/validation.js";
import {
  calculateIdealApertureGeometry
} from "./aperture.js";
import {
  calculateLensComplexPupilPsf
} from "./complex-pupil-psf.js";
import {
  calculateAiryDisk,
  type AiryDisk
} from "./diffraction.js";
import type {
  LensPsfKernel
} from "./lens-psf-profile.js";

export const REGULAR_POLYGON_DIFFRACTION_VERSION =
  "0.1.0" as const;

export interface CalculateRegularPolygonDiffractionInput {
  bladeCount: number;
  firstBladeEdgeAngleDegrees: number;
  focalLengthMm: number;
  apertureFNumber: number;
  wavelengthNm: number;
  /**
   * Odd sample count used across the polygon circumdiameter before zero
   * padding. Must be from 9 through 31.
   */
  pupilSupportSamplesAcrossCircumdiameter:
    number;
  /**
   * Linear zero-padding multiplier. The resulting odd square propagation grid
   * is limited to 63 samples per axis for the scalar reference evaluator.
   */
  zeroPaddingFactor: number;
}

export interface RegularPolygonDiffractionResult {
  version:
    typeof REGULAR_POLYGON_DIFFRACTION_VERSION;
  apertureModel:
    "ideal-regular-polygon-uniform-amplitude-zero-phase";
  normalization:
    "equal-area-equivalent-circular-diameter-from-f-number";
  bladeCount: number;
  firstBladeEdgeAngleDegrees:
    number;
  focalLengthMm: number;
  apertureFNumber: number;
  wavelengthNm: number;
  physicalPupil: {
    equivalentCircularDiameterMm:
      number;
    equivalentCircularAreaSquareMm:
      number;
    polygonCircumradiusMm:
      number;
    polygonInradiusMm: number;
    polygonAreaSquareMm: number;
    areaRatioToEquivalentCircle:
      number;
  };
  sampling: {
    pupilSupportSamplesAcrossCircumdiameter:
      number;
    zeroPaddingFactor: number;
    propagationGridSamples:
      number;
    pupilSamplePitchMm: number;
    occupiedPupilSampleCount:
      number;
  };
  apertureGeometry: {
    normalizedVertices:
      readonly {
        x: number;
        y: number;
      }[];
    sunstarRayAnglesDegrees:
      readonly number[];
    sunstarRayCount: number;
  };
  psf: LensPsfKernel;
  normalizedPsfEnergy: number;
  circularReference: {
    model:
      "ideal-circular-aperture-airy-disk";
    firstZeroDiameterMicrometers:
      number;
    result: AiryDisk;
  };
  circularAiryPreservedSeparate:
    true;
  complexPupilReferenceUsed: true;
  monochromatic: true;
  onAxis: true;
  uniformAmplitude: true;
  zeroPhase: true;
  aberrationIncluded: false;
  mechanicalClippingIncluded:
    false;
  bladeCurvatureIncluded: false;
  fieldDependenceIncluded: false;
  polychromaticIntegrationIncluded:
    false;
  strayLightIncluded: false;
  scalarSharpnessScoreProduced:
    false;
}

function requireOddIntegerInRange(
  name: string,
  value: number,
  minimum: number,
  maximum: number
): number {
  requirePositiveInteger(
    name,
    value
  );
  if (
    value < minimum ||
    value > maximum ||
    value % 2 === 0
  ) {
    throw new InvalidScientificInputError(
      name +
        " must be an odd integer from " +
        minimum.toString() +
        " through " +
        maximum.toString() +
        "."
    );
  }
  return value;
}

function requireZeroPaddingFactor(
  value: number
): number {
  requirePositiveFinite(
    "zeroPaddingFactor",
    value
  );
  if (value < 1) {
    throw new InvalidScientificInputError(
      "zeroPaddingFactor must be greater than or equal to 1."
    );
  }
  return value;
}

function oddGridSize(
  supportSamples: number,
  factor: number
): number {
  let size =
    Math.ceil(
      supportSamples * factor
    );
  if (size % 2 === 0) {
    size += 1;
  }
  if (size > 63) {
    throw new InvalidScientificInputError(
      "The padded polygon-diffraction propagation grid must not exceed 63 samples per axis."
    );
  }
  return size;
}

function polygonAreaForCircumradius(
  bladeCount: number,
  circumradiusMm: number
): number {
  return (
    bladeCount *
    circumradiusMm *
    circumradiusMm *
    Math.sin(
      2 * Math.PI /
      bladeCount
    ) /
    2
  );
}

function pointInsideConvexPolygon(
  x: number,
  y: number,
  vertices:
    readonly {
      x: number;
      y: number;
    }[],
  tolerance: number
): boolean {
  for (
    let index = 0;
    index < vertices.length;
    index += 1
  ) {
    const a =
      vertices[index]!;
    const b =
      vertices[
        (index + 1) %
        vertices.length
      ]!;
    const cross =
      (b.x - a.x) *
        (y - a.y) -
      (b.y - a.y) *
        (x - a.x);
    if (cross < -tolerance) {
      return false;
    }
  }
  return true;
}

function createPolygonPupilAmplitude(
  vertices:
    readonly {
      x: number;
      y: number;
    }[],
  gridSize: number,
  samplePitchMm: number
): {
  amplitude:
    readonly number[];
  occupiedCount: number;
} {
  const center =
    Math.floor(
      gridSize / 2
    );
  const tolerance =
    samplePitchMm *
    samplePitchMm *
    1e-9;
  const amplitude:
    number[] = [];
  let occupiedCount = 0;

  for (
    let row = 0;
    row < gridSize;
    row += 1
  ) {
    const y =
      (center - row) *
      samplePitchMm;
    for (
      let column = 0;
      column < gridSize;
      column += 1
    ) {
      const x =
        (column - center) *
        samplePitchMm;
      const inside =
        pointInsideConvexPolygon(
          x,
          y,
          vertices,
          tolerance
        );
      amplitude.push(
        inside ? 1 : 0
      );
      if (inside) {
        occupiedCount += 1;
      }
    }
  }

  if (occupiedCount === 0) {
    throw new InvalidScientificInputError(
      "Polygon pupil sampling must include at least one occupied pupil sample."
    );
  }

  return {
    amplitude,
    occupiedCount
  };
}

/**
 * Calculates a deterministic scalar Fraunhofer diffraction PSF for one ideal
 * on-axis monochromatic regular-polygon pupil.
 *
 * The selected f-number is mapped to an equal-area equivalent circular pupil:
 * D_eq = focalLength / fNumber. The regular polygon is scaled so its area is
 * exactly pi * (D_eq/2)^2. This keeps the nominal f-number throughput area
 * consistent while finite blade count changes pupil shape.
 *
 * The existing circular Airy result is returned separately and is never
 * relabeled as polygon diffraction.
 */
export function calculateRegularPolygonDiffraction(
  input:
    CalculateRegularPolygonDiffractionInput
): CalculationResult<RegularPolygonDiffractionResult> {
  requirePositiveFinite(
    "focalLengthMm",
    input.focalLengthMm
  );
  requirePositiveFinite(
    "apertureFNumber",
    input.apertureFNumber
  );
  requirePositiveFinite(
    "wavelengthNm",
    input.wavelengthNm
  );
  const supportSamples =
    requireOddIntegerInRange(
      "pupilSupportSamplesAcrossCircumdiameter",
      input
        .pupilSupportSamplesAcrossCircumdiameter,
      9,
      31
    );
  const zeroPaddingFactor =
    requireZeroPaddingFactor(
      input.zeroPaddingFactor
    );
  const gridSize =
    oddGridSize(
      supportSamples,
      zeroPaddingFactor
    );

  const aperture =
    calculateIdealApertureGeometry({
      bladeCount:
        input.bladeCount,
      firstBladeEdgeAngleDegrees:
        input
          .firstBladeEdgeAngleDegrees
    }).value;

  const equivalentCircularDiameterMm =
    input.focalLengthMm /
    input.apertureFNumber;
  const equivalentRadiusMm =
    equivalentCircularDiameterMm /
    2;
  const equivalentArea =
    Math.PI *
    equivalentRadiusMm *
    equivalentRadiusMm;
  const polygonUnitArea =
    polygonAreaForCircumradius(
      aperture.bladeCount,
      1
    );
  if (
    !Number.isFinite(
      polygonUnitArea
    ) ||
    polygonUnitArea <= 0
  ) {
    throw new InvalidScientificInputError(
      "Regular-polygon unit area must remain finite and positive."
    );
  }
  const circumradiusMm =
    Math.sqrt(
      equivalentArea /
      polygonUnitArea
    );
  const inradiusMm =
    circumradiusMm *
    Math.cos(
      Math.PI /
      aperture.bladeCount
    );
  const polygonArea =
    polygonAreaForCircumradius(
      aperture.bladeCount,
      circumradiusMm
    );
  const areaRatio =
    polygonArea /
    equivalentArea;

  const physicalVertices =
    aperture
      .normalizedVertices
      .map((vertex) => ({
        x:
          vertex.x *
          circumradiusMm,
        y:
          vertex.y *
          circumradiusMm
      }));
  const samplePitchMm =
    2 *
    circumradiusMm /
    (supportSamples - 1);
  const pupil =
    createPolygonPupilAmplitude(
      physicalVertices,
      gridSize,
      samplePitchMm
    );

  const complexPupil =
    calculateLensComplexPupilPsf({
      profile: {
        schemaVersion: "0.1.0",
        profileId:
          "ideal-regular-polygon-" +
          aperture.bladeCount.toString(),
        profileVersion: "1.0.0",
        scientificStatus:
          "approximation",
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
            input.focalLengthMm,
          focus: {
            kind: "infinity"
          },
          apertureFNumber:
            input.apertureFNumber,
          fieldPointMm: {
            x: 0,
            y: 0
          },
          wavelengthNm:
            input.wavelengthNm,
          signedDefocusImagePlaneMicrometers:
            0
        },
        responseIncludes: {
          diffraction: true,
          aberration: false,
          defocus: false,
          pupilClippingShape:
            false
        },
        relativePupilThroughputFactor:
          1,
        grid: {
          widthSamples:
            gridSize,
          heightSamples:
            gridSize,
          pupilSamplePitchMmX:
            samplePitchMm,
          pupilSamplePitchMmY:
            samplePitchMm,
          centerSampleX:
            Math.floor(
              gridSize / 2
            ),
          centerSampleY:
            Math.floor(
              gridSize / 2
            ),
          relativeAmplitude:
            pupil.amplitude,
          opticalPathDifferenceMicrometers:
            new Array<number>(
              gridSize *
              gridSize
            ).fill(0)
        },
        sensorOpticalStackIncluded:
          false,
        sensorSamplingIncluded:
          false,
        reconstructionIncluded:
          false,
        strayLightIncluded:
          false,
        evidence: [],
        uncertainty: {
          kind:
            "not-quantified",
          limitation:
            "Finite pupil-grid sampling and scalar Fraunhofer propagation introduce numerical approximation error."
        },
        limitations: [
          "Ideal regular straight-edged polygon only.",
          "Uniform pupil amplitude and zero phase; no aberration, apodization, blade curvature, field dependence, mechanical clipping, polarization or stray light.",
          "Monochromatic on-axis scalar Fraunhofer reference calculation.",
          "Finite pupil sampling and zero padding control numerical resolution; callers should verify convergence for scientific use."
        ]
      }
    }).value;

  const normalizedPsfEnergy =
    complexPupil.kernel
      .normalizedIntensity
      .reduce(
        (sum, value) =>
          sum + value,
        0
      );
  const circular =
    calculateAiryDisk({
      aperture:
        input.apertureFNumber,
      wavelengthNm:
        input.wavelengthNm
    }).value;

  return approximationResult(
    {
      version:
        REGULAR_POLYGON_DIFFRACTION_VERSION,
      apertureModel:
        "ideal-regular-polygon-uniform-amplitude-zero-phase",
      normalization:
        "equal-area-equivalent-circular-diameter-from-f-number",
      bladeCount:
        aperture.bladeCount,
      firstBladeEdgeAngleDegrees:
        (
          (
            input
              .firstBladeEdgeAngleDegrees %
            360
          ) +
          360
        ) %
        360,
      focalLengthMm:
        input.focalLengthMm,
      apertureFNumber:
        input.apertureFNumber,
      wavelengthNm:
        input.wavelengthNm,
      physicalPupil: {
        equivalentCircularDiameterMm,
        equivalentCircularAreaSquareMm:
          equivalentArea,
        polygonCircumradiusMm:
          circumradiusMm,
        polygonInradiusMm:
          inradiusMm,
        polygonAreaSquareMm:
          polygonArea,
        areaRatioToEquivalentCircle:
          areaRatio
      },
      sampling: {
        pupilSupportSamplesAcrossCircumdiameter:
          supportSamples,
        zeroPaddingFactor,
        propagationGridSamples:
          gridSize,
        pupilSamplePitchMm:
          samplePitchMm,
        occupiedPupilSampleCount:
          pupil.occupiedCount
      },
      apertureGeometry: {
        normalizedVertices:
          aperture
            .normalizedVertices,
        sunstarRayAnglesDegrees:
          aperture
            .sunstarRayAnglesDegrees,
        sunstarRayCount:
          aperture
            .sunstarRayCount
      },
      psf:
        complexPupil.kernel,
      normalizedPsfEnergy,
      circularReference: {
        model:
          "ideal-circular-aperture-airy-disk",
        firstZeroDiameterMicrometers:
          circular
            .firstZeroDiameterMicrometers,
        result:
          circular
      },
      circularAiryPreservedSeparate:
        true,
      complexPupilReferenceUsed:
        true,
      monochromatic: true,
      onAxis: true,
      uniformAmplitude: true,
      zeroPhase: true,
      aberrationIncluded:
        false,
      mechanicalClippingIncluded:
        false,
      bladeCurvatureIncluded:
        false,
      fieldDependenceIncluded:
        false,
      polychromaticIntegrationIncluded:
        false,
      strayLightIncluded:
        false,
      scalarSharpnessScoreProduced:
        false
    },
    "ideal-regular-polygon-fraunhofer-diffraction",
    "1.0.0",
    [
      "The regular polygon uses the existing straight-edged aperture orientation convention.",
      "Physical scale uses an equal-area equivalent circular diameter D=f/N, so polygon area equals the nominal circular f-number pupil area while finite blade count changes shape.",
      "The pupil has uniform amplitude and zero phase and is evaluated on axis at one monochromatic wavelength using the #113 scalar Fraunhofer complex-pupil reference path.",
      "PSF intensity is normalized to unit energy; no separate throughput loss is encoded in the normalized kernel.",
      "The existing circular Airy first-zero result remains a separate analytical reference and is not replaced or relabeled.",
      "Finite sampled pupil support and zero padding introduce numerical approximation error; convergence should be checked by increasing support sampling within the reference evaluator limits.",
      "Aberration, field dependence, mechanical clipping/cat-eye behavior, blade curvature, polychromatic integration, polarization and stray light are excluded."
    ]
  );
}
