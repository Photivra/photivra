# sensor/dark-current.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSensorDarkCurrentCharge

Evaluate the declared temperature-dependent dark electron rate and integrate over the exact
photo-signal local exposure event.

Dark current is an independently declared pre-compensation thermal electron rate. Exact-temperature
or sampled linear interpolation is supported only within declared applicability; no universal
doubling-temperature law is inferred. Population means remain approximations and do not model
hot-pixel/DCNU structure.

```ts
export function calculateSensorDarkCurrentCharge(
  input: Omit<CalculateSensorDarkCurrentChargeInput, "exposure"> & { exposure: SensorEqeExposureIntegration }
): CalculationResult<SensorDarkCurrentCharge>;
```

```ts
export function calculateSensorDarkCurrentCharge(
  input: Omit<CalculateSensorDarkCurrentChargeInput, "exposure"> & { exposure: SensorEqeTemporalPhotoSignal }
): CalculationResult<SensorTemporalDarkCurrentCharge>;
```

```ts
export function calculateSensorDarkCurrentCharge(
  input: CalculateSensorDarkCurrentChargeInput<SensorEqePhotoExposure>
): CalculationResult<SensorPhotoDarkCurrentCharge>;
```

```ts
export function calculateSensorDarkCurrentCharge(
  input:
    CalculateSensorDarkCurrentChargeInput<SensorEqePhotoExposure>
): CalculationResult<SensorPhotoDarkCurrentCharge>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSensorDarkCurrentChargeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateSensorDarkCurrentChargeInput<Exposure extends SensorEqePhotoExposure = SensorEqeExposureIntegration> {
  exposure:
    Exposure;
  darkCurrentProfile:
    SensorDarkCurrentProfile;
  operatingTemperatureC: number;
}
```

## parseSensorDarkCurrentProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Dark current is an independently declared pre-compensation thermal electron rate. Exact-temperature
or sampled linear interpolation is supported only within declared applicability; no universal
doubling-temperature law is inferred. Population means remain approximations and do not model
hot-pixel/DCNU structure.

```ts
export function parseSensorDarkCurrentProfile(
  value: unknown
): SensorDarkCurrentProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SensorDarkCurrentCharge

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorDarkCurrentCharge {
  darkCurrentProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  stationarityProfileId: string;
  temporalIntegrationId?: never;
  timeReference:
    "first-opening-boundary-phase";
  startOffsetSecondsFromOpeningReference:
    number;
  endOffsetSecondsFromOpeningReference:
    number;
  operatingTemperatureC: number;
  temperatureModel:
    SensorDarkCurrentTemperatureModel["kind"];
  temperatureInterpolationUsed:
    boolean;
  darkCurrentElectronsPerSecond:
    number;
  localExposureDurationSeconds:
    number;
  expectedDarkElectronCount:
    number;
  countMeaning:
    "expected-thermally-generated-electrons";
  expectationValueOnly: true;
  integerDarkElectronCountSampled:
    false;
  darkShotNoiseApplied: false;
  darkCurrentCompensationApplied:
    false;
  spatialDarkCurrentNonuniformityModeled:
    boolean;
  photoSignalIncluded: false;
  otherChargeIncluded: false;
  physicalFullWellAssessmentAuthorized:
    false;
  saturationAssessed: false;
  componentEvidence: {
    darkCurrent:
      readonly EvidenceProvenance[];
    siteApproximation:
      readonly EvidenceProvenance[];
    exposure:
      SensorEqeExposureIntegration["componentEvidence"];
  };
}
```

## SensorDarkCurrentProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorDarkCurrentProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  evidence: readonly EvidenceProvenance[];
  chargeMeaning:
    "pre-compensation-thermally-generated-electrons";
  siteApplicability:
    SensorDarkCurrentSiteApplicability;
  temperatureModel:
    SensorDarkCurrentTemperatureModel;
  darkCurrentCompensationIncluded: false;
  spatialDarkCurrentNonuniformityModeled:
    boolean;
}
```

## SensorDarkCurrentSiteApplicability

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorDarkCurrentSiteApplicability =
  | {
      kind: "exact-site";
      site: {
        x: number;
        y: number;
      };
    }
  | {
      kind:
        "uniform-site-mean-approximation";
      limitation: string;
      evidence:
        readonly EvidenceProvenance[];
    };
```

## SensorDarkCurrentTemperatureModel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorDarkCurrentTemperatureModel =
  | {
      kind:
        "fixed-reference-temperature";
      referenceTemperatureC: number;
      darkCurrentElectronsPerSecond:
        number;
    }
  | {
      kind:
        "piecewise-linear-temperature-table";
      interpolation: "piecewise-linear";
      outsideRangeBehavior:
        "fail-closed";
      samples: readonly {
        temperatureC: number;
        darkCurrentElectronsPerSecond:
          number;
      }[];
    };
```

## SensorPhotoDarkCurrentCharge

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorPhotoDarkCurrentCharge = SensorDarkCurrentCharge | SensorTemporalDarkCurrentCharge;
```

## SensorTemporalDarkCurrentCharge

Dark charge shares the exact temporal photo event, without a stationarity ID.

```ts
export type SensorTemporalDarkCurrentCharge = Omit<SensorDarkCurrentCharge, "stationarityProfileId" | "temporalIntegrationId" | "componentEvidence"> & {
  stationarityProfileId?: never;
  temporalIntegrationId: string;
  componentEvidence: Omit<SensorDarkCurrentCharge["componentEvidence"], "exposure"> & { exposure: SensorEqeTemporalPhotoSignal["componentEvidence"] };
};
```
