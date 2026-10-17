// SPDX-License-Identifier: Apache-2.0

/**
 * Packed sensor stage (#277): expected electrons per native site → seeded Poisson photo and dark charge →
 * physical capacity → Gaussian read noise → pre-ADC limit → ADC (INL, round half up, optional digital
 * gain) → RAW code, on typed arrays for one rectangular region of the native raster.
 *
 * This is the float64 CPU reference for the `webgpu-f32` sensor stage. It runs the same equations, the
 * same seeded noise model (`photivra-native-raw-noise` 0.4.0) and the same floating-point operation
 * order as `calculateNativeRawSite` in the per-site producer, so for the same expected electrons and
 * readout regime its codes are bit-identical to the per-site engine (tested). The per-site stream
 * seeds are MurmurHash3_x86_32 of (capture seed, absolute native row-major index, stream ID), so the
 * region and any banding cannot change a code.
 *
 * Optional (2.0): a fixed-pattern noise profile (`SENSOR_FIXED_PATTERN_NOISE_MODEL`; PRNU and DSNU or
 * hot-pixel factors on the Poisson means, row and column offsets added with read noise) and up to 8
 * additional stored-charge components (Poisson or deterministic), in the producer's exact order.
 *
 * Supported domain (frame-wide, fails closed otherwise): one readout regime, one physical charge
 * capacity, one fixed-pattern profile. See docs/WEBGPU.md.
 */
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireAllowlistedRecord } from "../core/record-validation.js";
import { adcTransfer, resolveSensorReadoutRegime, samplePoisson, type ResolvedSensorReadoutRegime,
  type SensorReadoutConversionProfile } from "../sensor/raw-readout.js";
import { createDeterministicUniformStream, deriveNativeSiteStreamSeedUint32, sampleDeterministicStandardNormal,
  NATIVE_SITE_CHARGE_STREAM_ID, NATIVE_SITE_READ_NOISE_STREAM_ID } from "../sensor/stochastic-seed.js";
import { evaluateFixedPatternColumnOffset, evaluateFixedPatternRowOffset, evaluateFixedPatternSiteFactors, parseSensorFixedPatternNoiseProfile,
  type SensorFixedPatternNoiseProfile } from "../sensor/fixed-pattern-noise.js";
import type { SensorAdditionalChargeSamplingModel } from "../sensor/raw-readout.js";
import { SENSOR_RAW_PRODUCER_NOISE_MODEL } from "./sensor-raw-producer.js";

export const PACKED_SENSOR_RAW_SCHEMA_VERSION = "0.1.0" as const;
export const PACKED_SENSOR_RAW_LIMITS = Object.freeze({
  maximumRegionSites: 24_000_000,
  maximumNativeSites: 0xffffffff,
  maximumDimension: 65_535,
  maximumAdcBitDepth: 16,
  maximumReadNoiseComponents: 16,
  maximumAdditionalChargeComponents: 8
});

/**
 * Optional fixed-pattern noise for a packed region. The colour-sampling site of native site (X, Y) is
 * (X + siteOrigin.x, Y + siteOrigin.y); the pattern is seeded from those coordinates, as in
 * `calculateSensorFixedPatternSite`.
 */
export interface PackedSensorFixedPatternNoise {
  profile: SensorFixedPatternNoiseProfile;
  /** Must equal `profile.colorSamplingProfileId`. */
  colorSamplingProfileId: string;
  siteOrigin: { x: number; y: number };
}
/** One additional stored-charge component, realized after photo and dark charge in declaration order. */
export interface PackedSensorAdditionalChargeComponent {
  componentId: string;
  /** `poisson` draws from the charge stream; `deterministic-expected-electron-equivalent` adds the expectation. */
  model: SensorAdditionalChargeSamplingModel;
  /** Expected electrons per region site, row-major. Finite, ≥ 0. */
  expectedElectrons: Float32Array | Float64Array;
}

