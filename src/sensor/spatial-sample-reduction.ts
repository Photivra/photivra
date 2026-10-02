// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Create the deterministic matching key for a spatial quadrature node; this is sample identity, not a
 * cryptographic checksum. Spatial node identity binds supplied values to deterministic AA/aperture
 * quadrature. Average weights and square-micrometre geometric area measures are separate.
 * Negative/non-finite irradiance or incomplete/duplicate coverage fail; geometry does not establish
 * QE, radiometric collection area or calibrated transport.
 * Revalidate node coordinates, weights, geometric measures and coverage before using a spatial plan as
 * a trusted scientific input. Spatial node identity binds supplied values to deterministic AA/aperture
 * quadrature. Average weights and square-micrometre geometric area measures are separate.
 * Negative/non-finite irradiance or incomplete/duplicate coverage fail; geometry does not establish
 * QE, radiometric collection area or calibrated transport.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import type {
  SensorSpatialSamplingQuadrature,
  SensorSpatialSamplingQuadratureNode
} from "./spatial-sampling-quadrature.js";

const SQUARE_MICROMETERS_TO_SQUARE_METERS = 1e-12;
const WEIGHT_TOLERANCE = 1e-10;
const AREA_TOLERANCE = 1e-10;

export type SensorSpatialSampleValueDomain =
  | {
      kind: "relative-linear";
      unit: "relative";
      semantic:
        "nonnegative-sensor-plane-irradiance-proxy";
    }
  | {
      kind: "radiometric-irradiance";
      unit: "W/m^2";
      semantic: "sensor-plane-irradiance";
    };

export interface SensorSpatialQuadratureNodeIdentity {
  antiAliasingComponentIndex: number;
  apertureSampleXIndex: number;
  apertureSampleYIndex: number;
}

export interface SensorSpatialQuadratureNodeValue {
  node: SensorSpatialQuadratureNodeIdentity;
  /**
   * Nonnegative finite scalar in the declared value domain.
   *
   * Values are evaluated at the corresponding quadrature node's
   * preAntiAliasingSourcePointMm.
   */
  value: number;
}

export interface ReduceSensorSpatialSamplingQuadratureInput {
  quadrature: SensorSpatialSamplingQuadrature;
  valueDomain: SensorSpatialSampleValueDomain;
  /**
   * Exactly one explicitly identified value per quadrature node.
   *
   * Ordering is not significant; node identity is.
   */
  nodeValues: readonly SensorSpatialQuadratureNodeValue[];
}

export type SensorSpatialSampleReductionValue =
  | {
      kind: "relative-linear";
      unit: "relative";
      semantic:
        "nonnegative-sensor-plane-irradiance-proxy";
      /**
       * Dimensionless weighted spatial average in the same relative domain.
       */
      normalizedSpatialAverageRelative: number;
      /**
       * Relative value × square micrometres.
       *
       * This is a geometric area-weighted diagnostic, not radiometric power.
       */
      geometricAreaIntegralRelativeSquareMicrometers: number;
    }
  | {
      kind: "radiometric-irradiance";
      unit: "W/m^2";
      semantic: "sensor-plane-irradiance";
      /**
       * Weighted mean irradiance over the geometric aperture after applying
       * the declared normalized AA spatial redistribution.
       */
      normalizedSpatialAverageIrradianceWattsPerSquareMeter: number;
      /**
       * Incident radiant flux represented by integrating the supplied
       * irradiance over the geometric aperture under the declared normalized
       * AA redistribution. Units: watts.
       *
       * This remains pre-CFA-response, pre-QE, pre-microlens-response and
       * excludes any optical-stack throughput not already present in the
       * caller-supplied irradiance values.
       */
      geometricApertureIncidentFluxWatts: number;
    };

