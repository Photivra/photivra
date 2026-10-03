# sensor/response-operating-range.ts public contracts

Package **1.1.0**, root API **1.1.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## assessSensorResponseOperatingRange

Assess every declared spectral-bin input against operating applicability and superposition before
authorizing instantaneous response conversion.

Operating-range assessment preserves incident power versus irradiance, wavelength support, reference
conditions and declared nonlinearity criterion. Per-bin conversion requires spectral-bin
applicability and spatial linear superposition. Valid mean input must not conceal an invalid bright
local sub-aperture.

```ts
export function assessSensorResponseOperatingRange(
  input:
    AssessSensorResponseOperatingRangeInput
): CalculationResult<SensorResponseOperatingRangeAssessment>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## AssessSensorResponseOperatingRangeInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AssessSensorResponseOperatingRangeInput {
  reduction:
    SensorSpatioSpectralIrradianceReduction;
  compatibility:
    SensorResponseApplicationCompatibilityAssessment;
  operatingRangeProfile:
    SensorResponseOperatingRangeProfile;
}
```

## parseSensorResponseOperatingRangeProfile

Validate an untrusted declaration and return the normalized typed contract. Unknown enum values,
missing required fields and incompatible scientific data fail at this boundary.

Operating-range assessment preserves incident power versus irradiance, wavelength support, reference
conditions and declared nonlinearity criterion. Per-bin conversion requires spectral-bin
applicability and spatial linear superposition. Valid mean input must not conceal an invalid bright
local sub-aperture.

```ts
export function parseSensorResponseOperatingRangeProfile(
  value: unknown
): SensorResponseOperatingRangeProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## SensorResponseLinearityCriterion

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorResponseLinearityCriterion {
  maximumAbsoluteRelativeDeviation: number;
}
```

## SensorResponseOperatingInputRange

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponseOperatingInputRange =
  | {
      kind:
        "wavelength-integrated-geometric-aperture-radiant-power";
      unit: "W";
      minimumInclusive: number;
      maximumInclusive: number;
    }
  | {
      kind:
        "wavelength-integrated-spatial-average-irradiance";
      unit: "W/m^2";
      minimumInclusive: number;
      maximumInclusive: number;
    };
```

## SensorResponseOperatingRangeAssessment

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorResponseOperatingRangeAssessment {
  operatingRangeProfileId: string;
  responseApplicationProfileId: string;
  spectralResponseProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  requiredSignalPath:
    SensorResponseSignalPath;
  inputRange:
    SensorResponseOperatingInputRange;
  evaluatedInput: {
    kind:
      SensorResponseOperatingInputRange["kind"];
    unit:
      SensorResponseOperatingInputRange["unit"];
    value: number;
  };
  wavelengthApplicability:
    SensorResponseOperatingWavelengthApplicability;
  evaluatedWavelengthRangeNanometers: {
    minimum: number;
    maximum: number;
  };
  linearityCriterion:
    SensorResponseLinearityCriterion;
  spectralInputModel:
    SensorResponseOperatingSpectralInputModel;
  evaluatedSpectralNodeInputs?:
    readonly {
      spectralSampleIndex: number;
      wavelengthNanometers: number;
      wavelengthMeasureNanometers: number;
      kind:
        SensorResponseOperatingInputRange["kind"];
      unit:
        SensorResponseOperatingInputRange["unit"];
      value: number;
    }[];
  spectralNodeRangeCompatibilityAssessed:
    boolean;
  spatialLinearityModel:
    SensorResponseOperatingSpatialLinearityModel;
  referenceConditionPolicy:
    SensorResponseReferenceConditionPolicy;
  referenceConditions?:
    SensorSpectralReferenceConditions;
  operatingConditions?:
    SensorSpectralReferenceConditions;
  operatingRangeCompatibilityAssessed: true;
  instantaneousResponseRangeCompatible: boolean;
  status:
    | "broadband-range-compatible"
    | "broadband-range-compatible-approximation"
    | "rate-conversion-authorized"
    | "rate-conversion-authorized-approximation"
    | "blocked";
  blockers:
    readonly SensorResponseOperatingRangeBlocker[];
  responseRateConversionAuthorized: boolean;
  responseApplicationPerformed: false;
  temporalIntegrationAuthorized: false;
  exposureDomainLinearityAssessed: false;
  accumulatedChargeLinearityAssessed: false;
  saturationAssessed: false;
  photonConversionPerformed: false;
  electronConversionPerformed: false;
  currentConversionPerformed: false;
  componentEvidence: {
    operatingRange:
      readonly EvidenceProvenance[];
    referenceConditionAssumption:
      readonly EvidenceProvenance[];
    spatialLinearity:
      readonly EvidenceProvenance[];
    structuralCompatibility:
      SensorResponseApplicationCompatibilityAssessment["componentEvidence"];
  };
}
```

