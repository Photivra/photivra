// SPDX-License-Identifier: Apache-2.0

import type { EvidenceBackedFact, EvidenceProvenance } from "../core/evidence-provenance.js";
import { parseGenericBodyExposureCapabilityProfile, parseGenericLensExposureCapabilityProfile,
  type GenericBodyExposureCapabilityProfile, type GenericLensExposureCapabilityProfile } from "./exposure-capabilities.js";
import { parseIsoCapabilityProfile, type IsoCapabilityProfile } from "./iso-capabilities.js";
import { parseGenericReleaseCapabilityProfile, type GenericReleaseCapabilityProfile } from "./release-capabilities.js";
import { parseFocusControlProfile, type FocusControlProfile } from "../capture/focus-control.js";
import { parseWhiteBalanceProfile, type WhiteBalanceProfile } from "../color/white-balance.js";
import { parseStabilizationSystemProfile, type StabilizationSystemProfile } from "../stabilization/system.js";
import { parseSensorReadoutConversionProfile, type SensorReadoutConversionProfile } from "../sensor/raw-readout.js";
import { parseGenericIsoSignalChainProfile, type GenericIsoSignalChainProfile } from "../sensor/iso-signal-chain.js";
import { parseExposureMeteringProfile, type ExposureMeteringProfile } from "../exposure/metering.js";
import { parseGenericBodyMeteringCapabilityProfile, type GenericBodyMeteringCapabilityProfile } from "./metering-capabilities.js";
import { parseFlashSyncCapabilityProfile, type FlashSyncCapabilityProfile } from "../exposure/flash.js";
import type { SensorReadoutTimingDeclaration } from "../sensor/readout-timing.js";

export type GenericEquipmentTier = "consumer" | "prosumer" | "professional";
export interface GenericVersionedAsset<T> { assetId: string; assetVersion: string; profile: T }
export interface GenericTierBodyAssets {
  exposure: GenericBodyExposureCapabilityProfile;
  iso: IsoCapabilityProfile;
  signalChain: GenericIsoSignalChainProfile;
  readout: readonly GenericVersionedAsset<SensorReadoutConversionProfile>[];
  readoutTiming: GenericVersionedAsset<SensorReadoutTimingDeclaration>;
  release: GenericReleaseCapabilityProfile;
  focus: FocusControlProfile;
  stabilization: StabilizationSystemProfile;
  whiteBalance: WhiteBalanceProfile;
  metering: readonly GenericVersionedAsset<ExposureMeteringProfile>[];
  meteringCapabilities: GenericBodyMeteringCapabilityProfile;
  flashSync: FlashSyncCapabilityProfile;
}
export interface GenericTierLensAssets {
  form: "prime";
  exposure: GenericLensExposureCapabilityProfile;
  /** Explicit synthetic coefficients, not measured calibration or a quality score. */
  matchedReference: {
    focalLengthMm: 50; aperture: 4; focusDistanceM: 5; wavelengthNm: 550;
    normalizationRadiusMm: number;
    distortionK1: number; lateralCaK1Offset: number; vignettingR2: number;
    breathingProjectionScale: number; transmission: number;
    correctionGainStrength: number; correctionCaFraction: number;
    ghostPowerFraction: number; veilPowerFraction: number;
    pupilAmplitudeByField: readonly (readonly number[])[];
    pupilOpdMicrometersByDefocus: readonly (readonly number[])[];
    pupilThroughputByField: readonly number[];
  };
  profileReferences: readonly { profileId: string; profileVersion: string }[];
  limitations: readonly string[];
}
export interface GenericEquipmentTierPreset {
  tier: GenericEquipmentTier;
  label: "Consumer" | "Prosumer" | "Professional";
  presetId: string; presetVersion: "1.0.0";
  scientificStatus: "approximation";
  evidence: readonly EvidenceProvenance[];
  body: GenericTierBodyAssets;
  lens: GenericTierLensAssets;
  tradeoffs: readonly string[];
}

const evidence: readonly EvidenceProvenance[] = [{ sourceOrigin: "photivra", sourceReference: "photivra:generic-tier-assets-v1",
  reuseStatus: "photivra-owned" }];
