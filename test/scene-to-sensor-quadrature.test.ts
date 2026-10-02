// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { calculateSceneToSensorIrradianceQuadrature, calculateSensorEqeLocalExposure,
  calculateIlluminationVignetting, calculateSensorSpectralQuadrature, simulateSensorRawFrame, createPhotographicExportPair } from "../src/index.js";
import { sceneOpticalInput } from "./helpers/scene-optical-quadrature-fixture.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
import { splitStack } from "./helpers/spatial-sample-fixture.js";
import { input as sensorInput, producerSiteInput } from "./helpers/eqe-exposure-fixture.js";

it("computes physical irradiance at every node with one paraxial acceptance and transmission", () => {
  const input = sceneOpticalInput(), saved = structuredClone(input);
  const result = calculateSceneToSensorIrradianceQuadrature(input);
  expect(input).toEqual(saved);
  for (const sample of result.value.samples) {
    const nm = sample.node.wavelengthNanometers;
    const expected = 2 * Math.PI / (4*4*4) * (0.8 - (nm-400)*0.004);
    expect(sample.optics.value.sensorPlaneSpectralIrradianceWattsPerSquareMeterNanometer).toBeCloseTo(expected, 15);
    expect(sample.bindings.providerBindingsMatched).toBe(true);
  }
  expect(result.value.reduction.value.wavelengthIntegratedGeometricApertureIncidentFluxWatts)
    .toBeCloseTo(2 * Math.PI/64 * 0.6 * 100 * 480000 * 1e-12, 15);
  expect(result.value).toMatchObject({ sourcePlane: "sensor-package-incident", sourceTargetProjectionVerified: false,
    sceneProviderExecutionVerified: false, psfRedistributionApplied: false, temporalIntegrationApplied: false });
  expect(calculateSceneToSensorIrradianceQuadrature({ ...input, samples: [...input.samples].reverse() })).toEqual(result);
  const resultSnapshot = structuredClone(result);
  input.samples[0]!.sceneRadianceResult.spectralRadianceWattsPerSquareMeterSteradianNanometer = 999;
  input.samples[0]!.sceneRadianceRequest.target.outgoingDirectionUnitVector.z = -1;
  input.spatialQuadrature.nodes[0]!.preAntiAliasingSourcePointMm.x = 999;
  expect(result).toEqual(resultSnapshot);
});

it("feeds package-incident EQE and rejects a site-incident reinterpretation", () => {
  const scene = sceneOpticalInput(), sensor = sensorInput();
  sensor.spectralResponseProfile.channels = sensor.spectralResponseProfile.channels.map(c => c.kind === "separable-channel-filter-and-detector-eqe" ? c : ({ ...c,
    responseScope: "sensor-package-incident-effective-channel-response" as const }));
  scene.spectralQuadrature = calculateSensorSpectralQuadrature({ ...sensor.spectralSampling,
    colorSamplingProfile: sensor.colorSamplingProfile, spectralResponseProfile: sensor.spectralResponseProfile }).value;
  const irradiance = calculateSceneToSensorIrradianceQuadrature(scene).value;
  sensor.irradianceSamples = irradiance.irradianceSamples;
  sensor.responseApplication.sourcePlane.value = irradiance.sourcePlane;
  const exposure = calculateSensorEqeLocalExposure(sensor).value.exposure.value;
  const expected = [425, 475].reduce((sum, nm) => sum + 2 * Math.PI/64 * (0.8-(nm-400)*0.004)
    * 480000e-12 * 50 * nm*1e-9 / (6.62607015e-34 * 299792458) * (0.2+(nm-400)*0.004) * 0.01, 0);
  expect(exposure.expectedGeneratedElectronCount / expected).toBeCloseTo(1, 14);
  sensor.responseApplication.sourcePlane.value = "site-incident";
  expect(() => calculateSensorEqeLocalExposure(sensor)).toThrow();
});

it("evaluates field throughput at each inverse-AA source point exactly once", () => {
  const sensor = sensorInput();
  sensor.spatialSampling.opticalStackProfile = splitStack();
  const request = sceneOpticalInput(sensor);
  const profile = { normalizationRadiusMm: 20, maximumNormalizedRadius: 1,
    coefficients: { r2: -0.5, r4: 0, r6: 0 } };
  request.samples = request.samples.map(sample => {
    const p = request.spatialQuadrature.nodes.find(p => p.antiAliasingComponentIndex === sample.node.spatialNode.antiAliasingComponentIndex &&
      p.apertureSampleXIndex === sample.node.spatialNode.apertureSampleXIndex &&
      p.apertureSampleYIndex === sample.node.spatialNode.apertureSampleYIndex)!;
    return { ...sample, fieldThroughput: { kind: "illumination-vignetting-result" as const,
      result: calculateIlluminationVignetting({ imagePointMm: p.preAntiAliasingSourcePointMm, profile }).value } };
  });
  const result = calculateSceneToSensorIrradianceQuadrature(request).value;
  let expectedPower = 0;
  for (const s of request.spectralQuadrature.nodes) {
    for (const p of request.spatialQuadrature.nodes) {
      const x = p.preAntiAliasingSourcePointMm.x, y = p.preAntiAliasingSourcePointMm.y;
      const throughput = 1 - 0.5*(x*x+y*y)/400;
      expectedPower += 2 * Math.PI/64 * (0.8-(s.wavelengthNanometers-400)*0.004) * throughput *
        p.combinedAreaMeasureSquareMicrometers * 1e-12 * s.wavelengthMeasureNanometers;
    }
  }
  expect(result.reduction.value.wavelengthIntegratedGeometricApertureIncidentFluxWatts).toBeCloseTo(expectedPower, 15);
  expect(result.samples).toHaveLength(16);
});

