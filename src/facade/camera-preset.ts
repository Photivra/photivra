// SPDX-License-Identifier: Apache-2.0

/**
 * Validation of a caller-supplied camera preset for simulateCapture(). A preset object (for example a
 * modified copy of a resolveGenericEquipmentTierCatalog() entry) must have exactly the preset shape:
 * unknown fields at the top level, in `body`, in `lens` or in `lens.matchedReference` are rejected,
 * and every profile is re-checked with its own strict parser, so a misspelled or stale field fails
 * instead of being silently ignored.
 * @see docs/QUICK_START.md for the facade contract.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { parseEvidenceList } from "../core/evidence-provenance.js";
import { rejectUnknownFields, requireInputObject, requirePublicOpaqueId } from "../core/record-validation.js";
import type { GenericEquipmentTierPreset } from "../equipment/generic-tier-assets.js";
import { parseGenericBodyExposureCapabilityProfile, parseGenericLensExposureCapabilityProfile } from "../equipment/exposure-capabilities.js";
import { parseIsoCapabilityProfile } from "../equipment/iso-capabilities.js";
import { parseGenericReleaseCapabilityProfile } from "../equipment/release-capabilities.js";
import { parseGenericBodyMeteringCapabilityProfile } from "../equipment/metering-capabilities.js";
import { parseFocusControlProfile } from "../capture/focus-control.js";
import { parseWhiteBalanceProfile } from "../color/white-balance.js";
import { parseStabilizationSystemProfile } from "../stabilization/system.js";
import { parseSensorReadoutConversionProfile } from "../sensor/raw-readout.js";
import { parseGenericIsoSignalChainProfile } from "../sensor/iso-signal-chain.js";
import { parseSensorFixedPatternNoiseProfile } from "../sensor/fixed-pattern-noise.js";
import { parseExposureMeteringProfile } from "../exposure/metering.js";
import { parseFlashSyncCapabilityProfile } from "../exposure/flash.js";

const PRESET_FIELDS = ["tier", "label", "presetId", "presetVersion", "scientificStatus", "evidence", "body", "lens", "tradeoffs"] as const;
const BODY_FIELDS = ["exposure", "iso", "signalChain", "readout", "readoutTiming", "rollingReadoutTiming", "fixedPatternNoise", "release", "focus",
  "stabilization", "whiteBalance", "metering", "meteringCapabilities", "flashSync"] as const;
const LENS_FIELDS = ["form", "exposure", "matchedReference", "profileReferences", "limitations"] as const;
const MATCHED_REFERENCE_FIELDS = ["focalLengthMm", "aperture", "focusDistanceM", "wavelengthNm", "normalizationRadiusMm", "distortionK1",
  "lateralCaK1Offset", "vignettingR2", "breathingProjectionScale", "transmission", "correctionGainStrength", "correctionCaFraction",
  "ghostPowerFraction", "veilPowerFraction", "pupilAmplitudeByField", "pupilOpdMicrometersByDefocus", "pupilThroughputByField"] as const;
const VERSIONED_ASSET_FIELDS = ["assetId", "assetVersion", "profile"] as const;

function objectWithFields(value: unknown, fields: readonly string[], path: string): Record<string, unknown> {
  requireInputObject(value, path);
  rejectUnknownFields(value as object, fields, path);
  return value as Record<string, unknown>;
}
function stringList(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new InvalidConfigurationError(path + " must be an array of strings.");
}
function versionedAsset(value: unknown, path: string, parse?: (profile: unknown) => unknown): void {
  const asset = objectWithFields(value, VERSIONED_ASSET_FIELDS, path);
  requirePublicOpaqueId(asset.assetId, path + ".assetId is invalid.");
  if (typeof asset.assetVersion !== "string" || asset.assetVersion.length === 0) throw new InvalidConfigurationError(path + ".assetVersion must be a non-empty string.");
  requireInputObject(asset.profile, path + ".profile");
  parse?.(asset.profile);
}
function versionedAssetList(value: unknown, path: string, parse: (profile: unknown) => unknown): void {
  if (!Array.isArray(value) || value.length === 0) throw new InvalidConfigurationError(path + " must be a non-empty array.");
  value.forEach((asset, index) => versionedAsset(asset, path + "[" + index + "]", parse));
}

/**
 * Checks a caller-supplied camera preset object and returns it unchanged. Throws InvalidConfigurationError
 * (or the profile parser's domain error) for a missing or malformed part or an unknown field.
 * Readout-timing declarations have no standalone parser; they are checked for shape only and are not
 * read by simulateCapture().
 */
export function parseCallerCameraPreset(value: unknown): GenericEquipmentTierPreset {
  const preset = objectWithFields(value, PRESET_FIELDS, "camera");
  if (typeof preset.tier !== "string" || typeof preset.label !== "string") throw new InvalidConfigurationError("camera.tier and camera.label must be strings.");
  requirePublicOpaqueId(preset.presetId, "camera.presetId is invalid.");
  if (typeof preset.presetVersion !== "string" || preset.presetVersion.length === 0) throw new InvalidConfigurationError("camera.presetVersion must be a non-empty string.");
  if (preset.scientificStatus !== "approximation") throw new InvalidConfigurationError("camera.scientificStatus must be \"approximation\".");
  parseEvidenceList(preset.evidence, "camera.evidence");
  stringList(preset.tradeoffs, "camera.tradeoffs");

  const body = objectWithFields(preset.body, BODY_FIELDS, "camera.body");
  parseGenericBodyExposureCapabilityProfile(body.exposure);
  parseIsoCapabilityProfile(body.iso);
  parseGenericIsoSignalChainProfile(body.signalChain);
  versionedAssetList(body.readout, "camera.body.readout", parseSensorReadoutConversionProfile);
  versionedAsset(body.readoutTiming, "camera.body.readoutTiming");
  versionedAsset(body.rollingReadoutTiming, "camera.body.rollingReadoutTiming");
  versionedAsset(body.fixedPatternNoise, "camera.body.fixedPatternNoise", parseSensorFixedPatternNoiseProfile);
  parseGenericReleaseCapabilityProfile(body.release);
  parseFocusControlProfile(body.focus);
  parseStabilizationSystemProfile(body.stabilization);
  parseWhiteBalanceProfile(body.whiteBalance);
  versionedAssetList(body.metering, "camera.body.metering", parseExposureMeteringProfile);
  parseGenericBodyMeteringCapabilityProfile(body.meteringCapabilities);
  parseFlashSyncCapabilityProfile(body.flashSync);

  const lens = objectWithFields(preset.lens, LENS_FIELDS, "camera.lens");
  if (lens.form !== "prime") throw new InvalidConfigurationError("camera.lens.form must be \"prime\".");
  parseGenericLensExposureCapabilityProfile(lens.exposure);
  objectWithFields(lens.matchedReference, MATCHED_REFERENCE_FIELDS, "camera.lens.matchedReference");
  if (!Array.isArray(lens.profileReferences)) throw new InvalidConfigurationError("camera.lens.profileReferences must be an array.");
  lens.profileReferences.forEach((reference, index) => {
    const r = objectWithFields(reference, ["profileId", "profileVersion"], "camera.lens.profileReferences[" + index + "]");
    if (typeof r.profileId !== "string" || typeof r.profileVersion !== "string") throw new InvalidConfigurationError("camera.lens.profileReferences[" + index + "] needs string profileId and profileVersion.");
  });
  stringList(lens.limitations, "camera.lens.limitations");
  return value as GenericEquipmentTierPreset;
}
