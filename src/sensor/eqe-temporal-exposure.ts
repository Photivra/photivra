// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Evaluate response validity and EQE independently at each declared shutter midpoint, then sum rates
 * times seconds. This is quadrature, not a stationarity claim or convergence proof. Shared
 * profile/geometry state prevents combining rates from different sites or shutter events. No renderer
 * executes here.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import { sumTemporalEqeRateExpectations } from "./temporal-eqe-sum.js";
import { bindSensorTemporalSamples } from "./temporal-sample-binding.js";
import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { calculateSensorEqeLocalRate, type CalculateSensorEqeLocalExposureInput } from "./eqe-local-exposure.js";

/** Shared response/site/shutter state, with separately evaluated physical light at each time. */
export interface CalculateSensorEqeTemporalExposureInput
  extends Omit<CalculateSensorEqeLocalExposureInput, "irradianceSamples" | "stationarityProfile"> {
  /** Complete uniform-midpoint coverage; array order is not temporal identity. */
  samples: readonly {
    temporalSampleIndex: number;
    /** Seconds on the shutter's first-opening-boundary-phase reference. */
    timeSecondsFromOpeningReference: number;
    /** Complete W/m²/nm Cartesian irradiance coverage for this instant. */
    irradianceSamples: CalculateSensorEqeLocalExposureInput["irradianceSamples"];
  }[];
}

/** Nonstationary photo expectation, deliberately distinct from stationary RAW producer inputs. */
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
  /** Canonical order, seconds-valued integration measures and independent child evidence. */
  samples: readonly {
    temporalSampleIndex: number;
    timeSecondsFromOpeningReference: number;
    integrationMeasureSeconds: number;
    timeAverageWeight: number;
    stages: ReturnType<typeof calculateSensorEqeLocalRate>;
  }[];
}

/**
 * Evaluate response validity and EQE independently at each declared shutter
 * midpoint, then sum rates times seconds. This is quadrature, not a stationarity
 * claim or convergence proof. Shared profile/geometry state prevents combining
 * rates from different sites or shutter events. No renderer executes here.
 */
export function calculateSensorEqeTemporalExposure(
  input: CalculateSensorEqeTemporalExposureInput
): CalculationResult<SensorEqeTemporalExposure> {
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
    // Exact shared construction rejects stale/global-clock samples without an implicit tolerance.
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