export interface PackedSensorRawInput {
  schemaVersion: typeof PACKED_SENSOR_RAW_SCHEMA_VERSION;
  /** Full native raster. Site seeds use the absolute index `(region.y + row) * nativeWidth + region.x + column`. */
  nativeWidth: number;
  nativeHeight: number;
  /** Region of the native raster to simulate, in native sites. */
  region: { x: number; y: number; width: number; height: number };
  /** The committed capture's noise seed (`capture.noise.seedUint32`). */
  captureSeedUint32: number;
  /** Expected photo-generated electrons per region site (EQE and local exposure applied), row-major. Finite, ≥ 0. */
  photoElectrons: Float32Array | Float64Array;
  /** Expected dark electrons per region site, row-major. Finite, ≥ 0. */
  darkElectrons: Float32Array | Float64Array;
  /** Physical charge storage capacity in electrons, the same at every site. */
  physicalChargeCapacityElectrons: number;
  readoutProfile: SensorReadoutConversionProfile;
  regimeId: string;
  /** Optional (2.0). */
  fixedPatternNoise?: PackedSensorFixedPatternNoise;
  /** Optional (2.0), at most 8. */
  additionalChargeComponents?: readonly PackedSensorAdditionalChargeComponent[];
}

/** Validated plan. Arrays are borrowed, not copied. */
export interface PackedSensorRawPlan {
  nativeWidth: number;
  nativeHeight: number;
  region: Readonly<{ x: number; y: number; width: number; height: number }>;
  siteCount: number;
  captureSeedUint32: number;
  physicalChargeCapacityElectrons: number;
  readout: ResolvedSensorReadoutRegime;
  noiseModel: typeof SENSOR_RAW_PRODUCER_NOISE_MODEL;
  seedSchedule: "murmur3-capture-seed-native-index-stream-v2";
  /** Largest expected photo and dark electron counts in the region (before fixed-pattern factors). */
  maximumPhotoElectrons: number;
  maximumDarkElectrons: number;
  /** Parsed fixed-pattern profile and colour-site origin, or null. */
  fixedPatternNoise: Readonly<{ profile: SensorFixedPatternNoiseProfile; siteOrigin: Readonly<{ x: number; y: number }> }> | null;
  /** Additional components (identity, model and largest expectation); their arrays stay on the input. */
  additionalChargeComponents: readonly Readonly<{ componentId: string; model: SensorAdditionalChargeSamplingModel; maximumExpectedElectrons: number }>[];
}

/** Per-region saturation and clamp counts, as in the per-site readout diagnostics. */
export interface PackedSensorRawDiagnostics {
  physicalSaturationSiteCount: number;
  preAdcSaturationSiteCount: number;
  digitalSaturationSiteCount: number;
  lowerClampSiteCount: number;
}

export interface PackedSensorRawResult {
  plan: PackedSensorRawPlan;
  /** RAW codes, row-major over the region. */
  codes: Uint16Array;
  diagnostics: PackedSensorRawDiagnostics;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new InvalidConfigurationError("Invalid packed sensor RAW geometry or seed.");
  }
  return value;
}

function maximumOf(values: Float32Array | Float64Array, count: number): number {
  if (!(values instanceof Float32Array || values instanceof Float64Array) || values.length !== count) {
    throw new InvalidConfigurationError("Packed sensor RAW electron arrays must match the region size.");
  }
  let maximum = 0;
  for (let i = 0; i < count; i++) {
    const v = values[i]!;
    // The negated comparison also rejects NaN.
    if (!(v >= 0 && v <= Number.MAX_VALUE)) throw new InvalidConfigurationError("Expected electrons must be finite and non-negative.");
    if (v > maximum) maximum = v;
  }
  return maximum;
}

