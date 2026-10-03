# optics/aperture.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## ApertureVertex

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ApertureVertex {
  x: number;
  y: number;
}
```

## calculateIdealApertureGeometry

Calculates ideal regular-polygon aperture geometry and the corresponding
straight-edge diffraction-ray directions.

This models only geometry/symmetry. It does not calculate diffraction
intensity, wavelength-dependent star length, blade curvature, lens
aberrations, coatings, or sensor blooming.

```ts
export function calculateIdealApertureGeometry(
  input: CalculateIdealApertureInput
): CalculationResult<IdealApertureGeometry>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateIdealApertureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateIdealApertureInput {
  /** Number of straight diaphragm blades/sides. Must be from 3 through 1024. */
  bladeCount: number;
  /**
   * Rotation of the first blade edge in degrees, measured counter-clockwise
   * in image coordinates before the diffraction-normal offset is applied.
   */
  firstBladeEdgeAngleDegrees?: number;
}
```

## IdealApertureGeometry

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface IdealApertureGeometry {
  bladeCount: number;
  /** Number of diffraction ray directions for the ideal straight-edged polygon. */
  sunstarRayCount: number;
  /**
   * Diffraction-ray directions in degrees, normalized to [0, 360).
   *
   * Each ray is perpendicular to a blade edge. Parallel opposite edges overlap
   * for even blade counts; odd blade counts therefore produce twice as many
   * visible ray directions.
   */
  sunstarRayAnglesDegrees: readonly number[];
  /** Unit-circumradius regular-polygon vertices. */
  normalizedVertices: readonly ApertureVertex[];
}
```
