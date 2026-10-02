# capture/raw-frame-reconstruction.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## parseRawFrameReconstructionInput

Revalidates committed RAW codes/geometry and complete phase dispatch; no external plane may supply output values.

```ts
export function parseRawFrameReconstructionInput(value: unknown): RawFrameReconstructionInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## RAW_FRAME_RECONSTRUCTION_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
RAW_FRAME_RECONSTRUCTION_SCHEMA_VERSION = "0.1.0" as const
```

## RawFrameReconstruction

Traceable virtual sensor-channel values, not colorimetric RGB or a rendered photograph.

```ts
export interface RawFrameReconstruction {
  schemaVersion: typeof RAW_FRAME_RECONSTRUCTION_SCHEMA_VERSION;
  rawFrame: SensorRawFrame;
  phaseProfiles: readonly RawFrameReconstructionPhaseProfile[];
  region: RasterRect;
  linearPlane: {
    imageState: "virtual-sensor-channels";
    rasterBinding: "native-reconstruction-region";
    pixelWidth: number;
    pixelHeight: number;
    channelIds: readonly string[];
    /** Interleaved native-region row-major values; black-subtracted normalization, signed. */
    samples: readonly number[];
  };
  /** Child envelopes and exact weighted RAW contributions, in matching native-region row-major order. */
  pixels: readonly CalculationResult<SensorRawReconstructedPixel>[];
  lineage: "engine-reconstructed-from-attached-raw";
  producerOriginVerified: false;
  whiteBalanceApplied: false;
  colorTransformApplied: false;
  physicalOrientationApplied: false;
  outputCropApplied: false;
  sharpeningApplied: false;
  denoisingApplied: false;
}
```

## RawFrameReconstructionInput

Bounded reference handoff; region coordinates stay in the full native sensor frame.

```ts
export interface RawFrameReconstructionInput {
  rawFrame: SensorRawFrame;
  region: RasterRect;
  phaseProfiles: readonly RawFrameReconstructionPhaseProfile[];
}
```

## RawFrameReconstructionPhaseProfile

Kernel selection is explicit per absolute native CFA repeat phase, not guessed from channel names.

```ts
export interface RawFrameReconstructionPhaseProfile {
  phaseX: number;
  phaseY: number;
  profile: SensorRawReconstructionProfile;
}
```

## resolveRawFrameReconstruction

Delegates each pixel to #14's explicit linear reconstruction using only the attached native RAW samples.

```ts
export function resolveRawFrameReconstruction(input: RawFrameReconstructionInput): CalculationResult<RawFrameReconstruction>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
