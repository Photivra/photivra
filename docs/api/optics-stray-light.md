# optics/stray-light.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateLensStrayLightIrradiance

Adds off-path spectral irradiance before sensor/exposure integration, never after tone mapping.
Source powers are integrated over profile.referenceEntranceAreaMm2 at this instant/wavelength.
Gaussian templates are independently parameterized approximations, not lens prescription ray tracing.

```ts
export function calculateLensStrayLightIrradiance(input: {
  profile: LensStrayLightProfile; state: OpticalProfileState; enabled: boolean;
  imagePointMm: LensFieldPointMm; wavelengthNm: number; wavelengthBasis: "air" | "vacuum";
  timeSeconds: number; primarySpectralIrradianceWPerM2PerNm: number;
  sources: readonly StrayLightSource[]; meterDomain: "primary-only" | "primary-plus-stray";
}): CalculationResult<StrayLightIrradiance>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## LensStrayLightProfile

Single explicit wavelength and exact generic camera state; clean optics only.

```ts
export interface LensStrayLightProfile {
  schemaVersion: "0.1.0";
  id: string;
  version: string;
  state: OpticalProfileState;
  evidence: GenericOpticalEvidence;
  interaction: "lens-reflections" | "sensor-lens-reflections";
  wavelengthNm: number;
  wavelengthBasis: "air" | "vacuum";
  maximumSourceAngleDegrees: number;
  /** Area over which the caller's incident source power was integrated. */
  referenceEntranceAreaMm2: number;
  responses: readonly ParametricStrayLightResponse[];
}
```

## ParametricStrayLightResponse

One reflected-path or broad scatter response, normalized over the infinite image plane.

```ts
export interface ParametricStrayLightResponse {
  id: string;
  kind: "ghost" | "veil";
  /** Centroid response in mm per degree of the two declared source field angles. */
  centroidMmPerDegree: readonly [number, number, number, number];
  offsetMm: LensFieldPointMm;
  sigmaMm: number;
  /** Fraction of source power entering this response at the axis. */
  axisPowerFraction: number;
  /** F(rho)=F(0)*(1+slope*rho²), rho=source angle/max angle. */
  angularSlope: number;
}
```

## parseLensStrayLightProfile

Strict generic profile parser; bounds passivity across the whole angular envelope.

```ts
export function parseLensStrayLightProfile(value: unknown): LensStrayLightProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## StrayLightIrradiance

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface StrayLightIrradiance {
  profileId: string;
  profileVersion: string;
  interaction: LensStrayLightProfile["interaction"];
  imagePointMm: LensFieldPointMm;
  wavelengthNm: number;
  wavelengthBasis: "air" | "vacuum";
  timeSeconds: number;
  primarySpectralIrradianceWPerM2PerNm: number;
  ghostSpectralIrradianceWPerM2PerNm: number;
  veilSpectralIrradianceWPerM2PerNm: number;
  totalSpectralIrradianceWPerM2PerNm: number;
  /** If primary-only, the meter excludes these additions; sensor always receives total. */
  meterDomain: "primary-only" | "primary-plus-stray";
  meterSpectralIrradianceWPerM2PerNm: number;
  contributions: readonly { sourceId: string; responseId: string; kind: "ghost" | "veil"; spectralIrradianceWPerM2PerNm: number }[];
}
```

## StrayLightSource

Direction remains available beyond the active frame; no crop clipping.

```ts
export interface StrayLightSource {
  id: string;
  fieldAngleXDegrees: number;
  fieldAngleYDegrees: number;
  incidentSpectralPowerWPerNm: number;
  /** Explicit source/path admission, e.g. a flag/hood decision; not a global hood scalar. */
  admittedFraction: number;
}
```
