# schema/scene-radiance-temporal.ts public contracts

Package **1.3.0**, root API **1.3.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createSceneRadianceTemporalSamplingPlan

Creates renderer/provider-neutral scene-radiance evaluation nodes over one
authoritative local exposure window.

The plan deliberately carries capture time separately from the legacy #85
request field name. Providers/renderers must evaluate scene/source radiance
at node.captureTimeSecondsFromReference on the first-opening-boundary clock.

```ts
export function createSceneRadianceTemporalSamplingPlan(
  input:
    CreateSceneRadianceTemporalSamplingPlanInput
): SceneRadianceTemporalSamplingPlan;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CreateSceneRadianceTemporalSamplingPlanInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CreateSceneRadianceTemporalSamplingPlanInput {
  planId: string;
  timing:
    ResolvedCaptureModeTiming;
  destinationPointNative:
    RasterPoint;
  temporalSampleCount: number;
  query:
    SceneRadianceTemporalQuery;
}
```

## ReducedSceneRadianceTemporalExposure

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ReducedSceneRadianceTemporalExposure {
  version:
    typeof SCENE_RADIANCE_TEMPORAL_SAMPLING_PLAN_VERSION;
  planId: string;
  timeReference:
    "first-opening-boundary-phase";
  localExposureWindow:
    SceneRadianceTemporalSamplingPlan["localExposureWindow"];
  temporalSampleCount: number;
  quadratureScheme:
    "uniform-midpoint";
  providerProfileId: string;
  sceneId: string;
  wavelengthNanometers: number;
  wavelengthBasis:
    SceneRadianceEvaluationRequest["wavelengthBasis"];
  quantity:
    "outgoing-spectral-radiance";
  averageSpectralRadianceWattsPerSquareMeterSteradianNanometer:
    number;
  integratedSpectralRadianceWattSecondsPerSquareMeterSteradianNanometer:
    number;
  nodes: readonly {
    nodeId: string;
    captureTimeSecondsFromReference:
      number;
    normalizedTimeWeight: number;
    timeMeasureSeconds: number;
    spectralRadianceWattsPerSquareMeterSteradianNanometer:
      number;
    evidence:
      SceneRadianceEvaluationResult["evidence"];
    uncertainty:
      SceneRadianceEvaluationResult["uncertainty"];
  }[];
  scientificStatus: "approximation";
  uncertaintyPropagation:
    "not-propagated";
  uncertaintyLimitation: string;
  sensorReadoutTimingUsedAsExposureTiming:
    false;
}
```

## reduceSceneRadianceTemporalSamples

Reduces provider-returned wavelength-resolved scene radiance over the
authoritative local exposure window.

Every sample must bind to the exact plan node/time/result identity. Numeric
uncertainty is retained per node and explicitly not combined because no
correlation/independence assumption is introduced.

```ts
export function reduceSceneRadianceTemporalSamples(
  input:
    ReduceSceneRadianceTemporalSamplesInput
): ReducedSceneRadianceTemporalExposure;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ReduceSceneRadianceTemporalSamplesInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ReduceSceneRadianceTemporalSamplesInput {
  plan:
    SceneRadianceTemporalSamplingPlan;
  samples:
    readonly SceneRadianceTemporalEvaluatedSample[];
}
```

## SCENE_RADIANCE_TEMPORAL_SAMPLING_PLAN_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SCENE_RADIANCE_TEMPORAL_SAMPLING_PLAN_VERSION =
  "0.1.0" as const
```

## SceneRadianceTemporalEvaluatedSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceTemporalEvaluatedSample {
  nodeId: string;
  captureTimeSecondsFromReference:
    number;
  result:
    SceneRadianceEvaluationResult;
}
```

## SceneRadianceTemporalQuery

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceTemporalQuery {
  providerProfileId: string;
  sceneId: string;
  illuminationProfileId: string;
  materialResponseProfileId: string;
  target:
    SceneRadianceEvaluationRequest["target"];
  wavelengthNanometers: number;
  wavelengthBasis:
    SceneRadianceEvaluationRequest["wavelengthBasis"];
}
```

## SceneRadianceTemporalSamplingNode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceTemporalSamplingNode {
  nodeId: string;
  expectedResultSampleId: string;
  temporalSampleIndex: number;
  localExposurePhase: number;
  captureTimeSecondsFromReference:
    number;
  normalizedTimeWeight: number;
  timeMeasureSeconds: number;
}
```

## SceneRadianceTemporalSamplingPlan

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SceneRadianceTemporalSamplingPlan {
  version:
    typeof SCENE_RADIANCE_TEMPORAL_SAMPLING_PLAN_VERSION;
  planId: string;
  timeReference:
    "first-opening-boundary-phase";
  timingProfileIdentity: {
    profileId: string;
    profileVersion: string;
    captureModeId: string;
  };
  destinationPointNative:
    RasterPoint;
  localExposureWindow: {
    startSecondsFromCaptureReference:
      number;
    endSecondsFromCaptureReference:
      number;
    durationSeconds: number;
  };
  temporalSampleCount: number;
  quadratureScheme:
    "uniform-midpoint";
  query:
    SceneRadianceTemporalQuery;
  nodes:
    readonly SceneRadianceTemporalSamplingNode[];
  providerMustEvaluateAtNodeCaptureTime:
    true;
  sensorReadoutTimingUsedAsExposureTiming:
    false;
}
```
