# sensor/eqe-local-exposure.ts public contracts

Package **1.2.0**, root API **1.2.0**. [Navigation](../API_REFERENCE.md) · [Developer guide](../DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## calculateSensorEqeLocalExposure

Compose validated irradiance reduction, response applicability/range, EQE
conversion and stationary local integration. The exposure value is suitable
for accumulated-charge photoSignal; dark/completeness/capacity/readout remain
explicit downstream inputs. Invalid or unsupported evidence fails closed.

```ts
export function calculateSensorEqeLocalExposure(
  input: CalculateSensorEqeLocalExposureInput
): CalculationResult<SensorEqeLocalExposure>;
```

This call is synchronous; any supplied provider must follow its explicit synchronous contract.

## CalculateSensorEqeLocalExposureInput

Explicit post-optics irradiance samples and evidence; no renderer or RGB conversion.

```ts
export interface CalculateSensorEqeLocalExposureInput {
  /** Physical area, registered aperture/lattice, AA support and destination site. */
  spatialSampling: Omit<CalculateSensorSpatialSamplingQuadratureInput,
    "colorSamplingProfile" | "colorSamplingBindingProfile" | "nativeRaster">;
  /** Explicit wavelength basis/range, channel and midpoint subdivision budget. */
  spectralSampling: Omit<CalculateSensorSpectralQuadratureInput,
    "colorSamplingProfile" | "spectralResponseProfile">;
  /** One W/m²/nm value per identified pre-AA spatial/spectral node. */
  irradianceSamples: ReduceSensorSpatioSpectralIrradianceInput["sampleValues"];
  /** Source-plane, collection-area and reference-condition evidence. */
  responseApplication: Omit<AssessSensorResponseApplicationCompatibilityInput, "reduction">;
  /** Evidence-backed linear response domain; no extrapolation is authorized. */
  operatingRangeProfile: AssessSensorResponseOperatingRangeInput["operatingRangeProfile"];
  /** Destination CFA/channel identity shared by every composed step. */
  colorSamplingProfile: CalculateSensorEqeElectronRateInput["colorSamplingProfile"];
  /** Direct or separable EQE response; A/W responsivity is unsupported here. */
  spectralResponseProfile: CalculateSensorEqeElectronRateInput["spectralResponseProfile"];
  /** Required explicit photon-energy conversion context for air wavelengths. */
  airPhotonEnergyContext?: CalculateSensorEqeElectronRateInput["airPhotonEnergyContext"];
  /** Native one-to-one site binding and one opening/closing shutter event. */
  localExposure: Omit<BindSensorRateToLocalExposureInput, "rate" | "colorSamplingProfile">;
  /** Separate declaration authorizing a constant rate across this exact window. */
  stationarityProfile: SensorRateTemporalStationarityProfile;
}
```

## SensorEqeLocalExposure

Child envelopes retain separate provenance, validity and unpropagated uncertainty.

```ts
export interface SensorEqeLocalExposure {
  upstreamOrigin: "declared-spatio-spectral-irradiance-samples";
  upstreamSceneAndOpticsVerified: false;
  spatialQuadrature: ReturnType<typeof calculateSensorSpatialSamplingQuadrature>;
  spectralQuadrature: ReturnType<typeof calculateSensorSpectralQuadrature>;
  reduction: ReturnType<typeof reduceSensorSpatioSpectralIrradiance>;
  compatibility: ReturnType<typeof assessSensorResponseApplicationCompatibility>;
  operatingRange: ReturnType<typeof assessSensorResponseOperatingRange>;
  electronRate: ReturnType<typeof calculateSensorEqeElectronRate>;
  exposureBinding: ReturnType<typeof bindSensorRateToLocalExposure>;
  exposure: CalculationResult<SensorEqeExposureIntegration>;
}
```
