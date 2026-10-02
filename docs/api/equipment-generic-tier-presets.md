# equipment/generic-tier-presets.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createGenericEquipmentTierSelection

Match lens tier by default; cross-tier combinations remain normal supported selections.

```ts
export function createGenericEquipmentTierSelection(input: {
  presetVersion: string; bodyTier: GenericEquipmentTier; lensTier?: GenericEquipmentTier;
}): GenericEquipmentTierSelection;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## GENERIC_EQUIPMENT_TIER_PRESET_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
GENERIC_EQUIPMENT_TIER_PRESET_VERSION = "1.0.0" as const
```

## GENERIC_EQUIPMENT_TIERS

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
GENERIC_EQUIPMENT_TIERS = Object.freeze(["consumer", "prosumer", "professional"] as const)
```

## GenericEquipmentTierProfileReference

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GenericEquipmentTierProfileReference { profileId: string; profileVersion: string }
```

## GenericEquipmentTierSelection

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GenericEquipmentTierSelection {
  schemaVersion: "0.1.0"; presetVersion: typeof GENERIC_EQUIPMENT_TIER_PRESET_VERSION;
  bodyTier: GenericEquipmentTier; lensTier: GenericEquipmentTier;
  bodyPresetId: string; lensPresetId: string;
  profileReferences: readonly GenericEquipmentTierProfileReference[];
  sensorFormatSelectedByTier: false; scientificTierMultiplierApplied: false;
}
```

## parseGenericEquipmentTierSelection

Reject stale/missing/retuned profile versions on saved simulations rather than selecting today's defaults.

```ts
export function parseGenericEquipmentTierSelection(value: unknown): GenericEquipmentTierSelection;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvedGenericTierLensProfiles

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedGenericTierLensProfiles {
  selection: GenericEquipmentTierSelection;
  state: OpticalProfileState;
  radial: RadialDistortionProfile;
  lateralCa: LateralChromaticAberrationProfile;
  vignetting: IlluminationVignettingProfile;
  breathingProjectionScale: number;
  transmission: SceneToSensorIrradianceProfile;
  pupils: readonly LensComplexPupilProfile[];
  stray: LensStrayLightProfile;
  correction: GenericLensCorrectionProfile;
  scientificStatus: "approximation";
}
```

## resolveGenericEquipmentTierCatalog

Exact-version catalog; no hidden latest alias and no sensor-size default.

```ts
export function resolveGenericEquipmentTierCatalog(input: { presetVersion: string }): readonly GenericEquipmentTierPreset[];
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## resolveGenericEquipmentTierLensProfiles

Bind the finite matched-reference optical slice to one exact generic selected state, without extrapolation.

```ts
export function resolveGenericEquipmentTierLensProfiles(input: { selection: GenericEquipmentTierSelection; state: OpticalProfileState }): ResolvedGenericTierLensProfiles;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
