# sensor/responsivity-photocurrent.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSensorResponsivityPhotocurrent

Integrate per-wavelength A/W times radiant-power contributions to steady-state current magnitude
with explicit electrical applicability.

A/W response converts per-bin radiant power to quasi-static detector-terminal current magnitude.
Electrical bias/load applicability is explicit. This is not EQE, electron rate, transimpedance
voltage or RAW; rapidly varying current requires a separate temporal detector-response model.

```ts
export function calculateSensorResponsivityPhotocurrent(
  input:
    CalculateSensorResponsivityPhotocurrentInput
): CalculationResult<SensorResponsivityPhotocurrent>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSensorResponsivityPhotocurrentInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateSensorResponsivityPhotocurrentInput {
  reduction:
    SensorSpatioSpectralIrradianceReduction;
  compatibility:
    SensorResponseApplicationCompatibilityAssessment;
  operatingRange:
    SensorResponseOperatingRangeAssessment;
  colorSamplingProfile:
    SensorColorSamplingProfile;
  spectralResponseProfile:
    SensorSpectralResponseProfile;
  electricalApplicabilityProfile:
    SensorResponsivityElectricalApplicabilityProfile;
  operatingElectricalConditions:
    SensorResponsivityElectricalConditions;
}
```

## parseSensorResponsivityElectricalApplicabilityProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

A/W response converts per-bin radiant power to quasi-static detector-terminal current magnitude.
Electrical bias/load applicability is explicit. This is not EQE, electron rate, transimpedance
voltage or RAW; rapidly varying current requires a separate temporal detector-response model.

```ts
export function parseSensorResponsivityElectricalApplicabilityProfile(
  value: unknown
): SensorResponsivityElectricalApplicabilityProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SensorResponsivityBiasCondition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponsivityBiasCondition =
  | {
      kind: "zero-bias-photovoltaic";
    }
  | {
      kind: "reverse-biased";
      magnitudeVolts: number;
    };
```

## SensorResponsivityElectricalApplicabilityProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorResponsivityElectricalApplicabilityProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  responseApplicationProfileId: string;
  spectralResponseProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  outputMeaning:
    "detector-terminal-photocurrent-magnitude";
  referenceConditions:
    SensorResponsivityElectricalConditions;
  conditionPolicy:
    SensorResponsivityElectricalConditionPolicy;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  evidence: readonly EvidenceProvenance[];
}
```

## SensorResponsivityElectricalConditionPolicy

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponsivityElectricalConditionPolicy =
  | {
      kind: "exact-match-required";
    }
  | {
      kind: "assume-compatible";
      limitation: string;
      evidence: readonly EvidenceProvenance[];
    };
```

## SensorResponsivityElectricalConditions

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorResponsivityElectricalConditions {
  bias: SensorResponsivityBiasCondition;
  readoutLoad:
    SensorResponsivityReadoutLoadCondition;
}
```

## SensorResponsivityPhotocurrent

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorResponsivityPhotocurrent {
  colorSamplingProfileId: string;
  responseProfileId: string;
  responseApplicationProfileId: string;
  operatingRangeProfileId: string;
  electricalApplicabilityProfileId:
    string;
  /** Engine-produced results populate the exact source color site. */
  site?: {
    x: number;
    y: number;
  };
  channelId: string;
  sourceResponseKind:
    "effective-spectral-responsivity";
  responseScope:
    SensorSpatioSpectralIrradianceReduction["responseScope"];
  responseReferencePlane:
    SensorResponseApplicationCompatibilityAssessment["requiredSourcePlane"];
  wavelengthBasis:
    SensorSpatioSpectralIrradianceReduction["wavelengthBasis"];
  wavelengthRangeNanometers:
    SensorSpatioSpectralIrradianceReduction["wavelengthRangeNanometers"];
  electricalReferenceConditions:
    SensorResponsivityElectricalConditions;
  operatingElectricalConditions:
    SensorResponsivityElectricalConditions;
  electricalConditionPolicy:
    SensorResponsivityElectricalConditionPolicy;
  electricalCompatibility:
    | "exact-match"
    | "assumed-compatible";
  spectralNodeCount: number;
  perWavelength:
    readonly SensorResponsivityWavelengthCurrentContribution[];
  photocurrentMagnitudeAmperes: number;
  currentSignConvention:
    "magnitude-only-no-circuit-polarity";
  summationMethod:
    "kahan-compensated";
  responseApplicationPerformed: true;
  spectralResponsivityApplied: true;
  quantumEfficiencyApplied: false;
  photonRateCalculated: false;
  electronRateCalculated: false;
  currentCalculated: true;
  chargeCalculated: false;
  temporalResponseModel:
    "quasi-static-steady-state-only";
  detectorBandwidthModeled: false;
  transimpedanceGainApplied: false;
  voltageCalculated: false;
  temporalIntegrationApplied: false;
  exposureDurationApplied: false;
  saturationAssessed: false;
  readoutElectronicsLinearityAssessed:
    false;
  shotNoiseApplied: false;
  readNoiseApplied: false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  responseUncertaintyPropagated: false;
  electricalApplicabilityUncertaintyPropagated:
    false;
  quadratureConvergenceErrorEstimated:
    false;
  componentEvidence: {
    electricalApplicability:
      readonly EvidenceProvenance[];
    electricalConditionAssumption:
      readonly EvidenceProvenance[];
  };
}
```

## SensorResponsivityReadoutLoadCondition

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponsivityReadoutLoadCondition =
  | {
      kind: "virtual-ground-current-readout";
    }
  | {
      kind: "finite-input-impedance";
      inputImpedanceOhms: number;
    };
```

## SensorResponsivityWavelengthCurrentContribution

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorResponsivityWavelengthCurrentContribution {
  spectralSampleIndex: number;
  wavelengthNanometers: number;
  wavelengthMeasureNanometers: number;
  geometricApertureIncidentSpectralFluxWattsPerNanometer:
    number;
  radiantPowerContributionWatts: number;
  spectralResponsivityAmperesPerWatt:
    number;
  responseInterpolationUsed: boolean;
  photocurrentMagnitudeContributionAmperes:
    number;
}
```
