# sensor/raw-readout.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateExpectedSensorReadout

Map expected charge through declared gain/offset/readout limits without stochastic sampling and
retain separate clipping domains.

Signal ordering is expected charge → independent seeded photo/dark draws → signed electronic read
noise → upper pre-ADC threshold → black pedestal → nearest-half-up ADC quantization → unsigned code
limits. Signed below-black values survive until the final code clamp. Physical storage saturation,
pre-ADC clipping and digital clipping have distinct diagnostics; ISO never invents a conversion
regime.

```ts
export function calculateExpectedSensorReadout(
  input:
    CalculateExpectedSensorReadoutInput
): CalculationResult<SensorExpectedReadoutSignal>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateExpectedSensorReadoutInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateExpectedSensorReadoutInput {
  accumulatedCharge:
    SensorAccumulatedChargeComposition;
  physicalCapacityAssessment:
    SensorPhysicalChargeCapacityAssessment;
  readoutProfile:
    SensorReadoutConversionProfile;
  regimeId: string;
}
```

## parseSensorChargeSamplingProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Signal ordering is expected charge → independent seeded photo/dark draws → signed electronic read
noise → upper pre-ADC threshold → black pedestal → nearest-half-up ADC quantization → unsigned code
limits. Signed below-black values survive until the final code clamp. Physical storage saturation,
pre-ADC clipping and digital clipping have distinct diagnostics; ISO never invents a conversion
regime.

```ts
export function parseSensorChargeSamplingProfile(
  value: unknown
): SensorChargeSamplingProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## parseSensorReadoutConversionProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Signal ordering is expected charge → independent seeded photo/dark draws → signed electronic read
noise → upper pre-ADC threshold → black pedestal → nearest-half-up ADC quantization → unsigned code
limits. Signed below-black values survive until the final code clamp. Physical storage saturation,
pre-ADC clipping and digital clipping have distinct diagnostics; ISO never invents a conversion
regime.

```ts
export function parseSensorReadoutConversionProfile(
  value: unknown
): SensorReadoutConversionProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvedSensorReadoutRegime

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedSensorReadoutRegime {
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  regime:
    SensorReadoutConversionRegime;
  regimeSelectionOwnedBy:
    "explicit-upstream-camera-state-not-inferred-from-iso";
  adcMaximumCode: number;
  combinedReadNoiseRmsElectrons:
    number;
}
```

## resolveSensorReadoutRegime

Select and validate a declared readout regime against exact channel/profile identity rather than
inferring it from ISO.

Signal ordering is expected charge → independent seeded photo/dark draws → signed electronic read
noise → upper pre-ADC threshold → black pedestal → nearest-half-up ADC quantization → unsigned code
limits. Signed below-black values survive until the final code clamp. Physical storage saturation,
pre-ADC clipping and digital clipping have distinct diagnostics; ISO never invents a conversion
regime.

```ts
export function resolveSensorReadoutRegime(
  input:
    ResolveSensorReadoutRegimeInput
): ResolvedSensorReadoutRegime;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveSensorReadoutRegimeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveSensorReadoutRegimeInput {
  profile:
    SensorReadoutConversionProfile;
  regimeId: string;
}
```

## SENSOR_CHARGE_SAMPLING_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SENSOR_CHARGE_SAMPLING_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## SENSOR_READOUT_CONVERSION_PROFILE_SCHEMA_VERSION

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
SENSOR_READOUT_CONVERSION_PROFILE_SCHEMA_VERSION =
  "0.1.0" as const
```

## SensorAdditionalChargeSamplingModel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorAdditionalChargeSamplingModel =
  | "poisson"
  | "deterministic-expected-electron-equivalent";
```

## SensorAdditionalChargeSamplingPolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorAdditionalChargeSamplingPolicy {
  componentId: string;
  model:
    SensorAdditionalChargeSamplingModel;
}
```

