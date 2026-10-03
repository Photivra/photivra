# optics/focus-breathing.ts public contracts

Package **1.1.0**, root API **1.1.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateFocusBreathingFieldOfView

Calculates one-axis field of view for the generic declared-scale focus-
breathing projection and reports the corresponding ideal thin-lens FOV.

A breathingProjectionScale of 1 reproduces the current focus-aware
thin-lens field-of-view result exactly.

```ts
export function calculateFocusBreathingFieldOfView(
  input: CalculateFocusBreathingFieldOfViewInput
): CalculationResult<FocusBreathingFieldOfView>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateFocusBreathingFieldOfViewInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateFocusBreathingFieldOfViewInput
  extends CalculateFocusBreathingProjectionInput {
  /** Sensor/capture dimension corresponding to the requested FOV, in millimetres. */
  sensorDimensionMm: number;
}
```

## calculateFocusBreathingProjection

Applies a caller-declared focus-breathing projection scale to the ideal
Gaussian thin-lens projection for one focus state.

Photivra does not infer the scale from focal length, focus distance, lens
identity, or marketing data. A value of 1 exactly preserves the current
thin-lens projection.

This is a generic approximation of focus-dependent projection/magnification,
not a calibrated real-lens model. The physical focal length remains
authoritative and unchanged.

```ts
export function calculateFocusBreathingProjection(
  input: CalculateFocusBreathingProjectionInput
): CalculationResult<FocusBreathingProjection>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateFocusBreathingProjectionInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateFocusBreathingProjectionInput {
  /** Physical lens focal length in millimetres. This value is never rewritten. */
  focalLengthMm: number;
  /** Selected focus distance in metres. */
  focusDistanceM: number;
  /**
   * Caller-declared projection scale for this focus state, relative to the
   * ideal thin-lens image distance.
   *
   * 1 means no additional breathing relative to the current thin-lens model.
   * Values above 1 narrow framing / increase magnification; values below 1
   * widen framing / reduce magnification.
   */
  breathingProjectionScale: number;
}
```

## FocusBreathingFieldOfView

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FocusBreathingFieldOfView {
  physicalFocalLengthMm: number;
  focusDistanceM: number;
  sensorDimensionMm: number;
  breathingProjectionScale: number;
  idealProjectionDistanceMm: number;
  effectiveProjectionDistanceMm: number;
  idealDegrees: number;
  effectiveDegrees: number;
  deltaDegrees: number;
}
```

## FocusBreathingProjection

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FocusBreathingProjection {
  /** Authoritative physical focal length supplied by the caller. */
  physicalFocalLengthMm: number;
  focusDistanceM: number;
  /** Ideal Gaussian thin-lens image distance before breathing adjustment. */
  idealProjectionDistanceMm: number;
  /**
   * Effective projection distance used by the generic breathing model.
   *
   * This is a projection/magnification parameter, not a replacement physical
   * focal length.
   */
  effectiveProjectionDistanceMm: number;
  /** Caller-declared scale relative to ideal thin-lens projection. */
  breathingProjectionScale: number;
  /** Ideal Gaussian thin-lens magnification at the selected focus distance. */
  idealMagnification: number;
  /** Generic breathing-adjusted magnification. */
  effectiveMagnification: number;
}
```