it("carries declared scene radiance through optics/EQE into deterministic four-site RAW and files", async () => {
  const raw = loadSensorRawProducerInput();
  const sites = raw.sites.map(site => {
    const sensor = producerSiteInput(raw, site);
    sensor.spectralResponseProfile.channels = sensor.spectralResponseProfile.channels.map(c =>
      c.kind === "separable-channel-filter-and-detector-eqe" ? c : { ...c, responseScope: "sensor-package-incident-effective-channel-response" });
    sensor.responseApplication.sourcePlane.value = "sensor-package-incident";
    const scene = sceneOpticalInput(sensor);
    scene.samples.forEach(s => { s.sceneRadianceResult.spectralRadianceWattsPerSquareMeterSteradianNanometer = 1e-9; });
    sensor.irradianceSamples = calculateSceneToSensorIrradianceQuadrature(scene).value.irradianceSamples;
    const exposure = calculateSensorEqeLocalExposure(sensor).value.exposure.value;
    const expected = [425, 475].reduce((sum, nm) => sum + 1e-9 * Math.PI/64 * (0.8-(nm-400)*0.004)
      * 480000e-12 * 50 * nm*1e-9 / (6.62607015e-34 * 299792458) * (0.2+(nm-400)*0.004)
      * raw.frame.capture.exposure.shutterSeconds, 0);
    expect(exposure.expectedGeneratedElectronCount / expected).toBeCloseTo(1, 14);
    return { ...site, charge: { ...site.charge, photoSignal: exposure } };
  });
  const produced = simulateSensorRawFrame({ ...raw, sites });
  expect(simulateSensorRawFrame({ ...raw, sites })).toEqual(produced);
  const output = loadPhotographicExportInput(); output.reconstruction.rawFrame = produced.value.frame;
  const pair = await createPhotographicExportPair(output);
  expect(await createPhotographicExportPair(output)).toEqual(pair);
  const bytes = pair.dng.bytes, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let strip = -1;
  for (let i = 0; i < view.getUint16(8, true); i++) {
    const offset = 10+12*i; if (view.getUint16(offset, true) === 273) strip = view.getUint32(offset+8, true);
  }
  expect(strip).toBeGreaterThan(0);
  expect(Array.from({ length: 4 }, (_, i) => view.getUint16(strip+2*i, true)))
    .toEqual(produced.value.frame.samples.map(s => s.rawCode));
});

describe("scene to sensor node bindings", () => {
  it.each(["missing", "duplicate", "spatial", "wavelength", "basis", "time", "provider", "result", "sample-id", "negative-radiance", "invalid-time", "profile", "sparse", "rgb-fidelity"])("rejects %s", fault => {
    const request = sceneOpticalInput(), sample = request.samples[0]!;
    if (fault === "missing") request.samples = request.samples.slice(1);
    if (fault === "duplicate") request.samples = request.samples.map(() => sample);
    if (fault === "spatial") sample.node.spatialNode.apertureSampleXIndex = 999;
    if (fault === "wavelength") sample.sceneRadianceRequest.wavelengthNanometers = 450;
    if (fault === "basis") sample.sceneRadianceRequest.wavelengthBasis = "air";
    if (fault === "time") sample.sceneRadianceRequest.timeSecondsFromExposureStart = 0.01;
    if (fault === "provider") request.sceneBindings.providerProfile.profileId = "other";
    if (fault === "result") sample.sceneRadianceResult.sceneId = "other";
    if (fault === "sample-id") {
      request.samples[1]!.sceneRadianceRequest.sampleId = sample.sceneRadianceRequest.sampleId;
      request.samples[1]!.sceneRadianceResult.sampleId = sample.sceneRadianceRequest.sampleId;
    }
    if (fault === "negative-radiance") sample.sceneRadianceResult.spectralRadianceWattsPerSquareMeterSteradianNanometer = -1;
    if (fault === "invalid-time") request.timeSecondsFromExposureStart = NaN;
    if (fault === "sparse") request.samples = Array(request.samples.length);
    if (fault === "rgb-fidelity") request.sceneBindings.providerProfile.fidelity.spectral = "rgb-derived-approximation";
    if (fault === "profile") request.optics.profile.sensorOpticalStackIncluded = true as false;
    expect(() => calculateSceneToSensorIrradianceQuadrature(request)).toThrow();
  });

  it("rejects a vignetting result from a different image point", () => {
    const request = sceneOpticalInput();
    request.samples[0]!.fieldThroughput = { kind: "illumination-vignetting-result", result:
      calculateIlluminationVignetting({ imagePointMm: { x: 0, y: 0 }, profile: { normalizationRadiusMm: 20, maximumNormalizedRadius: 1, coefficients: { r2: -0.5, r4: 0, r6: 0 } } }).value };
    expect(() => calculateSceneToSensorIrradianceQuadrature(request)).toThrow();
  });
});
