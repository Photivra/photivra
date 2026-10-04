# equipment/iso-capabilities.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## bindIsoCapabilityToExposureCapabilities

Binds the detailed #7 ISO/EI capability contract into the numeric capability
envelope consumed by #99.

The existing equipment capability must agree exactly with the profile's
global standard ISO range/grid. An evidenced capture-mode policy may narrow
the standard manual envelope for that mode. Auto ISO may then be narrower
still. Expanded L/H-style settings remain outside #99's ordinary numeric
ISO grid and are resolved through resolveIsoCapability().

```ts
export function bindIsoCapabilityToExposureCapabilities(
  input:
    BindIsoCapabilityToExposureCapabilitiesInput
): BoundIsoExposureCapabilities;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## BindIsoCapabilityToExposureCapabilitiesInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface BindIsoCapabilityToExposureCapabilitiesInput {
  isoCapabilityProfile:
    IsoCapabilityProfile;
  equipmentCapabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  captureModeId?: string;
}
```

## BoundIsoExposureCapabilities

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface BoundIsoExposureCapabilities {
  isoCapabilityProfileId: string;
  isoCapabilityProfileVersion: string;
  captureModeId: string | null;
  capabilities:
    ResolvedGenericEquipmentExposureCapabilities;
  expandedSettingsExcludedFromNumericExposureGrid:
    true;
  physicalGainInferred: false;
  readNoiseInferred: false;
}
```

## ISO_CAPABILITY_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
ISO_CAPABILITY_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## IsoAutoIsoCapability

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type IsoAutoIsoCapability =
  | {
      availability: "supported";
      standardExposureIndexRange:
        IsoExposureIndexRange;
      evidence: readonly EvidenceProvenance[];
    }
  | {
      availability:
        | "unsupported"
        | "unknown";
      evidence: readonly EvidenceProvenance[];
    };
```

## IsoCapabilityAvailability

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type IsoCapabilityAvailability =
  | "supported"
  | "unsupported"
  | "unknown";
```

## IsoCapabilityProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface IsoCapabilityProfile {
  schemaVersion:
    typeof ISO_CAPABILITY_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  capabilityMeaning:
    "reported-exposure-index-capability-not-physical-gain";
  standard: {
    exposureIndexRange:
      IsoExposureIndexRange;
    settingGrid:
      IsoStandardSettingGrid;
  };
  expandedSettings:
    readonly IsoExpandedSetting[];
  autoIso:
    IsoAutoIsoCapability;
  captureModePolicies:
    readonly IsoCaptureModePolicy[];
  evidence:
    readonly EvidenceProvenance[];
}
```

## IsoCaptureModePolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface IsoCaptureModePolicy {
  captureModeId: string;
  standardExposureIndexRange:
    IsoExposureIndexRange;
  expandedSettingIds:
    readonly string[];
  autoIso:
    IsoAutoIsoCapability;
  evidence: readonly EvidenceProvenance[];
}
```

## IsoExpandedSetting

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface IsoExpandedSetting {
  settingId: string;
  label: string;
  direction: "low" | "high";
  exposureIndexEquivalent: number;
  autoIsoEligible: boolean;
  evidence: readonly EvidenceProvenance[];
}
```

## IsoExposureIndexRange

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface IsoExposureIndexRange {
  minimum: number;
  maximum: number;
}
```

## IsoStandardSettingGrid

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type IsoStandardSettingGrid =
  | {
      kind: "continuous-within-range";
    }
  | {
      kind: "discrete-values";
      values: readonly number[];
    };
```

## parseIsoCapabilityProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

ISO is an exposure-index/control capability, not a source of photons or evidence of read noise.
Standard/expanded settings, capture-mode restrictions and Auto ISO availability are explicit;
unknown availability cannot authorize automatic control.

```ts
export function parseIsoCapabilityProfile(
  value: unknown
): IsoCapabilityProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## RequestedIsoSetting

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type RequestedIsoSetting =
  | {
      kind: "standard";
      exposureIndex: number;
    }
  | {
      kind: "expanded";
      settingId: string;
    };
```

## ResolvedIsoCapability

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedIsoCapability {
  profileId: string;
  profileVersion: string;
  captureModeId: string | null;
  setting:
    | {
        kind: "standard";
        exposureIndex: number;
      }
    | {
        kind: "expanded";
        settingId: string;
        label: string;
        direction:
          "low" | "high";
        exposureIndexEquivalent:
          number;
      };
  reportedExposureIndex: number;
  expandedSetting: boolean;
  autoIsoEligible:
    boolean;
  standardExposureIndexRange:
    IsoExposureIndexRange;
  standardSettingGrid:
    IsoStandardSettingGrid;
  autoIso:
    IsoAutoIsoCapability;
  capturedPhotonExpectationModified:
    false;
  photonShotNoiseStatisticsModified:
    false;
  physicalGainInferred:
    false;
  conversionGainInferred:
    false;
  readNoiseInferred: false;
  saturationInferred: false;
  exactCommercialCameraBehaviorClaimed:
    false;
}
```

## resolveIsoCapability

Resolve one standard/expanded/Auto ISO request under declared profile/capture-mode availability and
report explicit unavailable/unknown state.

ISO is an exposure-index/control capability, not a source of photons or evidence of read noise.
Standard/expanded settings, capture-mode restrictions and Auto ISO availability are explicit;
unknown availability cannot authorize automatic control.

```ts
export function resolveIsoCapability(
  input:
    ResolveIsoCapabilityInput
): ResolvedIsoCapability;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveIsoCapabilityInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveIsoCapabilityInput {
  profile:
    IsoCapabilityProfile;
  setting:
    RequestedIsoSetting;
  captureModeId?: string;
}
```
