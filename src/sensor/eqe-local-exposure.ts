// SPDX-License-Identifier: Apache-2.0

/**
 * Photo signal for one site over one exposure, assuming constant light. It chains four existing steps:
 * reduce irradiance samples over the site, check the response applies and is in range, convert with
 * EQE (external quantum efficiency), and integrate the constant rate over the local exposure.
 *
 * The result can be used as the photoSignal for accumulated charge. Dark current, completeness,
 * capacity and readout are separate later inputs. Invalid or unsupported evidence is rejected.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

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
import { requireInputObject } from "../core/record-validation.js";

/** Input: explicit irradiance samples after the optics, with evidence. No renderer or RGB conversion is involved. */
export interface CalculateSensorEqeLocalExposureInput {
  /** Physical area, the site's aperture on its grid, anti-aliasing (AA) support and the destination site. */
  spatialSampling: Omit<CalculateSensorSpatialSamplingQuadratureInput,
    "colorSamplingProfile" | "colorSamplingBindingProfile" | "nativeRaster">;
  /** Wavelength basis and range, channel, and the budget for midpoint subdivisions. */
  spectralSampling: Omit<CalculateSensorSpectralQuadratureInput,
    "colorSamplingProfile" | "spectralResponseProfile">;
  /** One value in W/m²/nm for each identified spatial and spectral node, before anti-aliasing. */
  irradianceSamples: ReduceSensorSpatioSpectralIrradianceInput["sampleValues"];
  /** Evidence about the source plane, collection area and reference conditions of the response data. */
  responseApplication: Omit<AssessSensorResponseApplicationCompatibilityInput, "reduction">;
  /** Evidence-backed range in which the response is linear. No extrapolation beyond it is allowed. */
  operatingRangeProfile: AssessSensorResponseOperatingRangeInput["operatingRangeProfile"];
  /** The destination CFA site and channel, shared by every step. */
  colorSamplingProfile: CalculateSensorEqeElectronRateInput["colorSamplingProfile"];
  /** EQE response, given directly or as separable factors. A/W responsivity is not supported here. */
  spectralResponseProfile: CalculateSensorEqeElectronRateInput["spectralResponseProfile"];
  /** Required for air wavelengths: the explicit context for converting to photon energy. */
  airPhotonEnergyContext?: CalculateSensorEqeElectronRateInput["airPhotonEnergyContext"];
  /** One-to-one native site binding and one shutter opening and closing. */
  localExposure: Omit<BindSensorRateToLocalExposureInput, "rate" | "colorSamplingProfile">;
  /** A separate declaration that the rate is constant over this exact window. */
  stationarityProfile: SensorRateTemporalStationarityProfile;
}

/** Result. Each step's result keeps its own provenance, validity and uncertainty; uncertainties are not combined. */
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
 * Runs irradiance reduction, the response applicability and range checks, EQE
 * conversion and constant-rate integration over the local exposure. The result
 * can be the photoSignal for accumulated charge. Dark current, completeness,
 * capacity and readout are separate later inputs. Invalid or unsupported
 * evidence is rejected.
 */
export function calculateSensorEqeLocalExposure(
  input: CalculateSensorEqeLocalExposureInput
): CalculationResult<SensorEqeLocalExposure> {
  requireInputObject(input, "calculateSensorEqeLocalExposure input");
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

/** Internal: the same chain for one instant (a rate). No stationarity check and no integration over the exposure. */
export function calculateSensorEqeLocalRate(
  input: Omit<CalculateSensorEqeLocalExposureInput, "stationarityProfile">
): Omit<SensorEqeLocalExposure, "upstreamOrigin" | "upstreamSceneAndOpticsVerified" | "exposure"> {
  requireInputObject(input.localExposure, "localExposure");
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
