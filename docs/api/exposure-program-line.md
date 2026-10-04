# exposure/program-line.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## EXPOSURE_PROGRAM_LINE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
EXPOSURE_PROGRAM_LINE_SCHEMA_VERSION =
  "0.1.0" as const
```

## ExposureProgramLineNode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ExposureProgramLineNode {
  nodeId: string;
  opticalExposureStopsFromReference: number;
  aperture: number;
  shutterSeconds: number;
}
```

## ExposureProgramLineProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ExposureProgramLineProfile {
  schemaVersion:
    typeof EXPOSURE_PROGRAM_LINE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  scientificStatus: "approximation";
  policyKind:
    "generic-program-line";
  interpolation:
    "log2-aperture-shutter";
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
  nodes:
    readonly ExposureProgramLineNode[];
}
```

## parseExposureProgramLineProfile

Parses a generic educational/product exposure program line.

A program line is control policy, not physics. Nodes declare desired
aperture/shutter pairs at explicit optical-exposure stops relative to the
resolver's reference exposure. Resolution later verifies that every node is
physically consistent with that reference and current equipment capability.

```ts
export function parseExposureProgramLineProfile(
  value: unknown
): ExposureProgramLineProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.
