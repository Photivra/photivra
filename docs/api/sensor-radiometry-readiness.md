# sensor/radiometry-readiness.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## assessRadiometryReadiness

Assesses whether the declared prerequisites are sufficient for a nominal
photon estimate and, separately, for a calibrated photon claim.

This assessment does not enable composed photon/noise output.

```ts
export function assessRadiometryReadiness(
  profile: RadiometryReadinessProfile
): RadiometryReadinessAssessment;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalibrationArtifactReference

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalibrationArtifactReference {
  id: string;
  checksumSha256: string;
}
```

## ExposureIntegrationRequirement

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ExposureIntegrationRequirement =
  | (RadiometryRequirementBase & {
      requirement: "exposure-integration";
      integrationModel: "uniform-boxcar";
    })
  | (RadiometryRequirementBase & {
      requirement: "exposure-integration";
      integrationModel: "documented-shutter-function";
      dataArtifact: CalibrationArtifactReference;
    });
```

## OpticalTransmissionRequirement

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type OpticalTransmissionRequirement =
  | (RadiometryRequirementBase & {
      requirement: "optical-transmission";
      representation: "spectral-data";
      dataArtifact: CalibrationArtifactReference;
    })
  | (RadiometryRequirementBase & {
      requirement: "optical-transmission";
      representation: "t-stop-approximation";
      tStop: number;
    });
```

## parseRadiometryReadinessProfile

Parses untrusted radiometry-prerequisite metadata.

This validates structure and provenance; it cannot prove that a cited
calibration/evidence claim is scientifically true.

```ts
export function parseRadiometryReadinessProfile(
  value: unknown
): RadiometryReadinessProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## PhotositeCollectionAreaRequirement

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type PhotositeCollectionAreaRequirement =
  | (RadiometryRequirementBase & {
      requirement: "photosite-collection-area";
      areaModel: "effective-collection-area";
      effectiveCollectionAreaSquareMicrometers: number;
    })
  | (RadiometryRequirementBase & {
      requirement: "photosite-collection-area";
      areaModel: "geometric-area-times-fill-factor";
      geometricCellAreaSquareMicrometers: number;
      fillFactor: number;
    });
```

## PupilVignettingRequirement

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type PupilVignettingRequirement =
  | (RadiometryRequirementBase & {
      requirement: "pupil-vignetting";
      representation: "spatial-data";
      dataArtifact: CalibrationArtifactReference;
    })
  | (RadiometryRequirementBase & {
      requirement: "pupil-vignetting";
      representation: "documented-approximation";
    });
```

## RadiometryReadinessAssessment

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface RadiometryReadinessAssessment {
  status: "not-ready" | "approximate-only" | "calibrated-ready";
  nominalPhotonEstimateReady: boolean;
  calibratedPhotonClaimReady: boolean;
  missingRequirements: readonly RadiometryRequirementId[];
  approximateRequirements: readonly RadiometryRequirementId[];
  unquantifiedUncertaintyRequirements: readonly RadiometryRequirementId[];
  /**
   * This assessment never enables composed photon/noise output by itself.
   * Integration remains an explicit later product/engine decision.
   */
  composedPhotonOutputEnabled: false;
}
```

## RadiometryReadinessProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface RadiometryReadinessProfile {
  schemaVersion: "0.1.0";
  components: readonly RadiometryRequirement[];
}
```

## RadiometryRequirement

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type RadiometryRequirement =
  | SceneSpectralRadianceRequirement
  | OpticalTransmissionRequirement
  | PupilVignettingRequirement
  | PhotositeCollectionAreaRequirement
  | ExposureIntegrationRequirement
  | SensorResponseRequirement;
```

## RadiometryRequirementId

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type RadiometryRequirementId =
  | "scene-spectral-radiance"
  | "optical-transmission"
  | "pupil-vignetting"
  | "photosite-collection-area"
  | "exposure-integration"
  | "sensor-response";
```

## RadiometryScientificStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type RadiometryScientificStatus =
  | "calibrated"
  | "approximation";
```

## RadiometryUncertaintyDeclaration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type RadiometryUncertaintyDeclaration =
  | {
      kind: "relative";
      fraction: number;
      basis: string;
    }
  | {
      kind: "absolute";
      plusMinus: number;
      unit: string;
      basis: string;
    }
  | {
      kind: "not-quantified";
      limitation: string;
    };
```

## SceneSpectralRadianceRequirement

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneSpectralRadianceRequirement
  extends RadiometryRequirementBase {
  requirement: "scene-spectral-radiance";
  representation:
    | "spectral-data"
    | "documented-spectral-approximation";
  dataArtifact: CalibrationArtifactReference;
}
```

## SensorResponseRequirement

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponseRequirement =
  | (RadiometryRequirementBase & {
      requirement: "sensor-response";
      responseRepresentation: "spectral-quantum-efficiency";
      dataArtifact: CalibrationArtifactReference;
    })
  | (RadiometryRequirementBase & {
      requirement: "sensor-response";
      responseRepresentation: "effective-qe-approximation";
      effectiveQuantumEfficiency: number;
    });
```