const limitations = ["Synthetic educational design values; no named camera/lens calibration or population ranking."];
const fact = <T>(value: T): EvidenceBackedFact<T> => ({ value, evidence });
const version = "1.0.0";
const disk = [0,0,1,0,0, 0,1,1,1,0, 1,1,1,1,1, 0,1,1,1,0, 0,0,1,0,0];
const clipped = [0,0,1,0,0, 0,1,1,1,0, 0,1,1,1,1, 0,1,1,1,0, 0,0,1,0,0];
const clippedMore = [0,0,0,0,0, 0,0,1,1,0, 0,0,1,1,1, 0,0,1,1,0, 0,0,0,0,0];
const near = [0,0,.12,0,0, 0,.06,0,.06,0, .12,0,-.04,0,.12, 0,.06,0,.06,0, 0,0,.12,0,0];
const flat = Array<number>(25).fill(0);
const far = near.map((v) => -v);

/** Data construction only: tier labels never enter downstream scientific equations. */
function bodyAssets(id: string, isoMax: number, cadence: number, frames: number, readNoise: number,
  dataReadoutSeconds: number, gain: number, maxAngle: number, continuousAf: boolean, advancedPolicies: boolean): GenericTierBodyAssets {
  const isoValues = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600].filter((v) => v <= isoMax);
  const exposure = parseGenericBodyExposureCapabilityProfile({ schemaVersion: "0.1.0", profileId: id+":exposure", profileVersion: version,
    scientificStatus: "approximation", evidence, shutter: { durationSecondsRange: fact({ minimum: 1/8000, maximum: 30 }), settingGrid: { kind: "continuous-within-range" } },
    iso: { range: fact({ minimum: 100, maximum: isoMax }), settingGrid: { kind: "discrete-values", values: fact(isoValues) }, autoIso: fact("supported") } });
  const iso = parseIsoCapabilityProfile({ schemaVersion: "0.1.0", profileId: id+":iso", profileVersion: version,
    capabilityMeaning: "reported-exposure-index-capability-not-physical-gain", standard: { exposureIndexRange: { minimum: 100, maximum: isoMax },
      settingGrid: { kind: "discrete-values", values: isoValues } }, expandedSettings: [], autoIso: { availability: "supported", standardExposureIndexRange: { minimum: 100, maximum: isoMax }, evidence },
    captureModePolicies: [], evidence });
  const readout = ["red", "green", "blue"].map((channelId): GenericVersionedAsset<SensorReadoutConversionProfile> => ({ assetId: id+":readout:"+channelId, assetVersion: version,
    profile: parseSensorReadoutConversionProfile({ schemaVersion: "0.1.0", profileId: id+":readout", colorSamplingProfileId: "photivra-generic-bayer", channelId,
      regimeSelectionOwnedBy: "explicit-upstream-camera-state-not-inferred-from-iso", evidence,
      regimes: [{ regimeId: "base", scientificStatus: "approximation", systemConversionGainElectronsPerCode: fact(1),
        preAdcSaturationElectronEquivalent: fact(20000), readNoiseComponents: [{ componentId: "electronic", rmsElectrons: fact(readNoise), evidence }],
        adc: { bitDepth: 16, blackLevelCode: 512, digitalSaturationCode: 65535, transfer: "uniform-round-half-up" }, evidence, limitations },
      { regimeId: "high", scientificStatus: "approximation", systemConversionGainElectronsPerCode: fact(.25),
        preAdcSaturationElectronEquivalent: fact(12000), readNoiseComponents: [{ componentId: "electronic", rmsElectrons: fact(readNoise*.75), evidence }],
        adc: { bitDepth: 16, blackLevelCode: 512, digitalSaturationCode: 65535, transfer: "uniform-round-half-up" }, evidence, limitations }] }) }));
  const signalChain = parseGenericIsoSignalChainProfile({ schemaVersion: "0.1.0", profileId: id+":signal-chain", profileVersion: version,
    scientificStatus: "approximation", isoCapabilityProfileId: iso.profileId, readoutProfileId: id+":readout",
    behaviorMeaning: "iso-state-selects-explicit-readout-regime-not-noise-equation", captureModeBindings: [{ captureModeId: "native-still",
      standardRegimeBands: [{ minimumExposureIndex: 100, maximumExposureIndex: 400, readoutRegimeId: "base" },
        { minimumExposureIndex: 800, maximumExposureIndex: isoMax, readoutRegimeId: "high" }], expandedRegimeBindings: [], evidence }],
    photonShotNoiseOwnedUpstream: true, processedImageBehaviorIncluded: false, fixedPatternNoiseModeled: false, lowSignalColorDegradationModeled: false,
    evidence, limitations });
  const release = parseGenericReleaseCapabilityProfile({ schemaVersion: "0.1.0", profileId: id+":release", profileVersion: version,
    scientificStatus: "approximation", evidence, supportedDriveModes: fact(["single", "burst", "self-timer"]), maximumLogicalFramesPerSequence: fact(frames),
    maximumCadenceFps: fact(cadence), minimumInterFrameGapSeconds: fact(0), overlappingOrdinaryStillExposures: false,
    exposureBracketing: { availability: fact("supported"), supportedAxes: ["shutter", "iso"] }, focusBracketing: { availability: fact("unsupported") } });
  const focus = parseFocusControlProfile({ schemaVersion: "0.1.0", profileId: id+":focus", profileVersion: version, scientificStatus: "approximation",
    supportedModes: continuousAf ? ["manual", "single-af", "continuous-af"] : ["manual", "single-af"], actuator: { kind: "ideal-instantaneous", evidence },
    continuousTargetLossPolicy: "hold-last-focus-require-explicit-reacquisition", supportedReleasePriorities: ["focus-priority", "release-priority", "balanced"],
    evidence, limitations: [...limitations, "AF actuator speed and subject recognition are not tier performance claims."] });
  const stabilization = parseStabilizationSystemProfile({ schemaVersion: "0.1.0", profileId: id+":stabilization", profileVersion: version,
    profileKind: "generic-synthetic", scientificStatus: "approximation", architecture: "sensor-shift", captureKind: "still",
    axisResponses: ["pitch", "yaw", "roll"].map((axis) => ({ axis, correctionGain: fact(gain), latencySeconds: fact(.001), maximumCorrectionAngleRad: fact(maxAngle) })),
    panningPolicy: { kind: "none" }, controlTransientModeled: false, spontaneousDriftModeled: false, cameraTranslationCorrectionModeled: false,
    digitalStabilizationIncluded: false, supportPolicyIncluded: false, stopRatingUsedAsDynamicResponse: false, evidence, limitations });
  const whiteBalance = parseWhiteBalanceProfile({ schemaVersion: "0.1.0", profileId: id+":white-balance", profileVersion: version,
    scientificStatus: "approximation", inputDomain: "relative-pre-wb-camera-linear-rgb", presets: [{ presetId: "neutral", label: "Neutral reference",
      channelGains: fact({ red: 1, green: 1, blue: 1 }) }], awbPolicies: [
      { policyId: "neutral-priority", intent: "neutral-priority", correctionStrength: fact(1) },
      ...(advancedPolicies ? [{ policyId: "ambience", intent: "ambience-preserving", correctionStrength: fact(.5) }] : [])], evidence, limitations });
  const metering = [{ kind: "multi-zone-uniform" }, ...(advancedPolicies ? [{ kind: "highlight-weighted", minimumWeightFraction: .2, exponent: 2 }] : [])]
    .map((policy): GenericVersionedAsset<ExposureMeteringProfile> => ({ assetId: id+":meter:"+policy.kind, assetVersion: version,
      profile: parseExposureMeteringProfile({ schemaVersion: "0.1.0", profileId: id+":meter:"+policy.kind, scientificStatus: "approximation",
        inputDomain: "relative-pre-exposure-linear-signal", captureRegion: "oriented-active-capture", policy,
        target: { kind: "relative-signal-reference", targetRelativeSignal: .18, evidence }, evidence,
        limitations: [...limitations, "0.18 is a declared target policy, not universal scene/camera truth."] }) }));
  const meteringCapabilities = parseGenericBodyMeteringCapabilityProfile({ schemaVersion: "0.1.0", profileId: id+":metering-capabilities", profileVersion: version,
    scientificStatus: "approximation", evidence, supportedMeteringProfiles: metering.map((m) => ({ meteringProfileId: m.profile.profileId, policyKind: m.profile.policy.kind, evidence })),
    spotFocusPointLinkage: { availability: "unsupported", evidence } });
  const timingId = id+":data-readout";
  return { exposure, iso, signalChain, readout, release, focus, stabilization, whiteBalance, metering, meteringCapabilities,
    readoutTiming: { assetId: timingId, assetVersion: version, profile: { readoutMode: "global", captureReadoutDurationSeconds: {
      value: dataReadoutSeconds, unit: "s", evidence } } },
    flashSync: parseFlashSyncCapabilityProfile({ schemaVersion: "0.1.0", profileId: id+":flash-sync", profileVersion: version,
      captureModeId: "native-still", timingProfileId: timingId, supportedOrdinarySyncModes: ["front-curtain", "rear-curtain"],
      highSpeedSyncSupported: false, ordinarySyncRequiresWholeActiveFrameSimultaneouslyExposed: true, evidence, limitations }) };
}
function lensAssets(id: string, r: GenericTierLensAssets["matchedReference"]): GenericTierLensAssets {
  return { form: "prime", exposure: parseGenericLensExposureCapabilityProfile({ schemaVersion: "0.1.0", profileId: id+":exposure", profileVersion: version,
    scientificStatus: "approximation", evidence, focalLengthMmRange: fact({ minimum: 50, maximum: 50 }), aperture: { widestAvailableFNumber: {
      kind: "constant", fNumber: fact(4) }, narrowestAvailableFNumber: fact(16), settingGrid: { kind: "continuous-within-range" } } }),
    matchedReference: r, profileReferences: ["radial", "lateral-ca", "vignetting", "breathing", "transmission", "pupil", "stray", "correction"]
      .map((role) => ({ profileId: id+":"+role, profileVersion: version })),
    limitations: [...limitations, "Optical reference response is limited to 50 mm, f/4, focus 5 m and explicit field/defocus/wavelength slices; capabilities do not authorize extrapolation.",
      "The initial prime has no OIS; body stabilization is separate."] };
}
const common = { focalLengthMm: 50 as const, aperture: 4 as const, focusDistanceM: 5 as const, wavelengthNm: 550 as const,
  normalizationRadiusMm: Math.hypot(18,12), correctionCaFraction: .8 };
