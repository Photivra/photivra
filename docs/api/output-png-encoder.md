# output/png-encoder.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## PNG_ENCODER_ID

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
PNG_ENCODER_ID = "photivra-png-rgb-v1" as const
```

## PNG_ENCODER_LIMITS

Bounds checked before allocation. 100 MP of 16-bit RGB is about 600 MB of filtered scanlines.

```ts
PNG_ENCODER_LIMITS = Object.freeze({ maximumDimension: 65535, maximumPixels: 100_000_000, maximumIccProfileBytes: 4_000_000 })
```

## PngCicpPrimaries

ITU-T H.273 ColourPrimaries: bt709 = 1 (also sRGB), display-p3 = 12 (SMPTE EG 432-1, D65), bt2020 = 9 (BT.2020/BT.2100).

```ts
export type PngCicpPrimaries = "bt709" | "display-p3" | "bt2020";
```

## PngCicpTransfer

ITU-T H.273 TransferCharacteristics: bt709 = 1, linear = 8, srgb = 13 (IEC 61966-2-1), pq = 16 (SMPTE ST 2084), hlg = 18 (ARIB STD-B67).

```ts
export type PngCicpTransfer = "bt709" | "linear" | "srgb" | "pq" | "hlg";
```

## PngColourEncoding

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type PngColourEncoding =
  | { kind: "srgb"; renderingIntent: "perceptual" | "relative-colorimetric" | "saturation" | "absolute-colorimetric" }
  | { kind: "icc"; profileName: string; profile: Uint8Array }
  | { kind: "cicp"; primaries: PngCicpPrimaries; transfer: PngCicpTransfer; fullRange: boolean };
```

## PngContentLightLevel

CTA-861.3 content light level in cd/m²; 0 means unknown.

```ts
export interface PngContentLightLevel {
  maximumContentLightLevelCdPerSquareMeter: number;
  maximumFrameAverageLightLevelCdPerSquareMeter: number;
}
```

## PngEncodeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PngEncodeInput {
  width: number;
  height: number;
  bitDepth: 8 | 16;
  /** Interleaved RGB code values, row-major; Uint8Array for 8-bit, Uint16Array for 16-bit. */
  samples: Uint8Array | Uint16Array;
  colourEncoding: PngColourEncoding;
  masteringDisplay?: PngMasteringDisplay;
  contentLightLevel?: PngContentLightLevel;
  /** Default "fixed-huffman". */
  compression?: "stored" | "fixed-huffman";
  /** PNG filter type 0..4 for every row, or the specification's minimum-sum-of-absolute-differences heuristic. Default "adaptive". */
  filter?: "none" | "sub" | "up" | "average" | "paeth" | "adaptive";
}
```

## PngMasteringDisplay

SMPTE ST 2086 mastering display colour volume: CIE 1931 xy chromaticities and luminance in cd/m².

```ts
export interface PngMasteringDisplay {
  redXy: readonly [number, number];
  greenXy: readonly [number, number];
  blueXy: readonly [number, number];
  whiteXy: readonly [number, number];
  maximumLuminanceCdPerSquareMeter: number;
  minimumLuminanceCdPerSquareMeter: number;
}
```

## serializePngImage

Encode an RGB still image as PNG (colour type 2, no interlace). Samples are written unchanged; 16-bit
samples are stored big-endian as PNG requires. Throws `InvalidConfigurationError` for any invalid or
inconsistent field before allocating the scanline buffer.

```ts
export function serializePngImage(input: PngEncodeInput): Uint8Array;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
