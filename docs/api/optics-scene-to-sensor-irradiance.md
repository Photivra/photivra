# optics/scene-to-sensor-irradiance.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSceneRadianceToSensorIrradiance

Apply declared pupil acceptance and exactly one transmission/field-throughput path to spectral scene
radiance, returning pre-stack irradiance with conservative evidence.

The optical bridge maps outgoing W/m²/sr/nm radiance to pre-sensor-stack W/m²/nm irradiance.
Circular paraxial acceptance is pi/(4*Nworking²); finite-focus unity-pupil geometry uses N*(1+m).
Spectral transmission and effective working T-stop are alternative paths, and field throughput is
applied exactly once. Sensor response and PSF redistribution are downstream.

```ts
export function calculateSceneRadianceToSensorIrradiance(
  input:
    CalculateSceneRadianceToSensorIrradianceInput
): CalculationResult<
  SceneToSensorIrradianceResult
>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSceneRadianceToSensorIrradianceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateSceneRadianceToSensorIrradianceInput {
  sceneRadianceRequest:
    SceneRadianceEvaluationRequest;
  sceneRadianceResult:
    SceneRadianceEvaluationResult;
  profile:
    SceneToSensorIrradianceProfile;
  focalLengthMm: number;
  nominalFNumber: number;
  focus:
    OpticalBridgeFocusContext;
  imagePointMm: {
    x: number;
    y: number;
  };
  fieldThroughput:
    OpticalBridgeFieldThroughput;
  frontOfLensFilters?:
    readonly FrontOfLensFilterProfile[];
}
```

## NumericRange

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface NumericRange {
  minimum: number;
  maximum: number;
}
```

## OpticalBridgeFieldThroughput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type OpticalBridgeFieldThroughput =
  | {
      kind: "unity";
    }
  | {
      kind:
        "illumination-vignetting-result";
      result:
        IlluminationVignetting;
    };
```

## OpticalBridgeFocusApplicability

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type OpticalBridgeFocusApplicability =
  | {
      kind: "any";
    }
  | {
      kind: "finite-distance-range";
      objectDistanceM: NumericRange;
    };
```

## OpticalBridgeFocusContext

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type OpticalBridgeFocusContext =
  | {
      kind: "infinity-focus";
    }
  | {
      kind:
        "ideal-symmetric-thin-lens";
      objectDistanceM: number;
      pupilMagnificationAssumption:
        "unity";
    }
  | {
      kind:
        "supplied-working-f-number";
      focus:
        | {
            kind: "infinity";
          }
        | {
            kind: "finite";
            objectDistanceM: number;
          };
      workingFNumber:
        EvidenceBackedFact<number>;
      basis: string;
    };
```

## OpticalBridgeScientificStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type OpticalBridgeScientificStatus =
  | "calibrated"
  | "approximation";
```

## OpticalBridgeUncertainty

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type OpticalBridgeUncertainty =
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

## OpticalTransmissionModel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type OpticalTransmissionModel =
  | {
      kind: "spectral-transmission";
      scientificStatus:
        OpticalBridgeScientificStatus;
      wavelengthBasis:
        Exclude<
          SpectralWavelengthBasis,
          "unspecified"
        >;
      samples:
        EvidenceBackedFact<
          readonly SpectralTransmissionSample[]
        >;
      uncertainty:
        OpticalBridgeUncertainty;
    }
  | {
      kind:
        "effective-working-t-stop-approximation";
      scientificStatus: "approximation";
      workingTStop:
        EvidenceBackedFact<number>;
      wavelengthBasis:
        Exclude<
          SpectralWavelengthBasis,
          "unspecified"
        >;
      wavelengthRangeNanometers:
        NumericRange;
      uncertainty:
        OpticalBridgeUncertainty;
      limitation: string;
    };
```

## parseSceneToSensorIrradianceProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

The optical bridge maps outgoing W/m²/sr/nm radiance to pre-sensor-stack W/m²/nm irradiance.
Circular paraxial acceptance is pi/(4*Nworking²); finite-focus unity-pupil geometry uses N*(1+m).
Spectral transmission and effective working T-stop are alternative paths, and field throughput is
applied exactly once. Sensor response and PSF redistribution are downstream.

