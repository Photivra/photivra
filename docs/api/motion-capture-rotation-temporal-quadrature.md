# motion/capture-rotation-temporal-quadrature.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateCaptureRotationTemporalQuadrature

Builds deterministic temporal quadrature nodes for pure-camera-rotation
capture geometry over each destination point's local exposure interval.

The first model uses an equal-width midpoint rule. Every node reuses
calculateCaptureRotationInverseMappings(), so the instantaneous geometry has
one authoritative implementation.

No radiance is evaluated here. normalizedTimeWeight is suitable for a
downstream time-average under a uniform temporal-response assumption, while
timeMeasureSeconds is the local dt measure for a downstream time integral.
Neither weight includes shutter transmission, scene flicker, sensor
response, radiometric calibration or any other throughput term.

The function intentionally reports no numerical integration error estimate:
geometry alone cannot determine the error in a scene-radiance integral.
Downstream renderers may compare increasing temporal sample counts in their
own radiance domain when convergence evidence is required.

```ts
export function calculateCaptureRotationTemporalQuadrature(
  input: CalculateCaptureRotationTemporalQuadratureInput
): CalculationResult<CaptureRotationTemporalQuadrature>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateCaptureRotationTemporalQuadratureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateCaptureRotationTemporalQuadratureInput
  extends Omit<
    CalculateCaptureRotationInverseMappingsInput,
    "localExposurePhase"
  > {
  /**
   * Number of deterministic temporal quadrature nodes per local exposure
   * interval. Nodes use the uniform midpoint rule.
   */
  temporalSampleCount: number;
}
```

## CaptureRotationTemporalQuadrature

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureRotationTemporalQuadrature {
  timeReference: "first-opening-boundary-phase";
  quadratureScheme: "uniform-midpoint";
  temporalResponseModel: "uniform-over-local-exposure";
  temporalSampleCount: number;
  /**
   * The quadrature returns geometry and temporal measure only. It does not
   * integrate radiance or produce a blur kernel.
   */
  outputMeaning: "temporal-geometry-quadrature-nodes";
  points: readonly CaptureRotationTemporalQuadraturePoint[];
  componentProvenance: {
    instantaneousInverseMapping: CalculationProvenance;
  };
}
```

## CaptureRotationTemporalQuadratureNode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureRotationTemporalQuadratureNode {
  temporalSampleIndex: number;
  /**
   * Normalized phase in the local exposure interval, strictly inside (0, 1).
   */
  localExposurePhase: number;
  captureTimeSecondsFromReference: number;
  /**
   * Dimensionless weight for approximating the time-average of a downstream
   * quantity under a uniform temporal-response assumption.
   */
  normalizedTimeWeight: number;
  /**
   * Seconds-valued quadrature measure for approximating a time integral.
   *
   * This is temporal measure only. It is not shutter transmission, radiometric
   * throughput, photon count, sensor response, or scene radiance.
   */
  timeMeasureSeconds: number;
  referenceImagePointMm: ImagePlanePointMm;
  inverseDisplacementImagePlaneMm: {
    x: number;
    y: number;
    distance: number;
  };
  inverseDisplacementNativeSamples: RasterVector & {
    distance: number;
  };
  inverseDisplacementOrientedSamples: RasterVector & {
    distance: number;
  };
}
```

## CaptureRotationTemporalQuadraturePoint

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureRotationTemporalQuadraturePoint {
  destinationPointNative: RasterPoint;
  destinationImagePointMm: ImagePlanePointMm;
  localExposureWindow: {
    startSecondsFromCaptureReference: number;
    endSecondsFromCaptureReference: number;
    durationSeconds: number;
  };
  nodes: readonly CaptureRotationTemporalQuadratureNode[];
}
```
