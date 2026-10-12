// SPDX-License-Identifier: Apache-2.0

/**
 * Deterministic stochastic-stream seed derivation for seeded sensor noise.
 *
 * Every per-site stream seed is a strong 32-bit hash of the capture seed, the absolute
 * native row-major site index and a fixed stream identifier. The hash is
 * MurmurHash3_x86_32 (Austin Appleby, placed in the public domain) applied to the
 * 12-byte little-endian message `[captureSeed, siteIndex, streamId]` with hash seed 0.
 * Its avalanche finalizer (`fmix32`) makes a one-bit input change flip each output bit
 * with probability close to 1/2, so neighbouring sites, the two streams of one site and
 * captures with nearby seeds receive unrelated stream seeds. A linear schedule such as
 * `seed + 2*index` fed into a linear generator (xorshift) does not have this property and
 * produced correlated, variance-deficient noise (issue #270).
 *
 * This is deterministic, non-cryptographic seed ownership. It is not a claim of
 * cryptographic unpredictability, and the statistical acceptance of the realized noise
 * is established by the moment/correlation tests, not by this hash alone.
 */

/** Stream identifiers. Changing them changes every realized RAW code. */
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
 * Return the uint32 seed of one stochastic stream for one absolute native site.
 * All inputs must be uint32 integers; the site index is the full-frame native row-major
 * index, never a tile- or chunk-relative index, so execution chunking cannot alter it.
 */
export function deriveNativeSiteStreamSeedUint32(
  captureSeedUint32: number,
  nativeSiteIndex: number,
  streamId: number
): number {
  if (!isUint32(captureSeedUint32) || !isUint32(nativeSiteIndex) || !isUint32(streamId)) {
    throw new RangeError("Stochastic stream seed inputs must be uint32 integers.");
  }
  let h = 0;
  h = mixBlock(h, captureSeedUint32);
  h = mixBlock(h, nativeSiteIndex);
  h = mixBlock(h, streamId);
  return fmix32(h ^ 12);
}
