# capture/sensor-raw-frame.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createSensorRawFrame

Commits native RAW samples and capture metadata; no demosaic, WB, tone or format packing.

```ts
export function createSensorRawFrame(input: SensorRawFrameInput): SensorRawFrame;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSensorRawFrameInput

Validates dense bounded native coverage and exact CFA/mode/site/code identity, without IO.

```ts
export function parseSensorRawFrameInput(value: unknown): SensorRawFrameInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SENSOR_RAW_FRAME_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SENSOR_RAW_FRAME_SCHEMA_VERSION = "0.1.0" as const
```

## SensorRawFrame

Immutable RAW attachment. Structural validation does not prove producer truth or DNG compatibility.

```ts
export interface SensorRawFrame extends SensorRawFrameInput {
  schemaVersion: typeof SENSOR_RAW_FRAME_SCHEMA_VERSION;
  sampleDomain: "native-cfa-raw-code";
  sampleOrder: "native-row-major";
  producerBinding: "caller-declared-capture-attachment";
  reconstructionApplied: false;
  renderingApplied: false;
  nativePixelWidth: number;
  nativePixelHeight: number;
}
```

## SensorRawFrameInput

Declared attachment of #14 native CFA samples to a committed photographic capture.

```ts
export interface SensorRawFrameInput {
  frameId: string;
  capture: SimulatedCapture;
  modeId: string;
  captureModeProfile: CaptureModeProfile;
  colorSamplingProfile: SensorColorSamplingProfile;
  bindingProfile: NativeEffectiveRasterColorSamplingBindingProfile;
  containerBitDepth: 16;
  /** Exactly one sample per full native site, row-major; no processed RGB masking. */
  samples: readonly SensorRawCaptureSample[];
}
```
