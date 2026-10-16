# optics/focus-breathing.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

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

## calculateGeometricFocusBreathing

Focus breathing derived from ideal focusing geometry rather than a declared scale.

- unit-focus: the whole lens moves; u + v = L - hiatus with 1/u + 1/v = 1/f, so
  v = (T - sqrt(T^2 - 4 f T)) / 2 for T = L - hiatus >= 4 f, and the field narrows as v grows.
- fixed-image-distance-internal-focus: an idealised internal-focus lens keeps the rear principal
  plane at v = f_infinity and shortens its focal length to f' = u v / (u + v); the angular field
  at the rear nodal point is then unchanged while magnification is f_infinity / u.
Both use paraxial Gaussian optics with nodal points at the principal planes (unit pupil
magnification; Kingslake & Johnson, Lens Design Fundamentals, 2nd ed., ch. 3; Ray, Applied
Photographic Optics, 3rd ed., ch. 9 and 14). Real internal-focus lenses also shift pupils and
principal planes, so their breathing needs a calibrated profile.

```ts
export function calculateGeometricFocusBreathing(
  input: CalculateGeometricFocusBreathingInput
): CalculationResult<GeometricFocusBreathing>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateGeometricFocusBreathingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateGeometricFocusBreathingInput {
  /** Focal length at infinity focus, mm. */
  focalLengthMm: number;
  /**
   * Photographic focus distance measured from the subject plane to the sensor (image) plane, in
   * metres, as marked on lens distance scales.
   */
  subjectToSensorDistanceM: number;
  /** Sensor/capture dimension along the axis of interest, mm. */
  sensorDimensionMm: number;
  focusingMethod: GeometricFocusingMethod;
  /**
   * Signed separation between the front and rear principal planes (the hiatus), mm; default 0
   * (thin lens). The subject-to-sensor distance is u + hiatus + v.
   */
  principalPlaneSeparationMm?: number;
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

## GeometricFocusBreathing

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GeometricFocusBreathing {
  focusingMethod: GeometricFocusingMethod;
  infinityFocalLengthMm: number;
  /** Focal length of the focused system (changes only for internal focus), mm. */
  effectiveFocalLengthMm: number;
  /** Subject distance from the front principal plane, mm. */
  objectDistanceMm: number;
  /** Rear principal plane to sensor distance (projection distance), mm. */
  imageDistanceMm: number;
  /** Lateral magnification v / u. */
  magnification: number;
  /** v / f_infinity: framing scale relative to infinity focus. */
  projectionScaleRelativeToInfinity: number;
  /**
   * v divided by the ideal thin-lens image distance of the same infinity focal length at
   * objectDistanceMm. Exactly 1 for unit focus; usable as breathingProjectionScale with
   * focusDistanceM = objectDistanceMm / 1000 in calculateFocusBreathingProjection().
   */
  equivalentBreathingProjectionScale: number;
  fieldOfViewDegrees: number;
  infinityFieldOfViewDegrees: number;
  deltaDegrees: number;
}
```

## GeometricFocusingMethod

Ideal focusing geometry for {@link calculateGeometricFocusBreathing}.

```ts
export type GeometricFocusingMethod =
  | "unit-focus"
  | "fixed-image-distance-internal-focus";
```
