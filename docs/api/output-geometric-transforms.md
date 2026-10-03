# output/geometric-transforms.ts public contracts

Package **1.1.0**, root API **1.1.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## AffineGeometricTransform

Explicit destination-to-source affine map, including rotation/shear/offset.

```ts
export interface AffineGeometricTransform extends TransformIdentity {
  kind: "affine";
  matrix: GeometricJacobian;
  offsetMm: LensFieldPointMm;
}
```

## calculateComposedGeometricMapping

Authoritative display-to-capture map and full local directional derivatives.

```ts
export function calculateComposedGeometricMapping(input: {
  mapping: PreparedGeometricMapping; destinationPointMm: LensFieldPointMm;
}): CalculationResult<GeometricMappingPoint>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculateForwardGeometricMapping

Capture-to-display bridge for focus, metering and overlays; reverses the same maps.

```ts
export function calculateForwardGeometricMapping(input: {
  mapping: PreparedGeometricMapping; sourcePointMm: LensFieldPointMm;
}): CalculationResult<LensFieldPointMm>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculateGeometricResampling

Samples an already-formed scalar image once; null output marks missing source support.

```ts
export function calculateGeometricResampling(input: {
  plan: GeometricSamplingPlan; sourceSamples: readonly number[];
}): CalculationResult<{ samples: readonly (number | null)[]; resamplePasses: 1; resampler: GeometricResampler }>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculateGeometricSamplingPlan

Resolves one joint validity/crop/AA plan after composing compatible inverse maps.

```ts
export function calculateGeometricSamplingPlan(input: {
  mapping: PreparedGeometricMapping; sourceRaster: GeometricRaster; destinationRaster: GeometricRaster;
  resampler: GeometricResampler; physicalProjectionDistanceMm: number;
}): CalculationResult<GeometricSamplingPlan>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## DigitalGeometricTransform

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type DigitalGeometricTransform = AffineGeometricTransform | RadialGeometricTransform;
```

## GeometricImageDomain

Domains are barriers: only contiguous equal-domain maps share a resample.

```ts
export type GeometricImageDomain = "raw-channel" | "reconstructed-linear" | "processed-output";
```

## GeometricJacobian

Row-major derivative d(source mm)/d(destination mm).

```ts
export type GeometricJacobian = readonly [number, number, number, number];
```

## GeometricMappingPoint

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GeometricMappingPoint {
  sourcePointMm: LensFieldPointMm;
  jacobian: GeometricJacobian;
  determinant: number;
  principalStretches: readonly [number, number];
  anisotropy: number;
  components: readonly { id: string; sourcePointMm: LensFieldPointMm; jacobian: GeometricJacobian }[];
}
```

## GeometricRaster

Regular pixel centers on the optical plane: +X right, +Y up; row order down.

```ts
export interface GeometricRaster {
  width: number;
  height: number;
  centerMm: LensFieldPointMm;
  pitchMm: number;
}
```

## GeometricResampler

Resampler identity is independent of mapping. Prefiltering is a caller obligation.

```ts
export interface GeometricResampler {
  id: string;
  version: string;
  filter: "nearest" | "bilinear";
  antialias: "none" | "source-prefiltered";
}
```

## GeometricSamplingPlan

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GeometricSamplingPlan {
  mapping: PreparedGeometricMapping;
  sourceRaster: GeometricRaster;
  destinationRaster: GeometricRaster;
  resampler: GeometricResampler;
  points: readonly GeometricMappingPoint[];
  /** Includes exact center-domain support for the selected filter; no edge extension. */
  validSourceMask: readonly boolean[];
  /** Largest all-valid axis-aligned pixel rectangle, half-open. Null if empty. */
  jointCrop: { x: number; y: number; width: number; height: number } | null;
  requiresPrefilter: boolean;
  canResample: boolean;
  physicalCapturedFovDegrees: { horizontal: number; vertical: number };
  /** Envelope of mapped pixel-center rays retained by the joint crop, not edge FOV. */
  retainedSampleRayEnvelopeDegrees: { minX: number; maxX: number; minY: number; maxY: number } | null;
}
```

## parseDigitalGeometricTransform

Parses strict transform data, rejecting unknown semantics and noninvertible profiles.

```ts
export function parseDigitalGeometricTransform(value: unknown): DigitalGeometricTransform;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PreparedGeometricMapping

Serializable prepared state. Maps are applied in listed destination-to-source order.

```ts
export interface PreparedGeometricMapping {
  schemaVersion: "0.1.0";
  frameTimeSeconds: number;
  transforms: readonly DigitalGeometricTransform[];
  semanticKey: string;
  groups: readonly { domain: GeometricImageDomain; componentIds: readonly string[] }[];
}
```

## prepareGeometricMapping

Prepares deterministic still/frame geometry; time changes require another preparation.

```ts
export function prepareGeometricMapping(input: {
  transforms: readonly DigitalGeometricTransform[]; frameTimeSeconds: number;
}): CalculationResult<PreparedGeometricMapping>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## RadialGeometricTransform

Correction samples physical distorted data at the mapped ideal destination.

```ts
export interface RadialGeometricTransform extends TransformIdentity {
  kind: "radial";
  profile: RadialDistortionProfile;
}
```
