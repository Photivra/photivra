# sensor/camera-saturation-capacity.ts public contracts

Package **1.0.0**, root API **0.116.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## assessSensorCameraSaturationCapacity

Compare dark-corrected expected photo signal with the declared camera response-chain capacity
without adding dark charge or identifying a hardware clamp.

Camera saturation capacity is a dark-corrected photo-signal electron-equivalent limit. It is not
physical total-charge storage capacity, ADC maximum or evidence of the limiting hardware stage. This
assessment compares expectations and does not synthesize post-saturation codes.

```ts
export function assessSensorCameraSaturationCapacity(
  input:
    AssessSensorCameraSaturationCapacityInput
): CalculationResult<SensorCameraSaturationCapacityAssessment>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## AssessSensorCameraSaturationCapacityInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AssessSensorCameraSaturationCapacityInput {
  accumulatedCharge:
    SensorAccumulatedChargeComposition;
  saturationProfile:
    SensorCameraSaturationCapacityProfile;
  operatingStateId: string;
  operatingTemperatureC: number;
}
```

## parseSensorCameraSaturationCapacityProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Camera saturation capacity is a dark-corrected photo-signal electron-equivalent limit. It is not
physical total-charge storage capacity, ADC maximum or evidence of the limiting hardware stage. This
assessment compares expectations and does not synthesize post-saturation codes.

```ts
export function parseSensorCameraSaturationCapacityProfile(
  value: unknown
): SensorCameraSaturationCapacityProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SensorCameraSaturationCapacityAssessment

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorCameraSaturationCapacityAssessment {
  saturationProfileId: string;
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
    "camera-signal-saturation-capacity-electrons";
  signalDomain:
    "dark-corrected-photo-generated-electron-equivalent";
  cameraSignalSaturationCapacityElectrons:
    number;
  expectedPhotoSignalElectronCount:
    number;
  totalExpectedStoredElectronCountDiagnostic:
    number;
  totalStoredChargeUsedForCameraSaturationComparison:
    false;
  expectedSignalToCameraSaturationRatio:
    number;
  expectedSignalHeadroomElectrons:
    number;
  expectedCameraSignalCapacityStatus:
    | "below-capacity"
    | "at-capacity"
    | "above-capacity";
  expectedPhotoSignalExceedsCameraCapacity:
    boolean;
  cameraSaturationCapacityAssessmentPerformed:
    true;
  assessmentMeaning:
    "expected-dark-corrected-photo-signal-vs-camera-saturation-capacity";
  physicalChargeCapacityUsed:
    false;
  limitingSaturationMechanismResolved:
    false;
  analogClippingThresholdModeled:
    false;
  digitalClippingThresholdModeled:
    false;
  adcMaximumCodeUsed:
    false;
  actualStochasticSaturationStateKnown:
    false;
  stochasticSaturationProbabilityAssessed:
    false;
  outputSignalAfterSaturationCalculated:
    false;
  clampApplied: false;
  physicalStoredChargeModified:
    false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  saturationCapacityUncertaintyPropagated:
    false;
  photoSignalUncertaintyPropagated:
    false;
  componentEvidence: {
    saturationCapacity:
      readonly EvidenceProvenance[];
    measurementMethod:
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

## SensorCameraSaturationCapacityProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorCameraSaturationCapacityProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  capacityMeaning:
    "camera-signal-saturation-capacity-electrons";
  signalDomain:
    "dark-corrected-photo-generated-electron-equivalent";
  saturationCapacityElectrons: number;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  evidence:
    readonly EvidenceProvenance[];
  measurementMethodId: string;
  measurementMethodEvidence:
    readonly EvidenceProvenance[];
  siteApplicability:
    SensorCameraSaturationSiteApplicability;
  operatingState: {
    stateId: string;
    evidence:
      readonly EvidenceProvenance[];
  };
  temperatureApplicability:
    SensorCameraSaturationTemperatureApplicability;
}
```

## SensorCameraSaturationSiteApplicability

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorCameraSaturationSiteApplicability =
  | {
      kind: "exact-site";
      site: {
        x: number;
        y: number;
      };
    }
  | {
      kind:
        "channel-population-mean-approximation";
      limitation: string;
      evidence:
        readonly EvidenceProvenance[];
    };
```

## SensorCameraSaturationTemperatureApplicability

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorCameraSaturationTemperatureApplicability =
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
