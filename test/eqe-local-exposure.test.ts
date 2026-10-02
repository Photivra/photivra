// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { calculateSensorEqeLocalExposure, calculateSensorSpatialSamplingQuadrature,
  calculateSensorSpectralQuadrature, simulateSensorRawFrame, createPhotographicExportPair,
  type CalculateSensorEqeLocalExposureInput } from "../src/index.js";
import { colorProfile, spectralProfile, applicationProfile, operatingProfile,
  evidence, operatingConditions } from "./helpers/eqe-response-fixture.js";
import { imagingArea, nativeRaster, samplingProfile, bindingProfile, absentStack } from "./helpers/spatial-sample-fixture.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

function input(): CalculateSensorEqeLocalExposureInput {
  const spatialSampling = { imagingArea, samplingApertureProfile: samplingProfile(), opticalStackProfile: absentStack(),
    site: { x: 1, y: 0 }, spatialSampleCountX: 2, spatialSampleCountY: 2 };
  const spectralSampling = { channelId: "green", wavelengthBasis: "vacuum" as const,
    wavelengthRangeNanometers: { minimum: 400, maximum: 500 }, maximumSubintervalWidthNanometers: 50 };
  const result: CalculateSensorEqeLocalExposureInput = { spatialSampling, spectralSampling, irradianceSamples: [],
    colorSamplingProfile: colorProfile(), spectralResponseProfile: spectralProfile(),
    responseApplication: { applicationProfile: applicationProfile(), sourcePlane: { value: "site-incident", evidence: evidence("test:plane") }, operatingConditions },
    operatingRangeProfile: operatingProfile(),
    localExposure: { bindingProfile: bindingProfile(), exposureWindowInput: { nativeRaster, shutterMechanism: "electronic",
      nominalExposureDurationSeconds: { value: 0.01, unit: "s", evidence: evidence("test:duration") },
      opening: { kind: "simultaneous" }, closing: { kind: "simultaneous" } } },
    stationarityProfile: { schemaVersion: "0.1.0", profileId: "stationarity", rateDomain: "eqe-electron-rate",
      colorSamplingProfileId: "bayer-like", channelId: "green", site: spatialSampling.site, bindingId: "binding",
      localExposureWindow: { timeReference: "first-opening-boundary-phase", startOffsetSecondsFromOpeningReference: 0,
        endOffsetSecondsFromOpeningReference: 0.01 }, stationarityMeaning: "reported-rate-constant-through-bound-local-exposure",
      status: "approximation", evidence: evidence("test:stationarity"), limitation: "Synthetic constant field only." } };
  return withSamples(result);
}

function withSamples(result: CalculateSensorEqeLocalExposureInput, intensity = 2): CalculateSensorEqeLocalExposureInput {
  const spatial = calculateSensorSpatialSamplingQuadrature({ ...result.spatialSampling,
    nativeRaster: result.localExposure.exposureWindowInput.nativeRaster,
    colorSamplingProfile: result.colorSamplingProfile, colorSamplingBindingProfile: result.localExposure.bindingProfile }).value;
  const spectral = calculateSensorSpectralQuadrature({ ...result.spectralSampling,
    colorSamplingProfile: result.colorSamplingProfile, spectralResponseProfile: result.spectralResponseProfile }).value;
  result.irradianceSamples = spectral.nodes.flatMap(s => spatial.nodes.map(p => ({ node: {
    spatialNode: { antiAliasingComponentIndex: p.antiAliasingComponentIndex, apertureSampleXIndex: p.apertureSampleXIndex,
      apertureSampleYIndex: p.apertureSampleYIndex }, spectralSampleIndex: s.spectralSampleIndex, wavelengthNanometers: s.wavelengthNanometers },
    spectralIrradianceWattsPerSquareMeterPerNanometer: intensity })));
  return result;
}

