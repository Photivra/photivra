# equipment/generic-tier-assets.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## GenericEquipmentTier

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type GenericEquipmentTier = "consumer" | "prosumer" | "professional";
```

## GenericEquipmentTierPreset

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GenericEquipmentTierPreset {
  tier: GenericEquipmentTier;
  label: "Consumer" | "Prosumer" | "Professional";
  presetId: string; presetVersion: "1.0.0";
  scientificStatus: "approximation";
  evidence: readonly EvidenceProvenance[];
  body: GenericTierBodyAssets;
  lens: GenericTierLensAssets;
  tradeoffs: readonly string[];
}
```

## GenericTierBodyAssets

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GenericTierBodyAssets {
  exposure: GenericBodyExposureCapabilityProfile;
  iso: IsoCapabilityProfile;
  signalChain: GenericIsoSignalChainProfile;
  readout: readonly GenericVersionedAsset<SensorReadoutConversionProfile>[];
  readoutTiming: GenericVersionedAsset<SensorReadoutTimingDeclaration>;
  release: GenericReleaseCapabilityProfile;
  focus: FocusControlProfile;
  stabilization: StabilizationSystemProfile;
  whiteBalance: WhiteBalanceProfile;
  metering: readonly GenericVersionedAsset<ExposureMeteringProfile>[];
  meteringCapabilities: GenericBodyMeteringCapabilityProfile;
  flashSync: FlashSyncCapabilityProfile;
}
```

## GenericTierLensAssets

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GenericTierLensAssets {
  form: "prime";
  exposure: GenericLensExposureCapabilityProfile;
  /** Explicit synthetic coefficients, not measured calibration or a quality score. */
  matchedReference: {
    focalLengthMm: 50; aperture: 4; focusDistanceM: 5; wavelengthNm: 550;
    normalizationRadiusMm: number;
    distortionK1: number; lateralCaK1Offset: number; vignettingR2: number;
    breathingProjectionScale: number; transmission: number;
    correctionGainStrength: number; correctionCaFraction: number;
    ghostPowerFraction: number; veilPowerFraction: number;
    pupilAmplitudeByField: readonly (readonly number[])[];
    pupilOpdMicrometersByDefocus: readonly (readonly number[])[];
    pupilThroughputByField: readonly number[];
  };
  profileReferences: readonly { profileId: string; profileVersion: string }[];
  limitations: readonly string[];
}
```

## GenericVersionedAsset

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GenericVersionedAsset<T> { assetId: string; assetVersion: string; profile: T }
```
