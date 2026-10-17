// SPDX-License-Identifier: Apache-2.0

/**
 * Guide-number relations and manufacturer-independent through-the-lens (TTL) flash exposure with a
 * pre-flash. The pre-flash is measured with the existing relative exposure meter; the solved power
 * fraction is applied to a ManualFlashProfile, whose pulse is then placed by the existing front/rear
 * curtain sync (resolveManualFlashSync) or high-speed sync (resolveHighSpeedFlashSync). Flash/TTL
 * metering stays separate from ambient metering: the ambient meter result is an input, not modified.
 * No vendor TTL algorithm, zone weighting table or flash protocol is reproduced.
 * @see docs/SCENE_SENSOR_TEMPORAL_EXPOSURE.md#flash-guide-number-ttl-and-high-speed-sync
 */

import { approximationResult, type CalculationResult } from "../core/calculation-result.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { requireInputKeys, requireInputObject } from "../core/record-validation.js";
import { parseManualFlashProfile, type ManualFlashProfile } from "./flash.js";
import {
  meterRelativeExposure,
  parseExposureMeteringProfile,
  type ExposureMeteringProfile,
  type ExposureMeteringSampleSet
} from "./metering.js";

export const TTL_FLASH_MODEL = Object.freeze({ id: "preflash-linear-ttl", version: "1.0.0" } as const);

function requirePositive(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new InvalidConfigurationError(name + " must be a finite number greater than zero.");
  }
  return value;
}

function requireFraction(value: unknown, name: string): number {
  const parsed = requirePositive(value, name);
  if (parsed > 1) throw new InvalidConfigurationError(name + " must lie in (0, 1].");
  return parsed;
}

export interface FlashGuideNumberInput {
  /** Guide number at full power for ISO 100, in metres (GN = distance · f-number). */
  fullPowerGuideNumberMetersIso100: number;
  /** Output as a fraction of full power, (0, 1]. */
  powerFraction: number;
  iso: number;
}

/**
 * Effective guide number GN = GN_full · √p · √(ISO/100).
 *
 * The guide number relation GN = d·N follows from the inverse-square law: the subject illuminance
 * from a point-like flash falls as 1/d², the sensor exposure as 1/N², so correct exposure holds while
 * d·N is constant (ISO 2827 defines its measurement). Exposure scales linearly with emitted energy
 * (power fraction p) and the required exposure inversely with ISO speed, so GN ∝ √p·√ISO.
 */
export function calculateFlashGuideNumber(input: FlashGuideNumberInput): number {
  requireInputKeys(input, "calculateFlashGuideNumber", ["fullPowerGuideNumberMetersIso100", "powerFraction", "iso"]);
  return requirePositive(input.fullPowerGuideNumberMetersIso100, "fullPowerGuideNumberMetersIso100") *
    Math.sqrt(requireFraction(input.powerFraction, "powerFraction")) *
    Math.sqrt(requirePositive(input.iso, "iso") / 100);
}

export interface FlashPowerForDistanceInput {
  fullPowerGuideNumberMetersIso100: number;
  subjectDistanceM: number;
  apertureFNumber: number;
  iso: number;
  /** Lowest available power fraction, (0, 1]. */
  minimumPowerFraction: number;
}

export interface FlashPowerForDistance {
  /** p = (d·N / (GN_full·√(ISO/100)))², before clamping. */
  requiredPowerFraction: number;
  powerFraction: number;
  status: "within-range" | "clamped-at-minimum-power" | "clamped-at-full-power";
  /** log2(delivered / required) flash exposure; positive is overexposure. */
  flashExposureErrorStops: number;
  /** GN_full·√(ISO/100)/N: the farthest correctly exposed distance at full power. */
  maximumDistanceM: number;
}