## SensorResponseOperatingRangeBlocker

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponseOperatingRangeBlocker =
  | "structural-compatibility-not-established"
  | "response-application-profile-id-mismatch"
  | "spectral-response-profile-id-mismatch"
  | "color-sampling-profile-id-mismatch"
  | "channel-id-mismatch"
  | "wavelength-basis-unresolved"
  | "wavelength-basis-mismatch"
  | "wavelength-range-outside-linearity-applicability"
  | "input-below-linearity-range"
  | "input-above-linearity-range"
  | "spectral-bin-width-outside-linearity-applicability"
  | "spectral-bin-input-below-linearity-range"
  | "spectral-bin-input-above-linearity-range"
  | "spatial-linearity-superposition-not-established"
  | "operating-conditions-not-declared"
  | "linearity-operating-conditions-mismatch";
```

## SensorResponseOperatingRangeProfile

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorResponseOperatingRangeProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  responseApplicationProfileId: string;
  spectralResponseProfileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  evidence: readonly EvidenceProvenance[];
  inputRange:
    SensorResponseOperatingInputRange;
  wavelengthApplicability:
    SensorResponseOperatingWavelengthApplicability;
  linearityCriterion:
    SensorResponseLinearityCriterion;
  /**
   * Optional for backward compatibility. Omission parses as not-established
   * and blocks new response-rate authorization.
   */
  spatialLinearityModel?:
    SensorResponseOperatingSpatialLinearityModel;
  /**
   * Optional for backward compatibility. Omission means the calibration only
   * establishes a broadband-integrated operating range and cannot authorize
   * wavelength-by-wavelength response conversion.
   */
  spectralInputModel?:
    SensorResponseOperatingSpectralInputModel;
  referenceConditions?:
    SensorSpectralReferenceConditions;
  referenceConditionPolicy:
    SensorResponseReferenceConditionPolicy;
}
```

## SensorResponseOperatingSpatialLinearityModel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponseOperatingSpatialLinearityModel =
  | {
      kind:
        "linear-superposition-over-geometric-aperture";
      scientificStatus:
        SensorSpectralResponseScientificStatus;
      evidence: readonly EvidenceProvenance[];
      limitation?: string;
    }
  | {
      kind: "not-established";
      limitation: string;
    };
```

## SensorResponseOperatingSpectralInputModel

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorResponseOperatingSpectralInputModel =
  | {
      kind: "broadband-integrated-only";
    }
  | {
      kind: "per-spectral-bin";
      maximumBinWidthNanometers: number;
      scientificStatus:
        SensorSpectralResponseScientificStatus;
      evidence: readonly EvidenceProvenance[];
      limitation?: string;
    };
```

## SensorResponseOperatingWavelengthApplicability

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorResponseOperatingWavelengthApplicability {
  wavelengthBasis:
    Exclude<SpectralWavelengthBasis, "unspecified">;
  minimumNanometers: number;
  maximumNanometers: number;
  containment:
    "requested-range-must-be-contained";
}
```
