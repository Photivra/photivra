# exposure/flash.ts public contracts

Package **1.1.0**, root API **1.1.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createManualFlashIlluminationOverlay

Construct an owned registered temporal illumination overlay from the resolved manual pulse while
preserving base ambient source identity.

Manual flash is a registered relative pulse/source overlay on the capture opening-reference clock.
Ordinary front/rear sync requires a real whole-frame opening interval. HSS/TTL and flash metering
are unsupported here; source magnitude, optical transport and sensor integration retain their own
contracts.

```ts
export function createManualFlashIlluminationOverlay(
  input:
    CreateManualFlashIlluminationOverlayInput
): ManualFlashIlluminationOverlay;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateManualFlashIlluminationOverlayInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CreateManualFlashIlluminationOverlayInput {
  baseIlluminationProfile:
    SceneIlluminationProfile;
  baseTemporalProfile?:
    SceneIlluminationTemporalProfile;
  flashProfile:
    ManualFlashProfile;
  resolvedSync:
    ResolvedManualFlashSync;
  illuminationProfileId: string;
  temporalProfileId: string;
}
```

## FLASH_SYNC_CAPABILITY_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
FLASH_SYNC_CAPABILITY_SCHEMA_VERSION =
  "0.1.0" as const
```

## FlashSyncCapabilityProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FlashSyncCapabilityProfile {
  schemaVersion:
    typeof FLASH_SYNC_CAPABILITY_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  captureModeId: string;
  timingProfileId: string;
  supportedOrdinarySyncModes:
    readonly ManualFlashSyncMode[];
  highSpeedSyncSupported: false;
  ordinarySyncRequiresWholeActiveFrameSimultaneouslyExposed:
    true;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## MANUAL_FLASH_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
MANUAL_FLASH_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## ManualFlashIlluminationOverlay

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ManualFlashIlluminationOverlay {
  flashApplied: boolean;
  illuminationProfile:
    SceneIlluminationProfile;
  temporalProfile:
    SceneIlluminationTemporalProfile | null;
  sourceId: string;
  waveformId: string;
  timeReference:
    "first-opening-boundary-phase";
  sourceMagnitudeAppliedBySceneTransport:
    true;
  materialTransportOwnedBySceneRadiance:
    true;
  visibilityOwnedBySceneRadiance:
    true;
  indirectTransportOwnedBySceneRadiance:
    true;
  postRenderBrightnessMultiplierUsed:
    false;
  whiteBalanceModified: false;
  ambientMeteringModified: false;
  ttlMeteringIncluded: false;
  ambientTemporalBehaviorPreserved:
    true;
}
```

## ManualFlashProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ManualFlashProfile {
  schemaVersion:
    typeof MANUAL_FLASH_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  sourceTemplate:
    Omit<
      SceneIlluminationSource,
      "enabled" |
      "temporalBehavior"
    >;
  pulse:
    ManualFlashPulseProfile;
  outputControl: {
    kind:
      "relative-linear-source-scale";
    scale: number;
    flashExposureCompensationStops:
      0;
  };
  ttlModeled: false;
  highSpeedSyncModeled: false;
  recycleBehaviorModeled: false;
  redEyePreflashModeled: false;
  modelingLightModeled: false;
  afAssistModeled: false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## ManualFlashPulseProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ManualFlashPulseProfile {
  waveformId: string;
  scientificStatus: "approximation";
  supportDurationSeconds: number;
  interpolation: "piecewise-linear";
  samples:
    readonly SceneIlluminationTemporalWaveformSample[];
  normalization:
    "relative-peak-one";
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## ManualFlashSyncMode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ManualFlashSyncMode =
  | "front-curtain"
  | "rear-curtain";
```

## parseFlashSyncCapabilityProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Manual flash is a registered relative pulse/source overlay on the capture opening-reference clock.
Ordinary front/rear sync requires a real whole-frame opening interval. HSS/TTL and flash metering
are unsupported here; source magnitude, optical transport and sensor integration retain their own
contracts.

```ts
export function parseFlashSyncCapabilityProfile(
  value: unknown
): FlashSyncCapabilityProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseManualFlashProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Manual flash is a registered relative pulse/source overlay on the capture opening-reference clock.
Ordinary front/rear sync requires a real whole-frame opening interval. HSS/TTL and flash metering
are unsupported here; source magnitude, optical transport and sensor integration retain their own
contracts.

```ts
export function parseManualFlashProfile(
  value: unknown
): ManualFlashProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## RequestedFlashSyncMode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type RequestedFlashSyncMode =
  | ManualFlashSyncMode
  | "high-speed-sync";
```

## ResolvedManualFlashSync

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedManualFlashSync {
  flashEnabled: boolean;
  flashProfileId: string;
  flashProfileVersion: string;
  sourceId: string;
  captureModeId: string;
  timingProfileId: string;
  syncCapabilityProfileId:
    string;
  syncMode:
    RequestedFlashSyncMode;
  syncStatus:
    | "disabled"
    | "ordinary-sync-resolved";
  timeReference:
    "first-opening-boundary-phase";
  wholeActiveFrameOpenInterval:
    {
      startSecondsFromCaptureReference:
        number;
      endSecondsFromCaptureReference:
        number;
      durationSeconds: number;
    };
  pulseSupportDurationSeconds:
    number;
  pulseStartSecondsFromCaptureReference:
    number | null;
  pulseEndSecondsFromCaptureReference:
    number | null;
  waveformTimeZeroSecondsFromCaptureReference:
    number | null;
  releaseFrameBinding:
    | {
        sequenceId: string;
        releaseFrameId: string;
        frameIndex: number;
        sceneTimeSecondsFromSequenceStartAtPulseStart:
          number;
        sceneTimeSecondsFromSequenceStartAtPulseEnd:
          number;
      }
    | null;
  hssModeled: false;
  ttlModeled: false;
  sensorReadoutTimingUsedAsExposureTiming:
    false;
  whiteBalanceModified: false;
  focusModified: false;
  exposureSettingsModified: false;
  driveModeModified: false;
  supportStateModified: false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## resolveManualFlashSync

Place a declared ordinary flash pulse into the actual whole-frame exposure opening interval for
front or rear sync, or return structured incompatibility.

Manual flash is a registered relative pulse/source overlay on the capture opening-reference clock.
Ordinary front/rear sync requires a real whole-frame opening interval. HSS/TTL and flash metering
are unsupported here; source magnitude, optical transport and sensor integration retain their own
contracts.

```ts
export function resolveManualFlashSync(
  input:
    ResolveManualFlashSyncInput
): ResolvedManualFlashSync;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveManualFlashSyncInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveManualFlashSyncInput {
  flashEnabled: boolean;
  flashProfile:
    ManualFlashProfile;
  syncCapabilities:
    FlashSyncCapabilityProfile;
  timing:
    ResolvedCaptureModeTiming;
  syncMode:
    RequestedFlashSyncMode;
  releaseFrame?:
    ResolvedReleaseFrame;
}
```
