# capture/sensor-raw-producer.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## parseSensorRawProducerInput

Validates complete native exposure inputs; no charge/noise/RAW code is accepted as a shortcut.

```ts
export function parseSensorRawProducerInput(value: unknown): SensorRawProducerInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SENSOR_RAW_PRODUCER_NOISE_MODEL

Capture noise model identity binds the seed schedule and signed electronic readout behavior.

```ts
SENSOR_RAW_PRODUCER_NOISE_MODEL = Object.freeze({ id: "photivra-native-raw-noise", version: "0.2.0" } as const)
```

## SENSOR_RAW_PRODUCER_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SENSOR_RAW_PRODUCER_SCHEMA_VERSION = "0.3.0" as const
```

## SensorRawProducerExposureWindowInput

Full-native exposure schedule; sampling coordinates belong to the producer.

```ts
export type SensorRawProducerExposureWindowInput = Omit<CalculateCaptureExposureWindowsInput,
  "nativeRaster" | "activeCaptureRect" | "samplePointsNative">;
```

## SensorRawProducerInput

Bounded single-frame handoff, never a conversion from independent RGB pixels.

```ts
export interface SensorRawProducerInput {
  frame: Omit<SensorRawFrameInput, "samples">;
  sites: readonly SensorRawProducerSiteInput[];
  /** Omission preserves the existing global 0..shutterSeconds event contract. */
  exposureWindow?: SensorRawProducerExposureWindowInput;
}
```

## SensorRawProducerResult

Engine-produced codes and child diagnostics; upstream radiance/response truth remains declared.

```ts
export interface SensorRawProducerResult {
  schemaVersion: typeof SENSOR_RAW_PRODUCER_SCHEMA_VERSION;
  codeProducer: "engine-charge-capacity-noise-adc";
  upstreamOrigin: "declared-eqe-and-dark-exposure-results";
  upstreamRadiometryVerified: false;
  seedSchedule: "capture-seed-plus-two-native-index-modulo-2-to-32-v1";
  frame: SensorRawFrame;
  localExposureWindows?: CalculationResult<CaptureExposureWindows>;
  sites: readonly {
    accumulatedCharge: ReturnType<typeof composeSensorAccumulatedCharge>;
    capacity: ReturnType<typeof assessSensorPhysicalChargeCapacity>;
    realization: ReturnType<typeof simulateSensorChargeRealization>;
    readout: ReturnType<typeof simulateSensorRawCode>;
  }[];
}
```

## SensorRawProducerSiteInput

One declared EQE/dark/completeness event and explicit readout state per native site.

```ts
export interface SensorRawProducerSiteInput {
  charge: ComposeSensorAccumulatedChargeInput;
  samplingProfile: SensorChargeSamplingProfile;
  capacityProfile: SensorPhysicalChargeCapacityProfile;
  operatingStateId: string;
  readoutProfile: SensorReadoutConversionProfile;
  regimeId: string;
}
```

## simulateSensorRawFrame

Composes existing accumulated-charge → capacity → Poisson → read noise/ADC → native sample → immutable frame contracts.

```ts
export function simulateSensorRawFrame(input: SensorRawProducerInput): CalculationResult<SensorRawProducerResult>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
