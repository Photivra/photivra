# sensor/response-application-compatibility.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## assessSensorResponseApplicationCompatibility

Assess whether exact source-plane, area, profile/channel and reference-condition bindings permit the
selected response application path.

Response application checks exact profile/channel, source plane, incident-area basis, spatial
uniformity and reference conditions. Structural compatibility alone does not authorize signal
conversion; per-bin operating-range validity and the typed EQE/A-W path are separate gates.

```ts
export function assessSensorResponseApplicationCompatibility(
  input:
    AssessSensorResponseApplicationCompatibilityInput
): CalculationResult<SensorResponseApplicationCompatibilityAssessment>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## AssessSensorResponseApplicationCompatibilityInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AssessSensorResponseApplicationCompatibilityInput {
  reduction:
    SensorSpatioSpectralIrradianceReduction;
  applicationProfile:
    SensorResponseApplicationProfile;
  sourcePlane:
    SourcedSensorResponseSourcePlane;
  operatingConditions?:
    SensorSpectralReferenceConditions;
}
```

## parseSensorResponseApplicationProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Response application checks exact profile/channel, source plane, incident-area basis, spatial
uniformity and reference conditions. Structural compatibility alone does not authorize signal
conversion; per-bin operating-range validity and the typed EQE/A-W path are separate gates.

```ts
export function parseSensorResponseApplicationProfile(
  value: unknown
): SensorResponseApplicationProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SensorResponseApplicationCompatibilityAssessment

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorResponseApplicationCompatibilityAssessment {
  applicationProfileId: string;
  spectralResponseProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  responseScope:
    SensorSpatioSpectralIrradianceReduction["responseScope"];
  requiredSourcePlane:
    SensorResponseSourcePlane;
  suppliedSourcePlane:
    SensorResponseSourcePlane;
  sourcePlaneMatched: boolean;
  responseIncidentAreaBasis:
    SensorResponseIncidentAreaBasis;
  currentlyIntegratedAreaBasis:
    "geometric-sensitive-aperture";
  geometricApertureAreaSquareMicrometers:
    number;
  nominalSiteCellAreaSquareMicrometers?:
    number;
  spatialResponseModel:
    SensorResponseSpatialModel;
  referenceConditionPolicy:
    SensorResponseReferenceConditionPolicy;
  responseReferenceConditions?:
    SensorSpectralReferenceConditions;
  operatingConditions?:
    SensorSpectralReferenceConditions;
  structuralCompatibilityEstablished:
    boolean;
  compatibilityStatus:
    | "compatible"
    | "compatible-approximation"
    | "blocked";
  blockers:
    readonly SensorResponseApplicationCompatibilityBlocker[];
  requiredSignalPath:
    SensorResponseSignalPath;
  quantifiedResponseUncertaintyAvailable:
    boolean;
  responseApplicationPerformed: false;
  signalConversionAuthorized: false;
  temporalIntegrationAuthorized: false;
  photonConversionPerformed: false;
  electronConversionPerformed: false;
  currentConversionPerformed: false;
  operatingRangeCompatibilityAssessed: false;
  spatiallyVaryingResponseSupported: false;
  componentEvidence: {
    applicationProfile:
      readonly EvidenceProvenance[];
    sourcePlane:
      readonly EvidenceProvenance[];
    spatialResponse:
      readonly EvidenceProvenance[];
    referenceConditionAssumption:
      readonly EvidenceProvenance[];
    response:
      SensorSpatioSpectralIrradianceReduction["componentEvidence"]["spectral"];
  };
}
```

## SensorResponseApplicationCompatibilityBlocker

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponseApplicationCompatibilityBlocker =
  | "spectral-response-profile-id-mismatch"
  | "color-sampling-profile-id-mismatch"
  | "channel-id-mismatch"
  | "sampling-aperture-profile-id-missing"
  | "sampling-aperture-profile-id-mismatch"
  | "optical-stack-profile-id-missing"
  | "optical-stack-profile-id-mismatch"
  | "source-plane-mismatch"
  | "wavelength-basis-unresolved"
  | "incident-area-basis-not-currently-integrated"
  | "incident-area-mismatch"
  | "spatial-response-uniformity-not-established"
  | "response-reference-conditions-not-declared"
  | "operating-conditions-not-declared"
  | "operating-conditions-mismatch";
```

## SensorResponseApplicationProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorResponseApplicationProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  spectralResponseProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  samplingApertureProfileId: string;
  opticalStackProfileId: string;
  evidence: readonly EvidenceProvenance[];
  incidentAreaBasis:
    SensorResponseIncidentAreaBasis;
  spatialResponseModel:
    SensorResponseSpatialModel;
  referenceConditionPolicy:
    SensorResponseReferenceConditionPolicy;
}
```

## SensorResponseIncidentAreaBasis

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponseIncidentAreaBasis =
  | {
      kind: "geometric-sensitive-aperture";
      areaSquareMicrometers: number;
    }
  | {
      kind: "full-site-cell";
      areaSquareMicrometers: number;
    }
  | {
      kind: "effective-collection-area";
      areaSquareMicrometers: number;
    };
```

## SensorResponseReferenceConditionPolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponseReferenceConditionPolicy =
  | {
      kind: "exact-match-required";
    }
  | {
      kind: "assume-compatible";
      limitation: string;
      evidence: readonly EvidenceProvenance[];
    };
```

## SensorResponseSignalPath

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponseSignalPath =
  | "photon-rate-to-electrons"
  | "radiant-power-to-current";
```

## SensorResponseSourcePlane

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponseSourcePlane =
  | "sensor-package-incident"
  | "site-incident";
```

## SensorResponseSpatialModel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponseSpatialModel =
  | {
      kind:
        "uniform-over-geometric-sensitive-aperture";
      scientificStatus:
        SensorSpectralResponseScientificStatus;
      evidence: readonly EvidenceProvenance[];
      limitation?: string;
    }
  | {
      kind: "not-established";
      limitation: string;
    };
```

## SourcedSensorResponseSourcePlane

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SourcedSensorResponseSourcePlane {
  value: SensorResponseSourcePlane;
  evidence: readonly EvidenceProvenance[];
}
```
