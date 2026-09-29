// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  SensorColorSamplingProfile
} from "./color-sampling.js";
import {
  parseSensorSpectralResponseProfile,
  resolveSensorSpectralResponseAtWavelength,
  type ResolvedSensorSpectralResponseValue,
  type SensorSpectralResponseProfile,
  type SensorSpectralResponseScientificStatus,
  type SensorSpectralResponseUncertainty,
  type SpectralWavelengthBasis
} from "./spectral-response.js";

const MAX_SPECTRAL_QUADRATURE_NODES = 100_000;

export interface SensorSpectralWavelengthRangeNanometers {
  minimum: number;
  maximum: number;
}

export interface CalculateSensorSpectralQuadratureInput {
  colorSamplingProfile: SensorColorSamplingProfile;
  spectralResponseProfile: SensorSpectralResponseProfile;
  channelId: string;
  wavelengthBasis: SpectralWavelengthBasis;
  wavelengthRangeNanometers:
    SensorSpectralWavelengthRangeNanometers;
  subdivisionsPerSegment: number;
  additionalBreakpointsNanometers?:
    readonly number[];
}

export interface SensorSpectralQuadratureNode {
  spectralSampleIndex: number;
  segmentIndex: number;
  subdivisionIndex: number;
  wavelengthNanometers: number;
  wavelengthMeasureNanometers: number;
  normalizedWavelengthWeight: number;
  response:
    ResolvedSensorSpectralResponseValue;
  responseInterpolationUsed: boolean;
}

export interface SensorSpectralQuadrature {
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  sourceResponseKind:
    | "effective-external-quantum-efficiency"
    | "effective-spectral-responsivity"
    | "separable-channel-filter-and-detector-eqe";
  responseScope:
    | "site-incident-effective-channel-response"
    | "sensor-package-incident-effective-channel-response"
    | "site-incident-channel-filter-times-detector-eqe";
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  wavelengthBasis: SpectralWavelengthBasis;
  wavelengthRangeNanometers:
    SensorSpectralWavelengthRangeNanometers;
  quadratureScheme:
    "response-breakpoint-aware-uniform-midpoint";
  segmentBoundarySource:
    "requested-range-plus-response-knots-plus-optional-additional-breakpoints";
  subdivisionsPerSegment: number;
  segmentCount: number;
  totalNodeCount: number;
  normalizedWavelengthWeightSum: number;
  wavelengthMeasureSumNanometers: number;
  nodes: readonly SensorSpectralQuadratureNode[];
  sourceSpectralValuesIncluded: false;
  spectralIrradianceIncluded: false;
  spectralPhotonIrradianceIncluded: false;
  opticalTransmissionIncludedByQuadrature: false;
  wavelengthIntegrationPerformed: false;
  spatialIntegrationPerformed: false;
  temporalIntegrationPerformed: false;
  photonsCalculated: false;
  electronsCalculated: false;
  rawCodeValueProduced: false;
  convergenceErrorEstimated: false;
}

function requirePositiveFinite(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new InvalidScientificInputError(
      path + " must be finite and greater than zero."
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
    throw new InvalidScientificInputError(
      path + " must be a positive safe integer."
    );
  }
  return value;
}

function channelResponse(
  profile: SensorSpectralResponseProfile,
  channelId: string
): SensorSpectralResponseProfile["channels"][number] {
  const response = profile.channels.find(
    (entry) => entry.channelId === channelId
  );
  if (response === undefined) {
    throw new InvalidScientificInputError(
      "No spectral response is declared for the requested channelId."
    );
  }
  return response;
}

function responseCurves(
  response:
    SensorSpectralResponseProfile["channels"][number]
): readonly {
  wavelengthBasis: SpectralWavelengthBasis;
  samples: readonly {
    wavelengthNanometers: number;
  }[];
}[] {
  if (
    response.kind ===
    "effective-external-quantum-efficiency"
  ) {
    return [
      response.externalQuantumEfficiency
    ];
  }
  if (
    response.kind ===
    "effective-spectral-responsivity"
  ) {
    return [
      response.spectralResponsivity
    ];
  }
  return [
    response.channelFilterTransmittance,
    response.detectorExternalQuantumEfficiency
  ];
}

function usableResponseRange(
  curves: readonly {
    samples: readonly {
      wavelengthNanometers: number;
    }[];
  }[]
): SensorSpectralWavelengthRangeNanometers {
  const minimum = Math.max(
    ...curves.map(
      (curve) =>
        curve.samples[0]!
          .wavelengthNanometers
    )
  );
  const maximum = Math.min(
    ...curves.map(
      (curve) =>
        curve.samples[
          curve.samples.length - 1
        ]!.wavelengthNanometers
    )
  );

  if (!(minimum < maximum)) {
    throw new InvalidScientificInputError(
      "Spectral-response curves do not have a usable overlapping wavelength interval."
    );
  }

  return { minimum, maximum };
}

