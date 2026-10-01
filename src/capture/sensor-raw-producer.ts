// SPDX-License-Identifier: Apache-2.0

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { parseEvidenceList } from "../core/evidence-provenance.js";
import { parseSimulatedCapture } from "./simulated-capture.js";
import { createSensorRawFrame, type SensorRawFrameInput, type SensorRawFrame } from "./sensor-raw-frame.js";
import { composeSensorAccumulatedCharge, parseSensorAccumulatedChargeCompletenessProfile, parseSensorAdditionalStoredChargeComponent,
  type ComposeSensorAccumulatedChargeInput } from "../sensor/accumulated-charge.js";
import { assessSensorPhysicalChargeCapacity, parseSensorPhysicalChargeCapacityProfile,
  type SensorPhysicalChargeCapacityProfile } from "../sensor/physical-charge-capacity.js";
import { simulateSensorChargeRealization, simulateSensorRawCode, parseSensorChargeSamplingProfile,
  parseSensorReadoutConversionProfile, resolveSensorReadoutRegime, type SensorChargeSamplingProfile, type SensorReadoutConversionProfile } from "../sensor/raw-readout.js";
import { createSensorRawCaptureSample } from "../sensor/raw-reconstruction.js";
import { parseSensorColorSamplingProfile } from "../sensor/color-sampling.js";
import { parseCaptureModeProfile } from "../sensor/capture-mode.js";
import { parseNativeEffectiveRasterColorSamplingBindingProfile, resolveCaptureModeColorSamplingContributors } from "../sensor/capture-color-sampling-binding.js";

export const SENSOR_RAW_PRODUCER_SCHEMA_VERSION = "0.1.0" as const;
/** Capture noise model identity required by this producer's versioned per-site seed schedule. */
export const SENSOR_RAW_PRODUCER_NOISE_MODEL = Object.freeze({ id: "photivra-native-raw-noise", version: "0.1.0" } as const);
/** One declared EQE/dark/completeness event and explicit readout state per native site. */
export interface SensorRawProducerSiteInput {
  charge: ComposeSensorAccumulatedChargeInput;
  samplingProfile: SensorChargeSamplingProfile;
  capacityProfile: SensorPhysicalChargeCapacityProfile;
  operatingStateId: string;
  readoutProfile: SensorReadoutConversionProfile;
  regimeId: string;
}
/** Bounded single-frame global-exposure handoff, never a conversion from independent RGB pixels. */
export interface SensorRawProducerInput {
  frame: Omit<SensorRawFrameInput, "samples">;
  sites: readonly SensorRawProducerSiteInput[];
}
/** Engine-produced codes and child diagnostics; upstream radiance/response truth remains declared. */
export interface SensorRawProducerResult {
  schemaVersion: typeof SENSOR_RAW_PRODUCER_SCHEMA_VERSION;
  codeProducer: "engine-charge-capacity-noise-adc";
  upstreamOrigin: "declared-eqe-and-dark-exposure-results";
  upstreamRadiometryVerified: false;
  seedSchedule: "capture-seed-plus-two-native-index-modulo-2-to-32-v1";
  frame: SensorRawFrame;
  sites: readonly {
    accumulatedCharge: ReturnType<typeof composeSensorAccumulatedCharge>;
    capacity: ReturnType<typeof assessSensorPhysicalChargeCapacity>;
    realization: ReturnType<typeof simulateSensorChargeRealization>;
    readout: ReturnType<typeof simulateSensorRawCode>;
  }[];
}
function fields(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((k) => !allowed.includes(k))) throw new InvalidConfigurationError("Invalid sensor RAW producer fields.");
  return value as Record<string, unknown>;
}
function publicId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new InvalidConfigurationError("Expected public producer identity.");
  return value;
}
function publicIdentities(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:Id|Version)$/.test(key)) publicId(child);
    else if (/Ids$/.test(key)) dense(child, 256).forEach(publicId);
    else publicIdentities(child);
  }
}
function dense(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum || Array.from({ length: value.length }, (_, i) => i in value).includes(false)) {
    throw new InvalidConfigurationError("Expected bounded dense producer array.");
  }
  return value;
}
function optionalEvidence(value: unknown): ReturnType<typeof parseEvidenceList> {
  return dense(value, 256).length === 0 ? [] : parseEvidenceList(value, "optionalExposureEvidence");
}
function exposureEvidence(value: unknown): ComposeSensorAccumulatedChargeInput["photoSignal"]["componentEvidence"] {
  const r = fields(value, ["stationarity", "exposureBinding"]);
  const b = fields(r.exposureBinding, ["binding", "colorSamplingProfile", "nominalExposureDuration", "openingBoundary", "closingBoundary"]);
  return { stationarity: parseEvidenceList(r.stationarity, "stationarity"), exposureBinding: {
    binding: parseEvidenceList(b.binding, "binding"), colorSamplingProfile: parseEvidenceList(b.colorSamplingProfile, "colorSamplingProfile"),
    nominalExposureDuration: parseEvidenceList(b.nominalExposureDuration, "nominalExposureDuration"),
    openingBoundary: optionalEvidence(b.openingBoundary), closingBoundary: optionalEvidence(b.closingBoundary) } };
}
const common = ["colorSamplingProfileId", "channelId", "site", "bindingId", "stationarityProfileId", "timeReference",
  "startOffsetSecondsFromOpeningReference", "endOffsetSecondsFromOpeningReference", "localExposureDurationSeconds", "componentEvidence"];
