# schema/scene-radiance.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## assessSceneMaterialResponseFidelity

Returns the conservative material fidelity represented by a profile.

```ts
export function assessSceneMaterialResponseFidelity(
  profile: SceneMaterialResponseProfile
): SceneMaterialResponseFidelity;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSceneMaterialResponseProfile

Parses material-response metadata consumed by a scene-radiance provider.

RGB/PBR data is approximation-only. Spectral data describes a
wavelength-preserving provider input and does not itself calculate a BSDF,
scene radiance, fluorescence, emission, volumetrics, or polarization.

```ts
export function parseSceneMaterialResponseProfile(
  value: unknown
): SceneMaterialResponseProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSceneRadianceEvaluationRequest

Parses one provider evaluation request at an explicit scene target,
physical time, wavelength, and outgoing direction.

```ts
export function parseSceneRadianceEvaluationRequest(
  value: unknown
): SceneRadianceEvaluationRequest;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSceneRadianceEvaluationResult

Parses one provider-produced outgoing spectral-radiance result.

The numeric value is accepted as provider output; parsing validates units,
finite/nonnegative value, provenance, and identity fields but does not prove
that the provider's transport calculation is physically correct.

```ts
export function parseSceneRadianceEvaluationResult(
  value: unknown
): SceneRadianceEvaluationResult;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSceneRadianceProviderProfile

Parses a renderer-neutral provider capability/profile declaration.

Schema 0.1.0 is deliberately approximation-only. A provider may consume
calibrated inputs, but this contract does not authorize a calibrated
outgoing-radiance claim until later spectral/transport completeness work.

```ts
export function parseSceneRadianceProviderProfile(
  value: unknown
): SceneRadianceProviderProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SCENE_MATERIAL_RESPONSE_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SCENE_MATERIAL_RESPONSE_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION =
  "0.1.0" as const
```

## SCENE_RADIANCE_PROVIDER_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SCENE_RADIANCE_PROVIDER_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## SceneMaterialResponseDefinition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneMaterialResponseDefinition {
  materialResponseId: string;
  evidence: readonly EvidenceProvenance[];
  representation:
    SceneMaterialResponseRepresentation;
}
```

## SceneMaterialResponseFidelity

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneMaterialResponseFidelity =
  | "spectral-data"
  | "rgb-pbr-approximation"
  | "mixed"
  | "unresolved";
```

## SceneMaterialResponseProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneMaterialResponseProfile {
  schemaVersion:
    typeof SCENE_MATERIAL_RESPONSE_PROFILE_SCHEMA_VERSION;
  profileId: string;
  sceneId: string;
  evidence: readonly EvidenceProvenance[];
  materials:
    readonly SceneMaterialResponseDefinition[];
  fluorescenceModeled: false;
  volumetricMaterialTransportModeled: false;
  polarizationModeled: false;
}
```

## SceneMaterialResponseRepresentation

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneMaterialResponseRepresentation =
  | {
      kind: "unresolved";
      limitation: string;
    }
  | {
      kind: "rgb-pbr-approximation";
      colorSpace: "linear-srgb";
      baseColor: {
        red: number;
        green: number;
        blue: number;
      };
      metallic: number;
      roughness: number;
      limitation: string;
    }
  | {
      kind: "spectral-wavelength-preserving-data";
      dataArtifact:
        SceneRadianceDataArtifactReference;
      wavelengthBasis:
        SpectralWavelengthBasis;
      wavelengthRangeNanometers:
        SpectralWavelengthRangeNanometers;
      scatteringModel:
        "provider-defined-wavelength-preserving";
      scientificStatus:
        SceneRadianceScientificStatus;
      uncertainty:
        SceneRadianceUncertainty;
      wavelengthChangingBehaviorModeled: false;
      emissionModeled: false;
    };
```

## SceneRadianceDataArtifactReference

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceDataArtifactReference {
  id: string;
  checksumSha256: string;
}
```

## SceneRadianceEvaluationBindingAssessment

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceEvaluationBindingAssessment {
  providerBindingsMatched: true;
  requestResultIdentityMatched: true;
  materialResponseFidelity:
    SceneMaterialResponseFidelity;
  temporalIlluminationProfileBound:
    boolean;
  calibratedRadianceClaimAuthorized: false;
  sensorPlaneIrradianceCalculated: false;
  opticsApplied: false;
  photonsCalculated: false;
}
```

