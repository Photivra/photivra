// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Deterministic per-sensor-instance fixed-pattern noise (FPN): photo-response non-uniformity (PRNU),
 * dark-signal non-uniformity (DSNU), hot pixels and row/column readout offsets, with the
 * definitions of EMVA Standard 1288 Release 4.0 (spatial non-uniformity of the photo response and of
 * the dark signal). The pattern is seeded from an explicit sensor-instance seed and absolute
 * colour-sampling site coordinates, never from the per-capture temporal noise seed, so the same
 * sensor instance shows the same pattern in every capture.
 *
 * Application points in the readout chain (see raw-readout.ts):
 * - PRNU multiplies the expected photo charge before photo shot-noise sampling;
 * - DSNU and hot pixels multiply the population-mean dark-current expectation before dark shot-noise
 *   sampling, so their excess charge scales with exposure duration and with the declared
 *   temperature model of the dark-current profile;
 * - row and column offsets are input-referred electron offsets added with read noise, before the
 *   pre-ADC threshold.
 *
 * The thermal dark-current contract itself remains a population mean; this module is a separate,
 * explicitly attached spatial model. Values are caller-declared (or synthetic preset values); nothing
 * here is measured calibration.
 * @see docs/MOTION_AND_SIGNAL.md for equations, coordinate/unit conventions, blockers and support
 * limits.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { parseEvidenceList, type EvidenceBackedFact, type EvidenceProvenance } from "../core/evidence-provenance.js";
import { requireAllowlistedRecord, requirePublicOpaqueId, requireInputObject } from "../core/record-validation.js";
import { InvalidScientificInputError } from "../core/validation.js";
import {
  createDeterministicUniformStream,
  deriveSensorFixedPatternSeedUint32,
  sampleDeterministicStandardNormal,
  SENSOR_FIXED_PATTERN_COLUMN_STREAM_ID,
  SENSOR_FIXED_PATTERN_DSNU_STREAM_ID,
  SENSOR_FIXED_PATTERN_HOT_PIXEL_STREAM_ID,
  SENSOR_FIXED_PATTERN_PRNU_STREAM_ID,
  SENSOR_FIXED_PATTERN_ROW_STREAM_ID
} from "./stochastic-seed.js";

export const SENSOR_FIXED_PATTERN_NOISE_PROFILE_SCHEMA_VERSION = "0.1.0" as const;
/** Versioned identity of the pattern-generation equations and seed schedule. */
export const SENSOR_FIXED_PATTERN_NOISE_MODEL = Object.freeze({ id: "photivra-sensor-fixed-pattern", version: "1.0.0" } as const);

/**
 * Explicit fixed-pattern parameters for one sensor instance. Every component is required; a zero
 * standard deviation, fraction or RMS disables that component.
 */
export interface SensorFixedPatternNoiseProfile {
  schemaVersion: typeof SENSOR_FIXED_PATTERN_NOISE_PROFILE_SCHEMA_VERSION;
  profileId: string;
  /** Colour-sampling lattice whose absolute site coordinates index the pattern. */
  colorSamplingProfileId: string;
  scientificStatus: "approximation";
  /** Sensor-instance identity, independent from every per-capture temporal seed. */
  sensorInstanceSeedUint32: number;
  /** EMVA 1288 PRNU: spatial standard deviation of the photo response divided by its mean. */
  photoResponseNonUniformity: { relativeStandardDeviation: EvidenceBackedFact<number> };
  /** Spatial standard deviation of the dark-current rate divided by the population-mean rate. */
  darkSignalNonUniformity: { relativeStandardDeviation: EvidenceBackedFact<number> };
  /** Fraction of sites whose dark-current rate is the population mean times the multiplier. */
  hotPixels: { siteFraction: EvidenceBackedFact<number>; darkCurrentMultiplier: EvidenceBackedFact<number> };
  /** Static per-row input-referred readout offset, normal with zero mean. */
  rowOffset: { rmsElectrons: EvidenceBackedFact<number> };
  /** Static per-column input-referred readout offset, normal with zero mean. */
  columnOffset: { rmsElectrons: EvidenceBackedFact<number> };
  patternDistribution: "normal-factors-truncated-at-zero";
  evidence: readonly EvidenceProvenance[];
  limitations: readonly string[];
}

/** The deterministic pattern values of one colour-sampling site. */
export interface SensorFixedPatternSiteValues {
  profileId: string;
  modelId: typeof SENSOR_FIXED_PATTERN_NOISE_MODEL.id;
  modelVersion: typeof SENSOR_FIXED_PATTERN_NOISE_MODEL.version;
  site: { x: number; y: number };
  /** Multiplies the expected photo charge (1 = no PRNU); never negative. */
  photoResponseGainFactor: number;
  /** Multiplies the population-mean dark expectation (1 = no DSNU); never negative. */
  darkCurrentFactor: number;
  hotPixel: boolean;
  rowOffsetElectrons: number;
  columnOffsetElectrons: number;
  /** rowOffsetElectrons + columnOffsetElectrons, added at readout. */
  readoutOffsetElectrons: number;
}

