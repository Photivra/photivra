# sensor/constant-rate-temporal-integration.ts public contracts

Package **1.4.0**, root API **1.4.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## IntegrateStationarySensorRateInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface IntegrateStationarySensorRateInput {
  rate:
    SensorInstantaneousRateResult;
  exposureBinding:
    SensorRateLocalExposureBinding;
  stationarityProfile:
    SensorRateTemporalStationarityProfile;
}
```

## integrateStationarySensorRateOverLocalExposure

Integrates one explicitly stationary response-rate result over its exact
bound local exposure window.

This function is intentionally limited to the constant-rate approximation.
It does not sample or integrate a time-varying signal.

```ts
export function integrateStationarySensorRateOverLocalExposure(
  input:
    IntegrateStationarySensorRateInput
): CalculationResult<SensorStationaryRateExposureIntegration>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSensorRateTemporalStationarityProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Rate times duration is allowed only by explicit stationarity bound to the exact site and local
shutter interval. EQE integrates to expected photons/electrons; A/W integrates current magnitude to
coulombs without an implicit carrier mapping. Counts remain fractional expectations before
stochastic sampling.

```ts
export function parseSensorRateTemporalStationarityProfile(
  value: unknown
): SensorRateTemporalStationarityProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SensorEqeExposureIntegration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorEqeExposureIntegration
  extends SensorTemporalIntegrationCommon {
  kind: "eqe-expected-counts";
  incidentPhotonRatePerSecond: number;
  expectedGeneratedElectronRatePerSecond:
    number;
  expectedIncidentPhotonCount: number;
  expectedGeneratedElectronCount:
    number;
  countsAreExpectationValues: true;
  integerPhotonCountSampled: false;
  integerElectronCountSampled: false;
  chargeCalculated: false;
  currentCalculated: false;
}
```

## SensorRateStationarityStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorRateStationarityStatus =
  | "established"
  | "approximation";
```

## SensorRateTemporalStationarityProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorRateTemporalStationarityProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  rateDomain:
    SensorRateLocalExposureBinding["rateDomain"];
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  localExposureWindow: {
    timeReference:
      "first-opening-boundary-phase";
    startOffsetSecondsFromOpeningReference:
      number;
    endOffsetSecondsFromOpeningReference:
      number;
  };
  stationarityMeaning:
    "reported-rate-constant-through-bound-local-exposure";
  status:
    SensorRateStationarityStatus;
  evidence: readonly EvidenceProvenance[];
  limitation?: string;
}
```

## SensorResponsivityExposureIntegration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorResponsivityExposureIntegration
  extends SensorTemporalIntegrationCommon {
  kind:
    "responsivity-photocurrent-charge";
  photocurrentMagnitudeAmperes: number;
  photochargeMagnitudeCoulombs:
    number;
  currentSignConvention:
    "magnitude-only-no-circuit-polarity";
  chargeSignConvention:
    "magnitude-only-no-carrier-or-circuit-polarity";
  carrierCountInferred: false;
  electronCountCalculated: false;
  photonCountCalculated: false;
  detectorBandwidthModeled: false;
}
```

## SensorStationaryRateExposureIntegration

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorStationaryRateExposureIntegration =
  | SensorEqeExposureIntegration
  | SensorResponsivityExposureIntegration;
```
