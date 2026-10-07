# optics/focus-state.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateFocusPlaneImageDistance

Calculates the ideal image-plane distance for an explicit focus state.

Finite focus delegates to the existing Gaussian thin-lens calculation, so
its numerical result and provenance are unchanged. Infinity focus resolves
exactly to the nominal focal length with zero limiting magnification.

```ts
export function calculateFocusPlaneImageDistance(
  input: CalculateFocusPlaneImageDistanceInput
): CalculationResult<ThinLensImageDistance>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateFocusPlaneImageDistanceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateFocusPlaneImageDistanceInput {
  /** Lens focal length in millimetres. */
  focalLengthMm: number;
  /** Explicit finite or infinity focus-plane state. */
  focus: FocusPlane;
}
```

## FocusPlane

Explicit ideal focus-plane state.

Finite distance is the longitudinal object-plane distance from the ideal
lens principal plane along the camera optical axis. Infinity is a semantic
state and is never represented with JavaScript Infinity or a fabricated
large distance.

```ts
export type FocusPlane =
  | {
      kind: "finite";
      distanceM: number;
    }
  | {
      kind: "infinity";
    };
```

## parseFocusPlane

Parses an explicit focus-plane state from an untrusted JSON boundary.

Missing/unknown focus is rejected rather than being interpreted as infinity.

```ts
export function parseFocusPlane(value: unknown): FocusPlane;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