const FACT_KEYS = ["value", "evidence"];

function fact(value: unknown, path: string, maximum: number, minimum = 0): EvidenceBackedFact<number> {
  const record = requireAllowlistedRecord(value, FACT_KEYS, path + " must be an evidence-backed fact.");
  const v = record.value;
  if (typeof v !== "number" || !Number.isFinite(v) || v < minimum || v > maximum) {
    throw new InvalidConfigurationError(path + ".value must be finite from " + minimum + " through " + maximum + ".");
  }
  return { value: v, evidence: parseEvidenceList(record.evidence, path + ".evidence") };
}

function limitations(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    throw new InvalidConfigurationError("sensorFixedPatternNoise.limitations must be an array of non-empty strings.");
  }
  if (new Set(value).size !== value.length) {
    throw new InvalidConfigurationError("sensorFixedPatternNoise.limitations must not contain duplicates.");
  }
  return value.map((entry: string) => entry.trim());
}

/**
 * Validate an untrusted fixed-pattern noise declaration. Unknown keys, out-of-range parameters and
 * missing evidence fail closed. PRNU and DSNU relative standard deviations are limited to 0.5 and 5,
 * the hot-pixel multiplier to 1–1e6.
 * @param value - Untrusted data. TypeScript types alone are not validation.
 * @returns SensorFixedPatternNoiseProfile.
 * @see docs/MOTION_AND_SIGNAL.md for the model and its sources.
 */
export function parseSensorFixedPatternNoiseProfile(value: unknown): SensorFixedPatternNoiseProfile {
  const r = requireAllowlistedRecord(value, ["schemaVersion", "profileId", "colorSamplingProfileId", "scientificStatus",
    "sensorInstanceSeedUint32", "photoResponseNonUniformity", "darkSignalNonUniformity", "hotPixels", "rowOffset", "columnOffset",
    "patternDistribution", "evidence", "limitations"], "Invalid sensor fixed-pattern noise profile fields.");
  if (r.schemaVersion !== SENSOR_FIXED_PATTERN_NOISE_PROFILE_SCHEMA_VERSION) {
    throw new InvalidConfigurationError('sensorFixedPatternNoise.schemaVersion must be "' + SENSOR_FIXED_PATTERN_NOISE_PROFILE_SCHEMA_VERSION + '".');
  }
  if (r.scientificStatus !== "approximation") {
    throw new InvalidConfigurationError('sensorFixedPatternNoise.scientificStatus must be "approximation".');
  }
  if (r.patternDistribution !== "normal-factors-truncated-at-zero") {
    throw new InvalidConfigurationError('sensorFixedPatternNoise.patternDistribution must be "normal-factors-truncated-at-zero".');
  }
  const seed = r.sensorInstanceSeedUint32;
  if (typeof seed !== "number" || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new InvalidConfigurationError("sensorFixedPatternNoise.sensorInstanceSeedUint32 must be an unsigned 32-bit integer.");
  }
  const prnu = requireAllowlistedRecord(r.photoResponseNonUniformity, ["relativeStandardDeviation"], "Invalid PRNU fields.");
  const dsnu = requireAllowlistedRecord(r.darkSignalNonUniformity, ["relativeStandardDeviation"], "Invalid DSNU fields.");
  const hot = requireAllowlistedRecord(r.hotPixels, ["siteFraction", "darkCurrentMultiplier"], "Invalid hot-pixel fields.");
  const row = requireAllowlistedRecord(r.rowOffset, ["rmsElectrons"], "Invalid row-offset fields.");
  const column = requireAllowlistedRecord(r.columnOffset, ["rmsElectrons"], "Invalid column-offset fields.");
  return {
    schemaVersion: SENSOR_FIXED_PATTERN_NOISE_PROFILE_SCHEMA_VERSION,
    profileId: requirePublicOpaqueId(r.profileId, "sensorFixedPatternNoise.profileId must be a public opaque identifier."),
    colorSamplingProfileId: requirePublicOpaqueId(r.colorSamplingProfileId, "sensorFixedPatternNoise.colorSamplingProfileId must be a public opaque identifier."),
    scientificStatus: "approximation",
    sensorInstanceSeedUint32: seed,
    photoResponseNonUniformity: { relativeStandardDeviation: fact(prnu.relativeStandardDeviation, "photoResponseNonUniformity.relativeStandardDeviation", 0.5) },
    darkSignalNonUniformity: { relativeStandardDeviation: fact(dsnu.relativeStandardDeviation, "darkSignalNonUniformity.relativeStandardDeviation", 5) },
    hotPixels: { siteFraction: fact(hot.siteFraction, "hotPixels.siteFraction", 1),
      darkCurrentMultiplier: fact(hot.darkCurrentMultiplier, "hotPixels.darkCurrentMultiplier", 1e6, 1) },
    rowOffset: { rmsElectrons: fact(row.rmsElectrons, "rowOffset.rmsElectrons", 1e6) },
    columnOffset: { rmsElectrons: fact(column.rmsElectrons, "columnOffset.rmsElectrons", 1e6) },
    patternDistribution: "normal-factors-truncated-at-zero",
    evidence: parseEvidenceList(r.evidence, "sensorFixedPatternNoise.evidence"),
    limitations: limitations(r.limitations)
  };
}

