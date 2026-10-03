# capture/simulated-capture.ts public contracts

Package **1.1.0**, root API **1.1.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## CaptureFloatStorage

External bytes are caller-owned; the engine never reads a path or URL.

```ts
export type CaptureFloatStorage =
  | { kind: "inline-float64"; samples: readonly number[] }
  | { kind: "external-float32" | "external-float64"; byteOrder: "little-endian"; artifactId: string; sha256: string; sampleCount: number };
```

## CaptureLinearImageState

Distinct linear domains, not one interchangeable 'linear' flag.

```ts
export type CaptureLinearImageState = "scene-referred-xyz" | "virtual-sensor-channels" | "color-transformed-linear-rgb";
```

## CaptureLinearPlane

Linear float plane; all channels are co-sited and interleaved in row-major order.

```ts
export interface CaptureLinearPlane {
  id: string;
  imageStateId: string;
  imageState: CaptureLinearImageState;
  rasterBinding: "oriented-active-capture" | "output";
  pixelWidth: number;
  pixelHeight: number;
  channelIds: readonly string[];
  colorProfile: CapturePublicProfileReference | null;
  /** Defined for colorimetric/RGB encodings; null for unresolved sensor channels. */
  encodingReferenceWhiteXyz: CaptureWhiteXyz | null;
  /** Value normalization, independent of capture saturation or eventual integer white. */
  referenceWhiteValue: number;
  whiteBalanceApplication: "intent-only" | "applied-rgb-gains" | "applied-chromatic-adaptation" | "not-applicable";
  captureSaturation:
    | { kind: "not-modeled" }
    | { kind: "declared-virtual-white"; whiteLevel: number; upstreamClippedSampleCount: number };
  appliedTransforms: readonly { profile: CapturePublicProfileReference; kind: "linear-color" | "chromatic-adaptation" | "digital-lens-correction" }[];
  storage: CaptureFloatStorage;
}
```

## CapturePublicProfileReference

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CapturePublicProfileReference { id: string; version: string }
```

## CaptureWhiteBalanceIntent

A resolved #108 choice, sanitized for public metadata. No estimator is rerun.

```ts
export interface CaptureWhiteBalanceIntent {
  stateId: string;
  source: ResolvedWhiteBalanceState["source"];
  locked: boolean;
  channelGains: WhiteBalanceChannelGains;
  sourceProfile: CapturePublicProfileReference | null;
}
```

## CaptureWhiteXyz

Normalized tristimulus white; Y=1. This is not a spectrum or Kelvin value.

```ts
export interface CaptureWhiteXyz { x: number; y: 1; z: number }
```

## createCaptureWhiteBalanceIntent

Converts validated shooting WB into a public metadata allowlist, discarding private extras.

```ts
export function createCaptureWhiteBalanceIntent(input: { state: ResolvedWhiteBalanceState }): CaptureWhiteBalanceIntent;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## createSimulatedCapture

Commits a format-neutral float master manifest; no radiance generation, clamp, WB or export encoding.

```ts
export function createSimulatedCapture(input: SimulatedCaptureInput): CalculationResult<SimulatedCapture>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSimulatedCapture

Parses an archived capture, recomputing and checking all derived geometry/focal metadata.

```ts
export function parseSimulatedCapture(value: unknown): SimulatedCapture;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## resolveSimulatedCapturePlane

Requires an exact plane image state; callers may not substitute another kind of 'linear'.

```ts
export function resolveSimulatedCapturePlane(input: {
  capture: SimulatedCapture; planeId: string; requiredImageState: CaptureLinearImageState;
}): CaptureLinearPlane;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## serializeSimulatedCapture

Canonical allowlisted JSON, including semantic samples/IDs, not private caches or file layout.

```ts
export function serializeSimulatedCapture(input: { capture: SimulatedCapture }): string;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SIMULATED_CAPTURE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SIMULATED_CAPTURE_SCHEMA_VERSION = "0.2.0" as const
```

## SimulatedCapture

Immutable committed value. Geometry/focal equivalence are derived, never caller overrides.

```ts
export interface SimulatedCapture extends SimulatedCaptureInput {
  schemaVersion: typeof SIMULATED_CAPTURE_SCHEMA_VERSION;
  engineApiVersion: string;
  resolvedGeometry: ResolvedCaptureGeometry;
  equivalentFocalLength35Mm: number;
}
```

## SimulatedCaptureInput

Format-neutral input from an upstream master/capture provider, not a preview image.

```ts
export interface SimulatedCaptureInput {
  captureId: string;
  sceneStateId: string;
  /** Seconds on the declared scene clock, not an embedded wall-clock timestamp. */
  sceneTimeSeconds: number;
  geometry: ResolveCaptureGeometryInput;
  exposure: { focalLengthMm: number; aperture: number; shutterSeconds: number; iso: number };
  focus: FocusPlane;
  noise: { seedUint32: number; realizationId: string; model: CapturePublicProfileReference };
  source: {
    kind: "scene-linear-master" | "sensor-derived-linear" | "color-transformed-linear-master";
    artifactId: string;
    sha256: string;
    dynamicRangeHistory: "unknown" | "no-loss-declared" | "upstream-clipped";
  };
  whiteBalanceIntent: CaptureWhiteBalanceIntent | null;
  /** Adopted/WB white is a camera choice, not automatically the encoding white. */
  adoptedWhiteXyz: CaptureWhiteXyz | null;
  models: readonly { profile: CapturePublicProfileReference; scientificStatus: ProvenanceKind; publicEvidenceIds: readonly string[] }[];
  planes: readonly CaptureLinearPlane[];
}
```
