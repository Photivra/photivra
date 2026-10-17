# sensor/raw-readout.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

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

## SensorAdcIntegralNonLinearity

Optional ADC integral non-linearity: a piecewise-linear offset in code units (LSB) as a function
of the ideal continuous ADC input code, added before quantization. Knots must start at code 0 and
end at the ADC maximum code. Omission is an ideal uniform ADC.

```ts
export interface SensorAdcIntegralNonLinearity {
  kind: "piecewise-linear-code-offset";
  knots: readonly { code: number; offsetCodes: number }[];
  evidence: readonly EvidenceProvenance[];
}
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
  /** Fixed-pattern profile applied to this realization, or null for the uniform population model. */
  fixedPatternNoiseProfileId:
    string | null;
  /** PRNU gain applied to the photo expectation (exactly 1 without a fixed pattern). */
  photoResponseGainFactor: number;
  /** DSNU/hot-pixel factor applied to the dark expectation (exactly 1 without a fixed pattern). */
  darkCurrentFactor: number;
  hotPixel: boolean;
  /** Poisson means actually sampled: expectation × the site's fixed-pattern factor. */
  photoSampledMeanElectronCount: number;
  darkSampledMeanElectronCount: number;
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
  /** Continuous ADC input code including any declared INL offset. */
  expectedCodeBeforeQuantization:
    number;
  adcIntegralNonLinearityOffsetCodes:
    number;
  digitalGain: number;
  /** Continuous code after post-ADC digital gain about black (equals the ADC input without one). */
  expectedCodeAfterDigitalGain:
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
  /** Fixed-pattern profile applied at readout, or null. */
  fixedPatternNoiseProfileId:
    string | null;
  /** Static fixed-pattern row + column offset in input-referred electrons (0 without a pattern). */
  fixedPatternReadoutOffsetElectrons:
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
  /** Continuous ADC input code including any declared integral non-linearity offset. */
  codeBeforeQuantization:
    number;
  /** INL offset added before quantization (0 for an ideal ADC). */
  adcIntegralNonLinearityOffsetCodes:
    number;
  /** ADC output after quantization and the ADC code-range limit, before digital gain. */
  adcCodeBeforeDigitalGain:
    number;
  /** Post-ADC digital gain (1 when the regime declares none). */
  digitalGain: number;
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
    /**
     * Optional post-ADC digital gain (>= 1) applied about the black level:
     * code = roundHalfUp((adcCode - black) * digitalGain + black). Omission means 1.
     */
    digitalGain?: number;
    integralNonLinearity?:
      SensorAdcIntegralNonLinearity;
  };
  exposureIndexGain?:
    SensorReadoutExposureIndexGain;
  evidence:
    readonly EvidenceProvenance[];
  limitations: readonly string[];
}
```

## SensorReadoutExposureIndexGain

Optional descriptive ISO-gain derivation of one regime (exposure index of CIPA DC-004 / ISO 12232 relative to the
base exposure index). The numbers that enter the readout equations remain
systemConversionGainElectronsPerCode (analog, pre-ADC) and adc.digitalGain (post-ADC); this
record must agree with them and never replaces them.

```ts
export interface SensorReadoutExposureIndexGain {
  exposureIndex: number;
  baseExposureIndex: number;
  /** Analog (pre-ADC) gain relative to the base-exposure-index regime. */
  analogGain: number;
  /** Post-ADC digital gain; equals adc.digitalGain (1 when omitted). */
  digitalGain: number;
  conversionGainMode:
    | "single-conversion-gain"
    | "low-conversion-gain"
    | "high-conversion-gain";
  evidence: readonly EvidenceProvenance[];
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
  /**
   * Optional per-sensor-instance fixed pattern. PRNU scales the photo Poisson mean and DSNU/hot
   * pixels scale the dark Poisson mean. Omission is exactly the uniform population model.
   */
  fixedPatternNoise?:
    SensorFixedPatternNoiseProfile;
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
  /**
   * Optional fixed pattern; must be the same profile used for the charge realization. Its static
   * row/column offsets are added with read noise before the pre-ADC threshold.
   */
  fixedPatternNoise?:
    SensorFixedPatternNoiseProfile;
}
```
