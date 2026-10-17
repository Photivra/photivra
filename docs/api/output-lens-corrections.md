# output/lens-corrections.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateLensCorrectedCapture

Applies bounded corrections to RGB channels that are already sampled and linear.
Compatible shared geometry and per-channel CA are combined, so each channel is resampled once.
A gain between geometry components, or incompatible domains, needs a separate staged caller.

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
  /** Area valid in every channel, before cropping. Missing colours are never made up. */
  validSourceMask: readonly boolean[];
  jointCrop: GeometricSamplingPlan["jointCrop"];
  /** Clipping events in gain stages, before the shared valid-area crop. Each stage is counted separately. */
  illuminationClippingEventCount: number;
}>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculatePeripheralIlluminationCorrection

Applies a gain after capture and reports the variance before clipping. It does not rewrite
the photon or SNR (signal-to-noise ratio) history of the capture.

```ts
export function calculatePeripheralIlluminationCorrection(input: {
  component: IlluminationLensCorrection; imagePointMm: LensFieldPointMm;
  signal: number; noiseVariance: number; clippingLevel: number;
}): CalculationResult<{ gain: number; signalBeforeClipping: number; signal: number; noiseVarianceBeforeClipping: number; clipped: boolean }>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## GenericLensCorrectionProfile

A correction profile for one exact lens-and-camera system. Components are listed in the order they are applied.

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

A distortion correction map, declared separately. It may deliberately leave some physical distortion in place.

```ts
export interface GeometricLensCorrection extends CorrectionComponentIdentity {
  kind: "geometry";
  transform: DigitalGeometricTransform;
}
```

## IlluminationLensCorrection

Vignetting correction as a gain applied after capture. A strength below 1 deliberately leaves some falloff. Range 0..1.

```ts
export interface IlluminationLensCorrection extends CorrectionComponentIdentity {
  kind: "peripheral-illumination";
  profile: IlluminationVignettingProfile;
  strength: number;
}
```

## LateralCaLensCorrection

Lateral CA: shifts colour channels into register. It does not correct longitudinal CA or colour shading.

```ts
export interface LateralCaLensCorrection extends CorrectionComponentIdentity {
  kind: "lateral-ca";
  transforms: Readonly<Record<LensCorrectionChannel, DigitalGeometricTransform>>;
}
```

## LensCorrectionCapture

The fixed capture identity travels with the output channels, so On/Off comparisons use the same capture.

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

Strictly parses a generic correction profile. It does not extrapolate and makes no claim to restore lost detail.

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
  /** For now, a RAW-like intent is recorded as metadata only. */
  application: "metadata-only" | "bake-downstream";
}
```

## resolveLensCorrectionPlan

Decides which corrections apply for a camera state. It accounts for per-component settings,
explicit dependencies between components, RAW intent and the educational "corrections off" bypass.

```ts
export function resolveLensCorrectionPlan(input: {
  profile: GenericLensCorrectionProfile; state: OpticalProfileState;
  selections: Readonly<Record<string, "on" | "off" | "auto">>;
  outputKind: "raw-like" | "processed"; selectionKind: "camera-selectable" | "reference-bypass";
}): CalculationResult<ResolvedLensCorrectionPlan>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
