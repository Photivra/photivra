# exposure/metering-scene-radiance.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createSceneRadianceDerivedExposureMeteringSampleSet

Creates a relative pre-exposure meter sample set bound to one validated #85
provider context.

The caller/renderer still supplies the scalar relative samples. This bridge
validates identity and timing semantics only; it does not convert spectral
radiance into luminance or define a calibrated meter spectral response.

```ts
export function createSceneRadianceDerivedExposureMeteringSampleSet(
  input:
    CreateSceneRadianceDerivedExposureMeteringSampleSetInput
): SceneRadianceDerivedExposureMeteringSampleSet;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateSceneRadianceDerivedExposureMeteringSampleSetInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CreateSceneRadianceDerivedExposureMeteringSampleSetInput {
  measurementId: string;
  sceneStateId: string;
  providerProfile:
    SceneRadianceProviderProfile;
  illuminationProfile:
    SceneIlluminationProfile;
  materialResponseProfile:
    SceneMaterialResponseProfile;
  illuminationTemporalProfile?:
    SceneIlluminationTemporalProfile;
  captureTimeSecondsFromReference?: number;
  captureGeometry:
    ResolvedCaptureGeometry;
  derivationProfile:
    SceneRadianceMeteringDerivationProfile;
  samples:
    readonly ExposureMeteringZoneSample[];
}
```

## parseSceneRadianceMeteringDerivationProfile

Parses the declared approximation used to reduce renderer/provider scene
information into the scalar relative-linear domain consumed by metering.

This profile explicitly does not authorize a calibrated luminance or
spectral-to-photometric conversion claim.

```ts
export function parseSceneRadianceMeteringDerivationProfile(
  value: unknown
): SceneRadianceMeteringDerivationProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SCENE_RADIANCE_METERING_DERIVATION_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SCENE_RADIANCE_METERING_DERIVATION_SCHEMA_VERSION =
  "0.1.0" as const
```

## SceneRadianceDerivedExposureMeteringSampleSet

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceDerivedExposureMeteringSampleSet
  extends ExposureMeteringSampleSet {
  sourceContext:
    SceneRadianceMeteringSourceContext;
}
```

## SceneRadianceMeteringDerivationProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceMeteringDerivationProfile {
  schemaVersion:
    typeof SCENE_RADIANCE_METERING_DERIVATION_SCHEMA_VERSION;
  derivationId: string;
  scientificStatus: "approximation";
  method:
    "renderer-provided-pre-exposure-relative-reduction";
  spectralWeighting:
    "not-calibrated";
  evidence: readonly EvidenceProvenance[];
  limitation: string;
}
```

## SceneRadianceMeteringSourceContext

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceMeteringSourceContext {
  kind:
    "scene-radiance-provider-derived-relative";
  sceneId: string;
  sceneStateId: string;
  providerProfileId: string;
  illuminationProfileId: string;
  materialResponseProfileId: string;
  derivationProfileId: string;
  providerScientificStatus:
    SceneRadianceProviderProfile["scientificStatus"];
  materialResponseFidelity:
    ReturnType<
      typeof assessSceneMaterialResponseFidelity
    >;
  temporal:
    SceneRadianceMeteringTemporalContext;
  spectralReductionCalibrated: false;
  calibratedLuminanceClaimAuthorized:
    false;
  calibratedSceneRadianceClaimAuthorized:
    false;
}
```

## SceneRadianceMeteringTemporalContext

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SceneRadianceMeteringTemporalContext =
  | {
      kind: "time-invariant";
    }
  | {
      kind:
        "registered-time-varying";
      illuminationTemporalProfileId:
        string;
      timeReference:
        "first-opening-boundary-phase";
      captureTimeSecondsFromReference:
        number;
    };
```
