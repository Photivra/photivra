# processing/hdr.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createHdrBracketMergeTask

Noise-optimal merge of linear RAW exposure brackets into a scene-linear photo-electron rate.

```ts
export function createHdrBracketMergeTask(input: HdrBracketMergeInput, provider: ProcessingProvider): ProcessingTask<HdrBracketMergeOutput>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## createHdrImageEncodingTask

Encodes linear RGB as BT.2020/BT.2100 PQ or HLG integer codes, or as float32 linear BT.2020.

```ts
export function createHdrImageEncodingTask(input: HdrImageEncodingInput, provider: ProcessingProvider): ProcessingTask<HdrImageEncodingOutput>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## HdrBracketFrame

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface HdrBracketFrame {
  exposureTimeSeconds: number;
  /** Linear RAW codes, one per sample. */
  codes: Uint16Array | Float32Array;
  blackLevelCode: number;
  /** Codes at or above this level are saturated and excluded. */
  whiteLevelCode: number;
  /** Optional per-sample flags. Non-zero excludes the sample (for example physical saturation before the ADC). */
  saturationFlags?: Uint8Array;
  /** System conversion gain K, electrons per code (includes the frame's ISO gain). */
  conversionGainElectronsPerCode: number;
  /** RMS read noise in electrons for this frame's readout regime. */
  readNoiseElectrons: number;
}
```

## HdrBracketMergeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface HdrBracketMergeInput {
  /** Samples per frame (e.g. width·height for a mosaic, width·height·3 for RGB). */
  sampleCount: number;
  frames: readonly HdrBracketFrame[];
  /** Variance reweighting iterations after the shot-noise-limited start; default 2. */
  iterations?: number;
  maximumWorkingBytes?: number;
}
```

## HdrBracketMergeOutput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface HdrBracketMergeOutput {
  /** Scene-linear photo-electron rate per sample, e⁻/s (relative scene radiance; not absolute). */
  radianceElectronsPerSecond: Float32Array;
  /** Model standard deviation of each estimate, e⁻/s. */
  standardDeviationElectronsPerSecond: Float32Array;
  /** Frames that contributed; 0 marks a sample saturated in every frame (value is a lower bound). */
  contributingFrameCount: Uint8Array;
  saturatedInAllFramesCount: number;
  provenance: ProcessingProvenance;
}
```

## HdrImageEncodingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface HdrImageEncodingInput {
  image: ProcessingRgbImage;
  inputColorSpace: ProcessingLinearColorSpace;
  transfer: HdrTransfer;
  /** PQ: luminance of relative value 1.0, cd/m². Default 203 (ITU-R BT.2408 HDR reference white). */
  referenceWhiteLuminanceCdPerSquareMeter?: number;
  /** HLG: signal of relative value 1.0. Default 0.75 (ITU-R BT.2408 HLG reference white). */
  hlgReferenceWhiteSignal?: number;
  /** PQ/HLG integer depth: 10 (default), 12 or 16. */
  bitDepth?: 10 | 12 | 16;
  /** BT.2100 full range D = round((2ⁿ−1)E′) (default) or narrow range D = round((219E′ + 16)·2ⁿ⁻⁸). */
  signalRange?: "full" | "narrow";
  maximumWorkingBytes?: number;
}
```

## HdrImageEncodingOutput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface HdrImageEncodingOutput {
  width: number;
  height: number;
  colorSpace: "rec2020";
  transfer: HdrTransfer;
  /** Interleaved RGB codes for PQ/HLG. */
  codes: Uint16Array | null;
  /** Interleaved linear BT.2020 RGB (relative, unclipped) for `linear-float32`. */
  linear: Float32Array | null;
  bitDepth: number | null;
  signalRange: "full" | "narrow" | null;
  /** Components below 0 after conversion to BT.2020 that were clipped (PQ/HLG). */
  negativeClippedSampleCount: number;
  /** Components above the PQ 10000 cd/m² or HLG E = 1 limit that were clipped. */
  overRangeClippedSampleCount: number;
  provenance: ProcessingProvenance;
}
```

## HdrTransfer

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type HdrTransfer = "pq" | "hlg" | "linear-float32";
```