describe("irradiance to EQE local exposure composition", () => {
  it("applies area, wavelength, photon energy, QE and duration once with separate child evidence", () => {
    const request = input(), saved = structuredClone(request);
    const result = calculateSensorEqeLocalExposure(request);
    expect(request).toEqual(saved);
    const h = 6.62607015e-34, c = 299792458;
    const photonRate = [425, 475].reduce((sum, nm) => sum + 2 * 480000 * 1e-12 * 50 * nm * 1e-9 / (h*c), 0);
    const electronRate = [425, 475].reduce((sum, nm) => sum + 2 * 480000 * 1e-12 * 50 * nm * 1e-9 / (h*c) * (0.2 + (nm-400)*0.004), 0);
    expect(result.value.electronRate.value.incidentPhotonRatePerSecond / photonRate).toBeCloseTo(1, 14);
    expect(result.value.exposure.value.expectedGeneratedElectronCount / (electronRate*0.01)).toBeCloseTo(1, 14);
    expect(result.value.reduction.value.wavelengthIntegratedGeometricApertureIncidentFluxWatts).toBeCloseTo(0.000096, 12);
    expect(result.value.upstreamSceneAndOpticsVerified).toBe(false);
    expect(result.value.exposure.value.rawCodeValueProduced).toBe(false);
    expect(result.value.reduction.value.responseUncertainty).toEqual({ kind: "relative", fraction: 0.02, basis: "test" });
    expect(result.value.electronRate.value.responseUncertaintyPropagated).toBe(false);
    expect(calculateSensorEqeLocalExposure({ ...input(), irradianceSamples: [...input().irradianceSamples].reverse() })).toEqual(result);
  });

  it("uses the exact local rolling window and scales stationary expectations with duration", () => {
    const request = input();
    const scan = { kind: "uniform-linear-native-scan" as const,
      directionNative: { value: "top-to-bottom" as const, evidence: evidence("test:scan-direction") },
      traversalDurationSeconds: { value: 0.002, unit: "s" as const, evidence: evidence("test:scan-duration") } };
    request.localExposure.exposureWindowInput.opening = scan;
    request.localExposure.exposureWindowInput.closing = scan;
    request.localExposure.exposureWindowInput.nominalExposureDurationSeconds.value = 0.02;
    request.stationarityProfile.localExposureWindow.startOffsetSecondsFromOpeningReference = 0.0005;
    request.stationarityProfile.localExposureWindow.endOffsetSecondsFromOpeningReference = 0.0205;
    const result = calculateSensorEqeLocalExposure(request).value;
    expect(result.exposure.value.startOffsetSecondsFromOpeningReference).toBe(0.0005);
    expect(result.exposure.value.localExposureDurationSeconds).toBeCloseTo(0.02, 15);
    expect(result.exposure.value.expectedGeneratedElectronCount /
      calculateSensorEqeLocalExposure(input()).value.exposure.value.expectedGeneratedElectronCount).toBeCloseTo(2, 14);
  });

  it.each(["missing-node", "negative-irradiance", "plane", "range", "channel", "binding", "window", "responsivity"])("rejects %s before exposing an integrated signal", fault => {
    const request = input();
    if (fault === "missing-node") request.irradianceSamples = request.irradianceSamples.slice(1);
    if (fault === "negative-irradiance") request.irradianceSamples = request.irradianceSamples.map(v => ({ ...v, spectralIrradianceWattsPerSquareMeterPerNanometer: -1 }));
    if (fault === "plane") request.responseApplication.sourcePlane.value = "sensor-package-incident";
    if (fault === "range") request.operatingRangeProfile.inputRange.maximumInclusive = 1e-8;
    if (fault === "channel") request.stationarityProfile.channelId = "red";
    if (fault === "binding") request.localExposure.bindingProfile.bindingId = "other";
    if (fault === "window") request.stationarityProfile.localExposureWindow.endOffsetSecondsFromOpeningReference = 0.02;
    if (fault === "responsivity") request.spectralResponseProfile = spectralProfile("responsivity");
    expect(() => calculateSensorEqeLocalExposure(request)).toThrow();
  });

  it("feeds all four native sites through charge/noise/ADC into deterministic paired files", async () => {
    const raw = loadSensorRawProducerInput();
    const duration = raw.frame.capture.exposure.shutterSeconds;
    const sites = raw.sites.map(site => {
      const request = input(), photo = site.charge.photoSignal;
      request.colorSamplingProfile = raw.frame.colorSamplingProfile;
      request.spectralResponseProfile.colorSamplingProfileId = "cfa";
      request.spectralResponseProfile.channels = request.spectralResponseProfile.channels.map(c => ({ ...c, channelId: photo.channelId }));
      request.spectralSampling.channelId = photo.channelId;
      request.spatialSampling.site = photo.site;
      request.spatialSampling.imagingArea = raw.frame.capture.geometry.imagingArea;
      const pitchX = request.spatialSampling.imagingArea.widthMm * 1000 / 2;
      const pitchY = request.spatialSampling.imagingArea.heightMm * 1000 / 2;
      request.spatialSampling.samplingApertureProfile.siteCenterLattice = {
        ...request.spatialSampling.samplingApertureProfile.siteCenterLattice,
        pitchXMicrometers: pitchX, pitchYMicrometers: pitchY,
        firstSiteCenterFromImagingAreaTopLeftMicrometers: { x: pitchX/2, y: pitchY/2 }
      };
      request.spatialSampling.samplingApertureProfile.colorSamplingProfileId = "cfa";
      request.spatialSampling.samplingApertureProfile.colorSamplingBindingId = raw.frame.bindingProfile.bindingId;
      request.responseApplication.applicationProfile = { ...request.responseApplication.applicationProfile, colorSamplingProfileId: "cfa", channelId: photo.channelId };
      request.operatingRangeProfile = { ...request.operatingRangeProfile, colorSamplingProfileId: "cfa", channelId: photo.channelId };
      request.operatingRangeProfile.inputRange.minimumInclusive = 0;
      request.localExposure.bindingProfile = raw.frame.bindingProfile;
      request.localExposure.exposureWindowInput.nativeRaster = raw.frame.bindingProfile.nativeRaster;
      request.localExposure.exposureWindowInput.nominalExposureDurationSeconds.value = duration;
      request.stationarityProfile = { ...request.stationarityProfile, profileId: photo.stationarityProfileId,
        colorSamplingProfileId: "cfa", channelId: photo.channelId, site: photo.site, bindingId: photo.bindingId,
        localExposureWindow: { ...request.stationarityProfile.localExposureWindow, endOffsetSecondsFromOpeningReference: duration } };
      // Own synthetic irradiance chosen for an independently predicted unsaturated signal.
      withSamples(request, 1e-9);
      const exposure = calculateSensorEqeLocalExposure(request).value.exposure.value;
      return { ...site, charge: { ...site.charge, photoSignal: exposure } };
    });
    const produced = simulateSensorRawFrame({ ...raw, sites });
    expect(simulateSensorRawFrame({ ...raw, sites })).toEqual(produced);
    expect(produced.value.sites).toHaveLength(4);
    const exported = loadPhotographicExportInput();
    exported.reconstruction.rawFrame = produced.value.frame;
    const pair = await createPhotographicExportPair(exported);
    expect(await createPhotographicExportPair(exported)).toEqual(pair);
    const bytes = pair.dng.bytes, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let strip = -1;
    for (let i = 0; i < view.getUint16(8, true); i++) {
      const offset = 10 + 12*i;
      if (view.getUint16(offset, true) === 273) strip = view.getUint32(offset+8, true);
    }
    expect(strip).toBeGreaterThan(0);
    expect(Array.from({ length: 4 }, (_, i) => view.getUint16(strip+2*i, true)))
      .toEqual(produced.value.frame.samples.map(s => s.rawCode));
    expect(pair.jpeg.bytes.length).toBeGreaterThan(0);
  });
});
