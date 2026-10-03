// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { composeSensorAccumulatedCharge, simulateSensorChargeRealization, calculatePrintRegionNoise } from "../src/index.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";
import { statisticsNoise } from "./helpers/print-region-statistics-fixture.js";

/** One conditional ideal linear neutral channel: L_relative = photoelectrons / lambda.
 * This declared synthetic mapping is not a calibrated camera luminance transform.
 * Pre-storage charge only: no dark/read noise, ADC, clipping or rendering is relabelled.
 */
function chargeEnsemble(lambda: number): number[][] {
  const site = loadSensorRawProducerInput().sites[1]!, photo = site.charge.photoSignal;
  if (photo.kind !== "eqe-expected-counts") throw Error("fixture");
  photo.expectedGeneratedElectronCount = lambda; photo.expectedGeneratedElectronRatePerSecond = lambda / photo.localExposureDurationSeconds;
  photo.expectedIncidentPhotonCount = 2 * lambda; photo.incidentPhotonRatePerSecond = 2 * lambda / photo.localExposureDurationSeconds;
  const charge = composeSensorAccumulatedCharge(site.charge).value;
  expect(charge.photoExpectedElectronCount).toBe(lambda); expect(charge.darkExpectedElectronCount).toBe(0);
  return Array.from({ length: 256 }, (_, frame) => Array.from({ length: 4 }, (_, pixel) => {
    const seed = (Math.imul(4 * frame + pixel + 1, 2654435761) + 196) >>> 0;
    const result = simulateSensorChargeRealization({ accumulatedCharge: charge, samplingProfile: site.samplingProfile, seedUint32: seed }).value;
    expect(result.photoShotNoiseApplied).toBe(true); expect(result.adcQuantizationApplied).toBe(false);
    return result.photoRealizedElectronCount / lambda;
  }));
}

// Predeclared conformance envelope, not a confidence interval for a photograph.
// Poisson central moments: mu2=lambda, mu4=lambda+3lambda^2.
// Var(unbiased sample variance) = lambda/n + 2lambda^2/(n-1).
// The broad 8-sigma moment band tests gross model/sampler regressions at each
// fixed count; no monotonic convergence is expected from stochastic estimates.
it.each([4, 40, 400])("checks actual pre-readout charge repeats against independent Poisson moments at lambda=%s", lambda => {
  const frames = chargeEnsemble(lambda), observations: number[] = [];
  for (const n of [32, 64, 128, 256]) {
    const input = statisticsNoise(frames.slice(0, n)); input.stationarySceneId = `owned-neutral-transmission-${lambda}`;
    input.frames.forEach(frame => { frame.source.processing = { id: "ideal-neutral-linear-charge-reference", version: "0.1.0" }; });
    const result = calculatePrintRegionNoise(input).value;
    expect(result.status).toBe("diagnostic-only"); const m = result.measurement!;
    expect(Math.abs(m.meanRelativeLuminance - 1)).toBeLessThan(8 / Math.sqrt(lambda * n));
    const expectedVariance = 1 / lambda;
    const varianceBand = 8 * Math.sqrt(lambda / n + 2 * lambda * lambda / (n - 1)) / (lambda * lambda);
    expect(Math.abs(m.meanTemporalSampleVarianceRelativeLuminanceSquared - expectedVariance)).toBeLessThan(varianceBand);
    expect(Math.abs(m.temporalRmsRelativeLuminance ** 2 - m.meanTemporalSampleVarianceRelativeLuminanceSquared)).toBeLessThan(1e-14);
    expect(result.acquisitionQualification).toBe("unassessed"); expect(result.uncertainty).toBe("not-quantified");
    observations.push(m.meanTemporalSampleVarianceRelativeLuminanceSquared);
  }
  expect(observations).toHaveLength(4);
});
