# sensor/temporal-photo-signal.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## createSensorEqeTemporalPhotoSignal

Re-evaluate physical input at every time before committing an owned compact
photo signal. Detailed child evidence/uncertainty stays in the returned
exposure diagnostics. This does not establish renderer/source execution.

```ts
export function createSensorEqeTemporalPhotoSignal(input: {
  temporalIntegrationId: string;
  exposure: CalculateSensorEqeTemporalExposureInput;
}): CalculationResult<{ photoSignal: SensorEqeTemporalPhotoSignal; exposure: ReturnType<typeof calculateSensorEqeTemporalExposure> }>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSensorEqeTemporalPhotoSignal

Recompute exact midpoint count sums; declarations do not prove source truth.

```ts
export function parseSensorEqeTemporalPhotoSignal(value: unknown): SensorEqeTemporalPhotoSignal;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SensorEqePhotoExposure

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorEqePhotoExposure = SensorEqeExposureIntegration | SensorEqeTemporalPhotoSignal;
```

## SensorEqeTemporalPhotoSignal

Compact untreated photo expectation; temporal identity is not stationarity evidence.

```ts
export interface SensorEqeTemporalPhotoSignal extends Omit<SensorEqeExposureIntegration,
  "kind" | "stationarityProfileId" | "stationarityStatus" | "integrationMethod" | "timeStationarityEstablished" |
  "timeVaryingSignalIntegrated" | "incidentPhotonRatePerSecond" | "expectedGeneratedElectronRatePerSecond" | "componentEvidence"> {
  kind: "eqe-temporal-photo-signal";
  temporalIntegrationId: string;
  stationarityProfileId?: never;
  integrationMethod: "uniform-midpoint-rate-quadrature";
  timeStationarityEstablished: false;
  timeVaryingSignalIntegrated: true;
  temporalSamples: readonly {
    timeSecondsFromOpeningReference: number;
    incidentPhotonRatePerSecond: number;
    expectedGeneratedElectronRatePerSecond: number;
  }[];
  componentEvidence: {
    temporalResponse: readonly EvidenceProvenance[];
    exposureBinding: SensorEqeExposureIntegration["componentEvidence"]["exposureBinding"];
  };
}
```
