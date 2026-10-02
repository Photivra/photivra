// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { calculateSensorEqeLocalExposure, calculateSensorEqeTemporalExposure, composeSensorAccumulatedCharge,
  type CalculateSensorEqeTemporalExposureInput, type SensorEqeExposureIntegration } from "../src/index.js";
import { input, withSamples } from "./helpers/eqe-exposure-fixture.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";
import { evidence, spectralProfile } from "./helpers/eqe-response-fixture.js";

function request(intensities = [1, 3]): CalculateSensorEqeTemporalExposureInput {
  const base = input();
  const { irradianceSamples: unusedSamples, stationarityProfile: unusedStationarity, ...shared } = base;
  void unusedSamples; void unusedStationarity;
  return { ...shared, samples: intensities.map((intensity, temporalSampleIndex) => ({
    temporalSampleIndex, timeSecondsFromOpeningReference: (temporalSampleIndex + 0.5) * (0.01 / intensities.length),
    irradianceSamples: withSamples(input(), intensity).irradianceSamples
  })) };
}

describe("nonstationary sensor EQE shutter integration", () => {
  it("integrates changing light with independent SI photon/charge arithmetic and no stationarity claim", () => {
    const r = request(), saved = structuredClone(r);
    const result = calculateSensorEqeTemporalExposure(r).value;
    const h = 6.62607015e-34, c = 299792458;
    const photons = [425, 475].reduce((sum, nm) => sum + 2 * 480000e-12 * 50 * nm * 1e-9 / (h*c), 0) * 0.01;
    const electrons = [425, 475].reduce((sum, nm) => sum + 2 * 480000e-12 * 50 * nm * 1e-9 / (h*c) * (0.2+(nm-400)*0.004), 0) * 0.01;
    expect(result.expectedIncidentPhotonCount / photons).toBeCloseTo(1, 14);
    expect(result.expectedGeneratedElectronCount / electrons).toBeCloseTo(1, 14);
    expect(result.samples.map(s => s.integrationMeasureSeconds)).toEqual([0.005, 0.005]);
    expect(result.samples.map(s => s.timeAverageWeight)).toEqual([0.5, 0.5]);
    expect(result.timeStationarityEstablished).toBe(false);
    expect(result.timeVaryingSignalIntegrated).toBe(true);
    expect(result.rawCodeValueProduced).toBe(false);
    expect(result.kind).not.toBe("eqe-expected-counts");
    expect(r).toEqual(saved);
    expect(calculateSensorEqeTemporalExposure({ ...r, samples: [...r.samples].reverse() }).value).toEqual(result);
    expect(result.samples[0]!.stages.electronRate.value.responseUncertaintyPropagated).toBe(false);
  });

  it("cannot be relabeled as an existing stationary charge input by a type assertion", () => {
    const exposure = calculateSensorEqeTemporalExposure(request()).value;
    const charge = loadSensorRawProducerInput().sites[0]!.charge;
    expect(() => composeSensorAccumulatedCharge({ ...charge,
      photoSignal: exposure as unknown as SensorEqeExposureIntegration })).toThrow(/photo-signal-only EQE/);
  });

  it.each([1, 2, 8, 256])("matches stationary expectations for constant light with %i time nodes", count => {
    const result = calculateSensorEqeTemporalExposure(request(Array.from({ length: count }, () => 2))).value;
    const stationary = calculateSensorEqeLocalExposure(input()).value.exposure.value;
    expect(result.expectedGeneratedElectronCount / stationary.expectedGeneratedElectronCount).toBeCloseTo(1, 14);
  });

  it("uses rolling local offsets instead of the global duration reference", () => {
    const r = request();
    const scan = { kind: "uniform-linear-native-scan" as const,
      directionNative: { value: "top-to-bottom" as const, evidence: evidence("test:direction") },
      traversalDurationSeconds: { value: 0.002, unit: "s" as const, evidence: evidence("test:scan") } };
    r.localExposure.exposureWindowInput.opening = scan;
    r.localExposure.exposureWindowInput.closing = scan;
    r.samples = r.samples.map(s => ({ ...s, timeSecondsFromOpeningReference: s.timeSecondsFromOpeningReference + 0.0005 }));
    const result = calculateSensorEqeTemporalExposure(r).value;
    expect(result.startOffsetSecondsFromOpeningReference).toBe(0.0005);
    expect(result.endOffsetSecondsFromOpeningReference).toBe(0.0105);
    expect(result.expectedGeneratedElectronCount / calculateSensorEqeTemporalExposure(request()).value.expectedGeneratedElectronCount).toBeCloseTo(1, 14);
    expect(() => calculateSensorEqeTemporalExposure({ ...r, samples: request().samples })).toThrow(/midpoint/);
  });

  it("converges toward an independently integrated quadratic irradiance without claiming an error bound", () => {
    const expected = calculateSensorEqeLocalExposure(withSamples(input(), 4/3)).value.exposure.value.expectedGeneratedElectronCount;
    const errors = [2, 4, 8].map(count => {
      const r = request(Array.from({ length: count }, (_, i) => 1 + ((i+0.5)/count)**2));
      return Math.abs(calculateSensorEqeTemporalExposure(r).value.expectedGeneratedElectronCount - expected);
    });
    expect(errors[0]! / errors[1]!).toBeCloseTo(4, 10);
    expect(errors[1]! / errors[2]!).toBeCloseTo(4, 10);
  });

  it.each(["empty", "large", "sparse", "duplicate", "index", "time", "wrong-time", "wrong-plane", "null", "not-array", "missing-node", "negative", "range", "responsivity", "budget"])("rejects %s without hiding an invalid instant in the average", fault => {
    const r = request();
    if (fault === "empty") r.samples = [];
    if (fault === "large") r.samples = Array.from({ length: 257 }, () => r.samples[0]!);
    if (fault === "sparse") r.samples = new Array(2);
    if (fault === "duplicate") r.samples = [r.samples[0]!, r.samples[0]!];
    if (fault === "index") r.samples[0]!.temporalSampleIndex = -1;
    if (fault === "time") r.samples[1]!.timeSecondsFromOpeningReference = NaN;
    if (fault === "wrong-time") r.samples[1]!.timeSecondsFromOpeningReference = 0.003;
    if (fault === "wrong-plane") r.responseApplication.sourcePlane.value = "sensor-package-incident";
    if (fault === "null") r.samples = [null as unknown as CalculateSensorEqeTemporalExposureInput["samples"][number]];
    if (fault === "not-array") r.samples = null as unknown as CalculateSensorEqeTemporalExposureInput["samples"];
    if (fault === "missing-node") r.samples[1]!.irradianceSamples = [];
    if (fault === "negative") r.samples[1]!.irradianceSamples = withSamples(input(), -1).irradianceSamples;
    if (fault === "range") {
      // Mean power remains below maximum, but the bright individual instant exceeds it.
      r.operatingRangeProfile.inputRange.maximumInclusive = 0.000065;
    }
    if (fault === "responsivity") r.spectralResponseProfile = spectralProfile("responsivity");
    if (fault === "budget") r.samples[1]!.irradianceSamples = new Array(100001);
    expect(() => calculateSensorEqeTemporalExposure(r)).toThrow();
  });
});