```ts
export function parseSceneToSensorIrradianceProfile(
  value: unknown
): SceneToSensorIrradianceProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## SceneToSensorIrradianceProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneToSensorIrradianceProfile {
  schemaVersion:
    typeof SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  lensProfileId: string;
  scientificStatus:
    OpticalBridgeScientificStatus;
  applicability: {
    focalLengthMm: NumericRange;
    nominalFNumber: NumericRange;
    focus:
      OpticalBridgeFocusApplicability;
  };
  transmission:
    OpticalTransmissionModel;
  distortionAreaMappingOwnership:
    "not-applied-by-bridge";
  psfRedistributionOwnership:
    "downstream-normalized-energy-redistribution";
  sensorOpticalStackIncluded: false;
  strayLightIncluded: false;
  polarizationModeled: false;
  wavelengthChangingBehaviorModeled: false;
  volumetricScatteringModeled: false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## SceneToSensorIrradianceResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneToSensorIrradianceResult {
  schemaVersion:
    typeof SCENE_TO_SENSOR_IRRADIANCE_PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileVersion: string;
  lensProfileId: string;
  sampleId: string;
  providerProfileId: string;
  sceneId: string;
  timeSecondsFromExposureStart: number;
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<
      SpectralWavelengthBasis,
      "unspecified"
    >;
  inputQuantity:
    "outgoing-spectral-radiance";
  inputUnit:
    "W/m^2/sr/nm";
  outputQuantity:
    "sensor-plane-spectral-irradiance";
  outputUnit:
    "W/m^2/nm";
  sceneSpectralRadianceWattsPerSquareMeterSteradianNanometer:
    number;
  focalLengthMm: number;
  nominalFNumber: number;
  workingFNumber: number;
  focusModel:
    OpticalBridgeFocusContext["kind"];
  paraxialGeometricAcceptanceSolidAngleSteradians:
    number;
  transmissionPath:
    OpticalTransmissionModel["kind"];
  spectralTransmissionFactor:
    number | null;
  effectiveWorkingTStop:
    number | null;
  tStopEquivalentTransmissionFactor:
    number | null;
  frontOfLensFilterCount: number;
  frontOfLensFilterTransmissionFactor:
    number;
  frontOfLensFilterAttenuationStops:
    number;
  frontOfLensFilterTransmissionAppliedExactlyOnce:
    true;
  frontOfLensFilterPolarizationModeled:
    false;
  fieldThroughputFactor: number;
  effectiveAcceptanceAfterTransmissionAndFieldSteradians:
    number;
  sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer:
    number;
  scientificStatus: "approximation";
  sceneRadianceScientificStatus:
    SceneRadianceEvaluationResult["scientificStatus"];
  opticalProfileScientificStatus:
    OpticalBridgeScientificStatus;
  sceneRadianceUncertainty:
    SceneRadianceEvaluationResult["uncertainty"];
  opticalUncertainty:
    OpticalBridgeUncertainty;
  radianceAmplificationApplied: false;
  fieldThroughputAppliedExactlyOnce:
    true;
  universalCos4FalloffApplied: false;
  distortionAreaCorrectionApplied: false;
  psfRedistributionApplied: false;
  sensorOpticalStackApplied: false;
  cfaApplied: false;
  quantumEfficiencyApplied: false;
  spectralResponsivityApplied: false;
  strayLightApplied: false;
  polarizationModeled: false;
  wavelengthChangingBehaviorModeled:
    false;
  volumetricScatteringModeled: false;
  calibratedSensorPlaneIrradianceClaimAuthorized:
    false;
  componentEvidence: {
    sceneRadiance:
      readonly EvidenceProvenance[];
    opticalProfile:
      readonly EvidenceProvenance[];
    transmission:
      readonly EvidenceProvenance[];
    workingFNumber:
      readonly EvidenceProvenance[];
    frontOfLensFilters:
      readonly EvidenceProvenance[];
  };
  limitations:
    readonly string[];
}
```

## SpectralTransmissionSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SpectralTransmissionSample {
  wavelengthNanometers: number;
  linearTransmissionFactor: number;
}
```
