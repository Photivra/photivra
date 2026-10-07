# sensor/exposure-window.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateCaptureExposureWindows

Resolves local capture exposure windows from independent opening and closing
boundary schedules.

The returned time basis is seconds from the first opening-boundary phase.
This is intentionally not the existing camera-rotation API's global
"exposure start" semantic; a later integration layer must bind those time
bases explicitly.

The mechanism identifies whether each boundary is mechanical or electronic,
but does not supply any traversal duration or direction. Every non-simultaneous
timing value and direction is caller-declared with evidence.

The first model supports simultaneous boundaries and uniform-linear
single-axis native-sensor scans only. It does not model curtain acceleration,
segmented/nonlinear electronic schedules, flash/flicker, rolling-shutter
image distortion, shutter shock, or EFCS-specific pupil/bokeh behavior.

```ts
export function calculateCaptureExposureWindows(
  input: CalculateCaptureExposureWindowsInput
): CalculationResult<CaptureExposureWindows>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateCaptureExposureWindowsInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateCaptureExposureWindowsInput {
  nativeRaster: NativeImageRaster;
  /**
   * Active capture rectangle in invariant native-raster coordinates.
   *
   * Defaults to the complete native raster. Boundary traversal timing is never
   * inferred by scaling a full-frame timing value to this rectangle.
   */
  activeCaptureRect?: RasterRect;
  shutterMechanism: CaptureShutterMechanism;
  /**
   * Nominal interval between the zero-phase opening and closing references.
   *
   * Local exposure duration may differ from this value when opening and closing
   * boundary schedules have different spatial phase behavior.
   */
  nominalExposureDurationSeconds: SourcedCaptureTimingSeconds;
  opening: ExposureBoundarySchedule;
  closing: ExposureBoundarySchedule;
  /**
   * Optional continuous native raster edge-coordinate points for diagnostics.
   * Pixel centers may be represented with +0.5 offsets.
   */
  samplePointsNative?: readonly RasterPoint[];
}
```

## CaptureExposureBoundaryActuator

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type CaptureExposureBoundaryActuator = "mechanical" | "electronic";
```

## CaptureExposureWindows

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureExposureWindows {
  shutterMechanism: CaptureShutterMechanism;
  timeReference: "first-opening-boundary-phase";
  nativeRaster: NativeImageRaster;
  activeCaptureRect: RasterRect;
  nominalExposureDurationSeconds: SourcedCaptureTimingSeconds;
  opening: ResolvedCaptureExposureBoundary;
  closing: ResolvedCaptureExposureBoundary;
  localExposureDurationRangeSeconds: {
    minimum: number;
    maximum: number;
  };
  samples: readonly CaptureExposureWindowSample[];
}
```

## CaptureExposureWindowSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CaptureExposureWindowSample {
  pointNative: RasterPoint;
  openingNormalizedScanPosition: number | null;
  closingNormalizedScanPosition: number | null;
  /**
   * Seconds from the first opening-boundary phase.
   */
  startOffsetSecondsFromOpeningReference: number;
  /**
   * Seconds from the first opening-boundary phase.
   */
  endOffsetSecondsFromOpeningReference: number;
  localExposureDurationSeconds: number;
}
```

## ExposureBoundarySchedule

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ExposureBoundarySchedule =
  | SimultaneousExposureBoundarySchedule
  | UniformLinearExposureBoundarySchedule;
```

## ResolvedCaptureExposureBoundary

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedCaptureExposureBoundary {
  actuator: CaptureExposureBoundaryActuator;
  schedule:
    | {
        kind: "simultaneous";
      }
    | {
        kind: "uniform-linear-native-scan";
        directionNative: SourcedCaptureBoundaryDirection;
        unitVectorNative: RasterVector;
        traversalDurationSeconds: SourcedCaptureTimingSeconds;
      };
}
```

## SimultaneousExposureBoundarySchedule

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SimultaneousExposureBoundarySchedule {
  kind: "simultaneous";
  directionNative?: never;
  traversalDurationSeconds?: never;
}
```

## SourcedCaptureBoundaryDirection

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SourcedCaptureBoundaryDirection =
  EvidenceBackedFact<NativeSensorReadoutScanDirection>;
```

## SourcedCaptureTimingSeconds

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SourcedCaptureTimingSeconds = SourcedSensorTimingSeconds;
```

## UniformLinearExposureBoundarySchedule

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface UniformLinearExposureBoundarySchedule {
  kind: "uniform-linear-native-scan";
  directionNative: SourcedCaptureBoundaryDirection;
  traversalDurationSeconds: SourcedCaptureTimingSeconds;
}
```
