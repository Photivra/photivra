// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { calculateCaptureExposureWindows, calculateSensorDarkCurrentCharge, composeSensorAccumulatedCharge,
  createSensorEqeTemporalPhotoSignal, parseSensorEqeTemporalPhotoSignal, simulateSensorRawFrame,
  parseSensorRawProducerInput, createPhotographicExportPair, type SensorEqeTemporalPhotoSignal,
  type SensorDarkCurrentProfile } from "../src/index.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
import { producerSiteInput, withSamples } from "./helpers/eqe-exposure-fixture.js";

function fixture(rolling = false): { raw: ReturnType<typeof loadSensorRawProducerInput>;
  diagnostics: ReturnType<typeof createSensorEqeTemporalPhotoSignal>[] } {
  const raw = loadSensorRawProducerInput(), evidence = raw.frame.colorSamplingProfile.evidence;
  const window = { shutterMechanism: "electronic" as const, nominalExposureDurationSeconds: {
    value: raw.frame.capture.exposure.shutterSeconds, unit: "s" as const, evidence },
  opening: rolling ? { kind: "uniform-linear-native-scan" as const,
    directionNative: { value: "right-to-left" as const, evidence },
    traversalDurationSeconds: { value: .001, unit: "s" as const, evidence } } : { kind: "simultaneous" as const },
  closing: rolling ? { kind: "uniform-linear-native-scan" as const,
    directionNative: { value: "right-to-left" as const, evidence },
    traversalDurationSeconds: { value: .002, unit: "s" as const, evidence } } : { kind: "simultaneous" as const } };
  if (rolling) raw.exposureWindow = window;
  const windows = calculateCaptureExposureWindows({ ...window, nativeRaster: raw.frame.capture.geometry.nativeRaster,
    samplePointsNative: raw.sites.map((_, i) => ({ x: i%2+.5, y: Math.floor(i/2)+.5 })) }).value;
  const diagnostics = raw.sites.map((site, index) => {
    const request = producerSiteInput(raw, site), w = windows.samples[index]!;
    request.localExposure.exposureWindowInput = { ...window, nativeRaster: request.localExposure.exposureWindowInput.nativeRaster };
    const { stationarityProfile: _stationarity, irradianceSamples: _irradiance, ...shared } = request;
    void _stationarity; void _irradiance;
    const result = createSensorEqeTemporalPhotoSignal({ temporalIntegrationId: `temporal-${index}`, exposure: {
      ...shared, samples: [1e-9, 3e-9].map((intensity, temporalSampleIndex) => ({ temporalSampleIndex,
        timeSecondsFromOpeningReference: w.startOffsetSecondsFromOpeningReference+(temporalSampleIndex+.5)*(w.localExposureDurationSeconds/2),
        irradianceSamples: withSamples(request, intensity).irradianceSamples })) } });
    const photo = result.value.photoSignal;
    const profile: SensorDarkCurrentProfile = { schemaVersion: "0.1.0", profileId: "dark-test",
      colorSamplingProfileId: photo.colorSamplingProfileId, channelId: photo.channelId, scientificStatus: "approximation",
      uncertainty: { kind: "not-quantified", limitation: "Synthetic owned fixture only." }, evidence,
      chargeMeaning: "pre-compensation-thermally-generated-electrons", siteApplicability: { kind: "exact-site", site: photo.site },
      temperatureModel: { kind: "fixed-reference-temperature", referenceTemperatureC: 20, darkCurrentElectronsPerSecond: 4 },
      darkCurrentCompensationIncluded: false, spatialDarkCurrentNonuniformityModeled: true };
    site.charge.photoSignal = photo;
    site.charge.darkCharge = calculateSensorDarkCurrentCharge({ exposure: photo, darkCurrentProfile: profile, operatingTemperatureC: 20 }).value;
    site.charge.completenessProfile.startOffsetSecondsFromOpeningReference = w.startOffsetSecondsFromOpeningReference;
    site.charge.completenessProfile.endOffsetSecondsFromOpeningReference = w.endOffsetSecondsFromOpeningReference;
    return result;
  });
  return { raw, diagnostics };
}

