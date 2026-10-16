# output/crop.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

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
   * Linear crop factor. 1 means no crop; 1.5 retains at most 1 / 1.5 of each
   * dimension. The shorter axis is floor(dimension / cropFactor); the longer
   * axis is the integer nearest the source aspect ratio, capped at
   * floor(dimension / cropFactor), so the aspect ratio is preserved as closely
   * as whole pixels allow.
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