## SceneRadianceEvaluationRequest

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceEvaluationRequest {
  schemaVersion:
    typeof SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION;
  sampleId: string;
  providerProfileId: string;
  sceneId: string;
  illuminationProfileId: string;
  materialResponseProfileId: string;
  target: SceneRadianceEvaluationTarget;
  timeSecondsFromExposureStart: number;
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<SpectralWavelengthBasis, "unspecified">;
}
```

## SceneRadianceEvaluationResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceEvaluationResult {
  schemaVersion:
    typeof SCENE_RADIANCE_EVALUATION_SCHEMA_VERSION;
  sampleId: string;
  providerProfileId: string;
  sceneId: string;
  wavelengthNanometers: number;
  wavelengthBasis:
    Exclude<SpectralWavelengthBasis, "unspecified">;
  quantity:
    "outgoing-spectral-radiance";
  unit: "W/m^2/sr/nm";
  spectralRadianceWattsPerSquareMeterSteradianNanometer:
    number;
  scientificStatus: "approximation";
  uncertainty: SceneRadianceUncertainty;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## SceneRadianceEvaluationTarget

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneRadianceEvaluationTarget =
  | {
      kind: "surface-point";
      sceneObjectId: string;
      materialResponseId: string;
      positionM: Vector3;
      outgoingDirectionUnitVector: Vector3;
    }
  | {
      kind: "environment-direction";
      outgoingDirectionUnitVector: Vector3;
    };
```

## SceneRadianceProviderProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceProviderProfile {
  schemaVersion:
    typeof SCENE_RADIANCE_PROVIDER_PROFILE_SCHEMA_VERSION;
  profileId: string;
  sceneId: string;
  illuminationProfileId: string;
  illuminationTemporalProfileId?: string;
  materialResponseProfileId: string;
  outputQuantity:
    "outgoing-spectral-radiance";
  outputUnit:
    "W/m^2/sr/nm";
  scientificStatus: "approximation";
  uncertainty: SceneRadianceUncertainty;
  fidelity: {
    spectral:
      SceneRadianceProviderSpectralFidelity;
    material:
      SceneMaterialResponseFidelity;
    visibility:
      SceneRadianceProviderVisibilityFidelity;
    directTransport:
      SceneRadianceProviderTransportFidelity;
    indirectTransport:
      SceneRadianceProviderTransportFidelity;
  };
  wavelengthChangingTransportModeled: false;
  volumetricTransportModeled: false;
  polarizationModeled: false;
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## SceneRadianceProviderSpectralFidelity

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneRadianceProviderSpectralFidelity =
  | "wavelength-resolved"
  | "rgb-derived-approximation";
```

## SceneRadianceProviderTransportFidelity

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneRadianceProviderTransportFidelity =
  | "resolved"
  | "approximation"
  | "not-modeled";
```

## SceneRadianceProviderVisibilityFidelity

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneRadianceProviderVisibilityFidelity =
  | "resolved"
  | "approximation"
  | "not-modeled";
```

## SceneRadianceScientificStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneRadianceScientificStatus =
  | "calibrated"
  | "approximation";
```

## SceneRadianceUncertainty

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneRadianceUncertainty =
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

## validateSceneRadianceEvaluationBindings

Validates exact identity/binding relationships around provider output.

This function never recomputes the radiance value and never promotes the
provider's approximation to calibrated radiometry.

```ts
export function validateSceneRadianceEvaluationBindings(
  input:
    ValidateSceneRadianceEvaluationBindingsInput
): SceneRadianceEvaluationBindingAssessment;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ValidateSceneRadianceEvaluationBindingsInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ValidateSceneRadianceEvaluationBindingsInput {
  providerProfile: SceneRadianceProviderProfile;
  illuminationProfile: SceneIlluminationProfile;
  illuminationTemporalProfile?:
    SceneIlluminationTemporalProfile;
  materialResponseProfile:
    SceneMaterialResponseProfile;
  request: SceneRadianceEvaluationRequest;
  result: SceneRadianceEvaluationResult;
}
```
