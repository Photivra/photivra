# sensor/spatial-sampling-quadrature.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSensorSpatialSamplingQuadrature

Builds deterministic spatial quadrature nodes for one CFA/color-sampling site.

The quadrature composes:

1. the resolved geometric sensitive aperture from the sampling-aperture
   foundation; and
2. the resolved effective AA point-splitting kernel from the optical-stack
   foundation.

The first aperture integration uses a tensor-product uniform midpoint rule.
For an AA component that moves optical energy by +delta on the sensor plane,
a destination aperture point samples the pre-AA optical field at
destination - delta. This inverse-source convention prevents applying the AA
shift twice.

The destination sensor site's CFA channel applies to every node. The
pre-AA source coordinate is an optical-field location, not another CFA site;
therefore shifted source coordinates never reassign the destination channel.

Nodes whose pre-AA source coordinates fall outside the active imaging area
are retained. They are neither clamped nor dropped/renormalized. A renderer
or optical-field provider owns source-coverage policy.

normalized weights approximate a spatial average. Square-micrometre measures
approximate a geometric area integral. Neither includes radiometric
throughput, QE, photon conversion, microlenses, diffusion/crosstalk, or
temporal integration.

```ts
export function calculateSensorSpatialSamplingQuadrature(
  input: CalculateSensorSpatialSamplingQuadratureInput
): CalculationResult<SensorSpatialSamplingQuadrature>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSensorSpatialSamplingQuadratureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## SensorSpatialSamplingQuadrature

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## SensorSpatialSamplingQuadratureNode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```
