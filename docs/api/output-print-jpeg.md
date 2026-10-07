# output/print-jpeg.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

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
PRINT_JPEG_SCHEMA_VERSION="0.1.0" as const
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
  maximumProviderReads:number;
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
  providerReads:number;
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