/** Validates the request (every array value once) and returns its plan. */
export function calculatePackedSensorRawPlan(input: PackedSensorRawInput): PackedSensorRawPlan {
  const r = requireAllowlistedRecord(input, ["schemaVersion", "nativeWidth", "nativeHeight", "region", "captureSeedUint32", "photoElectrons",
    "darkElectrons", "physicalChargeCapacityElectrons", "readoutProfile", "regimeId", "fixedPatternNoise", "additionalChargeComponents"],
  "Invalid packed sensor RAW input.");
  const L = PACKED_SENSOR_RAW_LIMITS;
  if (r.schemaVersion !== PACKED_SENSOR_RAW_SCHEMA_VERSION) throw new InvalidConfigurationError("Unsupported packed sensor RAW schema.");
  const nativeWidth = integer(r.nativeWidth, 1, L.maximumDimension), nativeHeight = integer(r.nativeHeight, 1, L.maximumDimension);
  if (nativeWidth * nativeHeight > L.maximumNativeSites) throw new InvalidConfigurationError("Native raster exceeds the uint32 site index.");
  const g = requireAllowlistedRecord(r.region, ["x", "y", "width", "height"], "Invalid packed sensor RAW region.");
  const x = integer(g.x, 0, nativeWidth - 1), y = integer(g.y, 0, nativeHeight - 1);
  const width = integer(g.width, 1, nativeWidth - x), height = integer(g.height, 1, nativeHeight - y);
  if (width * height > L.maximumRegionSites) throw new InvalidConfigurationError("Packed sensor RAW region exceeds the site limit.");
  const captureSeedUint32 = integer(r.captureSeedUint32, 0, 0xffffffff);
  const capacity = r.physicalChargeCapacityElectrons;
  if (typeof capacity !== "number" || !(capacity > 0 && capacity <= Number.MAX_VALUE)) {
    throw new InvalidConfigurationError("Physical charge capacity must be finite and positive.");
  }
  const readout = resolveSensorReadoutRegime({ profile: r.readoutProfile as SensorReadoutConversionProfile, regimeId: r.regimeId as string });
  if (readout.regime.adc.bitDepth > L.maximumAdcBitDepth || readout.regime.readNoiseComponents.length > L.maximumReadNoiseComponents) {
    throw new InvalidConfigurationError("Packed sensor RAW requires a uint16 ADC and at most 16 read-noise components.");
  }
  const siteCount = width * height;
  const maximumPhotoElectrons = maximumOf(r.photoElectrons as Float64Array, siteCount);
  const maximumDarkElectrons = maximumOf(r.darkElectrons as Float64Array, siteCount);
  let fixedPatternNoise: PackedSensorRawPlan["fixedPatternNoise"] = null;
  if (r.fixedPatternNoise !== undefined) {
    const f = requireAllowlistedRecord(r.fixedPatternNoise, ["profile", "colorSamplingProfileId", "siteOrigin"], "Invalid packed fixed-pattern noise.");
    const profile = parseSensorFixedPatternNoiseProfile(f.profile);
    if (f.colorSamplingProfileId !== profile.colorSamplingProfileId) {
      throw new InvalidConfigurationError("Fixed-pattern noise profile colour-sampling identity must match the packed region.");
    }
    const o = requireAllowlistedRecord(f.siteOrigin, ["x", "y"], "Invalid packed fixed-pattern site origin.");
    const ox = integer(o.x, 0, 0xffffffff - (x + width - 1)), oy = integer(o.y, 0, 0xffffffff - (y + height - 1));
    fixedPatternNoise = Object.freeze({ profile, siteOrigin: Object.freeze({ x: ox, y: oy }) });
  }
  const components = r.additionalChargeComponents === undefined ? [] : r.additionalChargeComponents;
  if (!Array.isArray(components) || components.length > L.maximumAdditionalChargeComponents) {
    throw new InvalidConfigurationError("Packed sensor RAW takes at most 8 additional stored-charge components.");
  }
  const ids = new Set<string>();
  const additionalChargeComponents = components.map((value: unknown) => {
    const c = requireAllowlistedRecord(value, ["componentId", "model", "expectedElectrons"], "Invalid packed additional charge component.");
    if (typeof c.componentId !== "string" || c.componentId.length === 0 || ids.has(c.componentId) ||
        (c.model !== "poisson" && c.model !== "deterministic-expected-electron-equivalent")) {
      throw new InvalidConfigurationError("Additional charge components need unique IDs and a Poisson or deterministic model.");
    }
    ids.add(c.componentId);
    return Object.freeze({ componentId: c.componentId, model: c.model as SensorAdditionalChargeSamplingModel,
      maximumExpectedElectrons: maximumOf(c.expectedElectrons as Float64Array, siteCount) });
  });
  return Object.freeze({ nativeWidth, nativeHeight, region: Object.freeze({ x, y, width, height }), siteCount, captureSeedUint32,
    physicalChargeCapacityElectrons: capacity, readout, noiseModel: SENSOR_RAW_PRODUCER_NOISE_MODEL,
    seedSchedule: "murmur3-capture-seed-native-index-stream-v2" as const, maximumPhotoElectrons, maximumDarkElectrons,
    fixedPatternNoise, additionalChargeComponents: Object.freeze(additionalChargeComponents) });
}

