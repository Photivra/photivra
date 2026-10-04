# optics/illumination-vignetting.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateIlluminationVignetting

Calculates generic field-dependent illumination falloff as a multiplicative
linear-light throughput factor.

The profile is accepted only when its relative throughput remains strictly
positive and never exceeds the optical-axis normalization of 1 throughout
the complete declared operating envelope.

```ts
export function calculateIlluminationVignetting(
  input: CalculateIlluminationVignettingInput
): CalculationResult<IlluminationVignetting>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateIlluminationVignettingInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateIlluminationVignettingInput {
  /**
   * Ideal image-plane field position relative to the optical axis, in mm.
   *
   * This slice evaluates throughput from the declared ideal field coordinate;
   * it does not apply or invert geometric distortion.
   */
  imagePointMm: LensFieldPointMm;
  profile: IlluminationVignettingProfile;
}
```

## IlluminationVignetting

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface IlluminationVignetting {
  imagePointMm: LensFieldPointMm;
  normalizedRadius: number;
  /**
   * Multiplicative factor for scene-linear/channel-linear signal.
   *
   * 1 means no attenuation; values are required to remain in (0, 1].
   */
  linearThroughputFactor: number;
  /** Positive exposure loss relative to the optical axis, in stops. */
  attenuationStops: number;
  profileMinimumThroughputFactor: number;
  profileMaximumThroughputFactor: number;
}
```

## IlluminationVignettingCoefficients

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface IlluminationVignettingCoefficients {
  /** Coefficient on normalized radius squared. */
  r2: number;
  /** Coefficient on normalized radius to the fourth power. */
  r4: number;
  /** Coefficient on normalized radius to the sixth power. */
  r6: number;
}
```

## IlluminationVignettingProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface IlluminationVignettingProfile {
  /** Physical image-plane radius used to normalize field position, in mm. */
  normalizationRadiusMm: number;
  /** Maximum normalized image-plane radius over which the profile is valid. */
  maximumNormalizedRadius: number;
  /**
   * Generic radial relative-illumination coefficients.
   *
   * Relative linear throughput is:
   *   1 + r2 * rho^2 + r4 * rho^4 + r6 * rho^6
   *
   * where rho is physical image-plane radius / normalizationRadiusMm.
   */
  coefficients: IlluminationVignettingCoefficients;
}
```
