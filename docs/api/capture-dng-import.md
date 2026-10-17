# capture/dng-import.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## DNG_IMPORT_LIMITS

Upper bound for `maximumPixels`. 200 MP (megapixels) of 16-bit codes is 400 MB.

```ts
DNG_IMPORT_LIMITS = Object.freeze({ defaultMaximumPixels: 64_000_000, maximumPixels: 200_000_000, defaultMaximumIfds: 64, maximumIfds: 1024 })
```

## DNG_IMPORT_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
DNG_IMPORT_SCHEMA_VERSION = "1.0.0" as const
```

## DngImportInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface DngImportInput {
  bytes: Uint8Array;
  /** Pixel-count limit (width x height), checked before any decode allocation. Default 64 000 000, at most 200 000 000. */
  maximumPixels?: number;
  /** Total IFDs (main chain plus SubIFDs) visited. Default 64, at most 1024. */
  maximumIfds?: number;
}
```

## ImportedDngBlackLevel

Black level (the code for zero light) pattern, from BlackLevel, BlackLevelRepeatDim and BlackLevelDeltaH/V. Origin is the active-area top-left.

```ts
export interface ImportedDngBlackLevel {
  repeatRows: number;
  repeatColumns: number;
  /** Row-column-sample order, length repeatRows x repeatColumns x samplesPerPixel. */
  values: number[];
  /** Per active-area column offset, or null when absent (all zeros). */
  deltaH: number[] | null;
  /** Per active-area row offset, or null when absent (all zeros). */
  deltaV: number[] | null;
}
```

## ImportedDngCfa

Repeating CFA pattern. Its origin is the top-left corner of `activeArea` (DNG 1.7.1.0, PhotometricInterpretation).

```ts
export interface ImportedDngCfa {
  repeatRows: number;
  repeatColumns: number;
  /** Row-major plane indices into `planeColors`, length repeatRows x repeatColumns. */
  pattern: number[];
  /** CFAPlaneColor: 0 red, 1 green, 2 blue, 3 cyan, 4 magenta, 5 yellow, 6 white. Default [0, 1, 2]. */
  planeColors: number[];
}
```

## ImportedDngRaw

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ImportedDngRaw {
  schemaVersion: typeof DNG_IMPORT_SCHEMA_VERSION;
  byteOrder: "little-endian" | "big-endian";
  /** DNGVersion bytes, or null for a TIFF-EP file without DNG tags. */
  dngVersion: [number, number, number, number] | null;
  make: string | null;
  model: string | null;
  uniqueCameraModel: string | null;
  /** TIFF/Exif Orientation 1..8 (default 1). Codes are returned in stored, not oriented, order. */
  orientation: number;
  width: number;
  height: number;
  samplesPerPixel: number;
  bitsPerSample: number;
  compression: "uncompressed" | "lossless-jpeg";
  photometricInterpretation: "cfa" | "linear-raw";
  /** Stored raw codes, row-major then sample, length width x height x samplesPerPixel. */
  codes: Uint16Array;
  cfa: ImportedDngCfa | null;
  /** LinearizationTable when present; not applied to `codes`. */
  linearizationTable: Uint16Array | null;
  blackLevel: ImportedDngBlackLevel;
  /** WhiteLevel per sample (default 2^bitsPerSample − 1). */
  whiteLevel: number[];
  /** ActiveArea as a rectangle (default the whole image). */
  activeArea: ImportedDngRect;
  /** DefaultCropOrigin/Size relative to the active-area origin; may be fractional (RATIONAL). */
  defaultCrop: ImportedDngRect;
  /** XYZ → camera (reference) matrices, row-major colorPlanes x 3, or null. */
  colorMatrix1: number[] | null;
  colorMatrix2: number[] | null;
  /** CalibrationIlluminant1/2 (Exif LightSource code), or null when absent. */
  calibrationIlluminant1: number | null;
  calibrationIlluminant2: number | null;
  /** AsShotNeutral in camera (reference) coordinates, or null. */
  asShotNeutral: number[] | null;
  /** RawDataUniqueID as 32 lowercase hex digits, or null. */
  rawDataUniqueId: string | null;
}
```

## ImportedDngRect

Half-open raster rectangle in stored-image pixel coordinates (+X right, +Y down).

```ts
export interface ImportedDngRect { x: number; y: number; width: number; height: number }
```

## parseDngRawImage

Parse one DNG or TIFF-EP file and decode its primary CFA or LinearRaw image (the first IFD with
NewSubFileType 0 and PhotometricInterpretation 32803 or 34892, in IFD-chain then SubIFD order).

Supported raw data: Compression 1 at 8..16 bits/sample (8 bits as bytes, 16 bits in the file byte
order, other depths packed MSB-first with byte-aligned rows, per DNG BitsPerSample) and Compression 7
lossless Huffman JPEG (T.81 Annex H) in strips or tiles, chunky planar configuration only.

```ts
export function parseDngRawImage(input: DngImportInput): ImportedDngRaw;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
