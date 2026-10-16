# capture/native-raw.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateNativeRawPlan

Full raster/resource/profile admission before callbacks or output allocation; no placeholder plane.

```ts
export function calculateNativeRawPlan(input: NativeRawInput): NativeRawPlan;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## createNativeRawTask

Executes validated EQE/dark/completeness events through the shared reference scalar physics.
Tiles are read and committed one at a time; the host yield runs at tile boundaries once about
8 ms of work has elapsed since the previous yield, and after the final tile. Activity is checked
before every tile, after every read and after every yield.

```ts
export function createNativeRawTask(input: NativeRawInput,provider: NativeRawProvider): NativeRawTask;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## NATIVE_RAW_LIMITS

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
NATIVE_RAW_LIMITS = Object.freeze({ maximumPixels: 24_000_000, maximumDimension: 16_384,
  tileWidth: 256, tileHeight: 1, outputBytesPerPixel: 7 })
```

## NATIVE_RAW_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
NATIVE_RAW_SCHEMA_VERSION = "0.1.0" as const
```

## NativeRawExposure

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type NativeRawExposure = Omit<SimulatedCapture, "schemaVersion" | "planes" | "source"> & {source:CaptureExposureSource};
```

## NativeRawExposureInput

A shooting event and source provenance, not a produced float master or committed RAW frame.

```ts
export type NativeRawExposureInput = Omit<SimulatedCaptureInput, "planes" | "source"> & {source:CaptureExposureSource};
```

## NativeRawInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeRawInput {
  exposure: NativeRawExposureInput;
  frameId: string;
  modeId: string;
  captureModeProfile: NativeRawProducerFrameContext["captureModeProfile"];
  colorSamplingProfile: NativeRawProducerFrameContext["colorSamplingProfile"];
  bindingProfile: NativeRawProducerFrameContext["bindingProfile"];
  exposureWindow?: SensorRawProducerExposureWindowInput;
  maximumOutputBytes: number;
  /** Optional execution chunk width in native sites, 1–256; omission preserves 256. Not a sampling control. */
  tileWidth?: number;
}
```

## NativeRawOutput

Sole-owner row-major arrays. They are not attachable to the bounded SensorRawFrame contract.

```ts
export interface NativeRawOutput {
  plan: NativeRawPlan;
  codes: Uint16Array;
  blackLevels: Uint16Array;
  digitalSaturationCodes: Uint16Array;
  /** Bits 0,1,2: physical scalar clamp, pre-ADC clamp, digital saturation respectively. */
  saturationFlags: Uint8Array;
  /**
   * Effective white (full-saturation) code per absolute CFA repeat phase, indexed
   * `phaseY*repeatWidthSites+phaseX`: min(digital saturation, round(black + min(capacity, pre-ADC
   * saturation)/gain)). See `calculateEffectiveSaturationCode`; a few bytes, not a per-pixel plane.
   */
  effectiveSaturationCodes: Uint16Array;
}
```

## NativeRawPlan

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeRawPlan {
  schemaVersion: typeof NATIVE_RAW_SCHEMA_VERSION;
  exposure: NativeRawExposure;
  frame: NativeRawProducerFrameContext;
  exposureWindow?: SensorRawProducerExposureWindowInput;
  pixelCount: number;
  outputBytes: number;
  tileCount: number;
  /** Present only for an explicit execution chunk width. Omission preserves legacy plan shape. */
  tileWidth?: number;
  upstreamRadiometryVerified: false;
  seedSchedule: "murmur3-capture-seed-native-index-stream-v2";
}
```

## NativeRawProvider

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeRawProvider {
  readTile(request: Readonly<NativeRawTileRequest>, signal: AbortSignal): Promise<NativeRawTile>;
  yieldControl(signal: AbortSignal): Promise<void>;
}
```

## NativeRawTask

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeRawTask {
  readonly plan: NativeRawPlan;
  readonly state: NativeRawTaskState;
  readonly completedTileCount: number;
  run(): Promise<void>;
  cancel(): void;
  dispose(): void;
  takeOutput(): NativeRawOutput;
}
```

## NativeRawTaskState

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type NativeRawTaskState = "ready" | "running" | "completed" | "cancelled" | "failed" | "disposed" | "transferred";
```

## NativeRawTile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeRawTile extends NativeRawTileRequest { sites: readonly SensorRawProducerSiteInput[] }
```

## NativeRawTileRequest

Rectangle is absolute full-native CFA space, before orientation, active crop or output scaling.

```ts
export interface NativeRawTileRequest { captureId: string; frameId: string; x: number; y: number; width: number; height: number }
```
