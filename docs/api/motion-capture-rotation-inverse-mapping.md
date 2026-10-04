# motion/capture-rotation-inverse-mapping.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateCaptureRotationInverseMappings

Calculates an instantaneous inverse capture-scan mapping for stationary
world rays under pure camera rotation.

The destination native sensor location is authoritative for local exposure
timing. At an explicit phase within that local window, the captured
image-plane ray is analytically mapped back to the reference image plane at
the first opening-boundary phase.

No fixed-point/iterative solve is used because pure rotation under the
existing constant-axis model has an analytic inverse once destination
location and local capture time are known.

This function is not a finite-exposure renderer and does not integrate blur.
Sensor data-readout timing is deliberately absent; exposure boundaries are
the only timing source.

```ts
export function calculateCaptureRotationInverseMappings(
  input: CalculateCaptureRotationInverseMappingsInput
): CalculationResult<CaptureRotationInverseMappings>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateCaptureRotationInverseMappingsInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateCaptureRotationInverseMappingsInput
  extends CalculateCaptureExposureWindowsInput {
  imagingArea: SensorImagingArea;
  focalLengthMm: number;
  focusDistanceM?: number;
  angularVelocityRadPerSec: CameraAngularVelocityRadPerSec;
  /**
   * Fraction of each point's local exposure interval at which the
   * instantaneous mapping is evaluated.
   *
   * 0 = local exposure start, 0.5 = local midpoint, 1 = local exposure end.
   * A phase is required because finite exposure has no single sharp geometry.
   */
  localExposurePhase: number;
  /**
   * Physical capture orientation used only to rotate the reported native
   * inverse sample-displacement vector into oriented-capture coordinates.
   * It does not alter the native exposure schedule.
   */
  orientation: CaptureOrientation;
  samplePointsNative: readonly RasterPoint[];
}
```

## CaptureRotationInverseMappings

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureRotationInverseMappings {
  timeReference: "first-opening-boundary-phase";
  referenceTimeSecondsFromCaptureReference: 0;
  mappingMeaning:
    "instantaneous-destination-to-exposure-start-reference-ray";
  orientation: CaptureOrientation;
  localExposurePhase: number;
  imagingArea: SensorImagingArea;
  activeCaptureRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  samples: readonly CaptureRotationInverseMappingSample[];
  componentProvenance: {
    exposureWindows: CalculationProvenance;
    sensorGeometry: CalculationProvenance;
    inverseCameraRotation: CalculationProvenance;
  };
}
```

## CaptureRotationInverseMappingSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureRotationInverseMappingSample {
  destinationPointNative: RasterPoint;
  destinationImagePointMm: ImagePlanePointMm;
  localExposureWindow: {
    startSecondsFromCaptureReference: number;
    endSecondsFromCaptureReference: number;
    durationSeconds: number;
  };
  localExposurePhase: number;
  captureTimeSecondsFromReference: number;
  /**
   * Same stationary world ray expressed in the exposure-start reference image
   * plane. This may lie outside the active capture; it is intentionally not
   * clamped.
   */
  referenceImagePointMm: ImagePlanePointMm;
  inverseDisplacementImagePlaneMm: {
    x: number;
    y: number;
    distance: number;
  };
  /**
   * Reference-minus-destination displacement in continuous native effective
   * raster-sample units (+X right, +Y down).
   */
  inverseDisplacementNativeSamples: RasterVector & {
    distance: number;
  };
  /**
   * The same displacement after physical capture orientation.
   */
  inverseDisplacementOrientedSamples: RasterVector & {
    distance: number;
  };
}
```
