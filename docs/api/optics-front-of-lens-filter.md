# optics/front-of-lens-filter.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## ComposedFrontOfLensFilterTransmission

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ComposedFrontOfLensFilterTransmission {
  schemaVersion:
    typeof FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION;
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<
      SpectralWavelengthBasis,
      "unspecified"
    >;
  appliedFilterCount: number;
  components:
    readonly ResolvedFrontOfLensFilterTransmission[];
  combinedLinearTransmissionFactor:
    number;
  combinedAttenuationStops: number;
  scientificStatus:
    FrontOfLensFilterScientificStatus;
  uncertaintyPropagation:
    "not-propagated";
  uncertaintyLimitation: string;
  compositionModel:
    "independent-multiplicative-unpolarized-transmission-no-inter-filter-reflections";
  polarizationModeled: false;
  wavelengthChangingBehaviorModeled:
    false;
  lensTransmissionIncluded: false;
  sensorOpticalStackIncluded: false;
  fieldThroughputIncluded: false;
}
```

## composeFrontOfLensFilterTransmission

Composes multiple passive front-of-lens filters multiplicatively at one
wavelength while preserving each component's identity.

```ts
export function composeFrontOfLensFilterTransmission(
  input:
    ComposeFrontOfLensFilterTransmissionInput
): ComposedFrontOfLensFilterTransmission;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ComposeFrontOfLensFilterTransmissionInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ComposeFrontOfLensFilterTransmissionInput {
  filters:
    readonly FrontOfLensFilterProfile[];
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<
      SpectralWavelengthBasis,
      "unspecified"
    >;
}
```

## FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## FrontOfLensFilterProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FrontOfLensFilterProfile {
  schemaVersion:
    typeof FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION;
  filterId: string;
  profileVersion: string;
  identityScope:
    "photivra-generic-unbranded";
  position: "front-of-lens";
  scientificStatus:
    FrontOfLensFilterScientificStatus;
  wavelengthBasis:
    Exclude<
      SpectralWavelengthBasis,
      "unspecified"
    >;
  wavelengthRangeNanometers: {
    minimum: number;
    maximum: number;
  };
  transmission:
    FrontOfLensFilterTransmissionModel;
  uncertainty:
    FrontOfLensFilterUncertainty;
  polarizationModeled: false;
  wavelengthChangingBehaviorModeled:
    false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## FrontOfLensFilterScientificStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type FrontOfLensFilterScientificStatus =
  | "calibrated"
  | "approximation";
```

## FrontOfLensFilterSpectralSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface FrontOfLensFilterSpectralSample {
  wavelengthNanometers: number;
  linearTransmissionFactor: number;
}
```

## FrontOfLensFilterTransmissionModel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type FrontOfLensFilterTransmissionModel =
  | {
      kind: "neutral-linear-transmission";
      linearTransmissionFactor:
        EvidenceBackedFact<number>;
    }
  | {
      kind: "neutral-optical-density";
      opticalDensityBase10:
        EvidenceBackedFact<number>;
    }
  | {
      kind: "spectral-transmission";
      samples:
        EvidenceBackedFact<
          readonly FrontOfLensFilterSpectralSample[]
        >;
    };
```

## FrontOfLensFilterUncertainty

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type FrontOfLensFilterUncertainty =
  | {
      kind: "relative";
      fraction: number;
      basis: string;
    }
  | {
      kind: "not-quantified";
      limitation: string;
    };
```

## parseFrontOfLensFilterProfile

Parses one generic front-of-lens transmission filter.

Schema 0.1.0 is explicitly unbranded and unpolarized. It models only
passive transmission placed before the lens. Reflections between stacked
filters, polarization, flare/ghosting and wavelength-changing behavior are
outside this contract.

```ts
export function parseFrontOfLensFilterProfile(
  value: unknown
): FrontOfLensFilterProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvedFrontOfLensFilterTransmission

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedFrontOfLensFilterTransmission {
  schemaVersion:
    typeof FRONT_OF_LENS_FILTER_PROFILE_SCHEMA_VERSION;
  filterId: string;
  profileVersion: string;
  identityScope:
    "photivra-generic-unbranded";
  position: "front-of-lens";
  scientificStatus:
    FrontOfLensFilterScientificStatus;
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<
      SpectralWavelengthBasis,
      "unspecified"
    >;
  transmissionKind:
    FrontOfLensFilterTransmissionModel["kind"];
  linearTransmissionFactor: number;
  attenuationStops: number;
  opticalDensityBase10: number;
  polarizationModeled: false;
  wavelengthChangingBehaviorModeled:
    false;
  lensTransmissionIncluded: false;
  sensorOpticalStackIncluded: false;
  fieldThroughputIncluded: false;
  uncertainty:
    FrontOfLensFilterUncertainty;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## resolveFrontOfLensFilterTransmission

Resolves one passive filter at one wavelength.

```ts
export function resolveFrontOfLensFilterTransmission(
  input:
    ResolveFrontOfLensFilterTransmissionInput
): ResolvedFrontOfLensFilterTransmission;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveFrontOfLensFilterTransmissionInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveFrontOfLensFilterTransmissionInput {
  profile: FrontOfLensFilterProfile;
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<
      SpectralWavelengthBasis,
      "unspecified"
    >;
}
```
