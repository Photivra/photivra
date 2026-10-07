# capture/linear-encoding.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateLinearCaptureEncoding

Quantizes one immutable inline float plane without changing its capture data.
Mapping: blackCode + (sample-blackValue)/(referenceWhiteValue-blackValue)
* (referenceWhiteCode-blackCode). Clips only under explicit policy, then rounds.

```ts
export function calculateLinearCaptureEncoding(input: LinearCaptureEncodingInput): CalculationResult<EncodedLinearCapture>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## EncodedLinearCapture

Format-neutral 16-bit unsigned codes; metadata retains color/WB/saturation meaning.

```ts
export interface EncodedLinearCapture {
  schemaVersion: typeof LINEAR_CAPTURE_ENCODING_SCHEMA_VERSION;
  captureId: string;
  /** Sanitized geometry/settings/WB/adopted-white/model provenance without float planes. */
  captureMetadata: Omit<SimulatedCapture, "planes">;
  sourcePlane: Omit<CaptureLinearPlane, "storage">;
  encoding: LinearCaptureEncoding;
  sampleLayout: "row-major-interleaved";
  bitDepth: 16;
  codeMinimum: 0;
  codeMaximum: 65535;
  referenceWhiteValue: number;
  /** Codes per relative source unit; same scale for all channels. */
  scale: number;
  minimumRepresentableValue: number;
  maximumRepresentableValue: number;
  /** Maximum above-black value / reference-white above-black value. */
  headroomFactor: number;
  /** 0.5/scale for in-range samples; excludes clipping error. */
  maximumRoundingError: number;
  clippedLowSampleCount: number;
  clippedHighSampleCount: number;
  /** No default rendering exposure/display white is chosen by linear encoding. */
  defaultRenderingExposureEv: null;
  samples: readonly number[];
}
```

## LINEAR_CAPTURE_ENCODING_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
LINEAR_CAPTURE_ENCODING_SCHEMA_VERSION = "0.1.0" as const
```

## LinearCaptureEncoding

Uniform channel mapping; capture reference white comes from the source plane.

```ts
export interface LinearCaptureEncoding {
  schemaVersion: typeof LINEAR_CAPTURE_ENCODING_SCHEMA_VERSION;
  /** Relative source sample value assigned blackCode; may be negative. */
  blackValue: number;
  /** Integer code at blackValue, 0..65534. An offset can preserve negative samples. */
  blackCode: number;
  /** Code at the plane's referenceWhiteValue, strictly above blackCode, at most 65535. */
  referenceWhiteCode: number;
  negativeValues: "preserve-if-representable" | "reject";
  outOfRange: "clip" | "reject";
  rounding: "nearest-ties-up";
}
```

## LinearCaptureEncodingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LinearCaptureEncodingInput {
  capture: SimulatedCapture;
  planeId: string;
  /** Prevents substituting a differently interpreted linear plane. */
  requiredImageState: CaptureLinearImageState;
  encoding: LinearCaptureEncoding;
}
```

## parseLinearCaptureEncoding

Strict allowlisted encoding parser; no default clipping/rounding policy is invented.

```ts
export function parseLinearCaptureEncoding(value: unknown): LinearCaptureEncoding;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
