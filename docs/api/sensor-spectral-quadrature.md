# sensor/spectral-quadrature.ts public contracts

Package **1.5.0**, root API **1.5.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSensorSpectralQuadrature

Builds deterministic wavelength quadrature nodes for one exact sensor
response channel without applying the response to a source spectrum.

The requested wavelength range must lie fully inside the response channel's
declared usable range. Response-curve knots and optional caller-provided
continuous-spectrum/optics breakpoints partition that range. Each segment is
then subdivided so no midpoint subinterval exceeds
maximumSubintervalWidthNanometers.

wavelengthMeasureNanometers is d-lambda in nanometres. It is not a
dimensionless response weight. Future integration must use a source spectral
density expressed per nanometre or explicitly convert units before
multiplying by this measure.

This function deliberately does not apply QE or A/W responsivity. Those
representations have different compatible downstream signal domains: QE is
photon-to-electron efficiency, while A/W responsivity relates incident
radiant power to electrical current. A later versioned composition must also
match responseScope to the source plane and collection-area semantics before
integrating any signal.

```ts
export function calculateSensorSpectralQuadrature(
  input:
    CalculateSensorSpectralQuadratureInput
): CalculationResult<SensorSpectralQuadrature>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSensorSpectralQuadratureInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface CalculateSensorSpectralQuadratureInput {
  colorSamplingProfile: SensorColorSamplingProfile;
  spectralResponseProfile: SensorSpectralResponseProfile;
  channelId: string;
  wavelengthBasis: SpectralWavelengthBasis;
  /**
   * Explicit wavelength interval to sample. This API validates the interval
   * against sensor-response support only; it does not establish scene-spectrum
   * or optical-transmission coverage.
   */
  wavelengthRangeNanometers:
    SensorSpectralWavelengthRangeNanometers;
  /**
   * Hard upper bound on each midpoint subinterval width.
   *
   * Response knots and optional additional breakpoints split the requested
   * range first; each resulting segment is then subdivided until every
   * subinterval is no wider than this value.
   */
  maximumSubintervalWidthNanometers: number;
  /**
   * Optional strictly increasing wavelength breakpoints from other continuous
   * spectral factors, such as scene spectral-density or optical-transmission
   * interpolation knots. Values must lie strictly inside the requested range.
   *
   * These coordinates do not assert that those external factors are actually
   * available or valid over the requested range.
   */
  additionalBreakpointsNanometers?:
    readonly number[];
}
```

## SensorSpectralQuadrature

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorSpectralQuadrature {
  profileId: string;
  colorSamplingProfileId: string;
  channelId: string;
  sourceResponseKind:
    SensorSpectralResponseProfile["channels"][number]["kind"];
  responseScope:
    SensorSpectralResponseProfile["channels"][number]["responseScope"];
  responseScientificStatus:
    SensorSpectralResponseScientificStatus;
  responseUncertainty:
    SensorSpectralResponseUncertainty;
  responseChannelBinding?: import("./spectral-response.js").SensorSpectralResponseChannelBinding;
  responseReferenceConditions?:
    SensorSpectralReferenceConditions;
  wavelengthBasis: SpectralWavelengthBasis;
  wavelengthBasisResolved: boolean;
  wavelengthRangeNanometers:
    SensorSpectralWavelengthRangeNanometers;
  responseDeclaredWavelengthRangeNanometers:
    SensorSpectralWavelengthRangeNanometers;
  quadratureScheme:
    "response-breakpoint-aware-bounded-midpoint";
  segmentBoundarySource:
    "requested-range-plus-response-knots-plus-optional-additional-breakpoints";
  /**
   * Ordered unique segment boundaries, including requested range endpoints.
   */
  segmentBoundariesNanometers:
    readonly number[];
  maximumSubintervalWidthNanometers: number;
  segmentCount: number;
  totalNodeCount: number;
  normalizedWavelengthWeightSum: number;
  wavelengthMeasureSumNanometers: number;
  nodes: readonly SensorSpectralQuadratureNode[];
  responseKnotAlignmentIncluded: true;
  componentEvidence: {
    colorSamplingProfile: readonly EvidenceProvenance[];
    profile: readonly EvidenceProvenance[];
    channel: readonly EvidenceProvenance[];
    curves:
      readonly (readonly EvidenceProvenance[])[];
  };
  /**
   * Hard scientific boundaries.
   */
  responseValuesIncluded: false;
  responseApplicationPerformed: false;
  sourceSpectralValuesIncluded: false;
  spectralIrradianceIncluded: false;
  spectralPhotonIrradianceIncluded: false;
  commonSpectralCoverageValidated: false;
  continuousSpectralDensityQuadratureOnly: true;
  discreteLineSpectrumIncluded: false;
  opticalTransmissionIncludedByQuadrature: false;
  wavelengthIntegrationPerformed: false;
  spatialIntegrationPerformed: false;
  temporalIntegrationPerformed: false;
  photonsCalculated: false;
  electronsCalculated: false;
  rawCodeValueProduced: false;
  convergenceErrorEstimated: false;
}
```

## SensorSpectralQuadratureNode

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorSpectralQuadratureNode {
  spectralSampleIndex: number;
  segmentIndex: number;
  subdivisionIndex: number;
  segmentSubdivisionCount: number;
  /**
   * Midpoint wavelength for this subinterval. Units: nm in wavelengthBasis.
   */
  wavelengthNanometers: number;
  /**
   * d-lambda represented by this node. Units: nm.
   *
   * This is wavelength measure only. It is not response-weighted throughput,
   * photon count, radiant energy, current, or a dimensionless probability.
   */
  wavelengthMeasureNanometers: number;
  /**
   * Dimensionless wavelength measure normalized by the requested range width.
   *
   * This may be useful for averages, but it is not a sensor-response weight.
   */
  normalizedWavelengthWeight: number;
}
```

## SensorSpectralWavelengthRangeNanometers

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type SensorSpectralWavelengthRangeNanometers =
  SpectralWavelengthRangeNanometers;
```
