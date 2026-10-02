// SPDX-License-Identifier: Apache-2.0

import { calculateCaptureExposureWindows, parseSceneIlluminationTemporalProfile,
  type CalculateEnvironmentSensorPhotoSignalInput, type SimulateEnvironmentSensorRawFrameInput,
  type SceneRadianceEvaluationRequest, type SceneRadianceEvaluationResult } from "../../src/index.js";
import { input as sensorInput, producerSiteInput } from "./eqe-exposure-fixture.js";
import { sceneOpticalInput } from "./scene-optical-quadrature-fixture.js";
import { psfInput } from "./psf-quadrature-fixture.js";
import { evidence } from "./eqe-response-fixture.js";
import { loadSensorRawProducerInput } from "./sensor-raw-producer-fixture.js";

export function evaluator(request: Readonly<SceneRadianceEvaluationRequest>, scale = 1): SceneRadianceEvaluationResult {
  return { schemaVersion: "0.1.0", sampleId: request.sampleId, sceneId: request.sceneId, providerProfileId: request.providerProfileId,
    wavelengthNanometers: request.wavelengthNanometers, wavelengthBasis: request.wavelengthBasis,
    quantity: "outgoing-spectral-radiance", unit: "W/m^2/sr/nm",
    spectralRadianceWattsPerSquareMeterSteradianNanometer: scale*(1+200*request.timeSecondsFromExposureStart),
    scientificStatus: "approximation", uncertainty: { kind: "not-quantified", limitation: "Owned analytic environment only." },
    evidence: evidence("test:executed-environment"), limitations: ["Synthetic time-varying uniform angular field."] };
}
export function siteInput(base = sensorInput(), psf = true): CalculateEnvironmentSensorPhotoSignalInput {
  base.spectralResponseProfile.channels = base.spectralResponseProfile.channels.map(c => c.kind === "separable-channel-filter-and-detector-eqe" ? c :
    { ...c, responseScope: "sensor-package-incident-effective-channel-response" });
  base.responseApplication.sourcePlane.value = "sensor-package-incident";
  const { irradianceSamples, stationarityProfile, ...sensor } = base;void irradianceSamples;void stationarityProfile;
  const scene = sceneOpticalInput(base), p = psfInput();
  scene.sceneBindings.providerProfile.illuminationTemporalProfileId = "time-lights";
  scene.sceneBindings.illuminationTemporalProfile = parseSceneIlluminationTemporalProfile({ schemaVersion: "0.1.0", profileId: "time-lights",
    sceneId: "room", illuminationProfileId: "lights", evidence: evidence("test:time-lights"),
    waveforms: [{ waveformId: "ramp", kind: "aperiodic-relative-multiplier", timeUnit: "s", scientificStatus: "approximation",
      uncertainty: { kind: "not-quantified", limitation: "Synthetic linear light ramp." }, evidence: evidence("test:ramp"),
      interpolation: "piecewise-linear", outsideSupportBehavior: "zero", samples: [
        { timeSecondsFromWaveformReference: 0, relativeMagnitudeMultiplier: 1 },
        { timeSecondsFromWaveformReference: 1, relativeMagnitudeMultiplier: 201 }] }],
    sourceBindings: [{ bindingId: "sky-time", sourceId: "sky", waveformId: "ramp", captureTimeReference: "first-opening-boundary-phase",
      waveformTimeZeroSecondsFromCaptureReference: 0, scientificStatus: "approximation",
      timingUncertainty: { kind: "not-quantified", limitation: "Owned exact synthetic clock." }, evidence: evidence("test:sky-time") }],
    baseIlluminationProfileRemainsAuthoritative: true, sensorReadoutTimingUsedAsExposureTiming: false, automaticExposurePolicyIncluded: false });
  return { temporalIntegrationId: "environment-test", sensor, sceneBindings: scene.sceneBindings, optics: scene.optics,
    motion: { angularVelocityRadPerSec: { pitch: .2, yaw: .4, roll: .3 }, timeReference: "first-opening-boundary-phase",
      environmentDirectionConvention: "outgoing-radiance-toward-camera" }, temporalSampleCount: 2,
    fieldThroughput: { kind: "unity", evidence: evidence("test:unity"), limitation: "Declared unity field throughput." },
    psf: psf ? { kind: "sampled-local", configuration: { psf: p.psf, psfWavelengthBasis: p.psfWavelengthBasis, spatialModel: p.spatialModel } } :
      { kind: "not-applied", evidence: evidence("test:no-psf"), limitation: "Point optics only; no lens blur." }, evaluateRadiance: evaluator };
}
export function frameInput(rolling = false, sampledPsf = false): SimulateEnvironmentSensorRawFrameInput {
  const raw = loadSensorRawProducerInput(), ev = raw.frame.colorSamplingProfile.evidence;
  const scan = { kind: "uniform-linear-native-scan" as const, directionNative: { value: "right-to-left" as const, evidence: ev },
    traversalDurationSeconds: { value: .002, unit: "s" as const, evidence: ev } };
  const exposureWindow = { shutterMechanism: "electronic" as const, nominalExposureDurationSeconds: {
    value: raw.frame.capture.exposure.shutterSeconds, unit: "s" as const, evidence: ev },
    opening: rolling ? scan : { kind: "simultaneous" as const }, closing: rolling ? scan : { kind: "simultaneous" as const } };
  const windows = calculateCaptureExposureWindows({ ...exposureWindow, nativeRaster: raw.frame.capture.geometry.nativeRaster,
    samplePointsNative: raw.sites.map((_, i) => ({ x: i%2+.5, y: Math.floor(i/2)+.5 })) }).value;
  return { frame: raw.frame, sceneBinding: { sceneStateId: raw.frame.capture.sceneStateId, providerSceneId: "room", evidence: ev },
    exposureWindow, evaluateRadiance: q => evaluator(q, 1e-9), sites: raw.sites.map((s, i) => {
      const e = siteInput(producerSiteInput(raw, s), sampledPsf), w = windows.samples[i]!;
      e.temporalIntegrationId = `environment-site-${i}`;
      e.sensor.localExposure.exposureWindowInput = { ...exposureWindow, nativeRaster: raw.frame.capture.geometry.nativeRaster };
      e.optics.focalLengthMm = raw.frame.capture.exposure.focalLengthMm;
      e.optics.nominalFNumber = raw.frame.capture.exposure.aperture;
      e.optics.profile.applicability.focalLengthMm = { minimum: e.optics.focalLengthMm, maximum: e.optics.focalLengthMm };
      e.optics.focus = raw.frame.capture.focus.kind === "infinity" ? { kind: "infinity-focus" } :
        { kind: "ideal-symmetric-thin-lens", objectDistanceM: raw.frame.capture.focus.distanceM, pupilMagnificationAssumption: "unity" };
      if(e.psf.kind === "sampled-local") {
        const configuration=e.psf.configuration.psf;
        configuration.focalLengthMm=e.optics.focalLengthMm;configuration.apertureFNumber=e.optics.nominalFNumber;configuration.focus=raw.frame.capture.focus;
        const diopters=configuration.focus.kind === "infinity" ? 0 : 1/configuration.focus.distanceM;
        configuration.profile.axes.focalLengthMm=[configuration.focalLengthMm];configuration.profile.axes.apertureFNumber=[configuration.apertureFNumber];configuration.profile.axes.focusDiopters=[diopters];
        configuration.profile.nodes=configuration.profile.nodes.map(n=>({...n,coordinate:{...n.coordinate,focalLengthMm:configuration.focalLengthMm,apertureFNumber:configuration.apertureFNumber,focusDiopters:diopters}}));
      }
      const { evaluateRadiance, ...environment } = e;void evaluateRadiance;
      const { charge: old, ...readout } = s;
      const { photoSignal, darkCharge, ...charge } = old;void darkCharge;
      charge.completenessProfile.startOffsetSecondsFromOpeningReference = w.startOffsetSecondsFromOpeningReference;
      charge.completenessProfile.endOffsetSecondsFromOpeningReference = w.endOffsetSecondsFromOpeningReference;
      return { environment, readout, charge, operatingTemperatureC: 20, darkCurrentProfile: { schemaVersion: "0.1.0", profileId: "dark-test",
        colorSamplingProfileId: photoSignal.colorSamplingProfileId, channelId: photoSignal.channelId, scientificStatus: "approximation",
        evidence: ev, uncertainty: { kind: "not-quantified", limitation: "Synthetic dark fixture." },
        chargeMeaning: "pre-compensation-thermally-generated-electrons", siteApplicability: { kind: "exact-site", site: photoSignal.site },
        temperatureModel: { kind: "fixed-reference-temperature", referenceTemperatureC: 20, darkCurrentElectronsPerSecond: 4 },
        darkCurrentCompensationIncluded: false, spatialDarkCurrentNonuniformityModeled: true } };
    }) };
}
