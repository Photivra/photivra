# sensor/physical-charge-capacity.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## assessSensorPhysicalChargeCapacity

Compare complete expected stored electrons to the explicitly applicable physical capacity and report
expectation-domain headroom without nonlinear storage simulation.

Physical storage capacity is a source-specific total stored-electron limit tied to site, operating
state and temperature. The assessment compares complete expected charge; it does not clamp
realizations or infer overflow/blooming. Camera saturation and ADC/readout thresholds remain
distinct.

```ts
export function assessSensorPhysicalChargeCapacity(
  input:
    AssessSensorPhysicalChargeCapacityInput
): CalculationResult<SensorPhysicalChargeCapacityAssessment>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## AssessSensorPhysicalChargeCapacityInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AssessSensorPhysicalChargeCapacityInput {
  accumulatedCharge:
    SensorAccumulatedChargeComposition;
  capacityProfile:
    SensorPhysicalChargeCapacityProfile;
  operatingStateId: string;
  operatingTemperatureC: number;
}
```

## parseSensorPhysicalChargeCapacityProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Physical storage capacity is a source-specific total stored-electron limit tied to site, operating
state and temperature. The assessment compares complete expected charge; it does not clamp
realizations or infer overflow/blooming. Camera saturation and ADC/readout thresholds remain
distinct.

```ts
export function parseSensorPhysicalChargeCapacityProfile(
  value: unknown
): SensorPhysicalChargeCapacityProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SensorPhysicalChargeCapacityAssessment

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorPhysicalChargeCapacityAssessment {
  capacityProfileId: string;
  completenessProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  operatingStateId: string;
  operatingTemperatureC: number;
  capacityMeaning:
    "physical-charge-storage-capacity-electrons";
  physicalChargeCapacityElectrons:
    number;
  totalExpectedStoredElectronCount:
    number;
  expectedChargeToCapacityRatio:
    number;
  expectedChargeHeadroomElectrons:
    number;
  expectedChargeCapacityStatus:
    | "below-capacity"
    | "at-capacity"
    | "above-capacity";
  expectedChargeExceedsCapacity:
    boolean;
  physicalChargeCapacityAssessmentPerformed:
    true;
  assessmentMeaning:
    "expected-charge-vs-physical-storage-capacity";
  actualStochasticSaturationStateKnown:
    false;
  stochasticSaturationProbabilityAssessed:
    false;
  storedChargeAfterPhysicalSaturationCalculated:
    false;
  overflowChargeCalculated: false;
  bloomingModeled: false;
  clampApplied: false;
  cameraSaturationAssessmentAuthorized:
    false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  capacityUncertaintyPropagated:
    false;
  accumulatedChargeUncertaintyPropagated:
    false;
  componentEvidence: {
    capacity:
      readonly EvidenceProvenance[];
    operatingState:
      readonly EvidenceProvenance[];
    siteApproximation:
      readonly EvidenceProvenance[];
    temperatureApproximation:
      readonly EvidenceProvenance[];
    chargeCompleteness:
      SensorAccumulatedChargeComposition["componentEvidence"]["completeness"];
  };
}
```

## SensorPhysicalChargeCapacityProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorPhysicalChargeCapacityProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  capacityMeaning:
    "physical-charge-storage-capacity-electrons";
  capacityElectrons: number;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  evidence:
    readonly EvidenceProvenance[];
  siteApplicability:
    SensorPhysicalChargeCapacitySiteApplicability;
  operatingState: {
    stateId: string;
    evidence:
      readonly EvidenceProvenance[];
  };
  temperatureApplicability:
    SensorPhysicalChargeCapacityTemperatureApplicability;
}
```

## SensorPhysicalChargeCapacitySiteApplicability

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorPhysicalChargeCapacitySiteApplicability =
  | {
      kind: "exact-site";
      site: {
        x: number;
        y: number;
      };
    }
  | {
      kind:
        "uniform-site-capacity-approximation";
      limitation: string;
      evidence:
        readonly EvidenceProvenance[];
    };
```

## SensorPhysicalChargeCapacityTemperatureApplicability

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorPhysicalChargeCapacityTemperatureApplicability =
  | {
      kind:
        "exact-reference-temperature";
      temperatureC: number;
    }
  | {
      kind: "not-modeled";
      limitation: string;
      evidence:
        readonly EvidenceProvenance[];
    };
```
