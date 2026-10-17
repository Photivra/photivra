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
 * Supported domain (frame-wide, fails closed otherwise): one readout regime, one physical charge
 * capacity, photo and dark charge only (no additional stored-charge components) and no fixed-pattern
 * noise. Use `simulateSensorRawFrame` for those. See docs/WEBGPU.md.
 */
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireAllowlistedRecord } from "../core/record-validation.js";
import { adcTransfer, resolveSensorReadoutRegime, samplePoisson, type ResolvedSensorReadoutRegime,
  type SensorReadoutConversionProfile } from "../sensor/raw-readout.js";
import { createDeterministicUniformStream, deriveNativeSiteStreamSeedUint32, sampleDeterministicStandardNormal,
  NATIVE_SITE_CHARGE_STREAM_ID, NATIVE_SITE_READ_NOISE_STREAM_ID } from "../sensor/stochastic-seed.js";
import { SENSOR_RAW_PRODUCER_NOISE_MODEL } from "./sensor-raw-producer.js";

export const PACKED_SENSOR_RAW_SCHEMA_VERSION = "0.1.0" as const;
export const PACKED_SENSOR_RAW_LIMITS = Object.freeze({
  maximumRegionSites: 24_000_000,
  maximumNativeSites: 0xffffffff,
  maximumDimension: 65_535,
  maximumAdcBitDepth: 16,
  maximumReadNoiseComponents: 16
});

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
  /** Largest expected photo and dark electron counts in the region. */
  maximumPhotoElectrons: number;
  maximumDarkElectrons: number;
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
    "darkElectrons", "physicalChargeCapacityElectrons", "readoutProfile", "regimeId"], "Invalid packed sensor RAW input.");
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
  return Object.freeze({ nativeWidth, nativeHeight, region: Object.freeze({ x, y, width, height }), siteCount, captureSeedUint32,
    physicalChargeCapacityElectrons: capacity, readout, noiseModel: SENSOR_RAW_PRODUCER_NOISE_MODEL,
    seedSchedule: "murmur3-capture-seed-native-index-stream-v2" as const, maximumPhotoElectrons, maximumDarkElectrons });
}

/** Saturation and clamp flags of one site: bit 0 physical, 1 pre-ADC, 2 digital, 3 lower clamp. */
export const PACKED_SENSOR_RAW_FLAG = Object.freeze({ physical: 1, preAdc: 2, digital: 4, lower: 8 });

/**
 * One site of the reference, in the operation order of `calculateNativeRawSite` without fixed-pattern
 * noise or additional components. Returns the code and writes its flags. `index` is the absolute
 * native row-major index.
 * @internal
 */
export function simulatePackedSensorSite(plan: PackedSensorRawPlan, photoE: number, darkE: number, index: number): { code: number; flags: number } {
  const seed = plan.captureSeedUint32, regime = plan.readout.regime, capacity = plan.physicalChargeCapacityElectrons;
  const random = createDeterministicUniformStream(deriveNativeSiteStreamSeedUint32(seed, index, NATIVE_SITE_CHARGE_STREAM_ID));
  const photoRealized = samplePoisson(photoE, random), darkRealized = samplePoisson(darkE, random);
  const realized = photoRealized + darkRealized + 0;
  const readRandom = createDeterministicUniformStream(deriveNativeSiteStreamSeedUint32(seed, index, NATIVE_SITE_READ_NOISE_STREAM_ID));
  const afterPhysical = Math.min(realized, capacity);
  let totalReadNoise = 0;
  for (const component of regime.readNoiseComponents) {
    totalReadNoise = totalReadNoise + (component.rmsElectrons.value === 0 ? 0 : sampleDeterministicStandardNormal(readRandom) * component.rmsElectrons.value);
  }
  const afterReadNoise = afterPhysical + totalReadNoise + 0;
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
  row0: number, row1: number, codes: Uint16Array, counts: number[]): void {
  const { region, nativeWidth } = plan;
  for (let row = row0; row < row1; row++) {
    for (let column = 0, i = row * region.width; column < region.width; column++, i++) {
      const site = simulatePackedSensorSite(plan, photo[i]!, dark[i]!, (region.y + row) * nativeWidth + region.x + column);
      codes[i] = site.code;
      if (site.flags & 1) counts[0]!++;
      if (site.flags & 2) counts[1]!++;
      if (site.flags & 4) counts[2]!++;
      if (site.flags & 8) counts[3]!++;
    }
  }
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
  simulatePackedSensorRows(plan, input.photoElectrons, input.darkElectrons, 0, plan.region.height, codes, counts);
  return { plan, codes, diagnostics: packedSensorDiagnostics(counts) };
}
