# optics/diffraction.ts public contracts

Package **1.1.0**, root API **1.1.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## AiryDisk

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AiryDisk {
  /**
   * Diameter from the center of the diffraction pattern to the first dark-ring
   * diameter, in micrometres: 2.44 * wavelength * f-number.
   */
  firstZeroDiameterMicrometers: number;
}
```

## calculateAiryDisk

Calculates the first-zero Airy-disk diameter for an ideal circular aperture.

This uses the established diffraction relation d = 2.44 * lambda * N.
It is an independent implementation of the mathematical relation and does
not model lens aberrations or non-circular pupil geometry.

```ts
export function calculateAiryDisk(
  input: CalculateAiryDiskInput
): CalculationResult<AiryDisk>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateAiryDiskInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateAiryDiskInput {
  /** F-number. */
  aperture: number;
  /** Wavelength in nanometres. Defaults are intentionally left to callers. */
  wavelengthNm: number;
}
```
