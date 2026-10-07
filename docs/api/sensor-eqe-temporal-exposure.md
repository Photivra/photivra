# sensor/eqe-temporal-exposure.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSensorEqeTemporalExposure

Evaluate response validity and EQE independently at each declared shutter
midpoint, then sum rates times seconds. This is quadrature, not a stationarity
claim or convergence proof. Shared profile/geometry state prevents combining
rates from different sites or shutter events. No renderer executes here.

```ts
export function calculateSensorEqeTemporalExposure(
  input: CalculateSensorEqeTemporalExposureInput
): CalculationResult<SensorEqeTemporalExposure>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSensorEqeTemporalExposureInput

Shared response/site/shutter state, with separately evaluated physical light at each time.

```ts
export interface CalculateSensorEqeTemporalExposureInput
  extends Omit<CalculateSensorEqeLocalExposureInput, "irradianceSamples" | "stationarityProfile"> {
  /** Complete uniform-midpoint coverage; array order is not temporal identity. */
  samples: readonly {
    temporalSampleIndex: number;
    /** Seconds on the shutter's first-opening-boundary-phase reference. */
    timeSecondsFromOpeningReference: number;
    /** Complete W/m²/nm Cartesian irradiance coverage for this instant. */
    irradianceSamples: CalculateSensorEqeLocalExposureInput["irradianceSamples"];
  }[];
}
```

## SensorEqeTemporalExposure

Nonstationary photo expectation, deliberately distinct from stationary RAW producer inputs.

```ts
export interface SensorEqeTemporalExposure {
  kind: "eqe-temporal-quadrature-expected-counts";
  colorSamplingProfileId: string;
  channelId: string;
  site: { x: number; y: number };
  bindingId: string;
  timeReference: "first-opening-boundary-phase";
  startOffsetSecondsFromOpeningReference: number;
  endOffsetSecondsFromOpeningReference: number;
  localExposureDurationSeconds: number;
  expectedIncidentPhotonCount: number;
  expectedGeneratedElectronCount: number;
  integrationMethod: "uniform-midpoint-rate-quadrature";
  timeStationarityEstablished: false;
  timeVaryingSignalIntegrated: true;
  temporalIntegrationApplied: true;
  upstreamSceneAndOpticsVerified: false;
  accumulatedSignalCompleteness: "photo-signal-only";
  physicalFullWellAssessmentAuthorized: false;
  shotNoiseApplied: false;
  rawCodeValueProduced: false;
  /** Canonical order, seconds-valued integration measures and independent child evidence. */
  samples: readonly {
    temporalSampleIndex: number;
    timeSecondsFromOpeningReference: number;
    integrationMeasureSeconds: number;
    timeAverageWeight: number;
    stages: ReturnType<typeof calculateSensorEqeLocalRate>;
  }[];
}
```
