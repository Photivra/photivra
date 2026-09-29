// SPDX-License-Identifier: Apache-2.0

import {
  approximationResult,
  type CalculationResult
} from "../core/calculation-result.js";
import {
  InvalidScientificInputError,
  requirePositiveInteger
} from "../core/validation.js";
import type {
  NativeEffectiveRasterColorSamplingBindingProfile
} from "./capture-color-sampling-binding.js";
import type {
  NativeColorSamplingSiteIndex,
  SensorColorSamplingProfile
} from "./color-sampling.js";
import {
  resolveAntiAliasingSpatialKernel,
  type SensorOpticalStackProfile
} from "./optical-stack.js";
import {
  resolveSensorSamplingAperture,
  type SensorSamplingApertureProfile
} from "./sampling-aperture.js";
import type {
  NativeImageRaster,
  SensorImagingArea
} from "./sensor-geometry.js";

const MAX_SPATIAL_QUADRATURE_NODES = 100_000;

export interface CalculateSensorSpatialSamplingQuadratureInput {
  imagingArea: SensorImagingArea;
  nativeRaster: NativeImageRaster;
  colorSamplingProfile: SensorColorSamplingProfile;
  colorSamplingBindingProfile: NativeEffectiveRasterColorSamplingBindingProfile;
  samplingApertureProfile: SensorSamplingApertureProfile;
  opticalStackProfile: SensorOpticalStackProfile;
  site: NativeColorSamplingSiteIndex;
  /** Number of midpoint cells across the geometric aperture width. */
  spatialSampleCountX: number;
  /** Number of midpoint cells across the geometric aperture height. */
  spatialSampleCountY: number;
}

export interface SensorSpatialSamplingQuadratureNode {
  antiAliasingComponentIndex: number;
  apertureSampleXIndex: number;
  apertureSampleYIndex: number;
  /**
   * Destination point inside the geometric sensitive aperture after the
   * declared AA point-splitting response.
   *
   * Native sensor physical coordinates, millimetres from the optical axis.
   */
  destinationAperturePointMm: {
    x: number;
    y: number;
  };
  /**
   * Declared AA displacement of optical energy on the sensor plane.
   *
   * +X right, +Y down; micrometres.
   */
  antiAliasingOffsetMicrometers: {
    x: number;
    y: number;
  };
  /**
   * Pre-AA source point that maps to destinationAperturePointMm under the
   * declared split component:
   *
   * source = destination - AA offset
   */
  preAntiAliasingSourcePointMm: {
    x: number;
    y: number;
  };
  /**
   * Whether the pre-AA source point lies inside the active physical imaging
   * area. False is not an error; downstream source-coverage policy decides how
   * to handle valid optical support outside the active sampling area.
   */
  preAntiAliasingSourceInsideImagingArea: boolean;
  /** Dimensionless midpoint weight for the aperture-area average. */
  normalizedApertureWeight: number;
  /** Dimensionless normalized weight from the AA split component. */
  normalizedAntiAliasingWeight: number;
  /**
   * Dimensionless product used for a spatial average of a downstream optical
   * field under this quadrature approximation.
   */
  combinedNormalizedSpatialWeight: number;
  /**
   * Geometric area measure represented by this aperture midpoint before the
   * AA component weight is applied. Units: square micrometres.
   */
  apertureAreaMeasureSquareMicrometers: number;
  /**
   * Geometric area measure multiplied by the dimensionless AA component
   * weight. Units remain square micrometres.
   *
   * This is not an effective radiometric collection area.
   */
  combinedAreaMeasureSquareMicrometers: number;
}

