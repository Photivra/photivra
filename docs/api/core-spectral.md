# core/spectral.ts public contracts

Package **1.1.0**, root API **1.1.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## parseSpectralWavelengthBasis

Parses a wavelength basis without inferring air/vacuum conversion.

```ts
export function parseSpectralWavelengthBasis(
  value: unknown,
  path = "wavelengthBasis"
): SpectralWavelengthBasis;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSpectralWavelengthRangeNanometers

Parses a positive non-empty wavelength interval in nanometres.

```ts
export function parseSpectralWavelengthRangeNanometers(
  value: unknown,
  path = "wavelengthRangeNanometers"
): SpectralWavelengthRangeNanometers;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSpectralWavelengthSample

Parses one positive wavelength coordinate in nanometres.

```ts
export function parseSpectralWavelengthSample(
  value: unknown,
  path = "spectralSample"
): SpectralWavelengthSample;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SpectralWavelengthBasis

Explicit wavelength coordinate basis used by renderer-neutral spectral data.

"unspecified" is permitted only where a downstream contract explicitly
allows unresolved/approximate wavelength coordinates. Calibrated physical
composition must resolve the basis before use.

```ts
export type SpectralWavelengthBasis =
  | "air"
  | "vacuum"
  | "unspecified";
```

## SpectralWavelengthRangeNanometers

Closed wavelength interval expressed in nanometres.

```ts
export interface SpectralWavelengthRangeNanometers {
  minimum: number;
  maximum: number;
}
```

## SpectralWavelengthSample

One wavelength coordinate expressed in nanometres.

```ts
export interface SpectralWavelengthSample {
  wavelengthNanometers: number;
}
```
