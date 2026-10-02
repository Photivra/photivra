# output/lens-corrections.ts public contracts

Package **1.0.0**, root API **0.116.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateLensCorrectedCapture

Executes bounded reconstructed-linear corrections on already sampled RGB channels.
Compatible common geometry plus channel CA is sampled once per channel.
A gain between geometry components or incompatible domains requires an external staged consumer.

```ts
export function calculateLensCorrectedCapture(input: {
  plan: ResolvedLensCorrectionPlan; capture: LensCorrectionCapture;
  destinationRaster: GeometricRaster; resampler: GeometricResampler;
  physicalProjectionDistanceMm: number; clippingLevel: number;
}): CalculationResult<{
  captureId: string; noiseRealizationId: string; timeSeconds: number;
  application: ResolvedLensCorrectionPlan["application"];
  channels: Readonly<Record<LensCorrectionChannel, readonly (number | null)[]>>;
  samplingPlans: Partial<Record<LensCorrectionChannel, GeometricSamplingPlan>>;
  /** Intersection across all channel footprints, before crop; no missing colors fabricated. */
  validSourceMask: readonly boolean[];
  jointCrop: GeometricSamplingPlan["jointCrop"];
  /** Gain-stage clipping events before joint support/crop; repeated stages count separately. */
  illuminationClippingEventCount: number;
}>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculatePeripheralIlluminationCorrection

Applies scalar post-capture gain and reports pre-clip variance; no photon/SNR history rewrite.

```ts
export function calculatePeripheralIlluminationCorrection(input: {
  component: IlluminationLensCorrection; imagePointMm: LensFieldPointMm;
  signal: number; noiseVariance: number; clippingLevel: number;
}): CalculationResult<{ gain: number; signalBeforeClipping: number; signal: number; noiseVarianceBeforeClipping: number; clipped: boolean }>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## GenericLensCorrectionProfile

Exact generic system binding, with components in authoritative application order.

```ts
export interface GenericLensCorrectionProfile {
  schemaVersion: "0.1.0";
  id: string;
  version: string;
  state: OpticalProfileState;
  evidence: GenericOpticalEvidence;
  components: readonly LensCorrectionComponent[];
}
```

## GeometricLensCorrection

A separately declared correction map may deliberately retain physical distortion.

```ts
export interface GeometricLensCorrection extends CorrectionComponentIdentity {
  kind: "geometry";
  transform: DigitalGeometricTransform;
}
```

## IlluminationLensCorrection

Post-capture scalar gain; strength 0..1 leaves explicit residual falloff.

```ts
export interface IlluminationLensCorrection extends CorrectionComponentIdentity {
  kind: "peripheral-illumination";
  profile: IlluminationVignettingProfile;
  strength: number;
}
```

## LateralCaLensCorrection

Channel registration only, not longitudinal CA or color shading.

```ts
export interface LateralCaLensCorrection extends CorrectionComponentIdentity {
  kind: "lateral-ca";
  transforms: Readonly<Record<LensCorrectionChannel, DigitalGeometricTransform>>;
}
```

## LensCorrectionCapture

Immutable capture identity accompanies downstream channels for meaningful On/Off comparisons.

```ts
export interface LensCorrectionCapture {
  state: OpticalProfileState;
  captureId: string;
  noiseRealizationId: string;
  timeSeconds: number;
  raster: GeometricRaster;
  channels: Readonly<Record<LensCorrectionChannel, readonly number[]>>;
}
```

## LensCorrectionChannel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type LensCorrectionChannel = "red" | "green" | "blue";
```

## LensCorrectionComponent

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type LensCorrectionComponent = GeometricLensCorrection | LateralCaLensCorrection | IlluminationLensCorrection;
```

## parseGenericLensCorrectionProfile

Strict parser for generic system corrections; no extrapolation or restoration claim.

```ts
export function parseGenericLensCorrectionProfile(value: unknown): GenericLensCorrectionProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvedLensCorrectionPlan

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedLensCorrectionPlan {
  profile: GenericLensCorrectionProfile;
  outputKind: "raw-like" | "processed";
  selectionKind: "camera-selectable" | "reference-bypass";
  components: readonly { component: LensCorrectionComponent; enabled: boolean;
    reason: "selected" | "default" | "mandatory" | "stabilization-dependency" | "component-dependency" | "reference-bypass" }[];
  /** RAW-like intent remains metadata only in this first foundation. */
  application: "metadata-only" | "bake-downstream";
}
```

## resolveLensCorrectionPlan

Resolves independent camera states, explicit dependencies, RAW intent and educational bypass.

```ts
export function resolveLensCorrectionPlan(input: {
  profile: GenericLensCorrectionProfile; state: OpticalProfileState;
  selections: Readonly<Record<string, "on" | "off" | "auto">>;
  outputKind: "raw-like" | "processed"; selectionKind: "camera-selectable" | "reference-bypass";
}): CalculationResult<ResolvedLensCorrectionPlan>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