export interface SensorSpatialSampleReduction {
  site: {
    x: number;
    y: number;
  };
  /**
   * Semantic destination CFA/color-site label only.
   *
   * No spectral filter response is applied by this reducer.
   */
  channelId: string;
  outputMeaning:
    "channel-tagged-pre-response-spatial-sample";
  valueDomain: SensorSpatialSampleValueDomain;
  nodeCount: number;
  sourceValuesMatchedBy:
    "quadrature-node-identity";
  sourceValuesSuppliedForAllNodes: true;
  outsideImagingAreaSourceValuesRequired: boolean;
  normalizedSpatialWeightSum: number;
  geometricApertureAreaSquareMicrometers: number;
  reducedValue: SensorSpatialSampleReductionValue;
  cfaSpectralFilteringApplied: false;
  channelIdIsSpectralResponse: false;
  temporalIntegrationApplied: false;
  exposureDurationApplied: false;
  quantumEfficiencyApplied: false;
  microlensResponseApplied: false;
  opticalThroughputAppliedByReducer: false;
  photonsCalculated: false;
  electronsCalculated: false;
  shotNoiseApplied: false;
  readNoiseApplied: false;
  adcQuantizationApplied: false;
  blackLevelApplied: false;
  saturationApplied: false;
  rawCodeValueProduced: false;
  demosaicOrReconstructionApplied: false;
}

function requireSafeNonNegativeInteger(
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

function requireNonNegativeFinite(
  value: unknown,
  path: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new InvalidScientificInputError(
      path +
        " must be a finite number greater than or equal to zero."
    );
  }
  return value;
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
      path +
        " must be a finite number greater than zero."
    );
  }
  return value;
}

function parseValueDomain(
  value: unknown
): SensorSpatialSampleValueDomain {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new InvalidScientificInputError(
      "valueDomain must be an object."
    );
  }

  const record = value as Record<string, unknown>;

  if (record.kind === "relative-linear") {
    if (
      record.unit !== "relative" ||
      record.semantic !==
        "nonnegative-sensor-plane-irradiance-proxy"
    ) {
      throw new InvalidScientificInputError(
        "relative-linear valueDomain must use unit \"relative\" and the canonical nonnegative sensor-plane irradiance-proxy semantic."
      );
    }
    return {
      kind: "relative-linear",
      unit: "relative",
      semantic:
        "nonnegative-sensor-plane-irradiance-proxy"
    };
  }

  if (
    record.kind === "radiometric-irradiance"
  ) {
    if (
      record.unit !== "W/m^2" ||
      record.semantic !==
        "sensor-plane-irradiance"
    ) {
      throw new InvalidScientificInputError(
        "radiometric-irradiance valueDomain must use unit \"W/m^2\" and semantic \"sensor-plane-irradiance\"."
      );
    }
    return {
      kind: "radiometric-irradiance",
      unit: "W/m^2",
      semantic: "sensor-plane-irradiance"
    };
  }

  throw new InvalidScientificInputError(
    "valueDomain.kind is invalid."
  );
}

/**
 * Create the deterministic matching key for a spatial quadrature node; this is sample identity, not a
 * cryptographic checksum.
 *
 * Spatial node identity binds supplied values to deterministic AA/aperture quadrature. Average weights
 * and square-micrometre geometric area measures are separate. Negative/non-finite irradiance or
 * incomplete/duplicate coverage fail; geometry does not establish QE, radiometric collection area or
 * calibrated transport.
 * @param identity - SensorSpatialQuadratureNodeIdentity. See the linked contract for coordinate, unit and profile binding semantics.
 * @returns string. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function sensorSpatialQuadratureNodeIdentityKey(
  identity: SensorSpatialQuadratureNodeIdentity
): string {
  return (
    identity.antiAliasingComponentIndex +
    ":" +
    identity.apertureSampleXIndex +
    ":" +
    identity.apertureSampleYIndex
  );
}

function validateQuadratureNode(
  node: SensorSpatialSamplingQuadratureNode,
  index: number
): SensorSpatialQuadratureNodeIdentity {
  const identity = {
    antiAliasingComponentIndex:
      requireSafeNonNegativeInteger(
        node.antiAliasingComponentIndex,
        "quadrature.nodes[" +
          index +
          "].antiAliasingComponentIndex"
      ),
    apertureSampleXIndex:
      requireSafeNonNegativeInteger(
        node.apertureSampleXIndex,
        "quadrature.nodes[" +
          index +
          "].apertureSampleXIndex"
      ),
    apertureSampleYIndex:
      requireSafeNonNegativeInteger(
        node.apertureSampleYIndex,
        "quadrature.nodes[" +
          index +
          "].apertureSampleYIndex"
      )
  };

  requireNonNegativeFinite(
    node.combinedNormalizedSpatialWeight,
    "quadrature.nodes[" +
      index +
      "].combinedNormalizedSpatialWeight"
  );
  requireNonNegativeFinite(
    node.combinedAreaMeasureSquareMicrometers,
    "quadrature.nodes[" +
      index +
      "].combinedAreaMeasureSquareMicrometers"
  );

  return identity;
}

function approximatelyEqual(
  actual: number,
  expected: number,
  tolerance: number
): boolean {
  const scale = Math.max(
    1,
    Math.abs(actual),
    Math.abs(expected)
  );
  return (
    Math.abs(actual - expected) <=
    tolerance * scale
  );
}

/**
 * Revalidate node coordinates, weights, geometric measures and coverage before using a spatial plan as
 * a trusted scientific input.
 *
 * Spatial node identity binds supplied values to deterministic AA/aperture quadrature. Average weights
 * and square-micrometre geometric area measures are separate. Negative/non-finite irradiance or
 * incomplete/duplicate coverage fail; geometry does not establish QE, radiometric collection area or
 * calibrated transport.
 * @param quadrature - SensorSpatialSamplingQuadrature. See the linked contract for coordinate, unit and profile binding semantics.
 * @returns Map<string, SensorSpatialSamplingQuadratureNode>. Return shape and scientific status are explicit; no calibration is inferred from successful execution.
 *
 * @see docs/API_REFERENCE.md for the root export and exact type graph.
 */
