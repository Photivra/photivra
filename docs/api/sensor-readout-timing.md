# sensor/readout-timing.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSensorReadoutTiming

Resolves a capture-specific native sensor readout scan schedule.

Rolling readout uses a uniform-linear single-axis approximation across the
declared active capture. The caller supplies the spatial timing span
explicitly; it is never inferred from total data-readout duration, active
crop dimensions, native raster density, output resolution, sensor
architecture metadata, or shutter mechanism.

Global readout has no spatial phase skew in this model even when a non-zero
data-readout duration is declared.

This foundation does not define local exposure start/end times, mechanical
curtain travel, EFCS curtain behavior, rolling-shutter image distortion,
flash/flicker interactions, or motion integration.

```ts
export function calculateSensorReadoutTiming(
  input: CalculateSensorReadoutTimingInput
): CalculationResult<SensorReadoutTiming>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSensorReadoutTimingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateSensorReadoutTimingInput {
  nativeRaster: NativeImageRaster;
  /**
   * Active capture rectangle in invariant native raster coordinates.
   *
   * Defaults to the complete native raster. Timing is never inferred by
   * scaling a full-frame value to this rectangle.
   */
  activeCaptureRect?: RasterRect;
  /**
   * Selected shutter mechanism for the capture.
   *
   * It is reported independently and does not modify the sensor timing
   * schedule in this foundation.
   */
  shutterMechanism: CaptureShutterMechanism;
  readout: SensorReadoutTimingDeclaration;
  /**
   * Optional continuous native raster edge-coordinate points for timing
   * diagnostics. Pixel centers may be represented with +0.5 offsets.
   */
  samplePointsNative?: readonly RasterPoint[];
}
```

## CaptureShutterMechanism

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type CaptureShutterMechanism =
  | "mechanical"
  | "electronic-first-curtain"
  | "electronic";
```

## GlobalSensorReadoutTimingDeclaration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GlobalSensorReadoutTimingDeclaration {
  readoutMode: "global";
  /**
   * Capture-specific sensor data-readout duration.
   *
   * This is deliberately not interpreted as spatial exposure/readout skew.
   */
  captureReadoutDurationSeconds: SourcedSensorTimingSeconds;
  scanDirectionNative?: never;
  spatialSamplingSkewSeconds?: never;
}
```

## NativeSensorReadoutScanDirection

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type NativeSensorReadoutScanDirection =
  | "top-to-bottom"
  | "bottom-to-top"
  | "left-to-right"
  | "right-to-left";
```

## RollingSensorReadoutTimingDeclaration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface RollingSensorReadoutTimingDeclaration {
  readoutMode: "rolling";
  /**
   * Capture-specific sensor data-readout duration.
   *
   * This fact is retained independently from spatial sampling skew because
   * published/declared readout duration and the spatial timing span need not be
   * treated as the same quantity.
   */
  captureReadoutDurationSeconds: SourcedSensorTimingSeconds;
  /**
   * Native-sensor scan direction for the selected capture mode.
   */
  scanDirectionNative: SourcedSensorReadoutFact<NativeSensorReadoutScanDirection>;
  /**
   * Time difference between the first and last spatial scan positions in the
   * uniform-linear timing approximation.
   */
  spatialSamplingSkewSeconds: SourcedSensorTimingSeconds;
}
```

## SensorReadoutMode

Readout architecture selected for one capture.

This reuses the architecture vocabulary but is not a hardware-capability
assertion. SensorArchitectureProfile.readoutCapabilities remains descriptive
metadata and is not consulted automatically.

```ts
export type SensorReadoutMode = SensorReadoutArchitecture;
```

## SensorReadoutTiming

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorReadoutTiming {
  readoutMode: SensorReadoutMode;
  shutterMechanism: CaptureShutterMechanism;
  nativeRaster: NativeImageRaster;
  activeCaptureRect: RasterRect;
  captureReadoutDurationSeconds: SourcedSensorTimingSeconds;
  maximumSpatialSamplingSkewSeconds: number;
  scan:
    | {
        pattern: "uniform-linear-single-axis";
        directionNative: SourcedSensorReadoutFact<NativeSensorReadoutScanDirection>;
        unitVectorNative: { x: number; y: number };
        spatialSamplingSkewSeconds: SourcedSensorTimingSeconds;
      }
    | null;
  samples: readonly SensorReadoutTimingSample[];
}
```

## SensorReadoutTimingDeclaration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorReadoutTimingDeclaration =
  | GlobalSensorReadoutTimingDeclaration
  | RollingSensorReadoutTimingDeclaration;
```

## SensorReadoutTimingSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorReadoutTimingSample {
  pointNative: RasterPoint;
  normalizedScanPosition: number | null;
  /**
   * Relative native-sensor readout phase in seconds.
   *
   * Zero is the first spatial scan position. This is not automatically an
   * exposure-start time or shutter-curtain time.
   */
  readoutPhaseOffsetSeconds: number;
}
```

## SourcedSensorReadoutFact

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SourcedSensorReadoutFact<T> = EvidenceBackedFact<T>;
```

## SourcedSensorTimingSeconds

Evidence-backed timing value with an explicit seconds unit.

```ts
export interface SourcedSensorTimingSeconds
  extends EvidenceBackedFact<number> {
  unit: "s";
}
```