/** Manual guide-number exposure: the power fraction that exposes a subject at distance d correctly. */
export function calculateFlashPowerForDistance(input: FlashPowerForDistanceInput): FlashPowerForDistance {
  requireInputKeys(input, "calculateFlashPowerForDistance", ["fullPowerGuideNumberMetersIso100", "subjectDistanceM",
    "apertureFNumber", "iso", "minimumPowerFraction"]);
  const gnIso = calculateFlashGuideNumber({ fullPowerGuideNumberMetersIso100: input.fullPowerGuideNumberMetersIso100,
    powerFraction: 1, iso: input.iso });
  const distance = requirePositive(input.subjectDistanceM, "subjectDistanceM");
  const aperture = requirePositive(input.apertureFNumber, "apertureFNumber");
  const minimum = requireFraction(input.minimumPowerFraction, "minimumPowerFraction");
  const required = (distance * aperture / gnIso) ** 2;
  const power = Math.min(1, Math.max(minimum, required));
  return { requiredPowerFraction: required, powerFraction: power,
    status: required < minimum ? "clamped-at-minimum-power" : required > 1 ? "clamped-at-full-power" : "within-range",
    flashExposureErrorStops: Math.log2(power / required), maximumDistanceM: gnIso / aperture };
}

export interface ResolveTtlFlashExposureInput {
  /** Spatially linear metering profile (multi-zone-uniform, center-weighted-radial or spot). */
  meteringProfile: ExposureMeteringProfile;
  /** Measurement-window samples with the flash off. */
  ambientSampleSet: ExposureMeteringSampleSet;
  /** The same zones and settings with the pre-flash fired. */
  preFlashSampleSet: ExposureMeteringSampleSet;
  /** Pre-flash output as a fraction of full power, (0, 1]. */
  preFlashPowerFraction: number;
  /**
   * Ratio of ambient integration in the main exposure to the measurement window at the same
   * aperture/ISO (e.g. t_main/t_measure), ≥ 0. The flash pulse lies inside both, so it does not scale.
   */
  ambientScaleToMainExposure: number;
  /** Flash exposure compensation applied to the TTL target, in stops. */
  flashExposureCompensationStops: number;
  /** Lowest available main-flash power fraction, (0, 1]. */
  minimumPowerFraction: number;
  /**
   * Flash energy delivered per line relative to an ordinary pulse at the same power fraction: 1 for
   * front/rear-curtain sync, η·t_e/D for HSS (see resolveHighSpeedFlashSync). Defaults to 1.
   */
  syncEnergyFactor?: number;
  /** Optional guide-number reporting. */
  guideNumber?: { fullPowerGuideNumberMetersIso100: number; iso: number; apertureFNumber: number };
}

export interface TtlFlashExposure {
  modelId: typeof TTL_FLASH_MODEL.id;
  modelVersion: typeof TTL_FLASH_MODEL.version;
  status: "resolved" | "clamped-at-minimum-power" | "clamped-at-full-power" | "no-flash-return";
  /** Metered ambient signal in the main exposure: k·M(ambient). */
  ambientMainExposureMeteredSignal: number;
  /** Metered flash-only signal per unit full power: M(preflash − ambient)/p_pre. */
  flashMeteredSignalPerFullPower: number;
  /** T·2^FEC. */
  targetRelativeSignal: number;
  /** Unclamped solution (T' − k·A)/(F·syncEnergyFactor); null with no flash return. */
  requiredPowerFraction: number | null;
  /** Commanded main-flash power fraction (clamped); null with no flash return. */
  powerFraction: number | null;
  ambientAloneReachesTarget: boolean;
  predictedMeteredSignal: number;
  /** log2(predicted / target); 0 when the solution is within range; null when nothing is predicted. */
  predictedExposureErrorStops: number | null;
  effectiveGuideNumberMetersAtIso: number | null;
  flashRangeAtApertureM: number | null;
  preFlashInsideMainExposure: false;
  ambientMeteringModified: false;
}

const LINEAR_POLICIES = new Set(["multi-zone-uniform", "center-weighted-radial", "spot"]);

