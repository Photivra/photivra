# output/print-jpeg.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createPrintJpegTask

Filtering uses exact source-pixel area overlap after decoding the explicitly declared 8-bit SDR stage.

```ts
export function createPrintJpegTask(input:PrintJpegInput,provider:PrintJpegProvider):PrintJpegTask;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parsePrintJpegInput

Admission-only; source detail/perception/printer qualification are separate contracts.

```ts
export function parsePrintJpegInput(input:PrintJpegInput):PrintJpegInput;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PRINT_JPEG_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
PRINT_JPEG_SCHEMA_VERSION="0.2.0" as const
```

## PrintJpegInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PrintJpegInput {
  source:PrintJpegSource;
  /** Integer crop in the declared oriented output source, not crop-local sensor/CFA coordinates. */
  crop:RasterRect;
  outputWidth:number;outputHeight:number;
  quantizationStep:number;
  maximumEncodedBytes:number;
  /**
   * Maximum provider `readTile` calls. The task reads each crop pixel exactly once, in tiles of at most
   * 256 x 32 pixels aligned to the crop origin, so it needs ceil(crop.height/32) x ceil(crop.width/256)
   * reads; a smaller budget fails before the first read.
   */
  maximumProviderReads:number;
  /**
   * Optional physical print density in pixels per inch (1..65535) from the caller's print plan. When present,
   * EXIF IFD0 records XResolution = YResolution = this value as a RATIONAL with ResolutionUnit = 2 (inches),
   * and JFIF APP0 records units = 1 with the nearest integer density (JFIF density fields are uint16).
   * When omitted no physical size is claimed: JFIF keeps units = 0 with a 1:1 aspect ratio. Exif 2.32 makes
   * the IFD0 resolution tags mandatory and says an unknown resolution "shall" be recorded as 72 dpi, so IFD0
   * carries 72/1 with ResolutionUnit = 2; that is the standard's unknown-resolution marker, not a print size.
   */
  pixelsPerInch?:number;
}
```

## PrintJpegOutput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PrintJpegOutput {
  schemaVersion:typeof PRINT_JPEG_SCHEMA_VERSION;
  input:PrintJpegInput;
  mediaType:"image/jpeg";
  bytes:Uint8Array;
  iccProfileVersion:typeof SRGB_ICC_PROFILE_VERSION;
  width:number;height:number;
  resampling:"exact-area-average-in-decoded-linear-light";
  sourceStage:"post-SDR-8-bit-quantization";
  digitalUpscalingApplied:false;
  sourceBytesVerified:false;
  /** Provider calls made: ceil(crop.height/32) x ceil(crop.width/256) tiles, each crop pixel read once. */
  providerReads:number;
  /** Byte behaviour of the baseline encoder that produced `bytes`. */
  encoderId:typeof EXPORT_JPEG_ENCODER_ID;
}
```

## PrintJpegProvider

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PrintJpegProvider {
  readTile(request:Readonly<PrintJpegTileRequest>,signal:AbortSignal):Promise<PrintJpegTile>;
  yieldControl(signal:AbortSignal):Promise<void>;
}
```

## PrintJpegSource

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PrintJpegSource {
  captureId:string;imageStateId:string;artifactId:string;sha256:string;
  width:number;height:number;
  encoding:"encoded-srgb-8-rgb";
}
```

## PrintJpegTask

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PrintJpegTask {
  readonly state:NativeRawTaskState;
  run():Promise<void>;cancel():void;dispose():void;takeOutput():PrintJpegOutput;
}
```

## PrintJpegTile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PrintJpegTile extends PrintJpegTileRequest {samples:Uint8Array}
```

## PrintJpegTileRequest

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface PrintJpegTileRequest {source:PrintJpegSource;x:number;y:number;width:number;height:number}
```
