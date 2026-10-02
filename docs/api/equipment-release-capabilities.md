# equipment/release-capabilities.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## GENERIC_RELEASE_CAPABILITY_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
GENERIC_RELEASE_CAPABILITY_SCHEMA_VERSION =
  "0.1.0" as const
```

## GenericExposureBracketAxis

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type GenericExposureBracketAxis =
  | "shutter"
  | "iso"
  | "aperture";
```

## GenericReleaseCapabilityProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface GenericReleaseCapabilityProfile {
  schemaVersion:
    typeof GENERIC_RELEASE_CAPABILITY_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus: "approximation";
  evidence: readonly EvidenceProvenance[];
  supportedDriveModes:
    EvidenceBackedFact<
      readonly GenericReleaseDriveMode[]
    >;
  maximumLogicalFramesPerSequence:
    EvidenceBackedFact<number>;
  maximumCadenceFps:
    EvidenceBackedFact<number>;
  minimumInterFrameGapSeconds:
    EvidenceBackedFact<number>;
  overlappingOrdinaryStillExposures:
    false;
  exposureBracketing: {
    availability:
      EvidenceBackedFact<
        GenericCapabilityAvailability
      >;
    supportedAxes:
      readonly GenericExposureBracketAxis[];
  };
  focusBracketing: {
    availability:
      EvidenceBackedFact<
        GenericCapabilityAvailability
      >;
  };
}
```

## GenericReleaseDriveMode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type GenericReleaseDriveMode =
  | "single"
  | "burst"
  | "self-timer";
```

## parseGenericReleaseCapabilityProfile

Parses generic logical-release/drive capabilities.

The first schema deliberately models non-overlapping ordinary still
exposures only. Buffer/media/thermal slowdown and pre-release capture remain
outside this profile.

```ts
export function parseGenericReleaseCapabilityProfile(
  value: unknown
): GenericReleaseCapabilityProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
