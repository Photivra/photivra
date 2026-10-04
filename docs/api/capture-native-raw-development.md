# capture/native-raw-development.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createNativeRawDevelopmentTask

Validates complete phase/halo support, snapshots RAW once, and yields between 256-pixel output tiles.
Retains explicit acquisition tile width when reconstructing the exact packed plan. Omitted width
preserves legacy plan shape; inconsistent tile counts or unsupported widths fail validation.
Acquisition chunk width changes neither CFA/seed coordinates nor development pixels, and does
not establish transport or device-resource qualification.

```ts
export function createNativeRawDevelopmentTask(input: NativeRawDevelopmentInput,
  yieldControl: (signal:AbortSignal)=>Promise<void>): NativeRawDevelopmentTask;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## NativeRawDevelopmentInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeRawDevelopmentInput {
  raw: NativeRawOutput;
  phaseProfiles: readonly RawFrameReconstructionPhaseProfile[];
  colorProfile: ExportSensorColorProfile;
  whiteBalance: "not-required" | "apply-resolved-sensor-gains";
  rendering: SdrRenderingProfile;
  /** Includes one owned packed RAW copy plus integer output; not caller buffers, process heap or GPU. */
  maximumRetainedPayloadBytes: number;
}
```

## NativeRawDevelopmentOutput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeRawDevelopmentOutput {
  raw: NativeRawOutput;
  phaseProfiles: readonly RawFrameReconstructionPhaseProfile[];
  colorProfile: ExportSensorColorProfile;
  whiteBalance: NativeRawDevelopmentInput["whiteBalance"];
  width: number;
  height: number;
  integerSamples: Uint8Array | Uint16Array;
  diagnostics: SdrRenderingResult["diagnostics"];
  outputEncoding: SdrRenderingResult["outputEncoding"];
  rendering: SdrRenderingProfile;
  displayAdaptation: SdrRenderingResult["displayAdaptation"];
  imageDataPairing: "derived-from-exact-packed-native-raw";
  producerOriginVerified: false;
}
```

## NativeRawDevelopmentTask

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeRawDevelopmentTask {
  readonly state: NativeRawTaskState;
  run(): Promise<void>;
  cancel(): void;
  dispose(): void;
  takeOutput(): NativeRawDevelopmentOutput;
}
```