export function validateSensorSpatialSamplingQuadrature(
  quadrature: SensorSpatialSamplingQuadrature
): Map<string, SensorSpatialSamplingQuadratureNode> {
  if (
    typeof quadrature !== "object" ||
    quadrature === null ||
    !Array.isArray(quadrature.nodes)
  ) {
    throw new InvalidScientificInputError(
      "quadrature must contain a nodes array."
    );
  }

  const totalNodeCount =
    requireSafeNonNegativeInteger(
      quadrature.totalNodeCount,
      "quadrature.totalNodeCount"
    );

  if (
    totalNodeCount === 0 ||
    quadrature.nodes.length !==
      totalNodeCount
  ) {
    throw new InvalidScientificInputError(
      "quadrature.totalNodeCount must be positive and exactly match quadrature.nodes.length."
    );
  }

  if (
    quadrature.colorSamplingProfileId !== undefined &&
    (
      typeof quadrature.colorSamplingProfileId !== "string" ||
      quadrature.colorSamplingProfileId.trim().length === 0
    )
  ) {
    throw new InvalidScientificInputError(
      "quadrature.colorSamplingProfileId must be a non-empty string when supplied."
    );
  }

  if (
    typeof quadrature.channelId !== "string" ||
    quadrature.channelId.trim().length === 0
  ) {
    throw new InvalidScientificInputError(
      "quadrature.channelId must be a non-empty string."
    );
  }

  requireSafeNonNegativeInteger(
    quadrature.site.x,
    "quadrature.site.x"
  );
  requireSafeNonNegativeInteger(
    quadrature.site.y,
    "quadrature.site.y"
  );

  const geometricArea =
    requirePositiveFinite(
      quadrature.geometricApertureAreaSquareMicrometers,
      "quadrature.geometricApertureAreaSquareMicrometers"
    );

  const nodesByKey =
    new Map<
      string,
      SensorSpatialSamplingQuadratureNode
    >();
  let weightSum = 0;
  let areaSum = 0;

  quadrature.nodes.forEach(
    (node, index) => {
      const identity =
        validateQuadratureNode(node, index);
      const key = sensorSpatialQuadratureNodeIdentityKey(identity);

      if (nodesByKey.has(key)) {
        throw new InvalidScientificInputError(
          "quadrature contains duplicate node identities."
        );
      }

      nodesByKey.set(key, node);
      weightSum +=
        node.combinedNormalizedSpatialWeight;
      areaSum +=
        node.combinedAreaMeasureSquareMicrometers;

      if (
        !Number.isFinite(weightSum) ||
        !Number.isFinite(areaSum)
      ) {
        throw new InvalidScientificInputError(
          "quadrature aggregate weights/measures must remain finite."
        );
      }
    }
  );

  if (
    !approximatelyEqual(
      weightSum,
      1,
      WEIGHT_TOLERANCE
    )
  ) {
    throw new InvalidScientificInputError(
      "quadrature combined normalized spatial weights must sum to 1."
    );
  }

  if (
    !approximatelyEqual(
      areaSum,
      geometricArea,
      AREA_TOLERANCE
    )
  ) {
    throw new InvalidScientificInputError(
      "quadrature combined geometric area measures must sum to the geometric aperture area."
    );
  }

  if (
    !approximatelyEqual(
      quadrature.normalizedSpatialWeightSum,
      weightSum,
      WEIGHT_TOLERANCE
    )
  ) {
    throw new InvalidScientificInputError(
      "quadrature.normalizedSpatialWeightSum does not match node weights."
    );
  }

  if (
    !approximatelyEqual(
      quadrature.combinedAreaMeasureSumSquareMicrometers,
      areaSum,
      AREA_TOLERANCE
    )
  ) {
    throw new InvalidScientificInputError(
      "quadrature.combinedAreaMeasureSumSquareMicrometers does not match node measures."
    );
  }

  return nodesByKey;
}