## SensorChargeRealization

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorChargeRealization {
  samplingProfileId: string;
  completenessProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  seedUint32: number;
  photoExpectedElectronCount: number;
  photoRealizedElectronCount: number;
  darkExpectedElectronCount: number;
  darkRealizedElectronCount: number;
  additionalComponents:
    readonly {
      componentId: string;
      expectedElectronCount: number;
      realizedElectronEquivalentCount:
        number;
      model:
        SensorAdditionalChargeSamplingModel;
    }[];
  totalExpectedStoredElectronCount:
    number;
  totalRealizedStoredElectronEquivalentCount:
    number;
  photoShotNoiseApplied: true;
  darkShotNoiseApplied: true;
  electronicReadNoiseApplied: false;
  physicalSaturationApplied: false;
  bloomingModeled: false;
  conversionGainApplied: false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  stochasticModel:
    "independent-poisson-photo-dark-explicit-additional-policy";
  deterministicSeededRealization:
    true;
}
```

## SensorChargeSamplingProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorChargeSamplingProfile {
  schemaVersion:
    typeof SENSOR_CHARGE_SAMPLING_PROFILE_SCHEMA_VERSION;
  profileId: string;
  completenessProfileId: string;
  scientificStatus: "approximation";
  photoShotNoiseModel: "poisson";
  darkShotNoiseModel: "poisson";
  additionalComponentPolicies:
    readonly SensorAdditionalChargeSamplingPolicy[];
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## SensorElectronicReadNoiseComponent

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorElectronicReadNoiseComponent {
  componentId: string;
  rmsElectrons:
    EvidenceBackedFact<number>;
  evidence:
    readonly EvidenceProvenance[];
}
```

## SensorExpectedReadoutSignal

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorExpectedReadoutSignal {
  readoutProfileId: string;
  regimeId: string;
  completenessProfileId: string;
  capacityProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  expectedStoredElectronCount:
    number;
  expectedStoredChargeBelowOrAtPhysicalCapacity:
    true;
  expectedElectronEquivalentAfterPreAdcSaturation:
    number;
  preAdcSaturationAppliedToExpectation:
    boolean;
  systemConversionGainElectronsPerCode:
    number;
  expectedCodeBeforeBlackOffset:
    number;
  blackLevelCode: number;
  expectedCodeBeforeQuantization:
    number;
  adcBitDepth: number;
  adcMaximumCode: number;
  digitalSaturationCode: number;
  expectedDigitalSaturation:
    boolean;
  electronicReadNoiseMeanElectrons:
    0;
  electronicReadNoiseRmsElectrons:
    number;
  electronicReadNoiseSampled: false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  isoUsedToInferRegime: false;
}
```

## SensorRawCodeSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorRawCodeSample {
  readoutProfileId: string;
  regimeId: string;
  samplingProfileId: string;
  completenessProfileId: string;
  capacityProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  site: {
    x: number;
    y: number;
  };
  bindingId: string;
  chargeSeedUint32: number;
  readNoiseSeedUint32: number;
  realizedStoredElectronEquivalentCountBeforePhysicalCapacity:
    number;
  physicalChargeCapacityElectrons:
    number;
  electronEquivalentAfterPhysicalScalarSaturation:
    number;
  physicalScalarSaturationApplied:
    boolean;
  overflowElectronEquivalentDiagnostic:
    number;
  bloomingModeled: false;
  electronicReadNoiseComponents:
    readonly {
      componentId: string;
      rmsElectrons: number;
      sampledElectrons: number;
    }[];
  totalElectronicReadNoiseElectrons:
    number;
  electronEquivalentAfterReadNoise:
    number;
  preAdcSaturationElectronEquivalent:
    number;
  /** Signed electronic signal after upper saturation, before conversion/pedestal. */
  electronEquivalentAfterPreAdcSaturation:
    number;
  preAdcSaturationApplied:
    boolean;
  systemConversionGainElectronsPerCode:
    number;
  blackLevelCode: number;
  codeBeforeQuantization:
    number;
  quantizedCodeBeforeDigitalClamp:
    number;
  adcBitDepth: number;
  adcMaximumCode: number;
  digitalSaturationCode: number;
  rawCode: number;
  digitalSaturationApplied:
    boolean;
  lowerCodeClampApplied:
    boolean;
  adcTransfer:
    "uniform-round-half-up";
  physicalSaturationApplied: boolean;
  electronicReadNoiseApplied:
    boolean;
  conversionGainApplied: true;
  adcQuantizationApplied: true;
  rawCodeValueProduced: true;
  isoUsedToInferRegime: false;
  deterministicSeededRealization:
    true;
}
```

## SensorReadoutConversionProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorReadoutConversionProfile {
  schemaVersion:
    typeof SENSOR_READOUT_CONVERSION_PROFILE_SCHEMA_VERSION;
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  regimes:
    readonly SensorReadoutConversionRegime[];
  regimeSelectionOwnedBy:
    "explicit-upstream-camera-state-not-inferred-from-iso";
  evidence:
    readonly EvidenceProvenance[];
}
```

## SensorReadoutConversionRegime

One explicitly selected electronic conversion regime, with sourced electrons
per code, upper pre-ADC electron-equivalent threshold, independent RMS-electron
read-noise components and unsigned ADC coding policy. Black pedestal and digital
saturation are code-domain quantities. The regime does not infer its hardware
mechanism or selection from ISO and does not replace physical storage capacity.

```ts
export interface SensorReadoutConversionRegime {
  regimeId: string;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  systemConversionGainElectronsPerCode:
    EvidenceBackedFact<number>;
  preAdcSaturationElectronEquivalent:
    EvidenceBackedFact<number>;
  readNoiseComponents:
    readonly SensorElectronicReadNoiseComponent[];
  adc: {
    bitDepth: number;
    blackLevelCode: number;
    digitalSaturationCode: number;
    transfer:
      "uniform-round-half-up";
  };
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## simulateSensorChargeRealization

Draw deterministic independently seeded photo/dark Poisson counts and explicit additional-component
policies from expected accumulated charge.

Signal ordering is expected charge → independent seeded photo/dark draws → signed electronic read
noise → upper pre-ADC threshold → black pedestal → nearest-half-up ADC quantization → unsigned code
limits. Signed below-black values survive until the final code clamp. Physical storage saturation,
pre-ADC clipping and digital clipping have distinct diagnostics; ISO never invents a conversion
regime.

```ts
export function simulateSensorChargeRealization(
  input:
    SimulateSensorChargeRealizationInput
): CalculationResult<SensorChargeRealization>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SimulateSensorChargeRealizationInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SimulateSensorChargeRealizationInput {
  accumulatedCharge:
    SensorAccumulatedChargeComposition;
  samplingProfile:
    SensorChargeSamplingProfile;
  seedUint32: number;
}
```

## simulateSensorRawCode

Use the declared seed/regime to preserve signed electronic noise through pedestal and quantization,
then return the bounded native ADC code and stage diagnostics.

Signal ordering is expected charge → independent seeded photo/dark draws → signed electronic read
noise → upper pre-ADC threshold → black pedestal → nearest-half-up ADC quantization → unsigned code
limits. Signed below-black values survive until the final code clamp. Physical storage saturation,
pre-ADC clipping and digital clipping have distinct diagnostics; ISO never invents a conversion
regime.

```ts
export function simulateSensorRawCode(
  input:
    SimulateSensorRawCodeInput
): CalculationResult<SensorRawCodeSample>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SimulateSensorRawCodeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SimulateSensorRawCodeInput {
  chargeRealization:
    SensorChargeRealization;
  physicalCapacityAssessment:
    SensorPhysicalChargeCapacityAssessment;
  readoutProfile:
    SensorReadoutConversionProfile;
  regimeId: string;
  readNoiseSeedUint32: number;
}
```