export const GENERIC_TIER_ASSETS: readonly GenericEquipmentTierPreset[] = [
  { tier: "consumer", label: "Consumer", presetId: "photivra-consumer", presetVersion: version, scientificStatus: "approximation", evidence,
    body: bodyAssets("photivra-consumer-body", 6400, 4, 8, 6, .03, .35, .005, false, false),
    lens: lensAssets("photivra-consumer-prime", { ...common, distortionK1: -.06, lateralCaK1Offset: .008, vignettingR2: -.5,
      breathingProjectionScale: 1.03, transmission: .75, correctionGainStrength: .8, ghostPowerFraction: .006, veilPowerFraction: .012,
      pupilAmplitudeByField: [disk, clipped, clippedMore], pupilOpdMicrometersByDefocus: [near, flat, far], pupilThroughputByField: [1,.85,.65] }),
    tradeoffs: ["Limited continuous AF; heavier digital correction and edge pupil clipping in matched reference."] },
  { tier: "prosumer", label: "Prosumer", presetId: "photivra-prosumer", presetVersion: version, scientificStatus: "approximation", evidence,
    body: bodyAssets("photivra-prosumer-body", 12800, 8, 16, 3, .015, .65, .01, true, true),
    lens: lensAssets("photivra-prosumer-prime", { ...common, distortionK1: -.025, lateralCaK1Offset: .004, vignettingR2: -.25,
      breathingProjectionScale: 1.015, transmission: .85, correctionGainStrength: .6, ghostPowerFraction: .003, veilPowerFraction: .006,
      pupilAmplitudeByField: [disk, disk, clipped], pupilOpdMicrometersByDefocus: [near.map((v)=>v*.7), flat, far.map((v)=>v*.7)], pupilThroughputByField: [1,.95,.85] }),
    tradeoffs: ["Lower matched-reference peripheral gain/noise amplification than Professional; not universally inferior."] },
  { tier: "professional", label: "Professional", presetId: "photivra-professional", presetVersion: version, scientificStatus: "approximation", evidence,
    body: bodyAssets("photivra-professional-body", 25600, 12, 24, 2, .008, .85, .02, true, true),
    lens: lensAssets("photivra-professional-prime", { ...common, distortionK1: -.01, lateralCaK1Offset: .002, vignettingR2: -.35,
      breathingProjectionScale: 1.005, transmission: .9, correctionGainStrength: .8, ghostPowerFraction: .001, veilPowerFraction: .002,
      pupilAmplitudeByField: [disk, disk, disk], pupilOpdMicrometersByDefocus: [near.map((v)=>v*.9), flat, far.map((v)=>v*.6)], pupilThroughputByField: [1,.98,.95] }),
    tradeoffs: ["Less edge clipping/stray light, with greater f/4 falloff/gain cost than Prosumer and asymmetric near/far wavefront character."] }
];
