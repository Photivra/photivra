# exposure/flash-ttl.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateFlashGuideNumber

Effective guide number GN = GN_full · √p · √(ISO/100).

The guide number relation GN = d·N follows from the inverse-square law: the subject illuminance
from a point-like flash falls as 1/d², the sensor exposure as 1/N², so correct exposure holds while
d·N is constant (ISO 2827 defines its measurement). Exposure scales linearly with emitted energy
(power fraction p) and the required exposure inversely with ISO speed, so GN ∝ √p·√ISO.

```ts
export function calculateFlashGuideNumber(input: FlashGuideNumberInput): number;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## calculateFlashPowerForDistance

Manual guide-number exposure: the power fraction that exposes a subject at distance d correctly.

```ts
export function calculateFlashPowerForDistance(input: FlashPowerForDistanceInput): FlashPowerForDistance;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## createTtlScaledFlashProfile

Returns a copy of a manual flash profile whose relative output is scaled by a resolved TTL power
fraction, ready for resolveManualFlashSync (front/rear curtain). For HSS pass the unscaled profile and
`ttl.powerFraction` as resolveHighSpeedFlashSync's powerFraction instead, so power is applied once.

```ts
export function createTtlScaledFlashProfile(flashProfile: ManualFlashProfile, ttl: TtlFlashExposure): ManualFlashProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## FlashGuideNumberInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FlashGuideNumberInput {
  /** Guide number at full power for ISO 100, in metres (GN = distance · f-number). */
  fullPowerGuideNumberMetersIso100: number;
  /** Output as a fraction of full power, (0, 1]. */
  powerFraction: number;
  iso: number;
}
```

## FlashPowerForDistance

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FlashPowerForDistance {
  /** p = (d·N / (GN_full·√(ISO/100)))², before clamping. */
  requiredPowerFraction: number;
  powerFraction: number;
  status: "within-range" | "clamped-at-minimum-power" | "clamped-at-full-power";
  /** log2(delivered / required) flash exposure; positive is overexposure. */
  flashExposureErrorStops: number;
  /** GN_full·√(ISO/100)/N: the farthest correctly exposed distance at full power. */
  maximumDistanceM: number;
}
```

## FlashPowerForDistanceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FlashPowerForDistanceInput {
  fullPowerGuideNumberMetersIso100: number;
  subjectDistanceM: number;
  apertureFNumber: number;
  iso: number;
  /** Lowest available power fraction, (0, 1]. */
  minimumPowerFraction: number;
}
```

## resolveTtlFlashExposure

Solves the main-flash power from a pre-flash measurement (manufacturer-independent TTL).

The meter is linear for the admitted policies, M(a + b) = M(a) + M(b). The pre-flash at power
p_pre adds the flash-only signal f_i = pre_i − ambient_i per zone; flash signal is proportional to
emitted energy, so at main power p it contributes (p/p_pre)·M(f). With ambient scaled to the main
exposure by k, the metered total is k·A + p·F with F = M(f)/p_pre. Setting it equal to the target
T' = T·2^FEC gives p = (T' − k·A)/(F·s), s the sync energy factor (1 ordinary, η·t_e/D for HSS),
clamped to [p_min, 1] (the guide-number range). Highlight policies are rejected because their
weights depend on the signal and the total is no longer linear in p.

```ts
export function resolveTtlFlashExposure(input: ResolveTtlFlashExposureInput): CalculationResult<TtlFlashExposure>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveTtlFlashExposureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveTtlFlashExposureInput {
  /** Spatially linear metering profile (multi-zone-uniform, center-weighted-radial or spot). */
  meteringProfile: ExposureMeteringProfile;
  /** Measurement-window samples with the flash off. */
  ambientSampleSet: ExposureMeteringSampleSet;
  /** The same zones and settings with the pre-flash fired. */
  preFlashSampleSet: ExposureMeteringSampleSet;
  /** Pre-flash output as a fraction of full power, (0, 1]. */
  preFlashPowerFraction: number;
  /**
   * Ratio of ambient integration in the main exposure to the measurement window at the same
   * aperture/ISO (e.g. t_main/t_measure), ≥ 0. The flash pulse lies inside both, so it does not scale.
   */
  ambientScaleToMainExposure: number;
  /** Flash exposure compensation applied to the TTL target, in stops. */
  flashExposureCompensationStops: number;
  /** Lowest available main-flash power fraction, (0, 1]. */
  minimumPowerFraction: number;
  /**
   * Flash energy delivered per line relative to an ordinary pulse at the same power fraction: 1 for
   * front/rear-curtain sync, η·t_e/D for HSS (see resolveHighSpeedFlashSync). Defaults to 1.
   */
  syncEnergyFactor?: number;
  /** Optional guide-number reporting. */
  guideNumber?: { fullPowerGuideNumberMetersIso100: number; iso: number; apertureFNumber: number };
}
```

## TTL_FLASH_MODEL

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
TTL_FLASH_MODEL = Object.freeze({ id: "preflash-linear-ttl", version: "1.0.0" } as const)
```

## TtlFlashExposure

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface TtlFlashExposure {
  modelId: typeof TTL_FLASH_MODEL.id;
  modelVersion: typeof TTL_FLASH_MODEL.version;
  status: "resolved" | "clamped-at-minimum-power" | "clamped-at-full-power" | "no-flash-return";
  /** Metered ambient signal in the main exposure: k·M(ambient). */
  ambientMainExposureMeteredSignal: number;
  /** Metered flash-only signal per unit full power: M(preflash − ambient)/p_pre. */
  flashMeteredSignalPerFullPower: number;
  /** T·2^FEC. */
  targetRelativeSignal: number;
  /** Unclamped solution (T' − k·A)/(F·syncEnergyFactor); null with no flash return. */
  requiredPowerFraction: number | null;
  /** Commanded main-flash power fraction (clamped); null with no flash return. */
  powerFraction: number | null;
  ambientAloneReachesTarget: boolean;
  predictedMeteredSignal: number;
  /** log2(predicted / target); 0 when the solution is within range; null when nothing is predicted. */
  predictedExposureErrorStops: number | null;
  effectiveGuideNumberMetersAtIso: number | null;
  flashRangeAtApertureM: number | null;
  preFlashInsideMainExposure: false;
  ambientMeteringModified: false;
}
```
