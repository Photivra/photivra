# equipment/generic-tier-assets.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

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
  presetId: string; presetVersion: "2.0.0";
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
  /** Global (no spatial skew) data readout; the default timing asset. */
  readoutTiming: GenericVersionedAsset<SensorReadoutTimingDeclaration>;
  /** Opt-in rolling readout variant with explicit top-to-bottom spatial skew. */
  rollingReadoutTiming: GenericVersionedAsset<SensorReadoutTimingDeclaration>;
  /** Opt-in synthetic fixed-pattern noise for this body; never applied unless a caller attaches it. */
  fixedPatternNoise: GenericVersionedAsset<SensorFixedPatternNoiseProfile>;
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
