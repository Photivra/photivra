# camera/projected-object-size.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateProjectedObjectSize

Calculates the projected size of a fronto-parallel object plane.

Without focusDistanceM, the function preserves ideal pinhole projection
using nominal focal length. With focusDistanceM, it projects to the ideal
thin-lens sensor plane selected by that focus distance.

```ts
export function calculateProjectedObjectSize(
  input: CalculateProjectedObjectSizeInput
): CalculationResult<ProjectedObjectSize>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateProjectedObjectSizeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateProjectedObjectSizeInput {
  /** Lens focal length in millimetres. */
  focalLengthMm: number;
  /** Object width in metres. */
  objectWidthM: number;
  /** Object height in metres. */
  objectHeightM: number;
  /** Object-plane distance from the camera in metres. */
  distanceM: number;
  /** Optional focus distance in metres for focus-aware sensor-plane projection. */
  focusDistanceM?: number;
  /** Optional sensor pixel pitch in micrometres. */
  pixelPitchMicrometers?: number;
}
```

## ProjectedObjectSize

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ProjectedObjectSize {
  widthMm: number;
  heightMm: number;
  projectionDistanceMm: number;
  widthPixels?: number;
  heightPixels?: number;
}
```
