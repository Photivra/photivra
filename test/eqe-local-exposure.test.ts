// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { calculateSensorEqeLocalExposure, simulateSensorRawFrame, createPhotographicExportPair } from "../src/index.js";
import { spectralProfile, evidence } from "./helpers/eqe-response-fixture.js";
import { input, withSamples, producerSiteInput } from "./helpers/eqe-exposure-fixture.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";

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
    const sites = raw.sites.map(site => {
      const request = producerSiteInput(raw, site);
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