function parseRequestedRange(
  input:
    SensorSpectralWavelengthRangeNanometers,
  usable:
    SensorSpectralWavelengthRangeNanometers
): SensorSpectralWavelengthRangeNanometers {
  if (
    typeof input !== "object" ||
    input === null
  ) {
    throw new InvalidScientificInputError(
      "wavelengthRangeNanometers must be an object."
    );
  }

  const minimum = requirePositiveFinite(
    input.minimum,
    "wavelengthRangeNanometers.minimum"
  );
  const maximum = requirePositiveFinite(
    input.maximum,
    "wavelengthRangeNanometers.maximum"
  );

  if (!(minimum < maximum)) {
    throw new InvalidScientificInputError(
      "wavelengthRangeNanometers.minimum must be less than maximum."
    );
  }

  if (
    minimum < usable.minimum ||
    maximum > usable.maximum
  ) {
    throw new InvalidScientificInputError(
      "Requested wavelength range must remain inside the usable spectral-response range."
    );
  }

  return { minimum, maximum };
}

function additionalBreakpoints(
  value: readonly number[] | undefined,
  range:
    SensorSpectralWavelengthRangeNanometers
): readonly number[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new InvalidScientificInputError(
      "additionalBreakpointsNanometers must be an array when supplied."
    );
  }

  return value.map(
    (entry, index) => {
      const wavelength =
        requirePositiveFinite(
          entry,
          "additionalBreakpointsNanometers[" +
            index +
            "]"
        );
      if (
        wavelength < range.minimum ||
        wavelength > range.maximum
      ) {
        throw new InvalidScientificInputError(
          "Additional spectral breakpoints must lie inside the requested wavelength range."
        );
      }
      return wavelength;
    }
  );
}

function partitionBoundaries(
  curves: readonly {
    samples: readonly {
      wavelengthNanometers: number;
    }[];
  }[],
  range:
    SensorSpectralWavelengthRangeNanometers,
  additional:
    readonly number[]
): readonly number[] {
  const boundaries = new Set<number>([
    range.minimum,
    range.maximum,
    ...additional
  ]);

  for (const curve of curves) {
    for (const sample of curve.samples) {
      if (
        sample.wavelengthNanometers >
          range.minimum &&
        sample.wavelengthNanometers <
          range.maximum
      ) {
        boundaries.add(
          sample.wavelengthNanometers
        );
      }
    }
  }

  return [...boundaries].sort(
    (a, b) => a - b
  );
}

