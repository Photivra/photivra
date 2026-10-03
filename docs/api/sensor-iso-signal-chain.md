# sensor/iso-signal-chain.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## GENERIC_ISO_SIGNAL_CHAIN_PRESET_CATALOG_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
GENERIC_ISO_SIGNAL_CHAIN_PRESET_CATALOG_SCHEMA_VERSION =
  "0.1.0" as const
```

## GENERIC_ISO_SIGNAL_CHAIN_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
GENERIC_ISO_SIGNAL_CHAIN_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## GenericIsoCaptureModeSignalChainBinding

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GenericIsoCaptureModeSignalChainBinding {
  captureModeId: string;
  standardRegimeBands:
    readonly GenericIsoStandardRegimeBand[];
  expandedRegimeBindings:
    readonly GenericIsoExpandedRegimeBinding[];
  evidence:
    readonly EvidenceProvenance[];
}
```

## GenericIsoExpandedRegimeBinding

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GenericIsoExpandedRegimeBinding {
  expandedSettingId: string;
  readoutRegimeId: string;
}
```

## GenericIsoSignalChainPreset

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type GenericIsoSignalChainPreset =
  | "good"
  | "better"
  | "best";
```

## GenericIsoSignalChainPresetCatalog

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GenericIsoSignalChainPresetCatalog {
  schemaVersion:
    typeof GENERIC_ISO_SIGNAL_CHAIN_PRESET_CATALOG_SCHEMA_VERSION;
  catalogId: string;
  catalogVersion: string;
  entries: readonly {
    preset:
      GenericIsoSignalChainPreset;
    signalChainProfileId:
      string;
    evidence:
      readonly EvidenceProvenance[];
  }[];
  performanceOrderingClaimed:
    false;
  realCameraRankingClaimed:
    false;
}
```

## GenericIsoSignalChainProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GenericIsoSignalChainProfile {
  schemaVersion:
    typeof GENERIC_ISO_SIGNAL_CHAIN_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus: "approximation";
  isoCapabilityProfileId: string;
  readoutProfileId: string;
  behaviorMeaning:
    "iso-state-selects-explicit-readout-regime-not-noise-equation";
  captureModeBindings:
    readonly GenericIsoCaptureModeSignalChainBinding[];
  photonShotNoiseOwnedUpstream:
    true;
  processedImageBehaviorIncluded:
    false;
  fixedPatternNoiseModeled:
    false;
  lowSignalColorDegradationModeled:
    false;
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## GenericIsoStandardRegimeBand

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GenericIsoStandardRegimeBand {
  minimumExposureIndex: number;
  maximumExposureIndex: number;
  readoutRegimeId: string;
}
```

## parseGenericIsoSignalChainPresetCatalog

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

The selected ISO/capture-mode state binds an explicit generic readout regime. Photons and photo/dark
shot-noise expectations remain upstream; regime gain, read noise and clipping are separately
declared. Generic tier labels do not calibrate or rank commercial equipment.

```ts
export function parseGenericIsoSignalChainPresetCatalog(
  value: unknown
): GenericIsoSignalChainPresetCatalog;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseGenericIsoSignalChainProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

The selected ISO/capture-mode state binds an explicit generic readout regime. Photons and photo/dark
shot-noise expectations remain upstream; regime gain, read noise and clipping are separately
declared. Generic tier labels do not calibrate or rank commercial equipment.

```ts
export function parseGenericIsoSignalChainProfile(
  value: unknown
): GenericIsoSignalChainProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvedGenericIsoSignalChain

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedGenericIsoSignalChain {
  profileId: string;
  profileVersion: string;
  scientificStatus:
    "approximation";
  captureModeId: string;
  iso:
    ResolvedIsoCapability;
  readout:
    ResolvedSensorReadoutRegime;
  regimeSelectionReason:
    | "standard-exposure-index-band"
    | "expanded-setting-binding";
  capturedPhotonExpectationModified:
    false;
  photonShotNoiseStatisticsModified:
    false;
  sensorGeometryModified: false;
  processedImageBehaviorApplied:
    false;
  fixedPatternNoiseApplied:
    false;
  lowSignalColorDegradationApplied:
    false;
  isoUsedAsDirectNoiseEquation:
    false;
  exactCommercialCameraBehaviorClaimed:
    false;
}
```

## resolveGenericIsoSignalChain

Select the explicit readout regime bound to the resolved ISO and capture-mode state; do not derive
gain/noise from an ISO number.

The selected ISO/capture-mode state binds an explicit generic readout regime. Photons and photo/dark
shot-noise expectations remain upstream; regime gain, read noise and clipping are separately
declared. Generic tier labels do not calibrate or rank commercial equipment.

```ts
export function resolveGenericIsoSignalChain(
  input:
    ResolveGenericIsoSignalChainInput
): ResolvedGenericIsoSignalChain;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveGenericIsoSignalChainInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveGenericIsoSignalChainInput {
  profile:
    GenericIsoSignalChainProfile;
  isoCapability:
    IsoCapabilityProfile;
  requestedIsoSetting:
    RequestedIsoSetting;
  captureModeId: string;
  readoutProfile:
    SensorReadoutConversionProfile;
}
```

## resolveGenericIsoSignalChainPreset

Select a generic catalog preset and return its explicit profile binding without claiming
manufacturer calibration.

The selected ISO/capture-mode state binds an explicit generic readout regime. Photons and photo/dark
shot-noise expectations remain upstream; regime gain, read noise and clipping are separately
declared. Generic tier labels do not calibrate or rank commercial equipment.

```ts
export function resolveGenericIsoSignalChainPreset(
  input: {
    catalog:
      GenericIsoSignalChainPresetCatalog;
    preset:
      GenericIsoSignalChainPreset;
  }
): {
  preset:
    GenericIsoSignalChainPreset;
  signalChainProfileId:
    string;
  performanceOrderingClaimed:
    false;
  realCameraRankingClaimed:
    false;
};
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
