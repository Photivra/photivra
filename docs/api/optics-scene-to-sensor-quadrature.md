# optics/scene-to-sensor-quadrature.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSceneToSensorIrradianceQuadrature

Calculate the existing paraxial optical bridge at every requested node.
Exact identity/coverage and provider bindings are checked before returning
physical W/m²/nm samples. Image coordinates belong to the spatial plan, so
callers cannot attach a field-throughput result from a different point.

```ts
export function calculateSceneToSensorIrradianceQuadrature(
  input: CalculateSceneToSensorIrradianceQuadratureInput
): CalculationResult<SceneToSensorIrradianceQuadrature>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSceneToSensorIrradianceQuadratureInput

Static point-sample bridge; PSF and temporal transport remain separate responsibilities.

```ts
export interface CalculateSceneToSensorIrradianceQuadratureInput {
  spatialQuadrature: ReduceSensorSpatioSpectralIrradianceInput["spatialQuadrature"];
  spectralQuadrature: ReduceSensorSpatioSpectralIrradianceInput["spectralQuadrature"];
  /** Evidence-backed provider/illumination/material identities, parsed before use. */
  sceneBindings: Omit<ValidateSceneRadianceEvaluationBindingsInput, "request" | "result">;
  /** One declared lens/focus/filter state shared by every node. */
  optics: Omit<CalculateSceneRadianceToSensorIrradianceInput,
    "sceneRadianceRequest" | "sceneRadianceResult" | "imagePointMm" | "fieldThroughput">;
  /** Explicit nonnegative instant shared by all queries; not an exposure integration. */
  timeSecondsFromExposureStart: number;
  /** Complete Cartesian coverage with a unique scene sampleId per node. */
  samples: readonly SceneSensorQuadratureSample[];
}
```

## SceneSensorQuadratureSample

One declared scene query/result for an exact pre-AA spatial/wavelength node.

```ts
export interface SceneSensorQuadratureSample {
  node: SensorSpatioSpectralNodeIdentity;
  sceneRadianceRequest: CalculateSceneRadianceToSensorIrradianceInput["sceneRadianceRequest"];
  sceneRadianceResult: CalculateSceneRadianceToSensorIrradianceInput["sceneRadianceResult"];
  fieldThroughput: CalculateSceneRadianceToSensorIrradianceInput["fieldThroughput"];
}
```

## SceneToSensorIrradianceQuadrature

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneToSensorIrradianceQuadrature {
  sourcePlane: "sensor-package-incident";
  outputMeaning: "pre-sensor-stack-pre-aa-irradiance-quadrature";
  sourceTargetProjectionVerified: false;
  sceneProviderExecutionVerified: false;
  psfRedistributionApplied: false;
  temporalIntegrationApplied: false;
  irradianceSamples: ReduceSensorSpatioSpectralIrradianceInput["sampleValues"];
  reduction: ReturnType<typeof reduceSensorSpatioSpectralIrradiance>;
  samples: readonly {
    node: SensorSpatioSpectralNodeIdentity;
    /** Physical source coordinate before AA redistribution, in mm. */
    preAntiAliasingSourcePointMm: { x: number; y: number };
    /** Owned provider target/time declaration; not a verified ray intersection. */
    request: SceneSensorQuadratureSample["sceneRadianceRequest"];
    result: SceneSensorQuadratureSample["sceneRadianceResult"];
    bindings: ReturnType<typeof validateSceneRadianceEvaluationBindings>;
    optics: ReturnType<typeof calculateSceneRadianceToSensorIrradiance>;
  }[];
}
```