function sameZones(a: ExposureMeteringSampleSet, b: ExposureMeteringSampleSet): void {
  if (a.sceneStateId !== b.sceneStateId || a.samples.length !== b.samples.length ||
    JSON.stringify(a.captureGeometry) !== JSON.stringify(b.captureGeometry)) {
    throw new InvalidScientificInputError("Ambient and pre-flash measurements must share scene state, geometry and zones.");
  }
  a.samples.forEach((sample, index) => {
    const other = b.samples[index]!;
    if (sample.sampleId !== other.sampleId || sample.areaWeight !== other.areaWeight ||
      sample.positionOrientedCaptureUv.u !== other.positionOrientedCaptureUv.u ||
      sample.positionOrientedCaptureUv.v !== other.positionOrientedCaptureUv.v) {
      throw new InvalidScientificInputError("Ambient and pre-flash zones must match exactly and in order.");
    }
  });
}

/**
 * Solves the main-flash power from a pre-flash measurement (manufacturer-independent TTL).
 *
 * The meter is linear for the admitted policies, M(a + b) = M(a) + M(b). The pre-flash at power
 * p_pre adds the flash-only signal f_i = pre_i − ambient_i per zone; flash signal is proportional to
 * emitted energy, so at main power p it contributes (p/p_pre)·M(f). With ambient scaled to the main
 * exposure by k, the metered total is k·A + p·F with F = M(f)/p_pre. Setting it equal to the target
 * T' = T·2^FEC gives p = (T' − k·A)/(F·s), s the sync energy factor (1 ordinary, η·t_e/D for HSS),
 * clamped to [p_min, 1] (the guide-number range). Highlight policies are rejected because their
 * weights depend on the signal and the total is no longer linear in p.
 */