export function calculateSensorSpectralQuadrature(
  input:
    CalculateSensorSpectralQuadratureInput
): CalculationResult<SensorSpectralQuadrature> {
  const subdivisionsPerSegment =
    requirePositiveSafeInteger(
      input.subdivisionsPerSegment,
      "subdivisionsPerSegment"
    );

  const responseProfile =
    parseSensorSpectralResponseProfile(
      input.spectralResponseProfile
    );
  const response = channelResponse(
    responseProfile,
    input.channelId
  );
  const curves =
    responseCurves(response);

  if (
    !curves.every(
      (curve) =>
        curve.wavelengthBasis ===
        input.wavelengthBasis
    )
  ) {
    throw new InvalidScientificInputError(
      "wavelengthBasis must exactly match every response curve used by the requested channel."
    );
  }

  const usable = usableResponseRange(
    curves
  );
  const range = parseRequestedRange(
    input.wavelengthRangeNanometers,
    usable
  );
  const additional =
    additionalBreakpoints(
      input.additionalBreakpointsNanometers,
      range
    );
  const boundaries =
    partitionBoundaries(
      curves,
      range,
      additional
    );
  const segmentCount =
    boundaries.length - 1;

  const totalNodeCount =
    segmentCount *
    subdivisionsPerSegment;
  if (
    !Number.isSafeInteger(
      totalNodeCount
    ) ||
    totalNodeCount <= 0
  ) {
    throw new InvalidScientificInputError(
      "Spectral quadrature node count must be a positive safe integer."
    );
  }
  if (
    totalNodeCount >
    MAX_SPECTRAL_QUADRATURE_NODES
  ) {
    throw new InvalidScientificInputError(
      "Spectral quadrature node count exceeds the safety limit of " +
        MAX_SPECTRAL_QUADRATURE_NODES +
        "."
    );
  }

  const totalSpan =
    range.maximum - range.minimum;
  const nodes:
    SensorSpectralQuadratureNode[] = [];
  let spectralSampleIndex = 0;

  for (
    let segmentIndex = 0;
    segmentIndex < segmentCount;
    segmentIndex += 1
  ) {
    const segmentMinimum =
      boundaries[segmentIndex]!;
    const segmentMaximum =
      boundaries[segmentIndex + 1]!;
    const segmentWidth =
      segmentMaximum - segmentMinimum;
    const wavelengthMeasureNanometers =
      segmentWidth /
      subdivisionsPerSegment;

    for (
      let subdivisionIndex = 0;
      subdivisionIndex <
      subdivisionsPerSegment;
      subdivisionIndex += 1
    ) {
      const wavelengthNanometers =
        segmentMinimum +
        (subdivisionIndex + 0.5) *
          wavelengthMeasureNanometers;

      const resolved =
        resolveSensorSpectralResponseAtWavelength(
          {
            colorSamplingProfile:
              input.colorSamplingProfile,
            spectralResponseProfile:
              responseProfile,
            channelId:
              input.channelId,
            wavelengthNanometers,
            wavelengthBasis:
              input.wavelengthBasis
          }
        );

      nodes.push({
        spectralSampleIndex,
        segmentIndex,
        subdivisionIndex,
        wavelengthNanometers,
        wavelengthMeasureNanometers,
        normalizedWavelengthWeight:
          wavelengthMeasureNanometers /
          totalSpan,
        response:
          resolved.value.response,
        responseInterpolationUsed:
          resolved.value
            .interpolationUsed
      });

      spectralSampleIndex += 1;
    }
  }

  const normalizedWavelengthWeightSum =
    nodes.reduce(
      (sum, node) =>
        sum +
        node.normalizedWavelengthWeight,
      0
    );
  const wavelengthMeasureSumNanometers =
    nodes.reduce(
      (sum, node) =>
        sum +
        node.wavelengthMeasureNanometers,
      0
    );

  const representative =
    resolveSensorSpectralResponseAtWavelength(
      {
        colorSamplingProfile:
          input.colorSamplingProfile,
        spectralResponseProfile:
          responseProfile,
        channelId: input.channelId,
        wavelengthNanometers:
          nodes[0]!
            .wavelengthNanometers,
        wavelengthBasis:
          input.wavelengthBasis
      }
    ).value;

  return approximationResult(
    {
      profileId:
        representative.profileId,
      colorSamplingProfileId:
        representative
          .colorSamplingProfileId,
      channelId:
        representative.channelId,
      sourceResponseKind:
        representative
          .sourceResponseKind,
      responseScope:
        representative.responseScope,
      scientificStatus:
        representative
          .scientificStatus,
      uncertainty:
        representative.uncertainty,
      wavelengthBasis:
        input.wavelengthBasis,
      wavelengthRangeNanometers:
        range,
      quadratureScheme:
        "response-breakpoint-aware-uniform-midpoint",
      segmentBoundarySource:
        "requested-range-plus-response-knots-plus-optional-additional-breakpoints",
      subdivisionsPerSegment,
      segmentCount,
      totalNodeCount,
      normalizedWavelengthWeightSum,
      wavelengthMeasureSumNanometers,
      nodes,
      sourceSpectralValuesIncluded:
        false,
      spectralIrradianceIncluded:
        false,
      spectralPhotonIrradianceIncluded:
        false,
      opticalTransmissionIncludedByQuadrature:
        false,
      wavelengthIntegrationPerformed:
        false,
      spatialIntegrationPerformed:
        false,
      temporalIntegrationPerformed:
        false,
      photonsCalculated: false,
      electronsCalculated: false,
      rawCodeValueProduced: false,
      convergenceErrorEstimated: false
    },
    "sensor-spectral-quadrature",
    "1.0.0",
    [
      "The partition includes requested range edges, response-curve knots, and optional caller-supplied spectral breakpoints.",
      "Each segment uses deterministic equal-width midpoint quadrature.",
      "Response values are resolved by resolveSensorSpectralResponseAtWavelength(); no second spectral-response interpolation rule is introduced.",
      "Response values and wavelength measures remain separate because QE and A/W responsivity require different compatible downstream source/signal semantics.",
      "No source spectral values, spectral irradiance, spectral photon irradiance, optical transmission, spatial integration, temporal integration, photon/electron conversion, or RAW output is calculated.",
      "Response-knot-aware partitioning does not guarantee adequate sampling of narrow source-spectrum or optical-transmission features; callers may supply additional breakpoints and/or increase subdivisions.",
      "No source-independent convergence/error estimate is reported because integration error depends on the downstream source spectrum and other wavelength-dependent factors."
    ]
  );
}
