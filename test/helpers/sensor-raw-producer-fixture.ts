// SPDX-License-Identifier: Apache-2.0

import { createSimulatedCapture, SENSOR_RAW_PRODUCER_NOISE_MODEL, type SensorRawProducerInput,
  type ComposeSensorAccumulatedChargeInput } from "../../src/index.js";
import { loadPhotographicExportInput } from "./photographic-export-fixture.js";

/** Declared synthetic EQE/dark exposure expectations, not scene radiometry or calibration evidence. */
export function loadSensorRawProducerInput(): SensorRawProducerInput {
  const old = loadPhotographicExportInput().reconstruction.rawFrame;
  const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _g, equivalentFocalLength35Mm: _f, ...capture } = old.capture;
  void _s; void _e; void _g; void _f;
  const frame: SensorRawProducerInput["frame"] = { frameId: old.frameId,
    capture: createSimulatedCapture({ ...capture, noise: { ...capture.noise, model: SENSOR_RAW_PRODUCER_NOISE_MODEL } }).value,
    modeId: old.modeId, captureModeProfile: old.captureModeProfile, colorSamplingProfile: old.colorSamplingProfile,
    bindingProfile: old.bindingProfile, containerBitDepth: 16 };
  const evidence = old.colorSamplingProfile.evidence, duration = frame.capture.exposure.shutterSeconds;
  return { frame, sites: old.samples.map((s, i): SensorRawProducerInput["sites"][number] => {
    const expected = [0, 10, 100, 800][i]!, identity = { colorSamplingProfileId: "cfa", channelId: s.channelId,
      site: s.colorSamplingSite, bindingId: frame.bindingProfile.bindingId, stationarityProfileId: "stationary-test",
      timeReference: "first-opening-boundary-phase" as const, startOffsetSecondsFromOpeningReference: 0,
      endOffsetSecondsFromOpeningReference: duration, localExposureDurationSeconds: duration };
    const exposureEvidence = { stationarity: evidence, exposureBinding: { binding: evidence, colorSamplingProfile: evidence,
      nominalExposureDuration: evidence, openingBoundary: [], closingBoundary: [] } };
    const photoSignal: ComposeSensorAccumulatedChargeInput["photoSignal"] = { ...identity,
      kind: "eqe-expected-counts", stationarityStatus: "approximation", integrationMethod: "constant-rate-times-local-exposure-duration",
      timeStationarityEstablished: true, temporalIntegrationApplied: true, exposureDurationApplied: true,
      timeVaryingSignalIntegrated: false, multiFrameSequenceIntegrated: false, darkChargeIncluded: false, otherChargeIncluded: false,
      accumulatedSignalCompleteness: "photo-signal-only", physicalFullWellAssessmentAuthorized: false,
      cameraSaturationAssessmentAuthorized: false, saturationAssessed: false, shotNoiseApplied: false, readNoiseApplied: false,
      adcQuantizationApplied: false, rawCodeValueProduced: false, componentEvidence: exposureEvidence,
      incidentPhotonRatePerSecond: 2*expected/duration, expectedGeneratedElectronRatePerSecond: expected/duration,
      expectedIncidentPhotonCount: 2*expected, expectedGeneratedElectronCount: expected, countsAreExpectationValues: true,
      integerPhotonCountSampled: false, integerElectronCountSampled: false, chargeCalculated: false, currentCalculated: false };
    const darkCharge: ComposeSensorAccumulatedChargeInput["darkCharge"] = { ...identity,
      darkCurrentProfileId: "dark-test", operatingTemperatureC: 20, temperatureModel: "fixed-reference-temperature",
      temperatureInterpolationUsed: false, darkCurrentElectronsPerSecond: 0, expectedDarkElectronCount: 0,
      countMeaning: "expected-thermally-generated-electrons", expectationValueOnly: true, integerDarkElectronCountSampled: false,
      darkShotNoiseApplied: false, darkCurrentCompensationApplied: false, spatialDarkCurrentNonuniformityModeled: true,
      photoSignalIncluded: false, otherChargeIncluded: false, physicalFullWellAssessmentAuthorized: false, saturationAssessed: false,
      componentEvidence: { darkCurrent: evidence, siteApproximation: [], exposure: exposureEvidence } };
    return { charge: { photoSignal, darkCharge, completenessProfile: { schemaVersion: "0.1.0", profileId: "complete-test",
      colorSamplingProfileId: "cfa", channelId: s.channelId, site: s.colorSamplingSite, bindingId: identity.bindingId,
      timeReference: identity.timeReference, startOffsetSecondsFromOpeningReference: 0, endOffsetSecondsFromOpeningReference: duration,
      darkCurrentProfileId: "dark-test", includedAdditionalComponentIds: [], coverageMeaning: "all-material-stored-electron-contributors-accounted-for",
      scientificStatus: "approximation", evidence, limitation: "Declared owned fixture expectations, no calibration." } },
    samplingProfile: { schemaVersion: "0.1.0", profileId: "charge-test", completenessProfileId: "complete-test", scientificStatus: "approximation",
      photoShotNoiseModel: "poisson", darkShotNoiseModel: "poisson", additionalComponentPolicies: [], evidence, limitations: ["Owned fixture sampling."] },
    capacityProfile: { schemaVersion: "0.1.0", profileId: "capacity-test", colorSamplingProfileId: "cfa", channelId: s.channelId,
      capacityMeaning: "physical-charge-storage-capacity-electrons", capacityElectrons: 1000, scientificStatus: "approximation",
      uncertainty: { kind: "not-quantified", limitation: "Synthetic fixture only." }, evidence,
      siteApplicability: { kind: "exact-site", site: s.colorSamplingSite }, operatingState: { stateId: "state-test", evidence },
      temperatureApplicability: { kind: "exact-reference-temperature", temperatureC: 20 } }, operatingStateId: "state-test",
    readoutProfile: { schemaVersion: "0.1.0", profileId: "readout-test", colorSamplingProfileId: "cfa", channelId: s.channelId,
      regimeSelectionOwnedBy: "explicit-upstream-camera-state-not-inferred-from-iso", evidence, regimes: [{ regimeId: "base",
        scientificStatus: "approximation", systemConversionGainElectronsPerCode: { value: 1, evidence },
        preAdcSaturationElectronEquivalent: { value: 1000, evidence }, readNoiseComponents: [{ componentId: "read",
          rmsElectrons: { value: 2, evidence }, evidence }], adc: { bitDepth: 10, blackLevelCode: 64, digitalSaturationCode: 1023,
          transfer: "uniform-round-half-up" }, evidence, limitations: ["Explicit synthetic conversion, not ISO-derived."] }] }, regimeId: "base" };
  }) };
}
