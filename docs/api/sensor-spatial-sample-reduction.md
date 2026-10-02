# sensor/spatial-sample-reduction.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## reduceSensorSpatialSamplingQuadrature

Reduces explicitly identified nonnegative linear scalar values over a
validated sensor spatial quadrature.

This function does not sample a renderer or optical model itself. Callers
evaluate one value at every quadrature node's preAntiAliasingSourcePointMm
and provide those values with exact node identity. Ordering is deliberately
irrelevant.

Two domains are supported:

- relative-linear: dimensionless nonnegative irradiance-like proxy for
  deterministic renderer/science regression;
- radiometric-irradiance: physical sensor-plane irradiance in W/m^2.

The destination site's channelId is metadata only. No CFA spectral
transmittance/sensitivity is applied, so the output must not be called a
physically color-filtered mosaic sample or RAW value.

```ts
export function reduceSensorSpatialSamplingQuadrature(
  input: ReduceSensorSpatialSamplingQuadratureInput
): CalculationResult<SensorSpatialSampleReduction>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ReduceSensorSpatialSamplingQuadratureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## SensorSpatialQuadratureNodeIdentity

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorSpatialQuadratureNodeIdentity {
  antiAliasingComponentIndex: number;
  apertureSampleXIndex: number;
  apertureSampleYIndex: number;
}
```

## SensorSpatialQuadratureNodeValue

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## SensorSpatialSampleReduction

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## SensorSpatialSampleReductionValue

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```

## SensorSpatialSampleValueDomain

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
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
```