function parseNodeValues(
  nodeValues: readonly SensorSpatialQuadratureNodeValue[],
  nodesByKey: ReadonlyMap<
    string,
    SensorSpatialSamplingQuadratureNode
  >
): Map<string, number> {
  if (!Array.isArray(nodeValues)) {
    throw new InvalidScientificInputError(
      "nodeValues must be an array."
    );
  }

  if (
    nodeValues.length !==
    nodesByKey.size
  ) {
    throw new InvalidScientificInputError(
      "nodeValues must contain exactly one value for every quadrature node."
    );
  }

  const valuesByKey = new Map<string, number>();

  nodeValues.forEach((entry, index) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.node !== "object" ||
      entry.node === null
    ) {
      throw new InvalidScientificInputError(
        "nodeValues[" +
          index +
          "] must contain a node identity object."
      );
    }

    const identity = {
      antiAliasingComponentIndex:
        requireSafeNonNegativeInteger(
          entry.node
            .antiAliasingComponentIndex,
          "nodeValues[" +
            index +
            "].node.antiAliasingComponentIndex"
        ),
      apertureSampleXIndex:
        requireSafeNonNegativeInteger(
          entry.node.apertureSampleXIndex,
          "nodeValues[" +
            index +
            "].node.apertureSampleXIndex"
        ),
      apertureSampleYIndex:
        requireSafeNonNegativeInteger(
          entry.node.apertureSampleYIndex,
          "nodeValues[" +
            index +
            "].node.apertureSampleYIndex"
        )
    };
    const key = sensorSpatialQuadratureNodeIdentityKey(identity);

    if (!nodesByKey.has(key)) {
      throw new InvalidScientificInputError(
        "nodeValues[" +
          index +
          "] identifies a node that is not present in quadrature."
      );
    }
    if (valuesByKey.has(key)) {
      throw new InvalidScientificInputError(
        "nodeValues contains duplicate node identities."
      );
    }

    valuesByKey.set(
      key,
      requireNonNegativeFinite(
        entry.value,
        "nodeValues[" +
          index +
          "].value"
      )
    );
  });

  return valuesByKey;
}

/**
 * Reduces explicitly identified nonnegative linear scalar values over a
 * validated sensor spatial quadrature.
 *
 * This function does not sample a renderer or optical model itself. Callers
 * evaluate one value at every quadrature node's preAntiAliasingSourcePointMm
 * and provide those values with exact node identity. Ordering is deliberately
 * irrelevant.
 *
 * Two domains are supported:
 *
 * - relative-linear: dimensionless nonnegative irradiance-like proxy for
 *   deterministic renderer/science regression;
 * - radiometric-irradiance: physical sensor-plane irradiance in W/m^2.
 *
 * The destination site's channelId is metadata only. No CFA spectral
 * transmittance/sensitivity is applied, so the output must not be called a
 * physically color-filtered mosaic sample or RAW value.
 */
