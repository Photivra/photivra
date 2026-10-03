# output/native-capture-sdr.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateNativeCaptureSdrPlan

Validates/admission-plans without reading external samples or allocating a raster.

```ts
export function calculateNativeCaptureSdrPlan(input: NativeCaptureSdrInput): NativeCaptureSdrPlan;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## createNativeCaptureSdrTask

Creates a single-use execution owner. Admission is validated before any buffer/provider work.

```ts
export function createNativeCaptureSdrTask(input: NativeCaptureSdrInput, provider: NativeCaptureSdrProvider): NativeCaptureSdrTask;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## NATIVE_CAPTURE_SDR_LIMITS

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
NATIVE_CAPTURE_SDR_LIMITS = Object.freeze({ maximumPixels: 24_000_000,
  maximumDimension: 16_384, tileWidth: 256, tileHeight: 32, maximumTileStorageSamples: 32_768 })
```

## NATIVE_CAPTURE_SDR_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
NATIVE_CAPTURE_SDR_SCHEMA_VERSION = "0.1.0" as const
```

## NativeCaptureSdrInput

Metadata-only external float master. Samples must already be color/WB resolved.

```ts
export interface NativeCaptureSdrInput {
  capture: SimulatedCapture;
  sourcePlaneId: string;
  outputImageStateId: string;
  profile: SdrRenderingProfile;
  /** Admission limit for retained integer output, before allocation or provider calls. */
  maximumOutputBytes: number;
}
```

## NativeCaptureSdrOutput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeCaptureSdrOutput {
  plan: NativeCaptureSdrPlan;
  /** Caller-owned packed row-major RGB; 16-bit codes are numeric, not serialized endian bytes. */
  integerSamples: Uint8Array | Uint16Array;
  diagnostics: SdrRenderingResult["diagnostics"];
  outputEncoding: SdrRenderingResult["outputEncoding"];
  displayAdaptation: SdrRenderingResult["displayAdaptation"];
}
```

## NativeCaptureSdrPlan

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeCaptureSdrPlan {
  schemaVersion: typeof NATIVE_CAPTURE_SDR_SCHEMA_VERSION;
  capture: SimulatedCapture;
  sourcePlaneId: string;
  outputImageStateId: string;
  profile: SdrRenderingProfile;
  outputBytes: number;
  /** Logical array payload bound, not JS heap/GPU/process peak memory or device qualification. */
  maximumScratchPayloadBytes: number;
  tileCount: number;
}
```

## NativeCaptureSdrProvider

One provider call at a time. Caller must release decoding/GPU resources on abort/settlement.

```ts
export interface NativeCaptureSdrProvider {
  readTile(request: Readonly<NativeCaptureSdrTileRequest>, signal: AbortSignal): Promise<NativeCaptureSdrTile>;
  /** Must yield to the host event loop, allowing cancellation/input events between tiles. */
  yieldControl(signal: AbortSignal): Promise<void>;
}
```

## NativeCaptureSdrTask

Single-use task: no partial output escapes; cancel/dispose prevents late publication.

```ts
export interface NativeCaptureSdrTask {
  readonly plan: NativeCaptureSdrPlan;
  readonly state: NativeCaptureSdrTaskState;
  readonly completedTileCount: number;
  run(): Promise<void>;
  cancel(): void;
  dispose(): void;
  /** Transfers sole retained buffer ownership once. Dispose cannot revoke a transferred buffer. */
  takeOutput(): NativeCaptureSdrOutput;
}
```

## NativeCaptureSdrTaskState

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type NativeCaptureSdrTaskState = "ready" | "running" | "completed" | "cancelled" | "failed" | "disposed" | "transferred";
```

## NativeCaptureSdrTile

Returned tile is exclusively handed to this call; do not mutate/reuse it. Padding is not image data.

```ts
export interface NativeCaptureSdrTile extends NativeCaptureSdrTileRequest {
  rowStrideSamples: number;
  samples: Float32Array | Float64Array;
}
```

## NativeCaptureSdrTileRequest

Absolute coordinates in the selected plane's declared binding, never crop-local sensor indices.

```ts
export interface NativeCaptureSdrTileRequest {
  captureId: string;
  sourcePlaneId: string;
  artifactId: string;
  sha256: string;
  x: number; y: number; width: number; height: number;
}
```
