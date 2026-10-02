# sensor/eqe-electron-rate.ts public contracts

Package **1.0.1**, root API **1.0.1**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSensorEqeElectronRate

Converts pre-response geometric-aperture spectral radiant power into
incident-photon rate and expected generated-electron rate.

This function applies response per wavelength node. It never applies one
broadband-average QE to total radiant power.

Temporal exposure integration remains downstream, so all outputs are rates
(per second), not photon/electron counts.

```ts
export function calculateSensorEqeElectronRate(
  input:
    CalculateSensorEqeElectronRateInput
): CalculationResult<SensorEqeElectronRate>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSensorEqeElectronRateInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateSensorEqeElectronRateInput {
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
  airPhotonEnergyContext?:
    SensorEqeAirPhotonEnergyContext;
}
```

## SensorEqeAirPhotonEnergyContext

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorEqeAirPhotonEnergyContext {
  samples:
    readonly SensorEqeAirRefractiveIndexSample[];
  operatingConditions?:
    AirRefractiveIndexReferenceConditions;
  conditionPolicy:
    AirRefractiveIndexConditionPolicy;
}
```

## SensorEqeAirRefractiveIndexSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorEqeAirRefractiveIndexSample {
  spectralSampleIndex: number;
  refractiveIndex:
    SourcedAirPhaseRefractiveIndex;
}
```

## SensorEqeElectronRate

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorEqeElectronRate {
  colorSamplingProfileId: string;
  responseProfileId: string;
  responseApplicationProfileId: string;
  operatingRangeProfileId: string;
  /** Engine-produced results populate the exact source color site. */
  site?: {
    x: number;
    y: number;
  };
  channelId: string;
  sourceResponseKind:
    | "effective-external-quantum-efficiency"
    | "separable-channel-filter-and-detector-eqe";
  responseScope:
    SensorSpatioSpectralIrradianceReduction["responseScope"];
  responseReferencePlane:
    SensorResponseApplicationCompatibilityAssessment["requiredSourcePlane"];
  wavelengthBasis:
    SensorSpatioSpectralIrradianceReduction["wavelengthBasis"];
  wavelengthRangeNanometers:
    SensorSpatioSpectralIrradianceReduction["wavelengthRangeNanometers"];
  spectralNodeCount: number;
  perWavelength:
    readonly SensorEqeWavelengthRateContribution[];
  incidentPhotonRatePerSecond: number;
  expectedGeneratedElectronRatePerSecond:
    number;
  summationMethod:
    "kahan-compensated";
  responseApplicationPerformed: true;
  quantumEfficiencyApplied: true;
  spectralResponsivityApplied: false;
  channelFilterTransmissionApplied:
    boolean;
  photonRateCalculated: true;
  electronRateCalculated: true;
  photonCountCalculated: false;
  electronCountCalculated: false;
  currentCalculated: false;
  temporalIntegrationApplied: false;
  exposureDurationApplied: false;
  saturationAssessed: false;
  shotNoiseApplied: false;
  readNoiseApplied: false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  responseUncertaintyPropagated: false;
  photonEnergyUncertaintyPropagated: false;
  quadratureConvergenceErrorEstimated:
    false;
}
```

## SensorEqeWavelengthRateContribution

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorEqeWavelengthRateContribution {
  spectralSampleIndex: number;
  wavelengthNanometers: number;
  wavelengthMeasureNanometers: number;
  geometricApertureIncidentSpectralFluxWattsPerNanometer:
    number;
  radiantPowerContributionWatts: number;
  vacuumWavelengthNanometers: number;
  photonEnergyJoules: number;
  wavelengthConversion:
    | "vacuum-identity"
    | "air-to-vacuum-via-phase-refractive-index";
  phaseRefractiveIndexUsed?: number;
  airConditionCompatibility?:
    | "exact-match"
    | "assumed-compatible";
  airRefractiveIndexEvidence?:
    readonly EvidenceProvenance[];
  incidentPhotonRatePerSecond: number;
  effectiveExternalQuantumEfficiency: number;
  responseComposition:
    | "direct-effective-response"
    | "channel-filter-transmittance-times-detector-eqe";
  channelFilterTransmittance?: number;
  detectorExternalQuantumEfficiency?: number;
  responseInterpolationUsed: boolean;
  expectedGeneratedElectronRatePerSecond:
    number;
}
```
