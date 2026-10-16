# capture/native-raw-development.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createNativeRawDevelopmentTask

Validates complete phase/halo support, takes ownership of the packed RAW (zero-copy transfer where
supported) and renders 256-pixel output tiles through the typed kernel. Development normalizes each
site to its CFA phase's effective white level, clips flagged/white sites before white balance and
applies the selected highlight mode (see `prepareSensorColorDevelopment`). Numeric RAW integrity is
checked in bounded chunks at the start of `run()`, with host yields, so creation stays O(metadata).
The host yield runs at chunk/tile boundaries once about 8 ms of work has elapsed since the previous
yield, and after the final tile; yield cadence never changes output.

`provider` is `{ yieldControl, onProgress? }`, the shape of the other native task providers. A bare
yield function is still accepted for 2.x and is deprecated.
Retains explicit acquisition tile width when reconstructing the exact packed plan. Acquisition chunk
width changes neither CFA/seed coordinates nor development pixels, and does not establish transport or
device-resource qualification.

```ts
export function createNativeRawDevelopmentTask(input: NativeRawDevelopmentInput,
  provider: NativeRawDevelopmentProvider | ((signal:AbortSignal)=>Promise<void>)): NativeRawDevelopmentTask;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## NativeRawDevelopmentInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeRawDevelopmentInput {
  /**
   * Packed RAW. Ownership transfers to the task: on creation its five typed arrays are detached with
   * `ArrayBuffer.prototype.transfer` (zero-copy; the caller's arrays become length 0), or copied when
   * the runtime lacks `transfer`. The developed output returns the same RAW, now owned by the output.
   */
  raw: NativeRawOutput;
  phaseProfiles: readonly RawFrameReconstructionPhaseProfile[];
  colorProfile: ExportSensorColorProfile;
  whiteBalance: "not-required" | "apply-resolved-sensor-gains";
  rendering: SdrRenderingProfile;
  /** Default `clip`: neutral clipped highlights. `reconstruct`: documented desaturation blend. */
  highlightMode?: RawHighlightMode;
  /** Includes the retained packed RAW plus integer output; not caller buffers, process heap or GPU. */
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
  highlight: RawHighlightDiagnostics;
  outputEncoding: SdrRenderingResult["outputEncoding"];
  rendering: SdrRenderingProfile;
  displayAdaptation: SdrRenderingResult["displayAdaptation"];
  imageDataPairing: "derived-from-exact-packed-native-raw";
  producerOriginVerified: false;
}
```

## NativeRawDevelopmentProvider

Host hooks, the same shape as the other native task providers (without a tile reader).

```ts
export interface NativeRawDevelopmentProvider {
  /** Must yield to the host event loop, allowing cancellation/input events between tiles. */
  yieldControl(signal: AbortSignal): Promise<void>;
  /** Optional observer called after each committed 256-pixel output tile; cannot change output. */
  onProgress?(progress: NativeTaskProgress): void;
}
```

## NativeRawDevelopmentTask

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NativeRawDevelopmentTask {
  readonly state: NativeRawTaskState;
  readonly completedTileCount: number;
  readonly totalTileCount: number;
  run(): Promise<void>;
  cancel(): void;
  dispose(): void;
  takeOutput(): NativeRawDevelopmentOutput;
}
```

## RawHighlightDiagnostics

RAW saturation consumed before white balance; counts are pixels/samples of the developed output.

```ts
export interface RawHighlightDiagnostics {
  mode: RawHighlightMode;
  /** Output pixels with at least one contributing site at/above its white level or flagged saturated. */
  saturatedPixelCount: number;
  /** `clip`: WB-scaled samples clipped at the smallest gain. Always 0 for `reconstruct`. */
  whiteBalanceClippedSampleCount: number;
  /** `reconstruct`: pixels blended toward neutral. Always 0 for `clip`. */
  reconstructedPixelCount: number;
}
```
