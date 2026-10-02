// SPDX-License-Identifier: Apache-2.0
import { calculateSensorSpatialSamplingQuadrature, calculateSensorSpectralQuadrature,
  type CalculateSensorEqeLocalExposureInput, type SensorRawProducerInput } from "../../src/index.js";
import { colorProfile, spectralProfile, applicationProfile, operatingProfile,
  evidence, operatingConditions } from "./eqe-response-fixture.js";
import { imagingArea, nativeRaster, samplingProfile, bindingProfile, absentStack } from "./spatial-sample-fixture.js";

export function input(): CalculateSensorEqeLocalExposureInput {
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

export function withSamples(result: CalculateSensorEqeLocalExposureInput, intensity = 2): CalculateSensorEqeLocalExposureInput {
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


/** Rebind the owned sensor approximation to one exact native RAW fixture site. */
export function producerSiteInput(raw: SensorRawProducerInput, site: SensorRawProducerInput["sites"][number]): CalculateSensorEqeLocalExposureInput {
  const duration = raw.frame.capture.exposure.shutterSeconds;
  const request = input(), photo = site.charge.photoSignal;
  if (photo.kind !== "eqe-expected-counts") throw new Error("Fixture requires stationary source identity.");
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
  return request;
}
