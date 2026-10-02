// SPDX-License-Identifier: Apache-2.0

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { calculateSensorSpatialSamplingQuadrature, type CalculateSensorSpatialSamplingQuadratureInput } from "./spatial-sampling-quadrature.js";
import { calculateSensorSpectralQuadrature, type CalculateSensorSpectralQuadratureInput } from "./spectral-quadrature.js";
import { reduceSensorSpatioSpectralIrradiance, type ReduceSensorSpatioSpectralIrradianceInput } from "./spatio-spectral-reduction.js";
import { assessSensorResponseApplicationCompatibility, type AssessSensorResponseApplicationCompatibilityInput } from "./response-application-compatibility.js";
import { assessSensorResponseOperatingRange, type AssessSensorResponseOperatingRangeInput } from "./response-operating-range.js";
import { calculateSensorEqeElectronRate, type CalculateSensorEqeElectronRateInput } from "./eqe-electron-rate.js";
import { bindSensorRateToLocalExposure, type BindSensorRateToLocalExposureInput } from "./local-exposure-binding.js";
import { integrateStationarySensorRateOverLocalExposure, type SensorEqeExposureIntegration, type SensorRateTemporalStationarityProfile } from "./constant-rate-temporal-integration.js";

/** Explicit post-optics irradiance samples and evidence; no renderer or RGB conversion. */
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

/** Child envelopes retain separate provenance, validity and unpropagated uncertainty. */
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

/**
 * Compose validated irradiance reduction, response applicability/range, EQE
 * conversion and stationary local integration. The exposure value is suitable
 * for accumulated-charge photoSignal; dark/completeness/capacity/readout remain
 * explicit downstream inputs. Invalid or unsupported evidence fails closed.
 */
export function calculateSensorEqeLocalExposure(
  input: CalculateSensorEqeLocalExposureInput
): CalculationResult<SensorEqeLocalExposure> {
  const stages = calculateSensorEqeLocalRate(input);
  const { spatialQuadrature, spectralQuadrature, reduction, compatibility, operatingRange, electronRate, exposureBinding } = stages;
  const exposure = integrateStationarySensorRateOverLocalExposure({
    rate: electronRate.value, exposureBinding: exposureBinding.value,
    stationarityProfile: input.stationarityProfile
  });
  if (exposure.value.kind !== "eqe-expected-counts") {
    throw new InvalidScientificInputError("EQE local exposure requires expected electron counts.");
  }
  return approximationResult({
    upstreamOrigin: "declared-spatio-spectral-irradiance-samples",
    upstreamSceneAndOpticsVerified: false,
    spatialQuadrature, spectralQuadrature, reduction, compatibility, operatingRange, electronRate, exposureBinding,
    exposure: { ...exposure, value: exposure.value }
  }, "sensor-eqe-local-exposure-composition", "0.1.0", [
    "Irradiance node values and upstream scene/optics origin are declared, not verified.",
    "Finite quadrature and explicit response/stationarity evidence retain their child limitations.",
    "Uncertainty and quadrature convergence errors are not propagated or combined."
  ]);
}

/** Internal shared instantaneous path; no stationarity or exposure accumulation. */
export function calculateSensorEqeLocalRate(
  input: Omit<CalculateSensorEqeLocalExposureInput, "stationarityProfile">
): Omit<SensorEqeLocalExposure, "upstreamOrigin" | "upstreamSceneAndOpticsVerified" | "exposure"> {
  const spatialQuadrature = calculateSensorSpatialSamplingQuadrature({
    ...input.spatialSampling, colorSamplingProfile: input.colorSamplingProfile,
    colorSamplingBindingProfile: input.localExposure.bindingProfile,
    nativeRaster: input.localExposure.exposureWindowInput.nativeRaster
  });
  const spectralQuadrature = calculateSensorSpectralQuadrature({
    ...input.spectralSampling, colorSamplingProfile: input.colorSamplingProfile,
    spectralResponseProfile: input.spectralResponseProfile
  });
  const reduction = reduceSensorSpatioSpectralIrradiance({
    spatialQuadrature: spatialQuadrature.value, spectralQuadrature: spectralQuadrature.value,
    sampleValues: input.irradianceSamples
  });
  const compatibility = assessSensorResponseApplicationCompatibility({
    ...input.responseApplication, reduction: reduction.value
  });
  const operatingRange = assessSensorResponseOperatingRange({
    reduction: reduction.value, compatibility: compatibility.value,
    operatingRangeProfile: input.operatingRangeProfile
  });
  const electronRate = calculateSensorEqeElectronRate({
    reduction: reduction.value, compatibility: compatibility.value,
    operatingRange: operatingRange.value,
    colorSamplingProfile: input.colorSamplingProfile,
    spectralResponseProfile: input.spectralResponseProfile,
    ...(input.airPhotonEnergyContext === undefined ? {} : { airPhotonEnergyContext: input.airPhotonEnergyContext })
  });
  const exposureBinding = bindSensorRateToLocalExposure({
    ...input.localExposure, rate: electronRate.value,
    colorSamplingProfile: input.colorSamplingProfile
  });
  return { spatialQuadrature, spectralQuadrature, reduction, compatibility, operatingRange, electronRate, exposureBinding };
}