export function reduceSensorSpatialSamplingQuadrature(
  input: ReduceSensorSpatialSamplingQuadratureInput
): CalculationResult<SensorSpatialSampleReduction> {
  const domain = parseValueDomain(
    input.valueDomain
  );
  const nodesByKey = validateSensorSpatialSamplingQuadrature(
    input.quadrature
  );
  const valuesByKey = parseNodeValues(
    input.nodeValues,
    nodesByKey
  );

  let weightedAverage = 0;
  let areaWeightedIntegral = 0;

  nodesByKey.forEach((node, key) => {
    const value = valuesByKey.get(key);
    if (value === undefined) {
      throw new InvalidScientificInputError(
        "A quadrature node is missing its explicit source value."
      );
    }

    weightedAverage +=
      value *
      node.combinedNormalizedSpatialWeight;
    areaWeightedIntegral +=
      value *
      node.combinedAreaMeasureSquareMicrometers;

    if (
      !Number.isFinite(weightedAverage) ||
      !Number.isFinite(areaWeightedIntegral)
    ) {
      throw new InvalidScientificInputError(
        "Reduced spatial sample must remain finite."
      );
    }
  });

  const reducedValue:
    SensorSpatialSampleReductionValue =
    domain.kind === "relative-linear"
      ? {
          kind: "relative-linear",
          unit: "relative",
          semantic:
            "nonnegative-sensor-plane-irradiance-proxy",
          normalizedSpatialAverageRelative:
            weightedAverage,
          geometricAreaIntegralRelativeSquareMicrometers:
            areaWeightedIntegral
        }
      : {
          kind: "radiometric-irradiance",
          unit: "W/m^2",
          semantic:
            "sensor-plane-irradiance",
          normalizedSpatialAverageIrradianceWattsPerSquareMeter:
            weightedAverage,
          geometricApertureIncidentFluxWatts:
            areaWeightedIntegral *
            SQUARE_MICROMETERS_TO_SQUARE_METERS
        };

  return approximationResult(
    {
      site: {
        ...input.quadrature.site
      },
      channelId:
        input.quadrature.channelId,
      outputMeaning:
        "channel-tagged-pre-response-spatial-sample",
      valueDomain: domain,
      nodeCount:
        input.quadrature.totalNodeCount,
      sourceValuesMatchedBy:
        "quadrature-node-identity",
      sourceValuesSuppliedForAllNodes: true,
      outsideImagingAreaSourceValuesRequired:
        input.quadrature
          .preAntiAliasingSourceOutsideImagingAreaNodeCount >
        0,
      normalizedSpatialWeightSum:
        input.quadrature
          .normalizedSpatialWeightSum,
      geometricApertureAreaSquareMicrometers:
        input.quadrature
          .geometricApertureAreaSquareMicrometers,
      reducedValue,
      cfaSpectralFilteringApplied: false,
      channelIdIsSpectralResponse: false,
      temporalIntegrationApplied: false,
      exposureDurationApplied: false,
      quantumEfficiencyApplied: false,
      microlensResponseApplied: false,
      opticalThroughputAppliedByReducer:
        false,
      photonsCalculated: false,
      electronsCalculated: false,
      shotNoiseApplied: false,
      readNoiseApplied: false,
      adcQuantizationApplied: false,
      blackLevelApplied: false,
      saturationApplied: false,
      rawCodeValueProduced: false,
      demosaicOrReconstructionApplied: false
    },
    "sensor-spatial-sample-reduction",
    "1.0.0",
    [
      "Input values are nonnegative linear scalars evaluated at each quadrature node's pre-AA source coordinate.",
      "Node values are matched by explicit quadrature-node identity rather than positional array order.",
      "The destination CFA/color channel is metadata only; no spectral transmittance, sensor spectral responsivity or quantum efficiency is applied.",
      "Relative-linear values are dimensionless irradiance-like proxies for deterministic testing and do not become physical radiometry.",
      "Radiometric-irradiance values use W/m^2; geometric aperture integration converts square micrometres to square metres to report incident radiant flux in watts.",
      "The physical irradiance branch reports geometric-aperture incident flux under the caller-supplied irradiance field and normalized AA spatial redistribution; it does not add omitted optical-stack throughput, microlens response, CFA response or sensor conversion.",
      "Every quadrature node requires an explicit source value, including pre-AA source points outside the active imaging area; no automatic clamping, zero-fill, extrapolation or renormalization occurs.",
      "Negative, NaN and infinite source values are rejected; signed intermediate color-transform values are outside this pre-response sensor-plane contract.",
      "Temporal exposure integration, wavelength integration, photons/electrons, noise, saturation, black level, ADC quantization, RAW code values and reconstruction remain separate future work."
    ]
  );
}
