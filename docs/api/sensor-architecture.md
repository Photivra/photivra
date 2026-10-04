# sensor/architecture.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## parseSensorArchitectureProfile

Parses untrusted descriptive sensor-architecture metadata.

Schema 0.2.0 remains accepted and returns a 0.2.0 profile unchanged in
semantic identity. Schema 0.3.0 adds optional evidence-backed CMOS/CCD
technology-family metadata. Unknown facts should be omitted instead of
inferred.

The parser validates structure, supported vocabulary, and field-level
evidence only; it does not verify that a cited real-world claim is
factually true and technology family does not activate hidden physics.

```ts
export function parseSensorArchitectureProfile(
  value: unknown
): SensorArchitectureProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION = "0.3.0" as const
```

## SensorArchitectureFactProvenance

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorArchitectureFactProvenance = EvidenceProvenance;
```

## SensorArchitectureProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorArchitectureProfile =
  | SensorArchitectureProfileV0_2
  | SensorArchitectureProfileV0_3;
```

## SensorArchitectureProfileV0_2

Legacy sensor-architecture schema.

Schema 0.2.0 remains accepted and is preserved exactly when parsed. It does
not support technologyFamily; omission remains unknown/unasserted.

```ts
export interface SensorArchitectureProfileV0_2
  extends SensorArchitectureProfileBase {
  schemaVersion: typeof LEGACY_SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION;
  technologyFamily?: never;
}
```

## SensorArchitectureProfileV0_3

Current descriptive sensor hardware/capability metadata.

Omitted properties mean unknown/unasserted. These fields are not scientific
effect switches: no architecture value changes noise, dynamic range, FOV,
crop factor, exposure, readout timing, or sampling without a separate
downstream model that explicitly consumes that fact.

```ts
export interface SensorArchitectureProfileV0_3
  extends SensorArchitectureProfileBase {
  schemaVersion: typeof SENSOR_ARCHITECTURE_PROFILE_SCHEMA_VERSION;
  /** Coarse detector technology identity only; never a performance switch. */
  technologyFamily?: SourcedSensorArchitectureFact<SensorTechnologyFamily>;
}
```

## SensorArchitectureReuseStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorArchitectureReuseStatus = EvidenceReuseStatus;
```

## SensorArchitectureSourceKind

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorArchitectureSourceKind = EvidenceSourceOrigin;
```

## SensorColorSamplingFamily

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorColorSamplingFamily =
  | "bayer"
  | "quad-bayer"
  | "monochrome"
  | "custom-rgb-mosaic"
  | "layered-color";
```

## SensorIlluminationArchitecture

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorIlluminationArchitecture = "fsi" | "bsi";
```

## SensorIntegrationArchitecture

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorIntegrationArchitecture =
  | "monolithic"
  | "partially-stacked"
  | "stacked";
```

## SensorReadoutArchitecture

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorReadoutArchitecture = "rolling" | "global";
```

## SensorTechnologyFamily

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorTechnologyFamily = "cmos" | "ccd";
```

## SourcedSensorArchitectureFact

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SourcedSensorArchitectureFact<T> = EvidenceBackedFact<T>;
```