describe("temporal EQE photo signal through RAW and paired export", () => {
  it.each([false, true])("preserves physical counts, exact event identity and deterministic RAW (rolling=%s)", rolling => {
    const { raw, diagnostics } = fixture(rolling), before = JSON.stringify(raw);
    const produced = simulateSensorRawFrame(raw).value;
    expect(simulateSensorRawFrame(raw).value).toEqual(produced);
    expect(JSON.stringify(raw)).toBe(before);
    expect(produced.upstreamRadiometryVerified).toBe(false);
    raw.sites.forEach((site, index) => {
      const p = site.charge.photoSignal as SensorEqeTemporalPhotoSignal, d = site.charge.darkCharge;
      // Independent SI calculation: two wavelength bins, QE slope and 800x600 um aperture.
      const h = 6.62607015e-34, c = 299792458, area = 480000e-12;
      const count = [425, 475].reduce((sum, nm) => sum+2e-9*area*50*nm*1e-9/(h*c)*(0.2+(nm-400)*.004), 0)*p.localExposureDurationSeconds;
      expect(p.expectedGeneratedElectronCount/count).toBeCloseTo(1, 14);
      expect(p.temporalSamples[1]!.expectedGeneratedElectronRatePerSecond/p.temporalSamples[0]!.expectedGeneratedElectronRatePerSecond).toBeCloseTo(3, 14);
      expect(p.stationarityProfileId).toBeUndefined(); expect(p.timeStationarityEstablished).toBe(false);
      expect(d.stationarityProfileId).toBeUndefined(); expect(d.temporalIntegrationId).toBe(p.temporalIntegrationId);
      expect(d.expectedDarkElectronCount).toBe(4*p.localExposureDurationSeconds);
      expect(produced.sites[index]!.accumulatedCharge.value.totalExpectedStoredElectronCount).toBe(p.expectedGeneratedElectronCount+d.expectedDarkElectronCount);
      expect(diagnostics[index]!.value.exposure.value.samples).toHaveLength(2);
      expect(Object.isFrozen(p.temporalSamples)).toBe(true);
      expect(parseSensorEqeTemporalPhotoSignal(p)).toEqual(p);
    });
  });

  it.each([false, true])("writes the exact realized native codes into DNG and develops JPEG from them (rolling=%s)", async rolling => {
    const { raw } = fixture(rolling), produced = simulateSensorRawFrame(raw).value;
    const input = loadPhotographicExportInput(); input.reconstruction.rawFrame = produced.frame;
    const pair = await createPhotographicExportPair(input), view = new DataView(pair.dng.bytes.buffer,
      pair.dng.bytes.byteOffset, pair.dng.bytes.byteLength);
    let strip = -1;
    for (let i = 0; i < view.getUint16(8, true); i++) {
      const offset = 10+12*i; if (view.getUint16(offset, true) === 273) strip = view.getUint32(offset+8, true);
    }
    expect(strip).toBeGreaterThan(0);
    expect(Array.from({ length: 4 }, (_, i) => view.getUint16(strip+2*i, true))).toEqual(produced.frame.samples.map(s => s.rawCode));
    expect(pair.source.value.rawFrame.samples).toEqual(produced.frame.samples);
    expect(pair.imageDataPairing).toBe("jpeg-generated-from-exact-attached-raw");
    expect((await createPhotographicExportPair(input)).jpeg.sha256).toBe(pair.jpeg.sha256);
  });

  it.each(["stationarity", "counts", "time", "rate", "sparse", "empty", "large", "identity", "treatment", "evidence", "duration", "site", "extra"])("rejects invalid temporal handoff: %s", fault => {
    const { raw } = fixture(), p = structuredClone(raw.sites[0]!.charge.photoSignal) as SensorEqeTemporalPhotoSignal;
    if (fault === "stationarity") Object.assign(p, { stationarityProfileId: "invented" });
    if (fault === "counts") p.expectedGeneratedElectronCount += 1;
    if (fault === "time") p.temporalSamples[0]!.timeSecondsFromOpeningReference += .001;
    if (fault === "rate") p.temporalSamples[0]!.expectedGeneratedElectronRatePerSecond = p.temporalSamples[0]!.incidentPhotonRatePerSecond+1;
    if (fault === "sparse") p.temporalSamples = new Array(2);
    if (fault === "empty") p.temporalSamples = [];
    if (fault === "large") p.temporalSamples = new Array(257);
    if (fault === "identity") p.temporalIntegrationId = "private email@example.com";
    if (fault === "treatment") Object.assign(p, { shotNoiseApplied: true });
    if (fault === "evidence") p.componentEvidence.temporalResponse = [];
    if (fault === "duration") p.localExposureDurationSeconds *= 2;
    if (fault === "site") p.site.x = -.5;
    if (fault === "extra") Object.assign(p, { debug: "unrecognized" });
    expect(() => parseSensorEqeTemporalPhotoSignal(p)).toThrow();
    raw.sites[0]!.charge.photoSignal = p;
    expect(() => composeSensorAccumulatedCharge(raw.sites[0]!.charge)).toThrow();
    expect(() => parseSensorRawProducerInput(raw)).toThrow();
  });

  it.each(["identity", "stationarity", "dark-window", "completeness", "schedule"])("rejects stale downstream bindings: %s", fault => {
    const { raw } = fixture(true), charge = raw.sites[0]!.charge;
    if (fault === "identity") charge.darkCharge.temporalIntegrationId = "different";
    if (fault === "stationarity") Object.assign(charge.darkCharge, { stationarityProfileId: "invented" });
    if (fault === "dark-window") charge.darkCharge.startOffsetSecondsFromOpeningReference += .001;
    if (fault === "completeness") charge.completenessProfile.endOffsetSecondsFromOpeningReference += .001;
    if (fault === "schedule") delete raw.exposureWindow;
    expect(() => simulateSensorRawFrame(raw)).toThrow();
  });
});
