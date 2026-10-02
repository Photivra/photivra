# output/crop.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateCenteredCrop

Calculates dimensions remaining after a centered, same-aspect-ratio crop.

```ts
export function calculateCenteredCrop(
  input: CalculateCenteredCropInput
): CalculationResult<CenteredCrop>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateCenteredCropInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateCenteredCropInput {
  /** Original image width in pixels. */
  pixelWidth: number;
  /** Original image height in pixels. */
  pixelHeight: number;
  /**
   * Linear crop factor. 1 means no crop; 1.5 retains 1 / 1.5 of each
   * dimension while preserving aspect ratio.
   */
  cropFactor: number;
}
```

## CenteredCrop

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CenteredCrop {
  pixelWidth: number;
  pixelHeight: number;
  megapixels: number;
  /** Fraction of original pixel area retained, from 0 to 1. */
  retainedAreaFraction: number;
}
```