const photoTrue = ["timeStationarityEstablished", "temporalIntegrationApplied", "exposureDurationApplied", "countsAreExpectationValues"];
const photoFalse = ["timeVaryingSignalIntegrated", "multiFrameSequenceIntegrated", "darkChargeIncluded", "otherChargeIncluded",
  "physicalFullWellAssessmentAuthorized", "cameraSaturationAssessmentAuthorized", "saturationAssessed", "shotNoiseApplied",
  "readNoiseApplied", "adcQuantizationApplied", "rawCodeValueProduced", "integerPhotonCountSampled", "integerElectronCountSampled", "chargeCalculated", "currentCalculated"];
function chargeInput(value: unknown): ComposeSensorAccumulatedChargeInput {
  const r = fields(value, ["photoSignal", "darkCharge", "additionalChargeComponents", "completenessProfile"]);
  const p = fields(r.photoSignal, [...common, ...photoTrue, ...photoFalse, "kind", "stationarityStatus", "integrationMethod",
    "accumulatedSignalCompleteness", "incidentPhotonRatePerSecond", "expectedGeneratedElectronRatePerSecond", "expectedIncidentPhotonCount", "expectedGeneratedElectronCount"]);
  const darkFalse = ["integerDarkElectronCountSampled", "darkShotNoiseApplied", "darkCurrentCompensationApplied", "photoSignalIncluded",
    "otherChargeIncluded", "physicalFullWellAssessmentAuthorized", "saturationAssessed"];
  const d = fields(r.darkCharge, [...common, ...darkFalse, "darkCurrentProfileId", "operatingTemperatureC", "temperatureModel",
    "temperatureInterpolationUsed", "darkCurrentElectronsPerSecond", "expectedDarkElectronCount", "countMeaning", "expectationValueOnly", "spatialDarkCurrentNonuniformityModeled"]);
  if (p.kind !== "eqe-expected-counts" || p.integrationMethod !== "constant-rate-times-local-exposure-duration" ||
      p.accumulatedSignalCompleteness !== "photo-signal-only" || (p.stationarityStatus !== "established" && p.stationarityStatus !== "approximation") ||
      photoTrue.some((k) => p[k] !== true) || photoFalse.some((k) => p[k] !== false) || darkFalse.some((k) => d[k] !== false) ||
      d.expectationValueOnly !== true || d.countMeaning !== "expected-thermally-generated-electrons" ||
      typeof d.spatialDarkCurrentNonuniformityModeled !== "boolean" || typeof d.temperatureInterpolationUsed !== "boolean" ||
      (d.temperatureModel !== "fixed-reference-temperature" && d.temperatureModel !== "piecewise-linear-temperature-table")) {
    throw new InvalidConfigurationError("Producer requires untreated EQE/dark exposure expectations, not sampled, clipped or A/W charge.");
  }
  if (d.temperatureModel === "fixed-reference-temperature" && d.temperatureInterpolationUsed !== false) {
    throw new InvalidConfigurationError("Fixed-temperature dark result cannot claim temperature interpolation.");
  }
  for (const record of [p, d]) {
    for (const k of ["colorSamplingProfileId", "channelId", "bindingId", "stationarityProfileId"]) publicId(record[k]);
    fields(record.site, ["x", "y"]);
    if (record.timeReference !== "first-opening-boundary-phase") throw new InvalidConfigurationError("Unsupported producer time origin.");
  }
  publicId(d.darkCurrentProfileId);
  for (const [record, keys] of [[p, ["incidentPhotonRatePerSecond", "expectedGeneratedElectronRatePerSecond", "expectedIncidentPhotonCount", "expectedGeneratedElectronCount"]],
    [d, ["darkCurrentElectronsPerSecond", "expectedDarkElectronCount"]]] as const) {
    for (const k of keys) if (typeof record[k] !== "number" || !Number.isFinite(record[k]) || record[k] < 0) throw new InvalidConfigurationError("Invalid expected rates/counts.");
  }
  const duration = p.localExposureDurationSeconds;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0 ||
      p.expectedIncidentPhotonCount !== (p.incidentPhotonRatePerSecond as number)*duration ||
      p.expectedGeneratedElectronCount !== (p.expectedGeneratedElectronRatePerSecond as number)*duration ||
      d.expectedDarkElectronCount !== (d.darkCurrentElectronsPerSecond as number)*duration ||
      (p.expectedGeneratedElectronCount as number) > (p.expectedIncidentPhotonCount as number)) {
    throw new InvalidConfigurationError("Exposure expectations must match their exact constant-rate products and EQE domain.");
  }
  const e = fields(d.componentEvidence, ["darkCurrent", "siteApproximation", "exposure"]);
  const charge = { photoSignal: { ...p, componentEvidence: exposureEvidence(p.componentEvidence) },
    darkCharge: { ...d, componentEvidence: { darkCurrent: parseEvidenceList(e.darkCurrent, "darkCurrent"),
      siteApproximation: optionalEvidence(e.siteApproximation), exposure: exposureEvidence(e.exposure) } },
    completenessProfile: parseSensorAccumulatedChargeCompletenessProfile(r.completenessProfile),
    ...(r.additionalChargeComponents === undefined ? {} : { additionalChargeComponents:
      dense(r.additionalChargeComponents, 32).map(parseSensorAdditionalStoredChargeComponent) }) } as unknown as ComposeSensorAccumulatedChargeInput;
  // Existing composition owns exact photo/dark/additional/completeness event consistency.
  composeSensorAccumulatedCharge(charge);
  return charge;
}
/** Validates complete native global-exposure inputs; no charge/noise/RAW code is accepted as a shortcut. */
export function parseSensorRawProducerInput(value: unknown): SensorRawProducerInput {
  const r = fields(value, ["frame", "sites"]), f = fields(r.frame, ["frameId", "capture", "modeId", "captureModeProfile", "colorSamplingProfile", "bindingProfile", "containerBitDepth"]);
  const capture = parseSimulatedCapture(f.capture), native = capture.geometry.nativeRaster, count = native.pixelWidth*native.pixelHeight;
  const sites = dense(r.sites, 4096);
  const frame = { frameId: publicId(f.frameId), capture, modeId: publicId(f.modeId), containerBitDepth: 16 as const,
    captureModeProfile: parseCaptureModeProfile(f.captureModeProfile), colorSamplingProfile: parseSensorColorSamplingProfile(f.colorSamplingProfile),
    bindingProfile: parseNativeEffectiveRasterColorSamplingBindingProfile(f.bindingProfile) };
  const mode = frame.captureModeProfile.modes.find((m) => m.modeId === frame.modeId);
  if (f.containerBitDepth !== 16 || count > 4096 || sites.length !== count ||
      capture.noise.model.id !== SENSOR_RAW_PRODUCER_NOISE_MODEL.id || capture.noise.model.version !== SENSOR_RAW_PRODUCER_NOISE_MODEL.version ||
      frame.colorSamplingProfile.layout.kind !== "periodic-mosaic" || !mode || mode.acquisition.kind !== "single-frame" ||
      mode.perFrameSampling.kind !== "native-effective-raster" || (mode.reconstructionStages?.length ?? 0) !== 0) {
    throw new InvalidConfigurationError("Producer requires exact noise identity and bounded single-frame native CFA coverage.");
  }
  const parsed = sites.map((site, i): SensorRawProducerSiteInput => {
    const s = fields(site, ["charge", "samplingProfile", "capacityProfile", "operatingStateId", "readoutProfile", "regimeId"]);
    const charge = chargeInput(s.charge), p = charge.photoSignal;
    const contributors = resolveCaptureModeColorSamplingContributors({ nativeRaster: native, captureModeProfile: frame.captureModeProfile,
      modeId: frame.modeId, colorSamplingProfile: frame.colorSamplingProfile, bindingProfile: frame.bindingProfile,
      modeSampleIndexFullFrame: { x: i%native.pixelWidth, y: Math.floor(i/native.pixelWidth) } });
    if (contributors.totalContributorSites !== 1 || contributors.channelComposition.kind !== "single-channel" ||
        p.colorSamplingProfileId !== frame.colorSamplingProfile.profileId || p.channelId !== contributors.channelComposition.channelId ||
        p.site.x !== contributors.colorSamplingSiteRect.x || p.site.y !== contributors.colorSamplingSiteRect.y ||
        p.bindingId !== frame.bindingProfile.bindingId || p.startOffsetSecondsFromOpeningReference !== 0 ||
        p.endOffsetSecondsFromOpeningReference !== capture.exposure.shutterSeconds || p.localExposureDurationSeconds !== capture.exposure.shutterSeconds) {
      throw new InvalidConfigurationError("Charge site/channel/binding/global exposure differs from committed capture.");
    }
    return { charge, samplingProfile: parseSensorChargeSamplingProfile(s.samplingProfile), capacityProfile: parseSensorPhysicalChargeCapacityProfile(s.capacityProfile),
      operatingStateId: publicId(s.operatingStateId), readoutProfile: parseSensorReadoutConversionProfile(s.readoutProfile), regimeId: publicId(s.regimeId) };
  });
  for (const s of parsed) {
    publicIdentities(s);
    const readout = resolveSensorReadoutRegime({ profile: s.readoutProfile, regimeId: s.regimeId });
    if (s.readoutProfile.profileId !== parsed[0]!.readoutProfile.profileId || s.regimeId !== parsed[0]!.regimeId ||
        readout.regime.adc.bitDepth > 16 || readout.regime.adc.digitalSaturationCode <= readout.regime.adc.blackLevelCode ||
        s.readoutProfile.colorSamplingProfileId !== s.charge.photoSignal.colorSamplingProfileId ||
        s.readoutProfile.channelId !== s.charge.photoSignal.channelId || s.samplingProfile.completenessProfileId !== s.charge.completenessProfile.profileId) {
      throw new InvalidConfigurationError("Frame requires one readout identity/regime and a positive uint16 RAW code span.");
    }
  }
  publicIdentities(frame);
  return { frame, sites: parsed };
}
/** Composes existing accumulated-charge → capacity → Poisson → read noise/ADC → native sample → immutable frame contracts. */
export function simulateSensorRawFrame(input: SensorRawProducerInput): CalculationResult<SensorRawProducerResult> {
  const v = parseSensorRawProducerInput(input), seed = v.frame.capture.noise.seedUint32;
  const sites = v.sites.map((s, i): SensorRawProducerResult["sites"][number] => {
    const accumulatedCharge = composeSensorAccumulatedCharge(s.charge);
    const capacity = assessSensorPhysicalChargeCapacity({ accumulatedCharge: accumulatedCharge.value, capacityProfile: s.capacityProfile,
      operatingStateId: s.operatingStateId, operatingTemperatureC: s.charge.darkCharge.operatingTemperatureC });
    const realization = simulateSensorChargeRealization({ accumulatedCharge: accumulatedCharge.value, samplingProfile: s.samplingProfile,
      seedUint32: (seed+2*i) >>> 0 });
    const readout = simulateSensorRawCode({ chargeRealization: realization.value, physicalCapacityAssessment: capacity.value,
      readoutProfile: s.readoutProfile, regimeId: s.regimeId, readNoiseSeedUint32: (seed+2*i+1) >>> 0 });
    return { accumulatedCharge, capacity, realization, readout };
  });
  const native = v.frame.capture.geometry.nativeRaster;
  const samples = sites.map((s, i) => createSensorRawCaptureSample({ rawCode: s.readout.value,
    contributors: resolveCaptureModeColorSamplingContributors({ nativeRaster: native, captureModeProfile: v.frame.captureModeProfile,
      modeId: v.frame.modeId, colorSamplingProfile: v.frame.colorSamplingProfile, bindingProfile: v.frame.bindingProfile,
      modeSampleIndexFullFrame: { x: i%native.pixelWidth, y: Math.floor(i/native.pixelWidth) } }) }));
  return approximationResult({ schemaVersion: SENSOR_RAW_PRODUCER_SCHEMA_VERSION, codeProducer: "engine-charge-capacity-noise-adc",
    upstreamOrigin: "declared-eqe-and-dark-exposure-results", upstreamRadiometryVerified: false,
    seedSchedule: "capture-seed-plus-two-native-index-modulo-2-to-32-v1", frame: createSensorRawFrame({ ...v.frame, samples }), sites },
  "native-sensor-raw-frame-producer", SENSOR_RAW_PRODUCER_SCHEMA_VERSION, [
    "Untreated EQE/dark exposure results and completeness evidence are upstream declarations; source radiometry is not independently verified",
    "Native row-major site seeds are capture seed plus 2*index / 2*index+1 modulo 2^32; schedule identity is not an independence proof",
    "Existing scalar capacity/noise/readout approximations retain distinct physical/pre-ADC/digital saturation diagnostics; no blooming",
    "Global stationary exposure only; no rolling/local timing, multi-frame acquisition, RGB-to-RAW conversion or production-stage activation",
    "Stored capture float planes remain independent; same-RAW export must use the returned frame's reconstruction handoff"]);
}