/** Fixed-pattern values that one site needs. @internal */
export interface PackedSensorSitePattern { photoResponseGainFactor: number; darkCurrentFactor: number; readoutOffsetElectrons: number }

/**
 * Evaluates the fixed-pattern values of region sites with the model's own functions. Row and column
 * offsets are computed once per row and column; `readoutOffsetElectrons` is row + column, as in
 * `calculateSensorFixedPatternSite`. @internal
 */
export function createPackedFixedPattern(plan: PackedSensorRawPlan): ((column: number, row: number) => PackedSensorSitePattern) | null {
  const f = plan.fixedPatternNoise;
  if (f === null) return null;
  const { region } = plan, x0 = region.x + f.siteOrigin.x, y0 = region.y + f.siteOrigin.y;
  const rows = new Float64Array(region.height), columns = new Float64Array(region.width);
  for (let row = 0; row < region.height; row++) rows[row] = evaluateFixedPatternRowOffset(f.profile, y0 + row);
  for (let column = 0; column < region.width; column++) columns[column] = evaluateFixedPatternColumnOffset(f.profile, x0 + column);
  return (column, row) => {
    const factors = evaluateFixedPatternSiteFactors(f.profile, x0 + column, y0 + row);
    return { photoResponseGainFactor: factors.photoResponseGainFactor, darkCurrentFactor: factors.darkCurrentFactor,
      readoutOffsetElectrons: rows[row]! + columns[column]! };
  };
}

/** Saturation and clamp flags of one site: bit 0 physical, 1 pre-ADC, 2 digital, 3 lower clamp. */
export const PACKED_SENSOR_RAW_FLAG = Object.freeze({ physical: 1, preAdc: 2, digital: 4, lower: 8 });

/**
 * One site of the reference, in the operation order of `calculateNativeRawSite`. Returns the code and
 * its flags. `index` is the absolute native row-major index; `pattern` is the site's fixed-pattern
 * values (required when the plan has a profile) and `additional` its additional-component expectations,
 * in the plan's order.
 * @internal
 */
export function simulatePackedSensorSite(plan: PackedSensorRawPlan, photoE: number, darkE: number, index: number,
  pattern: PackedSensorSitePattern | null = null, additional: readonly number[] = []): { code: number; flags: number } {
  const seed = plan.captureSeedUint32, regime = plan.readout.regime, capacity = plan.physicalChargeCapacityElectrons;
  if ((plan.fixedPatternNoise === null) !== (pattern === null) || additional.length !== plan.additionalChargeComponents.length) {
    throw new InvalidConfigurationError("Packed sensor site extras must match the plan.");
  }
  const random = createDeterministicUniformStream(deriveNativeSiteStreamSeedUint32(seed, index, NATIVE_SITE_CHARGE_STREAM_ID));
  // As in simulateSensorChargeRealization: the fixed-pattern factors multiply the Poisson means.
  const photoMean = pattern === null ? photoE : photoE * pattern.photoResponseGainFactor;
  const darkMean = pattern === null ? darkE : darkE * pattern.darkCurrentFactor;
  const photoRealized = samplePoisson(photoMean, random), darkRealized = samplePoisson(darkMean, random);
  let additionalRealized = 0;
  for (let k = 0; k < additional.length; k++) {
    const expected = additional[k]!;
    additionalRealized = additionalRealized + (plan.additionalChargeComponents[k]!.model === "poisson" ? samplePoisson(expected, random) : expected);
  }
  const realized = photoRealized + darkRealized + additionalRealized;
  const readRandom = createDeterministicUniformStream(deriveNativeSiteStreamSeedUint32(seed, index, NATIVE_SITE_READ_NOISE_STREAM_ID));
  const afterPhysical = Math.min(realized, capacity);
  let totalReadNoise = 0;
  for (const component of regime.readNoiseComponents) {
    totalReadNoise = totalReadNoise + (component.rmsElectrons.value === 0 ? 0 : sampleDeterministicStandardNormal(readRandom) * component.rmsElectrons.value);
  }
  const afterReadNoise = afterPhysical + totalReadNoise + (pattern === null ? 0 : pattern.readoutOffsetElectrons);
  const threshold = regime.preAdcSaturationElectronEquivalent.value;
  const afterPreAdc = Math.min(afterReadNoise, threshold);
  const quantized = adcTransfer(regime, plan.readout.adcMaximumCode, afterPreAdc).quantized;
  const saturation = regime.adc.digitalSaturationCode;
  const flags = (afterPhysical < realized ? PACKED_SENSOR_RAW_FLAG.physical : 0) | (afterReadNoise > threshold ? PACKED_SENSOR_RAW_FLAG.preAdc : 0) |
    (quantized >= saturation ? PACKED_SENSOR_RAW_FLAG.digital : 0) | (quantized < 0 ? PACKED_SENSOR_RAW_FLAG.lower : 0);
  return { code: Math.max(0, Math.min(quantized, saturation)), flags };
}

