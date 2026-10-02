# optics/depth-of-field.ts public contracts

Package **1.0.0**, root API **0.116.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateDefocusCircle

Calculates the geometric defocus-circle diameter at the sensor plane for a
subject plane away from the selected focus plane.

```ts
export function calculateDefocusCircle(
  input: CalculateDefocusCircleInput
): CalculationResult<DefocusCircle>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateDefocusCircleInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateDefocusCircleInput {
  /** Lens focal length in millimetres. */
  focalLengthMm: number;
  /** F-number. */
  aperture: number;
  /** Focus-plane distance from the lens plane in metres. */
  focusDistanceM: number;
  /** Subject-plane distance from the lens plane in metres. */
  subjectDistanceM: number;
}
```

## calculateDepthOfField

Calculates thin-lens depth-of-field limits using the conventional
hyperfocal-distance formulation.

The model is geometric and does not include diffraction, aberrations,
focus breathing, pupil magnification, or macro/high-magnification effects.

```ts
export function calculateDepthOfField(
  input: CalculateDepthOfFieldInput
): CalculationResult<DepthOfField>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateDepthOfFieldInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateDepthOfFieldInput {
  /** Lens focal length in millimetres. */
  focalLengthMm: number;
  /** F-number. */
  aperture: number;
  /** Focus distance from the lens plane in metres. */
  focusDistanceM: number;
  /** Acceptable circle of confusion diameter in millimetres. */
  circleOfConfusionMm: number;
}
```

## DefocusCircle

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface DefocusCircle {
  /** Geometric blur-circle diameter at the sensor plane in millimetres. */
  diameterMm: number;
}
```

## DepthOfField

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface DepthOfField {
  hyperfocalDistanceM: number;
  nearLimitM: number;
  /** Null represents an infinite far limit. */
  farLimitM: number | null;
  /** Null represents infinite total depth of field. */
  totalDepthOfFieldM: number | null;
}
```
