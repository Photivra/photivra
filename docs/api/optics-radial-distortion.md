# optics/radial-distortion.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateInverseRadialDistortionMapping

Invert the declared monotonic radial field map within its supported envelope using the existing
bounded root solve and preserve explicit optical coordinates.

```ts
export function calculateInverseRadialDistortionMapping(
  input: CalculateInverseRadialDistortionMappingInput
): CalculationResult<InverseRadialDistortionMapping>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateInverseRadialDistortionMappingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateInverseRadialDistortionMappingInput {
  /** Distorted image-plane point to inverse-map back to ideal coordinates. */
  distortedImagePointMm: LensFieldPointMm;
  profile: RadialDistortionProfile;
}
```

## calculateInverseRadialDistortionMappings

Inverse-maps multiple distorted image-plane destinations while validating
and resolving the radial profile only once for the complete batch.

The returned per-point mappings are numerically identical to the scalar API;
provenance and profile validation are shared once at the batch boundary.

```ts
export function calculateInverseRadialDistortionMappings(
  input: CalculateInverseRadialDistortionMappingsInput
): CalculationResult<InverseRadialDistortionMappings>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateInverseRadialDistortionMappingsInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateInverseRadialDistortionMappingsInput {
  /** Distorted image-plane destinations to inverse-map in one validated batch. */
  distortedImagePointsMm: readonly LensFieldPointMm[];
  profile: RadialDistortionProfile;
}
```

## calculateRadialDistortionMapping

Applies a generic radial lens-distortion field mapping to one ideal
image-plane point.

The mapping is rotationally symmetric about the optical axis:

  p_distorted = p_ideal * (1 + k1 r² + k2 r⁴ + k3 r⁶)

where r is normalized by the caller-declared physical reference radius.

The profile is accepted only when the radial mapping is strictly monotonic
over its declared operating radius, which makes inverse destination-to-source
sampling well-defined.

```ts
export function calculateRadialDistortionMapping(
  input: CalculateRadialDistortionMappingInput
): CalculationResult<RadialDistortionMapping>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateRadialDistortionMappingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateRadialDistortionMappingInput {
  /** Ideal/undistorted image-plane point. */
  imagePointMm: LensFieldPointMm;
  profile: RadialDistortionProfile;
}
```

## InverseRadialDistortionMapping

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface InverseRadialDistortionMapping {
  direction: "distorted-to-undistorted";
  distortedImagePointMm: LensFieldPointMm;
  sourceImagePointMm: LensFieldPointMm;
  distortedNormalizedRadius: number;
  sourceNormalizedRadius: number;
  radialScaleAtSource: number;
  deltaMm: {
    x: number;
    y: number;
    distance: number;
  };
  profileMinimumRadialDerivative: number;
}
```

## InverseRadialDistortionMappings

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface InverseRadialDistortionMappings {
  direction: "distorted-to-undistorted-batch";
  mappings: readonly InverseRadialDistortionMapping[];
  pointCount: number;
  profileMinimumRadialDerivative: number;
}
```

## LensFieldPointMm

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LensFieldPointMm {
  /** Image-plane X coordinate relative to the optical axis, in mm. */
  x: number;
  /** Image-plane Y coordinate relative to the optical axis, in mm. */
  y: number;
}
```

## RadialDistortionCoefficients

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface RadialDistortionCoefficients {
  /** Dimensionless r² coefficient. */
  k1: number;
  /** Dimensionless r⁴ coefficient. */
  k2: number;
  /** Dimensionless r⁶ coefficient. */
  k3: number;
}
```

## RadialDistortionMapping

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface RadialDistortionMapping {
  direction: "undistorted-to-distorted";
  sourceImagePointMm: LensFieldPointMm;
  mappedImagePointMm: LensFieldPointMm;
  sourceNormalizedRadius: number;
  mappedNormalizedRadius: number;
  radialScale: number;
  deltaMm: {
    x: number;
    y: number;
    distance: number;
  };
  profileMinimumRadialDerivative: number;
}
```

## RadialDistortionProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface RadialDistortionProfile {
  /**
   * Physical image-plane radius used to normalize field position, in mm.
   * Coefficients are meaningful only with this declared normalization.
   */
  normalizationRadiusMm: number;
  /**
   * Maximum undistorted normalized radius over which this profile is declared
   * valid and must remain one-to-one/invertible.
   */
  maximumNormalizedRadius: number;
  coefficients: RadialDistortionCoefficients;
}
```
