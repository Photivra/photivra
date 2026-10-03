# output/sdr-rendering.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSdrRendering

Standalone SDR rendering: rendering exposure → tone → gamut → sRGB transfer → quantization.
No physical capture, metering, WB/color/correction integration or display adaptation runs.

```ts
export function calculateSdrRendering(input: SdrRenderingInput): CalculationResult<SdrRenderingResult>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSdrRenderingInput

Validates declared image state and a bounded finite inline raster; never resolves WB/color.

```ts
export function parseSdrRenderingInput(value: unknown): SdrRenderingInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSdrRenderingProfile

Validates every explicit rendering/encoding policy; unknown HDR/display modes fail.

```ts
export function parseSdrRenderingProfile(value: unknown): SdrRenderingProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SDR_RENDERING_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SDR_RENDERING_SCHEMA_VERSION = "0.1.0" as const
```

## SdrRenderingInput

Only an explicitly color-transformed, co-sited linear-sRGB/D65 raster is accepted.

```ts
export interface SdrRenderingInput {
  sourceImageStateId: string;
  inputImageState: "color-transformed-linear-rgb";
  inputColorSpace: "linear-srgb-d65";
  whiteBalanceHandling: "already-applied-upstream" | "not-required";
  pixelWidth: number;
  pixelHeight: number;
  referenceWhiteValue: number;
  /** Relative linear RGB, row-major tightly interleaved red/green/blue. */
  samples: readonly number[];
  profile: SdrRenderingProfile;
}
```

## SdrRenderingProfile

First-party rendering choices, independent of physical exposure and display calibration.

```ts
export interface SdrRenderingProfile {
  schemaVersion: typeof SDR_RENDERING_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  renderingExposureEv: number;
  toneCurve: "identity" | "positive-reinhard-per-channel";
  gamutHandling: "clip-components" | "reject-out-of-range";
  outputDynamicRange: "sdr";
  transferFunction: "srgb";
  bitDepth: 8 | 16;
  rounding: "nearest-ties-up";
  dither: "none";
}
```

## SdrRenderingResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SdrRenderingResult {
  schemaVersion: typeof SDR_RENDERING_SCHEMA_VERSION;
  sourceImageStateId: string;
  profile: SdrRenderingProfile;
  pixelWidth: number;
  pixelHeight: number;
  channelOrder: readonly ["red", "green", "blue"];
  whiteBalanceHandling: SdrRenderingInput["whiteBalanceHandling"];
  /** Relative normalized linear samples after exposure/tone, before gamut handling. */
  toneMappedLinearSamples: readonly number[];
  outputLinearSamples: readonly number[];
  outputEncodedSamples: readonly number[];
  integerSamples: readonly number[];
  outputEncoding: {
    imageState: "output-referred-sdr";
    colorSpace: "srgb";
    primariesXy: { red: readonly [number, number]; green: readonly [number, number]; blue: readonly [number, number] };
    whitePointXy: readonly [number, number];
    referenceWhiteLuminanceCdM2: 80;
    codeMinimum: 0;
    codeMaximum: number;
  };
  diagnostics: {
    renderingNegativeSampleCount: number;
    renderingAboveReferenceSampleCount: number;
    toneChangedSampleCount: number;
    gamutClippedLowSampleCount: number;
    gamutClippedHighSampleCount: number;
    /** Upstream full-well/ADC/RAW saturation is unavailable, never inferred from output. */
    captureSaturation: "not-consumed";
  };
  /** Platform color management follows this encoded output; no actual display is assessed. */
  displayAdaptation: { kind: "external-platform"; applied: false; displayCapabilities: "unknown" };
}
```
