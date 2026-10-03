# capture/environment-raw-producer.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## EnvironmentSensorRawFrame

Approximate executed provider-to-RAW lineage. sites retain per-site optical/EQE
results; raw retains charge, capacity, seeded-noise/readout diagnostics and exact
native frame. providerEvaluationCount is actual bounded work, not a quality score.
Conservative verification/activation flags belong to this standalone adapter;
a parent production plan records its own graph execution without upgrading them.

```ts
export interface EnvironmentSensorRawFrame {
  upstreamOrigin: "executed-environment-query-provider-optics-psf-eqe";
  providerTransportVerified: false;
  productionPlanActivated: false;
  providerEvaluationCount: number;
  sceneBinding: SimulateEnvironmentSensorRawFrameInput["sceneBinding"];
  sites: readonly ReturnType<typeof executeEnvironmentSensorPhotoSignal>[];
  raw: ReturnType<typeof simulateSensorRawFrame>;
}
```

## simulateEnvironmentSensorRawFrame

Preflight complete native coverage and aggregate support before invoking supplied
provider code, then reuse dark/completeness/capacity/noise/ADC ownership. The
returned RAW frame feeds the existing reconstruction and paired export APIs.

```ts
export function simulateEnvironmentSensorRawFrame(input: SimulateEnvironmentSensorRawFrameInput): CalculationResult<EnvironmentSensorRawFrame>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SimulateEnvironmentSensorRawFrameInput

Full native site order; generated photo/dark charge cannot be supplied as a shortcut.

```ts
export interface SimulateEnvironmentSensorRawFrameInput {
  frame: SensorRawProducerInput["frame"];
  sceneBinding: { sceneStateId: string; providerSceneId: string; evidence: readonly EvidenceProvenance[] };
  /** Shared shutter schedule is bound to the committed frame duration. */
  exposureWindow: NonNullable<SensorRawProducerInput["exposureWindow"]>;
  sites: readonly {
    environment: Omit<CalculateEnvironmentSensorPhotoSignalInput, "evaluateRadiance">;
    darkCurrentProfile: SensorDarkCurrentProfile;
    operatingTemperatureC: number;
    charge: Omit<SensorRawProducerSiteInput["charge"], "photoSignal" | "darkCharge">;
    readout: Omit<SensorRawProducerSiteInput, "charge">;
  }[];
  evaluateRadiance: EnvironmentRadianceEvaluator;
}
```