/**
 * Reference rows `[row0, row1)` of the region into `codes` (indexed from the region start), adding flags
 * into `counts` (physical, pre-ADC, digital, lower).
 * @internal
 */
export function simulatePackedSensorRows(plan: PackedSensorRawPlan, photo: Float32Array | Float64Array, dark: Float32Array | Float64Array,
  row0: number, row1: number, codes: Uint16Array, counts: number[], extras: PackedSensorExtras = NO_EXTRAS): void {
  const { region, nativeWidth } = plan;
  const additional = new Array<number>(extras.additional.length).fill(0);
  for (let row = row0; row < row1; row++) {
    for (let column = 0, i = row * region.width; column < region.width; column++, i++) {
      for (let k = 0; k < additional.length; k++) additional[k] = extras.additional[k]![i]!;
      const site = simulatePackedSensorSite(plan, photo[i]!, dark[i]!, (region.y + row) * nativeWidth + region.x + column,
        extras.pattern === null ? null : extras.pattern(column, row), additional);
      codes[i] = site.code;
      if (site.flags & 1) counts[0]!++;
      if (site.flags & 2) counts[1]!++;
      if (site.flags & 4) counts[2]!++;
      if (site.flags & 8) counts[3]!++;
    }
  }
}

/** Per-site extras of a region: the fixed-pattern evaluator and the additional-component arrays. @internal */
export interface PackedSensorExtras {
  pattern: ((column: number, row: number) => PackedSensorSitePattern) | null;
  additional: readonly (Float32Array | Float64Array)[];
}
const NO_EXTRAS: PackedSensorExtras = Object.freeze({ pattern: null, additional: Object.freeze([]) });

/** The extras of a validated input; `snapshot` copies the arrays. @internal */
export function packedSensorExtras(plan: PackedSensorRawPlan, input: PackedSensorRawInput, snapshot: boolean): PackedSensorExtras {
  return { pattern: createPackedFixedPattern(plan),
    additional: (input.additionalChargeComponents ?? []).map(c => (snapshot ? c.expectedElectrons.slice() : c.expectedElectrons)) };
}

export function packedSensorDiagnostics(counts: readonly number[]): PackedSensorRawDiagnostics {
  return { physicalSaturationSiteCount: counts[0]!, preAdcSaturationSiteCount: counts[1]!, digitalSaturationSiteCount: counts[2]!,
    lowerClampSiteCount: counts[3]! };
}

/**
 * Synchronous float64 reference for a bounded region. Use the image-kernel accelerator for large
 * regions, host yields or the `webgpu-f32` backend.
 */
export function simulatePackedSensorRaw(input: PackedSensorRawInput): PackedSensorRawResult {
  const plan = calculatePackedSensorRawPlan(input);
  const codes = new Uint16Array(plan.siteCount), counts = [0, 0, 0, 0];
  simulatePackedSensorRows(plan, input.photoElectrons, input.darkElectrons, 0, plan.region.height, codes, counts,
    packedSensorExtras(plan, input, false));
  return { plan, codes, diagnostics: packedSensorDiagnostics(counts) };
}
