# motion/capture-translation-parallax-temporal-quadrature.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateCaptureTranslationParallaxTemporalQuadrature

Evaluates depth-dependent translational parallax at deterministic midpoint
nodes over each scene point's authoritative local exposure window.

The model is deliberately per point. Camera translation and optional subject
translation coexist through relative linear motion; neither is redefined as
the other. Camera rotation and visibility/occlusion remain separate models.

```ts
export function calculateCaptureTranslationParallaxTemporalQuadrature(
  input:
    CalculateCaptureTranslationParallaxTemporalQuadratureInput
): CalculationResult<CaptureTranslationParallaxTemporalQuadrature>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateCaptureTranslationParallaxTemporalQuadratureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateCaptureTranslationParallaxTemporalQuadratureInput {
  timing:
    ResolvedCaptureModeTiming;
  imagingArea:
    SensorImagingArea;
  focalLengthMm: number;
  focusDistanceM?: number;
  orientation:
    CaptureOrientation;
  /**
   * Constant physical camera-center translation in camera axes at the capture
   * reference phase. Rotation is intentionally separate.
   */
  cameraTranslationVelocityMps:
    Vector3;
  temporalSampleCount: number;
  sceneSamples:
    readonly CaptureTranslationParallaxSceneSample[];
}
```

## CaptureTranslationParallaxSceneSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureTranslationParallaxSceneSample {
  sampleId: string;
  /**
   * Native destination point whose authoritative local exposure window applies
   * to this scene sample.
   */
  destinationPointNative:
    RasterPoint;
  /**
   * Metric point position in the camera axes at the first-opening-boundary
   * phase. +X right, +Y up, +Z forward/away from the camera.
   */
  positionCameraM: Vector3;
  /**
   * Optional constant subject/world-point velocity in the same initial camera
   * axes. Omitted means stationary world point.
   */
  subjectVelocityMps?: Vector3;
}
```

## CaptureTranslationParallaxTemporalNode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureTranslationParallaxTemporalNode {
  temporalSampleIndex: number;
  localExposurePhase: number;
  captureTimeSecondsFromReference:
    number;
  normalizedTimeWeight: number;
  timeMeasureSeconds: number;
  relativePositionCameraM:
    Vector3;
  mappedImagePointMm: {
    x: number;
    y: number;
  };
  deltaFromReferenceImagePlaneMm: {
    x: number;
    y: number;
    distance: number;
  };
  deltaNativeSamples: {
    x: number;
    y: number;
    distance: number;
  };
  deltaOrientedSamples: {
    x: number;
    y: number;
    distance: number;
  };
}
```

## CaptureTranslationParallaxTemporalQuadrature

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureTranslationParallaxTemporalQuadrature {
  timeReference:
    "first-opening-boundary-phase";
  timingProfileIdentity: {
    profileId: string;
    profileVersion: string;
    captureModeId: string;
  };
  orientation:
    CaptureOrientation;
  projectionDistanceMm: number;
  temporalSampleCount: number;
  cameraTranslationVelocityMps:
    Vector3;
  samples:
    readonly CaptureTranslationParallaxTemporalSample[];
  geometryModel:
    "metric-depth-dependent-constant-linear-translation";
  relativeMotionComposition:
    "subject-minus-camera-translation";
  metricSceneDepthRequired: true;
  oneGlobalHomographyAuthorized: false;
  cameraRotationComposed: false;
  visibilityOcclusionModeled: false;
  sensorReadoutTimingUsedAsExposureTiming:
    false;
}
```

## CaptureTranslationParallaxTemporalSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureTranslationParallaxTemporalSample {
  sampleId: string;
  destinationPointNative:
    RasterPoint;
  referencePositionCameraM:
    Vector3;
  subjectVelocityMps: Vector3;
  localExposureWindow: {
    startSecondsFromCaptureReference:
      number;
    endSecondsFromCaptureReference:
      number;
    durationSeconds: number;
  };
  referenceImagePointMm: {
    x: number;
    y: number;
  };
  nodes:
    readonly CaptureTranslationParallaxTemporalNode[];
}
```
