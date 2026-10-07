# sensor/scene-eqe-temporal-exposure.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSceneSensorEqeTemporalExposure

Compose declared scene radiance through paraxial optics and instantaneous EQE
at every exact local shutter midpoint. Light is never averaged before response
validity. No projection, renderer, PSF, charge/noise or production stage executes.

```ts
export function calculateSceneSensorEqeTemporalExposure(
  input: CalculateSceneSensorEqeTemporalExposureInput
): CalculationResult<SceneSensorEqeTemporalExposure>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSceneSensorEqeTemporalExposureInput

Declared physical scene radiance at every spatial/wavelength/local-shutter midpoint.

```ts
export interface CalculateSceneSensorEqeTemporalExposureInput {
  /** One destination site, response and local shutter event; no stationarity declaration. */
  sensor: Omit<CalculateSensorEqeTemporalExposureInput, "samples">;
  sceneBindings: CalculateSceneToSensorIrradianceQuadratureInput["sceneBindings"];
  optics: CalculateSceneToSensorIrradianceQuadratureInput["optics"];
  /** Explicitly binds scene query seconds to the shutter's first-opening boundary. */
  timeReference: "first-opening-boundary-phase";
  samples: readonly {
    temporalSampleIndex: number;
    timeSecondsFromOpeningReference: number;
    sceneSamples: CalculateSceneToSensorIrradianceQuadratureInput["samples"];
  }[];
}
```

## SceneSensorEqeTemporalExposure

Child optical and sensor envelopes retain approximation/evidence independently.

```ts
export interface SceneSensorEqeTemporalExposure {
  sourcePlane: "sensor-package-incident";
  sourceTargetProjectionVerified: false;
  sceneProviderExecutionVerified: false;
  psfRedistributionApplied: false;
  opticalSamples: readonly {
    temporalSampleIndex: number;
    timeSecondsFromOpeningReference: number;
    optics: ReturnType<typeof calculateSceneToSensorIrradianceQuadrature>;
  }[];
  exposure: ReturnType<typeof calculateSensorEqeTemporalExposure>;
}
```