export interface SensorSpatialSamplingQuadrature {
  coordinateSystem: "native-sensor-physical";
  colorSamplingProfileId?: string;
  samplingApertureProfileId?: string;
  opticalStackProfileId?: string;
  site: NativeColorSamplingSiteIndex;
  channelId: string;
  quadratureScheme:
    "tensor-product-uniform-midpoint";
  outputMeaning:
    "pre-aa-optical-field-spatial-quadrature-nodes";
  spatialSampleCountX: number;
  spatialSampleCountY: number;
  antiAliasingComponentCount: number;
  totalNodeCount: number;
  geometricApertureAreaSquareMicrometers: number;
  nominalSiteCellAreaSquareMicrometers?: number;
  geometricSensitiveAreaFractionOfLatticeCell?: number;
  normalizedSpatialWeightSum: number;
  combinedAreaMeasureSumSquareMicrometers: number;
  preAntiAliasingSourceOutsideImagingAreaNodeCount: number;
  sourcePointRule:
    "pre-aa-source-equals-destination-minus-aa-offset";
  destinationCfaChannelAppliesToAllNodes: true;
  cfaReassignmentBySourceCoordinate: false;
  sourceCoveragePolicy: "not-applied";
  nodes: readonly SensorSpatialSamplingQuadratureNode[];
  /**
   * Hard scientific boundaries.
   */
  opticalFieldValuesIncluded: false;
  radianceIncluded: false;
  photonsIncluded: false;
  electronsIncluded: false;
  spectralResponseIncluded: false;
  quantumEfficiencyIncluded: false;
  opticalThroughputIncluded: false;
  microlensResponseIncluded: false;
  chargeDiffusionIncluded: false;
  electricalCrosstalkIncluded: false;
  temporalIntegrationIncluded: false;
  rawSampleValueIncluded: false;
  reconstructedPixelValueIncluded: false;
  geometricAreaMeasureIsRadiometricCollectionArea: false;
  componentEvidence: {
    samplingApertureProfile: readonly import("../core/evidence-provenance.js").EvidenceProvenance[];
    samplingApertureLattice: readonly import("../core/evidence-provenance.js").EvidenceProvenance[];
    geometricSensitiveAperture: readonly import("../core/evidence-provenance.js").EvidenceProvenance[];
    opticalStackProfile: readonly import("../core/evidence-provenance.js").EvidenceProvenance[];
    antiAliasingResponse: readonly import("../core/evidence-provenance.js").EvidenceProvenance[];
  };
}

function midpointCoordinate(
  index: number,
  count: number
): number {
  return (index + 0.5) / count;
}

function insideImagingArea(
  pointMm: { x: number; y: number },
  imagingArea: SensorImagingArea
): boolean {
  const halfWidth = imagingArea.widthMm / 2;
  const halfHeight = imagingArea.heightMm / 2;

  return (
    pointMm.x >= -halfWidth &&
    pointMm.x <= halfWidth &&
    pointMm.y >= -halfHeight &&
    pointMm.y <= halfHeight
  );
}

/**
 * Builds deterministic spatial quadrature nodes for one CFA/color-sampling site.
 *
 * The quadrature composes:
 *
 * 1. the resolved geometric sensitive aperture from the sampling-aperture
 *    foundation; and
 * 2. the resolved effective AA point-splitting kernel from the optical-stack
 *    foundation.
 *
 * The first aperture integration uses a tensor-product uniform midpoint rule.
 * For an AA component that moves optical energy by +delta on the sensor plane,
 * a destination aperture point samples the pre-AA optical field at
 * destination - delta. This inverse-source convention prevents applying the AA
 * shift twice.
 *
 * The destination sensor site's CFA channel applies to every node. The
 * pre-AA source coordinate is an optical-field location, not another CFA site;
 * therefore shifted source coordinates never reassign the destination channel.
 *
 * Nodes whose pre-AA source coordinates fall outside the active imaging area
 * are retained. They are neither clamped nor dropped/renormalized. A renderer
 * or optical-field provider owns source-coverage policy.
 *
 * normalized weights approximate a spatial average. Square-micrometre measures
 * approximate a geometric area integral. Neither includes radiometric
 * throughput, QE, photon conversion, microlenses, diffusion/crosstalk, or
 * temporal integration.
 */
