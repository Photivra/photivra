// SPDX-License-Identifier: Apache-2.0

/**
 * Photo signal for one site over one exposure when the light changes over time.
 *
 * The response checks and EQE (external quantum efficiency) conversion run separately at each
 * declared midpoint time of the shutter interval. The rates are then multiplied by their time steps
 * and summed (numerical quadrature). This does not claim the light is constant, and does not prove
 * the sum has converged. All samples share one profile and geometry, so rates from different sites
 * or shutter events cannot be mixed. No renderer runs here.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import { sumTemporalEqeRateExpectations } from "./temporal-eqe-sum.js";
import { bindSensorTemporalSamples } from "./temporal-sample-binding.js";
import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { calculateSensorEqeLocalRate, type CalculateSensorEqeLocalExposureInput } from "./eqe-local-exposure.js";
import { requireInputObject } from "../core/record-validation.js";

/** Input: shared response, site and shutter settings, plus the light evaluated separately at each time. */
export interface CalculateSensorEqeTemporalExposureInput
  extends Omit<CalculateSensorEqeLocalExposureInput, "irradianceSamples" | "stationarityProfile"> {
  /** One sample for every uniform midpoint time. Array order does not define which time a sample is. */
  samples: readonly {
    temporalSampleIndex: number;
    /** Seconds from the shutter's reference time (the first opening boundary). */
    timeSecondsFromOpeningReference: number;
    /** Irradiance in W/m²/nm at every spatial × spectral node, for this instant. */
    irradianceSamples: CalculateSensorEqeLocalExposureInput["irradianceSamples"];
  }[];
}

/** Expected photo signal with light that varies over time. Kept separate from the constant-rate inputs of the RAW producer. */
export interface SensorEqeTemporalExposure {
  kind: "eqe-temporal-quadrature-expected-counts";
  colorSamplingProfileId: string;
  channelId: string;
  site: { x: number; y: number };
  bindingId: string;
  timeReference: "first-opening-boundary-phase";
  startOffsetSecondsFromOpeningReference: number;
  endOffsetSecondsFromOpeningReference: number;
  localExposureDurationSeconds: number;
  expectedIncidentPhotonCount: number;
  expectedGeneratedElectronCount: number;
  integrationMethod: "uniform-midpoint-rate-quadrature";
  timeStationarityEstablished: false;
  timeVaryingSignalIntegrated: true;
  temporalIntegrationApplied: true;
  upstreamSceneAndOpticsVerified: false;
  accumulatedSignalCompleteness: "photo-signal-only";
  physicalFullWellAssessmentAuthorized: false;
  shotNoiseApplied: false;
  rawCodeValueProduced: false;
  /** Samples in canonical order, each with its time step in seconds and its own evidence. */
  samples: readonly {
    temporalSampleIndex: number;
    timeSecondsFromOpeningReference: number;
    integrationMeasureSeconds: number;
    timeAverageWeight: number;
    stages: ReturnType<typeof calculateSensorEqeLocalRate>;
  }[];
}

/**
 * Runs the response checks and EQE conversion separately at each declared
 * midpoint time, then sums rate × time step. This is numerical quadrature. It does
 * not claim the light is constant or prove convergence. Shared profile and
 * geometry stop rates from different sites or shutter events being mixed. No
 * renderer runs here.
 */
export function calculateSensorEqeTemporalExposure(
  input: CalculateSensorEqeTemporalExposureInput
): CalculationResult<SensorEqeTemporalExposure> {
  requireInputObject(input, "calculateSensorEqeTemporalExposure input");
  const ordered = bindSensorTemporalSamples(input.samples, sample => sample.irradianceSamples);
  const count = ordered.length;
  const samples: SensorEqeTemporalExposure["samples"][number][] = [];
  let previousTime = -Infinity;
  for (let index = 0; index < count; index++) {
    const sample = ordered[index]!;
    const stages = calculateSensorEqeLocalRate({ ...input, irradianceSamples: sample.irradianceSamples });
    const binding = stages.exposureBinding.value;
    const start = binding.localExposureWindow.startOffsetSecondsFromOpeningReference;
    const measure = binding.localExposureDurationSeconds / count;
    const time = start + (index + 0.5) * measure;
    // Times are built the same way and must match exactly, so a stale sample or one on a global clock is rejected with no hidden tolerance.
    if (sample.timeSecondsFromOpeningReference !== time || !Number.isFinite(measure) || measure <= 0 ||
      !(time > start && time > previousTime && time < binding.localExposureWindow.endOffsetSecondsFromOpeningReference)) {
      throw new InvalidScientificInputError("Temporal sample must match its representable local shutter midpoint exactly.");
    }
    previousTime = time;
    samples.push({ temporalSampleIndex: index, timeSecondsFromOpeningReference: time,
      integrationMeasureSeconds: measure, timeAverageWeight: 1 / count, stages });
  }
  const { photonCount, electronCount } = sumTemporalEqeRateExpectations(
    samples.map(s => s.stages.electronRate.value), samples[0]!.integrationMeasureSeconds);
  const binding = samples[0]!.stages.exposureBinding.value;
  return approximationResult({ kind: "eqe-temporal-quadrature-expected-counts",
    colorSamplingProfileId: binding.colorSamplingProfileId, channelId: binding.channelId, site: { ...binding.site },
    bindingId: binding.bindingId, timeReference: "first-opening-boundary-phase",
    startOffsetSecondsFromOpeningReference: binding.localExposureWindow.startOffsetSecondsFromOpeningReference,
    endOffsetSecondsFromOpeningReference: binding.localExposureWindow.endOffsetSecondsFromOpeningReference,
    localExposureDurationSeconds: binding.localExposureDurationSeconds,
    expectedIncidentPhotonCount: photonCount, expectedGeneratedElectronCount: electronCount,
    integrationMethod: "uniform-midpoint-rate-quadrature", timeStationarityEstablished: false,
    timeVaryingSignalIntegrated: true, temporalIntegrationApplied: true, upstreamSceneAndOpticsVerified: false,
    accumulatedSignalCompleteness: "photo-signal-only", physicalFullWellAssessmentAuthorized: false,
    shotNoiseApplied: false, rawCodeValueProduced: false, samples
  }, "sensor-eqe-temporal-exposure", "0.1.0", [
    "Irradiance at each time is declared; scene transport, projection and PSF execution are not verified.",
    "Uniform midpoint quadrature has no asserted convergence bound or combined uncertainty.",
    "Nonstationary counts are not the existing stationary charge/RAW producer contract; downstream integration remains required."
  ]);
}
