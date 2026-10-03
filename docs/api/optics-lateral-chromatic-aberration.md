# optics/lateral-chromatic-aberration.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateInverseLateralChromaticAberrationMapping

Inverse-maps one distorted output destination independently for the
representative red/green/blue channels.

Renderers can use the returned per-channel ideal source coordinates for
inverse sampling without inventing chromatic-aberration equations.

```ts
export function calculateInverseLateralChromaticAberrationMapping(
  input: CalculateInverseLateralChromaticAberrationMappingInput
): CalculationResult<InverseLateralChromaticAberrationMapping>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateInverseLateralChromaticAberrationMappingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateInverseLateralChromaticAberrationMappingInput {
  /**
   * Distorted output image-plane destination. Each output channel is inverse-
   * mapped independently to its ideal source coordinate.
   */
  distortedImagePointMm: LensFieldPointMm;
  profile: LateralChromaticAberrationProfile;
}
```

## calculateInverseLateralChromaticAberrationMappings

Inverse-maps multiple distorted destinations while resolving the shared CA
profile once and validating each combined channel profile once for the
complete batch.

Per-point values match calculateInverseLateralChromaticAberrationMapping();
provenance is shared once at the batch boundary.

```ts
export function calculateInverseLateralChromaticAberrationMappings(
  input: CalculateInverseLateralChromaticAberrationMappingsInput
): CalculationResult<InverseLateralChromaticAberrationMappings>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateInverseLateralChromaticAberrationMappingsInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateInverseLateralChromaticAberrationMappingsInput {
  /**
   * Distorted output image-plane destinations. Each destination is inverse-
   * mapped independently for red, green, and blue after one profile-resolution
   * step for the batch.
   */
  distortedImagePointsMm: readonly LensFieldPointMm[];
  profile: LateralChromaticAberrationProfile;
}
```

## calculateLateralChromaticAberrationMapping

Calculates generic lateral chromatic-aberration field separation by mapping
one ideal image-plane point through a shared green-reference base distortion
and red/blue radial coefficient offsets.

This is channel-dependent field mapping, not a blur kernel.

```ts
export function calculateLateralChromaticAberrationMapping(
  input: CalculateLateralChromaticAberrationMappingInput
): CalculationResult<LateralChromaticAberrationMapping>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateLateralChromaticAberrationMappingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateLateralChromaticAberrationMappingInput {
  /** Ideal/undistorted image-plane point shared by all channels. */
  imagePointMm: LensFieldPointMm;
  profile: LateralChromaticAberrationProfile;
}
```

## ChannelSeparationVectorMm

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ChannelSeparationVectorMm {
  x: number;
  y: number;
  distance: number;
}
```

## InverseLateralChromaticAberrationChannelMapping

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface InverseLateralChromaticAberrationChannelMapping {
  sourceImagePointMm: LensFieldPointMm;
  radialScaleAtSource: number;
  combinedCoefficients: RadialDistortionCoefficients;
}
```

## InverseLateralChromaticAberrationMapping

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface InverseLateralChromaticAberrationMapping {
  direction: "distorted-output-to-channel-sources";
  referenceChannel: "green";
  distortedImagePointMm: LensFieldPointMm;
  channels: {
    red: InverseLateralChromaticAberrationChannelMapping;
    green: InverseLateralChromaticAberrationChannelMapping;
    blue: InverseLateralChromaticAberrationChannelMapping;
  };
  sourceSeparation: LateralChromaticAberrationSeparation;
}
```

## InverseLateralChromaticAberrationMappings

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface InverseLateralChromaticAberrationMappings {
  direction: "distorted-output-to-channel-sources-batch";
  referenceChannel: "green";
  mappings: readonly InverseLateralChromaticAberrationMapping[];
  pointCount: number;
}
```

## LateralChromaticAberrationChannel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type LateralChromaticAberrationChannel = "red" | "green" | "blue";
```

## LateralChromaticAberrationChannelMapping

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LateralChromaticAberrationChannelMapping {
  mappedImagePointMm: LensFieldPointMm;
  radialScale: number;
  combinedCoefficients: RadialDistortionCoefficients;
}
```

## LateralChromaticAberrationMapping

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LateralChromaticAberrationMapping {
  direction: "undistorted-to-channel-distorted";
  referenceChannel: "green";
  sourceImagePointMm: LensFieldPointMm;
  channels: {
    red: LateralChromaticAberrationChannelMapping;
    green: LateralChromaticAberrationChannelMapping;
    blue: LateralChromaticAberrationChannelMapping;
  };
  separation: LateralChromaticAberrationSeparation;
}
```

## LateralChromaticAberrationProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LateralChromaticAberrationProfile {
  /** Shared physical image-plane normalization radius in millimetres. */
  normalizationRadiusMm: number;
  /** Shared undistorted normalized-radius operating envelope. */
  maximumNormalizedRadius: number;
  /**
   * Green-reference base geometric distortion.
   *
   * This common mapping is included in every channel. Red/blue CA terms are
   * added to this base, so callers should not apply a second distortion pass.
   */
  baseDistortionCoefficients: RadialDistortionCoefficients;
  /** Additional red-channel radial coefficients relative to green. */
  redCoefficientOffset: RadialDistortionCoefficients;
  /** Additional blue-channel radial coefficients relative to green. */
  blueCoefficientOffset: RadialDistortionCoefficients;
}
```

## LateralChromaticAberrationSeparation

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface LateralChromaticAberrationSeparation {
  redGreen: ChannelSeparationVectorMm;
  blueGreen: ChannelSeparationVectorMm;
  redBlue: ChannelSeparationVectorMm;
  maximumPairDistanceMm: number;
}
```