export function calculateSensorSpatialSamplingQuadrature(
  input: CalculateSensorSpatialSamplingQuadratureInput
): CalculationResult<SensorSpatialSamplingQuadrature> {
  requirePositiveInteger(
    "spatialSampleCountX",
    input.spatialSampleCountX
  );
  requirePositiveInteger(
    "spatialSampleCountY",
    input.spatialSampleCountY
  );

  const samplingAperture =
    resolveSensorSamplingAperture({
      imagingArea: input.imagingArea,
      nativeRaster: input.nativeRaster,
      colorSamplingProfile:
        input.colorSamplingProfile,
      colorSamplingBindingProfile:
        input.colorSamplingBindingProfile,
      samplingApertureProfile:
        input.samplingApertureProfile,
      site: input.site
    });

  const antiAliasing =
    resolveAntiAliasingSpatialKernel(
      input.opticalStackProfile
    );

  const apertureNodeCount =
    input.spatialSampleCountX *
    input.spatialSampleCountY;
  if (!Number.isSafeInteger(apertureNodeCount)) {
    throw new InvalidScientificInputError(
      "spatialSampleCountX × spatialSampleCountY must be a safe integer."
    );
  }

  const totalNodeCount =
    apertureNodeCount *
    antiAliasing.components.length;
  if (!Number.isSafeInteger(totalNodeCount)) {
    throw new InvalidScientificInputError(
      "Spatial quadrature node count must be a safe integer."
    );
  }
  if (
    totalNodeCount >
    MAX_SPATIAL_QUADRATURE_NODES
  ) {
    throw new InvalidScientificInputError(
      "Spatial quadrature node count exceeds the per-site safety limit of " +
        MAX_SPATIAL_QUADRATURE_NODES +
        ". Increase fidelity by tiling or batching downstream work rather than allocating one oversized node set."
    );
  }

  const aperture =
    samplingAperture.geometricSensitiveAperture;
  const normalizedApertureWeight =
    1 / apertureNodeCount;
  const apertureAreaMeasureSquareMicrometers =
    aperture.areaSquareMicrometers /
    apertureNodeCount;

  const apertureCenterMm =
    aperture.centerFromOpticalAxisMm;
  const widthMm =
    aperture.widthMicrometers / 1000;
  const heightMm =
    aperture.heightMicrometers / 1000;
  const leftMm =
    apertureCenterMm.x - widthMm / 2;
  const topMm =
    apertureCenterMm.y - heightMm / 2;

  const nodes: SensorSpatialSamplingQuadratureNode[] = [];
  let outsideCount = 0;

  antiAliasing.components.forEach(
    (aaComponent, antiAliasingComponentIndex) => {
      const aaOffsetMm = {
        x:
          aaComponent.offsetMicrometers.x /
          1000,
        y:
          aaComponent.offsetMicrometers.y /
          1000
      };

      for (
        let apertureSampleYIndex = 0;
        apertureSampleYIndex <
        input.spatialSampleCountY;
        apertureSampleYIndex += 1
      ) {
        const yPhase = midpointCoordinate(
          apertureSampleYIndex,
          input.spatialSampleCountY
        );
        const destinationY =
          topMm + yPhase * heightMm;

        for (
          let apertureSampleXIndex = 0;
          apertureSampleXIndex <
          input.spatialSampleCountX;
          apertureSampleXIndex += 1
        ) {
          const xPhase = midpointCoordinate(
            apertureSampleXIndex,
            input.spatialSampleCountX
          );
          const destinationX =
            leftMm + xPhase * widthMm;
          const destinationAperturePointMm = {
            x: destinationX,
            y: destinationY
          };
          const preAntiAliasingSourcePointMm = {
            x:
              destinationX -
              aaOffsetMm.x,
            y:
              destinationY -
              aaOffsetMm.y
          };
          const sourceInside = insideImagingArea(
            preAntiAliasingSourcePointMm,
            input.imagingArea
          );
          if (!sourceInside) {
            outsideCount += 1;
          }

          const combinedNormalizedSpatialWeight =
            normalizedApertureWeight *
            aaComponent.normalizedWeight;
          const combinedAreaMeasureSquareMicrometers =
            apertureAreaMeasureSquareMicrometers *
            aaComponent.normalizedWeight;

          nodes.push({
            antiAliasingComponentIndex,
            apertureSampleXIndex,
            apertureSampleYIndex,
            destinationAperturePointMm,
            antiAliasingOffsetMicrometers: {
              ...aaComponent.offsetMicrometers
            },
            preAntiAliasingSourcePointMm,
            preAntiAliasingSourceInsideImagingArea:
              sourceInside,
            normalizedApertureWeight,
            normalizedAntiAliasingWeight:
              aaComponent.normalizedWeight,
            combinedNormalizedSpatialWeight,
            apertureAreaMeasureSquareMicrometers,
            combinedAreaMeasureSquareMicrometers
          });
        }
      }
    }
  );

  const normalizedSpatialWeightSum =
    nodes.reduce(
      (sum, node) =>
        sum +
        node.combinedNormalizedSpatialWeight,
      0
    );
  const combinedAreaMeasureSumSquareMicrometers =
    nodes.reduce(
      (sum, node) =>
        sum +
        node.combinedAreaMeasureSquareMicrometers,
      0
    );

  return approximationResult(
    {
      coordinateSystem:
        "native-sensor-physical",
      colorSamplingProfileId:
        samplingAperture
          .colorSamplingProfileId,
      samplingApertureProfileId:
        samplingAperture.profileId,
      opticalStackProfileId:
        antiAliasing.profileId,
      site: {
        ...samplingAperture.site
      },
      channelId:
        samplingAperture.channelId,
      quadratureScheme:
        "tensor-product-uniform-midpoint",
      outputMeaning:
        "pre-aa-optical-field-spatial-quadrature-nodes",
      spatialSampleCountX:
        input.spatialSampleCountX,
      spatialSampleCountY:
        input.spatialSampleCountY,
      antiAliasingComponentCount:
        antiAliasing.components.length,
      totalNodeCount,
      geometricApertureAreaSquareMicrometers:
        aperture.areaSquareMicrometers,
      nominalSiteCellAreaSquareMicrometers:
        samplingAperture.lattice
          .nominalCellAreaSquareMicrometers,
      geometricSensitiveAreaFractionOfLatticeCell:
        aperture
          .geometricSensitiveAreaFractionOfLatticeCell,
      normalizedSpatialWeightSum,
      combinedAreaMeasureSumSquareMicrometers,
      preAntiAliasingSourceOutsideImagingAreaNodeCount:
        outsideCount,
      sourcePointRule:
        "pre-aa-source-equals-destination-minus-aa-offset",
      destinationCfaChannelAppliesToAllNodes:
        true,
      cfaReassignmentBySourceCoordinate:
        false,
      sourceCoveragePolicy:
        "not-applied",
      nodes,
      opticalFieldValuesIncluded: false,
      radianceIncluded: false,
      photonsIncluded: false,
      electronsIncluded: false,
      spectralResponseIncluded: false,
      quantumEfficiencyIncluded: false,
      opticalThroughputIncluded: false,
      microlensResponseIncluded: false,
      chargeDiffusionIncluded: false,
      electricalCrosstalkIncluded: false,
      temporalIntegrationIncluded: false,
      rawSampleValueIncluded: false,
      reconstructedPixelValueIncluded: false,
      geometricAreaMeasureIsRadiometricCollectionArea:
        false,
      componentEvidence: {
        samplingApertureProfile:
          samplingAperture.provenance.profile,
        samplingApertureLattice:
          samplingAperture.provenance.lattice,
        geometricSensitiveAperture:
          samplingAperture.provenance.aperture,
        opticalStackProfile:
          antiAliasing.provenance.profile,
        antiAliasingResponse:
          antiAliasing.provenance
            .antiAliasingResponse
      }
    },
    "sensor-spatial-sampling-quadrature",
    "1.0.0",
    [
      "Spatial aperture integration uses a deterministic tensor-product uniform midpoint rule.",
      "The destination sensor site's semantic CFA/color channel applies to every quadrature node; pre-AA source coordinates never reassign the destination channel.",
      "AA point-splitting is inverse-sampled: a +delta output displacement reads the pre-AA optical field at destination - delta.",
      "AA component weights and aperture midpoint weights are dimensionless normalized spatial-average weights.",
      "Square-micrometre measures are geometric integration measures only and are not effective radiometric collection area, throughput, QE, or photon count.",
      "Pre-AA source points may leave the active physical imaging area and are not clamped, dropped, or renormalized.",
      "The AA kernel remains the optical-stack foundation's field/wavelength/polarization-invariant approximation where applicable.",
      "Microlens spatial response, charge diffusion, electrical/optical crosstalk, spectral response, radiometry, temporal integration, RAW sample generation, and reconstruction remain separate future work.",
      "No geometry-only spatial quadrature error estimate is reported because downstream optical-field spatial frequency/content determines integration error."
    ]
  );
}
