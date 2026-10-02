# motion/capture-rotation-trajectory.ts public contracts

Package **1.0.0**, root API **0.116.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateCaptureRotationTrajectories

Evaluates pure-camera-rotation trajectories for stationary reference rays
over each point's local exposure window.

This is a temporal-geometry bridge, not a finished rolling-shutter image
mapping. The native sample point defines where a stationary world ray would
land in the reference global-shutter image at the first opening-boundary
phase. The existing camera-rotation model is then evaluated at that point's
local exposure start and end.

Sensor data-readout timing is intentionally absent. A camera/mode-specific
relationship between sensor readout and exposure boundaries requires a
separate explicit contract; this function never assumes one.

A later renderer-facing rolling-shutter warp must solve the image mapping
consistently with capture-location-dependent time and integrate over the
local exposure interval. The endpoint chord returned here must not be treated
as a blur kernel or as an inverse destination-to-source sampling map.

```ts
export function calculateCaptureRotationTrajectories(
  input: CalculateCaptureRotationTrajectoriesInput
): CalculationResult<CaptureRotationTrajectories>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateCaptureRotationTrajectoriesInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateCaptureRotationTrajectoriesInput
  extends CalculateCaptureExposureWindowsInput {
  /**
   * Physical photosensitive imaging area associated with nativeRaster.
   */
  imagingArea: SensorImagingArea;
  /** Physical focal length in millimetres. */
  focalLengthMm: number;
  /** Optional focus distance in metres for focus-aware projection distance. */
  focusDistanceM?: number;
  /**
   * Constant physical camera angular velocity resolved in camera axes at the
   * first opening-boundary phase.
   */
  angularVelocityRadPerSec: CameraAngularVelocityRadPerSec;
  /**
   * Native points whose stationary-reference-ray trajectories should be
   * evaluated. Required and non-empty for this trajectory API.
   */
  samplePointsNative: readonly RasterPoint[];
}
```

## CaptureRotationTrajectories

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureRotationTrajectories {
  timeReference: "first-opening-boundary-phase";
  trajectoryMeaning: "forward-stationary-reference-ray";
  imagingArea: SensorImagingArea;
  activeCaptureRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  samples: readonly CaptureRotationTrajectorySample[];
  componentProvenance: {
    exposureWindows: CalculationProvenance;
    cameraRotation: CalculationProvenance;
  };
}
```

## CaptureRotationTrajectoryEndpoint

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureRotationTrajectoryEndpoint {
  timeSecondsFromCaptureReference: number;
  mappedImagePointMm: ImagePlanePointMm;
  deltaFromReferenceMm: {
    x: number;
    y: number;
    distance: number;
  };
}
```

## CaptureRotationTrajectorySample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureRotationTrajectorySample {
  pointNative: RasterPoint;
  /**
   * Image-plane position of the stationary world ray at the capture reference
   * time (the first opening-boundary phase).
   */
  referenceImagePointMm: ImagePlanePointMm;
  localExposureWindow: {
    startSecondsFromCaptureReference: number;
    endSecondsFromCaptureReference: number;
    durationSeconds: number;
    openingNormalizedScanPosition: number | null;
    closingNormalizedScanPosition: number | null;
  };
  atLocalExposureStart: CaptureRotationTrajectoryEndpoint;
  atLocalExposureEnd: CaptureRotationTrajectoryEndpoint;
  /**
   * Chord between the two trajectory endpoints.
   *
   * This is not a blur kernel, integrated exposure, or rolling-shutter warp.
   */
  localExposureTrajectoryEndpointDeltaMm: {
    x: number;
    y: number;
    distance: number;
  };
}
```
