# sensor/spatio-spectral-reduction.ts public contracts

Package **1.0.0**, root API **0.116.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## reduceSensorSpatioSpectralIrradiance

Reduces explicitly supplied sensor-plane spectral irradiance E_lambda(x,y)
over the Cartesian product of an existing spatial quadrature and spectral
quadrature.

The supplied density unit is W/m^2/nm and wavelengthMeasureNanometers is
d-lambda in nm, so their direct product has units W/m^2. Do not convert
d-lambda to metres unless the spectral-density denominator is converted
consistently.

Spatial area integration uses the spatial quadrature's geometric area
measures converted from square micrometres to square metres. The result is
geometric-aperture incident radiant flux only; geometric area is not upgraded
to an effective radiometric collection area.

This reducer deliberately stops before sensor response. The spectral plan was
derived from a specific response channel so its support/knots are useful, but
QE, A/W responsivity and channel-filter transmission are not applied here.
Response-scope/source-plane matching therefore remains an explicit later
composition step.

```ts
export function reduceSensorSpatioSpectralIrradiance(
  input:
    ReduceSensorSpatioSpectralIrradianceInput
): CalculationResult<SensorSpatioSpectralIrradianceReduction>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## ReduceSensorSpatioSpectralIrradianceInput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ReduceSensorSpatioSpectralIrradianceInput {
  spatialQuadrature: SensorSpatialSamplingQuadrature;
  spectralQuadrature: SensorSpectralQuadrature;
  /**
   * Exactly one explicitly identified E_lambda(x,y) value for every Cartesian
   * product of spatial and spectral quadrature nodes.
   *
   * Ordering is not significant; node identity is.
   */
  sampleValues: readonly SensorSpatioSpectralIrradianceSample[];
}
```

## SensorSpatioSpectralIrradianceReduction

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorSpatioSpectralIrradianceReduction {
  colorSamplingProfileId: string;
  samplingApertureProfileId?: string;
  opticalStackProfileId?: string;
  site: {
    x: number;
    y: number;
  };
  channelId: string;
  responseProfileId: string;
  sourceResponseKind:
    SensorSpectralQuadrature["sourceResponseKind"];
  responseScope:
    SensorSpectralQuadrature["responseScope"];
  responseScientificStatus:
    SensorSpectralQuadrature["responseScientificStatus"];
  responseUncertainty:
    SensorSpectralQuadrature["responseUncertainty"];
  responseChannelBinding?:
    SensorSpectralQuadrature["responseChannelBinding"];
  responseReferenceConditions?:
    SensorSpectralQuadrature["responseReferenceConditions"];
  wavelengthBasis:
    SensorSpectralQuadrature["wavelengthBasis"];
  wavelengthBasisResolved: boolean;
  wavelengthRangeNanometers:
    SensorSpectralQuadrature["wavelengthRangeNanometers"];
  responseDeclaredWavelengthRangeNanometers:
    SensorSpectralQuadrature["responseDeclaredWavelengthRangeNanometers"];
  outputMeaning:
    "pre-response-spatio-spectral-radiometric-reduction";
  inputValueDomain: {
    kind: "radiometric-spectral-irradiance";
    unit: "W/m^2/nm";
    semantic:
      "pre-aa-pre-response-sensor-plane-spectral-irradiance";
  };
  spatialNodeCount: number;
  spectralNodeCount: number;
  combinedSampleCount: number;
  sourceValuesMatchedBy:
    "spatial-node-identity-plus-spectral-sample-index-and-wavelength";
  sourceValuesSuppliedForAllCombinedNodes: true;
  outsideImagingAreaSourceValuesRequired: boolean;
  geometricApertureAreaSquareMicrometers?: number;
  nominalSiteCellAreaSquareMicrometers?: number;
  geometricSensitiveAreaFractionOfLatticeCell?: number;
  perWavelength:
    readonly SensorSpatioSpectralWavelengthReduction[];
  /**
   * Integral over the requested wavelength interval of the spatially averaged
   * spectral irradiance. Units: W/m^2.
   */
  wavelengthIntegratedSpatialAverageIrradianceWattsPerSquareMeter:
    number;
  /**
   * Integral over the requested wavelength interval and geometric aperture
   * area. Units: W.
   *
   * This is pre-sensor-response incident radiant flux over the declared
   * wavelength interval, not collected optical power or generated charge.
   */
  wavelengthIntegratedGeometricApertureIncidentFluxWatts:
    number;
  spatialIntegrationApplied: true;
  wavelengthIntegrationApplied: true;
  spectralResponsePlanUsedForWavelengthSupport: true;
  spectralResponseApplicationPerformed: false;
  responseScopeMatchedToSourcePlane: false;
  quantumEfficiencyApplied: false;
  spectralResponsivityApplied: false;
  channelFilterTransmissionApplied: false;
  opticalTransmissionAppliedByReducer: false;
  radiometricCollectionAreaEstablished: false;
  temporalIntegrationApplied: false;
  exposureDurationApplied: false;
  photonsCalculated: false;
  electronsCalculated: false;
  currentCalculated: false;
  shotNoiseApplied: false;
  readNoiseApplied: false;
  adcQuantizationApplied: false;
  rawCodeValueProduced: false;
  demosaicOrReconstructionApplied: false;
  convergenceErrorEstimated: false;
  componentEvidence: {
    spatial:
      SensorSpatialSamplingQuadrature["componentEvidence"];
    spectral:
      SensorSpectralQuadrature["componentEvidence"];
  };
}
```

## SensorSpatioSpectralIrradianceSample

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorSpatioSpectralIrradianceSample {
  node: SensorSpatioSpectralNodeIdentity;
  /**
   * Spectral irradiance evaluated at the spatial quadrature node's
   * preAntiAliasingSourcePointMm and this spectral node's wavelength.
   *
   * Units: W/m^2/nm.
   */
  spectralIrradianceWattsPerSquareMeterPerNanometer: number;
}
```

## SensorSpatioSpectralNodeIdentity

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorSpatioSpectralNodeIdentity {
  spatialNode: SensorSpatialQuadratureNodeIdentity;
  spectralSampleIndex: number;
  wavelengthNanometers: number;
}
```

## SensorSpatioSpectralWavelengthReduction

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface SensorSpatioSpectralWavelengthReduction {
  spectralSampleIndex: number;
  wavelengthNanometers: number;
  wavelengthMeasureNanometers: number;
  normalizedWavelengthWeight: number;
  /**
   * Spatially reduced spectral irradiance at this wavelength.
   * Units: W/m^2/nm.
   */
  normalizedSpatialAverageSpectralIrradianceWattsPerSquareMeterPerNanometer:
    number;
  /**
   * Spectral radiant flux density incident over the geometric sensitive
   * aperture after the declared normalized AA redistribution.
   * Units: W/nm.
   *
   * This uses geometric area, not an established radiometric collection area.
   */
  geometricApertureIncidentSpectralFluxWattsPerNanometer: number;
  /**
   * Contribution to the wavelength-integrated spatial average.
   * Units: W/m^2.
   */
  wavelengthIntegratedSpatialAverageContributionWattsPerSquareMeter: number;
  /**
   * Contribution to wavelength-integrated geometric-aperture incident flux.
   * Units: W.
   */
  wavelengthIntegratedGeometricApertureIncidentFluxContributionWatts: number;
}
```