export function resolveTtlFlashExposure(input: ResolveTtlFlashExposureInput): CalculationResult<TtlFlashExposure> {
  requireInputObject(input, "resolveTtlFlashExposure input");
  requireInputObject(input.ambientSampleSet, "resolveTtlFlashExposure ambientSampleSet");
  requireInputObject(input.preFlashSampleSet, "resolveTtlFlashExposure preFlashSampleSet");
  if (!Array.isArray(input.ambientSampleSet.samples) || !Array.isArray(input.preFlashSampleSet.samples)) {
    throw new InvalidConfigurationError("TTL sample sets must contain sample arrays.");
  }
  const profile = parseExposureMeteringProfile(input.meteringProfile);
  if (!LINEAR_POLICIES.has(profile.policy.kind)) {
    throw new InvalidScientificInputError(
      "TTL flash requires a spatially linear metering policy (multi-zone-uniform, center-weighted-radial or spot)."
    );
  }
  sameZones(input.ambientSampleSet, input.preFlashSampleSet);
  const preFlash = requireFraction(input.preFlashPowerFraction, "preFlashPowerFraction");
  const minimum = requireFraction(input.minimumPowerFraction, "minimumPowerFraction");
  const k = input.ambientScaleToMainExposure;
  if (typeof k !== "number" || !Number.isFinite(k) || k < 0) {
    throw new InvalidConfigurationError("ambientScaleToMainExposure must be a finite number greater than or equal to zero.");
  }
  const fec = input.flashExposureCompensationStops;
  if (typeof fec !== "number" || !Number.isFinite(fec)) {
    throw new InvalidConfigurationError("flashExposureCompensationStops must be finite.");
  }
  const syncFactor = input.syncEnergyFactor === undefined ? 1 : requireFraction(input.syncEnergyFactor, "syncEnergyFactor");
  const flashOnly: ExposureMeteringSampleSet = { ...input.preFlashSampleSet,
    measurementId: input.preFlashSampleSet.measurementId + ":flash-only",
    samples: input.preFlashSampleSet.samples.map((sample, index) => {
      const difference = sample.relativeLinearSignal - input.ambientSampleSet.samples[index]!.relativeLinearSignal;
      if (!(difference >= 0)) {
        throw new InvalidScientificInputError("Pre-flash signal must not be below the ambient signal in any zone.");
      }
      return { ...sample, relativeLinearSignal: difference };
    }) };
  const ambient = meterRelativeExposure({ profile, sampleSet: input.ambientSampleSet }).value.meteredRelativeSignal;
  const flashPerFull = meterRelativeExposure({ profile, sampleSet: flashOnly }).value.meteredRelativeSignal / preFlash;
  const ambientMain = k * ambient;
  const target = profile.target.targetRelativeSignal * Math.pow(2, fec);
  const deliveredPerFull = flashPerFull * syncFactor;
  let status: TtlFlashExposure["status"], required: number | null, power: number | null;
  if (deliveredPerFull === 0) {
    status = "no-flash-return"; required = null; power = null;
  } else {
    required = (target - ambientMain) / deliveredPerFull;
    power = Math.min(1, Math.max(minimum, required));
    status = required < minimum ? "clamped-at-minimum-power" : required > 1 ? "clamped-at-full-power" : "resolved";
  }
  const predicted = ambientMain + (power ?? 0) * deliveredPerFull;
  const gn = input.guideNumber;
  const effectiveGn = gn === undefined || power === null ? null : calculateFlashGuideNumber({
    fullPowerGuideNumberMetersIso100: gn.fullPowerGuideNumberMetersIso100, powerFraction: power, iso: gn.iso }) * Math.sqrt(syncFactor);
  return approximationResult({
    modelId: TTL_FLASH_MODEL.id,
    modelVersion: TTL_FLASH_MODEL.version,
    status,
    ambientMainExposureMeteredSignal: ambientMain,
    flashMeteredSignalPerFullPower: flashPerFull,
    targetRelativeSignal: target,
    requiredPowerFraction: required,
    powerFraction: power,
    ambientAloneReachesTarget: ambientMain >= target,
    predictedMeteredSignal: predicted,
    predictedExposureErrorStops: predicted > 0 ? Math.log2(predicted / target) : null,
    effectiveGuideNumberMetersAtIso: effectiveGn,
    flashRangeAtApertureM: effectiveGn === null || gn === undefined ? null : effectiveGn / requirePositive(gn.apertureFNumber, "apertureFNumber"),
    preFlashInsideMainExposure: false,
    ambientMeteringModified: false
  }, TTL_FLASH_MODEL.id, TTL_FLASH_MODEL.version, [
    "Relative pre-exposure meter signals only; no calibrated flash energy, subject reflectance or distance is inferred.",
    "Flash signal is assumed proportional to emitted energy and fully inside the main exposure (pulse) or each line's slit (HSS factor).",
    "The pre-flash precedes the main exposure; subject motion and ambient change between pre-flash and exposure are not modeled.",
    "This is a generic linear pre-flash solution, not any manufacturer's TTL algorithm, zone weighting or flash protocol."
  ]);
}

/**
 * Returns a copy of a manual flash profile whose relative output is scaled by a resolved TTL power
 * fraction, ready for resolveManualFlashSync (front/rear curtain). For HSS pass the unscaled profile and
 * `ttl.powerFraction` as resolveHighSpeedFlashSync's powerFraction instead, so power is applied once.
 */
export function createTtlScaledFlashProfile(flashProfile: ManualFlashProfile, ttl: TtlFlashExposure): ManualFlashProfile {
  const flash = parseManualFlashProfile(flashProfile);
  requireInputObject(ttl, "createTtlScaledFlashProfile ttl");
  if (ttl.powerFraction === null || typeof ttl.powerFraction !== "number") {
    throw new InvalidScientificInputError("TTL found no flash return; there is no power fraction to apply.");
  }
  return { ...flash, outputControl: { ...flash.outputControl, scale: flash.outputControl.scale * ttl.powerFraction } };
}