function normal(seed: number, x: number, y: number, stream: number): number {
  return sampleDeterministicStandardNormal(createDeterministicUniformStream(deriveSensorFixedPatternSeedUint32(seed, x, y, stream)));
}

/**
 * Evaluate the deterministic fixed-pattern values of one absolute colour-sampling site.
 *
 * - PRNU gain g = max(0, 1 + σ_PRNU·z₁);
 * - hot pixel when u < f_hot, then dark factor d = m_hot; otherwise d = max(0, 1 + σ_DSNU·z₂);
 * - row offset σ_row·z(row y), column offset σ_col·z(column x), in input-referred electrons.
 *
 * z are unit normals and u a uniform, each from its own MurmurHash3-seeded stream of
 * (sensorInstanceSeed, x, y, stream). Row values use x = 0 and column values y = 0 so a whole row or
 * column shares one value. The zero truncation biases the mean factor by less than 1e-6 for σ ≤ 0.2.
 * @param input - parsed or untrusted profile plus a nonnegative integer site.
 * @returns SensorFixedPatternSiteValues.
 */
export function calculateSensorFixedPatternSite(input: {
  profile: SensorFixedPatternNoiseProfile; site: { x: number; y: number };
}): SensorFixedPatternSiteValues {
  requireInputObject(input, "calculateSensorFixedPatternSite input");
  const profile = parseSensorFixedPatternNoiseProfile(input.profile);
  return evaluateParsedFixedPatternSite(profile, input.site);
}

/** Internal: evaluation for an already parsed profile. */
export function evaluateParsedFixedPatternSite(profile: SensorFixedPatternNoiseProfile,
  site: { x: number; y: number }): SensorFixedPatternSiteValues {
  const { x, y } = site ?? {};
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x > 0xffff_ffff || y > 0xffff_ffff) {
    throw new InvalidScientificInputError("Fixed-pattern site coordinates must be nonnegative uint32 integers.");
  }
  const seed = profile.sensorInstanceSeedUint32;
  const prnuSd = profile.photoResponseNonUniformity.relativeStandardDeviation.value;
  const dsnuSd = profile.darkSignalNonUniformity.relativeStandardDeviation.value;
  const hotFraction = profile.hotPixels.siteFraction.value;
  const rowRms = profile.rowOffset.rmsElectrons.value;
  const columnRms = profile.columnOffset.rmsElectrons.value;
  const photoResponseGainFactor = prnuSd === 0 ? 1 : Math.max(0, 1 + prnuSd * normal(seed, x, y, SENSOR_FIXED_PATTERN_PRNU_STREAM_ID));
  const hotPixel = hotFraction > 0 &&
    createDeterministicUniformStream(deriveSensorFixedPatternSeedUint32(seed, x, y, SENSOR_FIXED_PATTERN_HOT_PIXEL_STREAM_ID)).next() < hotFraction;
  const darkCurrentFactor = hotPixel ? profile.hotPixels.darkCurrentMultiplier.value :
    dsnuSd === 0 ? 1 : Math.max(0, 1 + dsnuSd * normal(seed, x, y, SENSOR_FIXED_PATTERN_DSNU_STREAM_ID));
  const rowOffsetElectrons = rowRms === 0 ? 0 : rowRms * normal(seed, 0, y, SENSOR_FIXED_PATTERN_ROW_STREAM_ID);
  const columnOffsetElectrons = columnRms === 0 ? 0 : columnRms * normal(seed, x, 0, SENSOR_FIXED_PATTERN_COLUMN_STREAM_ID);
  return {
    profileId: profile.profileId,
    modelId: SENSOR_FIXED_PATTERN_NOISE_MODEL.id,
    modelVersion: SENSOR_FIXED_PATTERN_NOISE_MODEL.version,
    site: { x, y },
    photoResponseGainFactor,
    darkCurrentFactor,
    hotPixel,
    rowOffsetElectrons,
    columnOffsetElectrons,
    readoutOffsetElectrons: rowOffsetElectrons + columnOffsetElectrons
  };
}
