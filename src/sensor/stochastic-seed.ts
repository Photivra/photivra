// SPDX-License-Identifier: Apache-2.0

/**
 * Seeds for the random-number streams behind simulated sensor noise. The same inputs always give
 * the same noise.
 *
 * Each per-site stream seed is a strong 32-bit hash of the capture seed, the absolute native
 * row-major site index and a fixed stream ID. The hash is MurmurHash3_x86_32 (Austin Appleby,
 * placed in the public domain) of the 12-byte little-endian message `[captureSeed, siteIndex,
 * streamId]` with hash seed 0. Its avalanche finalizer (`fmix32`) makes a one-bit input change flip
 * each output bit with probability close to 1/2. So neighbouring sites, the two streams of one site
 * and captures with nearby seeds get unrelated seeds. A linear schedule such as `seed + 2*index` fed
 * into a linear generator (xorshift) lacks this property, and produced correlated noise with too
 * little variance (issue #270).
 *
 * This is deterministic and not cryptographic; it does not claim unpredictability. The moment and
 * correlation tests, not this hash alone, show that the resulting noise is statistically acceptable.
 */

import { InvalidScientificInputError } from "../core/validation.js";

/** Stream IDs. Changing them changes every simulated RAW code. */
export const NATIVE_SITE_CHARGE_STREAM_ID = 0 as const;
export const NATIVE_SITE_READ_NOISE_STREAM_ID = 1 as const;

const MURMUR3_C1 = 0xcc9e2d51;
const MURMUR3_C2 = 0x1b873593;

/** MurmurHash3 32-bit avalanche finalizer; a bijection on uint32 with fmix32(0) = 0. */
export function fmix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function mixBlock(hash: number, block: number): number {
  let k = Math.imul(block >>> 0, MURMUR3_C1);
  k = (k << 15) | (k >>> 17);
  k = Math.imul(k, MURMUR3_C2);
  let h = (hash ^ k) >>> 0;
  h = (h << 13) | (h >>> 19);
  return (Math.imul(h, 5) + 0xe6546b64) >>> 0;
}

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

/**
 * Returns the uint32 seed of one random stream for one absolute native site.
 * All inputs must be uint32 integers. The site index is the full-frame native row-major
 * index, never relative to a tile or chunk, so how the work is split cannot change it.
 */
export function deriveNativeSiteStreamSeedUint32(
  captureSeedUint32: number,
  nativeSiteIndex: number,
  streamId: number
): number {
  if (!isUint32(captureSeedUint32) || !isUint32(nativeSiteIndex) || !isUint32(streamId)) {
    throw new InvalidScientificInputError("Stochastic stream seed inputs must be uint32 integers.");
  }
  let h = 0;
  h = mixBlock(h, captureSeedUint32);
  h = mixBlock(h, nativeSiteIndex);
  h = mixBlock(h, streamId);
  return fmix32(h ^ 12);
}

/** One deterministic stream of uniforms strictly inside (0,1). */
export interface DeterministicUniformStream {
  next(): number;
}

/**
 * Creates the deterministic, non-cryptographic xorshift32 random stream for one charge, read-noise
 * or fixed-pattern identity.
 *
 * The seed is first scrambled by the MurmurHash3 `fmix32` avalanche finalizer. xorshift32 is linear
 * over GF(2), so an unscrambled seed would give nearby seeds almost identical first draws, and noise
 * that is correlated across the sensor with too little variance (issue #270). The nonzero fallback
 * avoids the zero state, which xorshift can never leave. Adding 0.5 before dividing gives values
 * strictly inside (0,1), so the logarithms in the Poisson and normal transforms never see 0 or 1.
 * Changing any of this changes simulated RAW output and needs a model and replay review.
 */
export function createDeterministicUniformStream(seedUint32: number): DeterministicUniformStream {
  let state = fmix32((seedUint32 ^ 0x9e3779b9) >>> 0);
  if (state === 0) {
    state = 0x6d2b79f5;
  }
  return {
    next(): number {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return (state + 0.5) / 0x1_0000_0000;
    }
  };
}

/**
 * Box–Muller transform of two uniform values in (0,1) (Box & Muller 1958). Each call uses two values
 * and returns one standard normal sample. The second possible sample is not cached, so the order of
 * draws from the stream never shifts.
 */
export function sampleDeterministicStandardNormal(random: DeterministicUniformStream): number {
  const u1 = random.next();
  const u2 = random.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Fixed-pattern stream IDs. They seed spatial patterns that belong to one physical sensor, never
 * per-capture noise, and are hashed with the sensor-instance seed instead of the capture seed.
 */
export const SENSOR_FIXED_PATTERN_PRNU_STREAM_ID = 16 as const;
export const SENSOR_FIXED_PATTERN_DSNU_STREAM_ID = 17 as const;
export const SENSOR_FIXED_PATTERN_HOT_PIXEL_STREAM_ID = 18 as const;
export const SENSOR_FIXED_PATTERN_ROW_STREAM_ID = 19 as const;
export const SENSOR_FIXED_PATTERN_COLUMN_STREAM_ID = 20 as const;

/**
 * Returns the uint32 seed of one fixed-pattern stream for one physical colour-sampling site: the
 * MurmurHash3_x86_32 hash (hash seed 0) of the 16-byte little-endian message
 * `[sensorInstanceSeed, siteX, siteY, streamId]`. Site coordinates are absolute indices in the
 * colour-sampling grid, so the pattern belongs to the physical sensor and does not change with crop,
 * tiling or the per-capture seed. Deterministic and not cryptographic.
 */
export function deriveSensorFixedPatternSeedUint32(
  sensorInstanceSeedUint32: number,
  siteX: number,
  siteY: number,
  streamId: number
): number {
  if (!isUint32(sensorInstanceSeedUint32) || !isUint32(siteX) || !isUint32(siteY) || !isUint32(streamId)) {
    throw new InvalidScientificInputError("Fixed-pattern seed inputs must be uint32 integers.");
  }
  let h = 0;
  h = mixBlock(h, sensorInstanceSeedUint32);
  h = mixBlock(h, siteX);
  h = mixBlock(h, siteY);
  h = mixBlock(h, streamId);
  return fmix32(h ^ 16);
}
