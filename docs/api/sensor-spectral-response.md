# sensor/spectral-response.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## EffectiveSensorResponseScope

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type EffectiveSensorResponseScope =
  | "site-incident-effective-channel-response"
  | "sensor-package-incident-effective-channel-response";
```

## parseSensorSpectralResponseProfile

Parses reusable wavelength-dependent response data for semantic sensor
channels without inferring response from channel names or CFA family.

Embedded multi-point curves require reusable-data or Photivra-owned evidence.
Public/factual references without reuse permission may support metadata but
cannot by themselves authorize copying numeric curve data into the engine.

```ts
export function parseSensorSpectralResponseProfile(
  value: unknown
): SensorSpectralResponseProfile;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolvedSensorSpectralResponse

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolvedSensorSpectralResponse {
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  sourceResponseKind:
    SensorSpectralChannelResponse["kind"];
  responseScope:
    SensorSpectralChannelResponse["responseScope"];
  scientificStatus:
    SensorSpectralResponseScientificStatus;
  uncertainty:
    SensorSpectralResponseUncertainty;
  wavelengthNanometers: number;
  wavelengthBasis: SpectralWavelengthBasis;
  wavelengthBasisResolved: boolean;
  declaredWavelengthRangeNanometers: {
    minimum: number;
    maximum: number;
  };
  interpolation:
    "piecewise-linear";
  interpolationUsed: boolean;
  outsideRangeBehavior:
    "fail-closed";
  response:
    ResolvedSensorSpectralResponseValue;
  referenceConditions?:
    SensorSpectralReferenceConditions;
  conditionDependenceModeled: false;
  fieldAngleDependenceModeled: false;
  temperatureDependenceModeled: false;
  polarizationDependenceModeled: false;
  spectralIrradianceIntegrated: false;
  wavelengthIntegrationPerformed: false;
  qeResponsivityConversionPerformed: false;
  photonsCalculated: false;
  electronsCalculated: false;
  rawCodeValueProduced: false;
  componentEvidence: {
    profile: readonly EvidenceProvenance[];
    channel: readonly EvidenceProvenance[];
    curves:
      readonly (readonly EvidenceProvenance[])[];
  };
}
```

## ResolvedSensorSpectralResponseValue

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ResolvedSensorSpectralResponseValue =
  | {
      kind:
        "effective-external-quantum-efficiency";
      externalQuantumEfficiency: number;
      composition:
        | "direct-effective-response"
        | "channel-filter-transmittance-times-detector-eqe";
      channelFilterTransmittance?: number;
      detectorExternalQuantumEfficiency?: number;
    }
  | {
      kind:
        "effective-spectral-responsivity";
      amperesPerWatt: number;
      composition:
        "direct-effective-response";
    };
```

## resolveSensorSpectralResponseAtWavelength

Public spectral-response resolver for untrusted/raw profile inputs.

Profiles are parsed once here. Internal composition code that has already
parsed both profiles may use resolveParsedSensorSpectralResponseAtWavelength
to avoid repeating full profile parsing for every wavelength node.

```ts
export function resolveSensorSpectralResponseAtWavelength(
  input:
    ResolveSensorSpectralResponseAtWavelengthInput
): CalculationResult<ResolvedSensorSpectralResponse>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ResolveSensorSpectralResponseAtWavelengthInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ResolveSensorSpectralResponseAtWavelengthInput {
  colorSamplingProfile:
    SensorColorSamplingProfile;
  spectralResponseProfile:
    SensorSpectralResponseProfile;
  channelId: string;
  wavelengthNanometers: number;
  wavelengthBasis: SpectralWavelengthBasis;
}
```

## SensorSpectralChannelResponse

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorSpectralChannelResponse =
  | (SensorSpectralChannelResponseBase & {
      kind:
        "effective-external-quantum-efficiency";
      responseScope:
        EffectiveSensorResponseScope;
      externalQuantumEfficiency:
        SpectralFractionCurve;
    })
  | (SensorSpectralChannelResponseBase & {
      kind:
        "effective-spectral-responsivity";
      responseScope:
        EffectiveSensorResponseScope;
      spectralResponsivity:
        SpectralResponsivityCurve;
    })
  | (SensorSpectralChannelResponseBase & {
      kind:
        "separable-channel-filter-and-detector-eqe";
      responseScope:
        "site-incident-channel-filter-times-detector-eqe";
      combinationRule: "multiply";
      channelFilterTransmittance:
        SpectralFractionCurve;
      detectorExternalQuantumEfficiency:
        SpectralFractionCurve;
    });
```

## SensorSpectralReferenceConditions

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorSpectralReferenceConditions {
  temperatureC?: number;
  incidenceAngleDegreesFromNormal?: number;
  polarization?:
    | "unpolarized"
    | "unspecified";
}
```

## SensorSpectralResponseChannelBinding

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorSpectralResponseChannelBinding {
  format:
    "photivra-spectral-channel-response-canonical-json-v1";
  canonicalJson: string;
}
```

## SensorSpectralResponseProfile

Versioned channel-response data linked to one exact color-sampling profile.
Each channel declares effective EQE, effective A/W response or separable filter
and detector EQE, sampled support/interpolation and an explicit wavelength basis.
Reference conditions, evidence and uncertainty retain their own validity. Names
such as red/green/blue never supply missing curves or justify extrapolation.

```ts
export interface SensorSpectralResponseProfile {
  schemaVersion: "0.1.0";
  profileId: string;
  colorSamplingProfileId: string;
  evidence: readonly EvidenceProvenance[];
  channels:
    readonly SensorSpectralChannelResponse[];
}
```

## SensorSpectralResponseScientificStatus

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorSpectralResponseScientificStatus =
  | "calibrated"
  | "approximation";
```

## SensorSpectralResponseUncertainty

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorSpectralResponseUncertainty =
  | {
      kind: "relative";
      fraction: number;
      basis: string;
    }
  | {
      kind: "not-quantified";
      limitation: string;
    };
```

## SpectralFractionCurve

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SpectralFractionCurve
  extends SpectralCurveBase {
  samples: readonly SpectralFractionSample[];
}
```

## SpectralFractionSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SpectralFractionSample
  extends SpectralWavelengthSample {
  value: number;
}
```

## SpectralResponsivityCurve

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SpectralResponsivityCurve
  extends SpectralCurveBase {
  samples: readonly SpectralResponsivitySample[];
}
```

## SpectralResponsivitySample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SpectralResponsivitySample
  extends SpectralWavelengthSample {
  amperesPerWatt: number;
}
```
