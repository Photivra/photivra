// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { createNativeRawTask, simulateSensorChargeRealization, simulateSensorRawFrame } from "../src/index.js";
import { deriveNativeSiteStreamSeedUint32, fmix32 } from "../src/sensor/stochastic-seed.js";
import { nativeRawFixture } from "./helpers/native-raw-fixture.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";

/*
 * Regression for #270: per-site noise streams must be statistically independent.
 *
 * All statistics run the production native RAW path (createNativeRawTask ->
 * calculateNativeRawSite -> Poisson charge -> Gaussian read noise -> ADC). The owned
 * fixture repeats a 2x2 CFA cell with expected photoelectrons 0, 10, 100, 800, unit
 * conversion gain (1 e-/DN), black level 64 DN, 10-bit ADC, capacity/pre-ADC limits
 * far above the tested signals and read noise rms 2 e- (or 0 where stated).
 *
 * Expected code moments (EMVA 1288 §2 linear camera model; Janesick, Photon Transfer):
 * code = 64 + N + round(R), N ~ Poisson(lambda), R ~ Normal(0, sigma^2), so
 *   E[code] = 64 + lambda   (round(R) is symmetric about zero)
 *   Var[code] = lambda + sigma^2 + q,  q = 1/12 when sigma > 0 (Sheppard; exact to
 *   O(exp(-2 pi^2 sigma^2)) at sigma = 2), q = 0 when sigma = 0 (integer charge).
 * Fourth cumulants add: kappa4 = lambda (Poisson) - q^2*6/5 (uniform rounding) + 0 (normal).
 *
 * Tolerances are predeclared 5-sigma sampling bands for n independent samples:
 *   mean:      5 sqrt(Var/n)
 *   variance:  5 sqrt((kappa4 + 2 Var^2)/n)            (Var of unbiased sample variance)
 *   corr.:     5 / sqrt(n)                              (null distribution of Pearson r)
 * Seeds are fixed, so results are deterministic; a 5-sigma band leaves margin for the
 * fixed draw while still rejecting the issue #270 failure (variance ~0.22 lambda and
 * lag-1 correlation ~0.8).
 */
const WIDTH = 128, HEIGHT = 64, BLACK = 64, LAMBDA = [0, 10, 100, 800] as const;
const phase = (i: number, width: number): number => (Math.floor(i / width) % 2) * 2 + (i % width) % 2;

async function runNative(width: number, height: number, seed: number, readNoiseRms = 2): Promise<Uint16Array> {
  const f = nativeRawFixture(width, height);
  f.input.exposure.noise.seedUint32 = seed;
  for (const s of f.reference.sites) s.readoutProfile.regimes[0]!.readNoiseComponents[0]!.rmsElectrons.value = readNoiseRms;
  const task = createNativeRawTask(f.input, f.provider);
  await task.run();
  return task.takeOutput().codes;
}

function moments(lambda: number, sigma: number): { mean: number; variance: number; kappa4: number } {
  const q = sigma > 0 ? 1 / 12 : 0;
  return { mean: BLACK + lambda, variance: lambda + sigma * sigma + q, kappa4: lambda - 1.2 * q * q };
}

/** Residuals standardized by the expected (not sample) moments of each site's CFA phase. */
function standardized(codes: Uint16Array, width: number, sigma: number): Float64Array {
  return Float64Array.from(codes, (c, i) => {
    const m = moments(LAMBDA[phase(i, width)]!, sigma);
    return (c - m.mean) / Math.sqrt(m.variance);
  });
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = a.length, ma = a.reduce((p, v) => p + v, 0) / n, mb = b.reduce((p, v) => p + v, 0) / n;
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { c += (a[i]! - ma) * (b[i]! - mb); va += (a[i]! - ma) ** 2; vb += (b[i]! - mb) ** 2; }
  return c / Math.sqrt(va * vb);
}

/** Pairs (x,y) and (x+dx,y+dy) inside the raster, optionally restricted to one CFA phase. */
function lagPairs(z: ArrayLike<number>, width: number, height: number, dx: number, dy: number, only?: number): [number[], number[]] {
  const a: number[] = [], b: number[] = [];
  for (let y = 0; y + dy < height; y++) for (let x = 0; x + dx < width; x++) {
    const i = y * width + x;
    if (only !== undefined && phase(i, width) !== only) continue;
    a.push(z[i]!); b.push(z[(y + dy) * width + x + dx]!);
  }
  return [a, b];
}

/**
 * Row-major lag-1/lag-2 (the old seed+2i schedule) and horizontal/vertical/diagonal
 * neighbours, pooled over phases with nonzero variance; even lags also per CFA colour.
 */
function expectSpatiallyUncorrelated(codes: Uint16Array, sigma: number): void {
  const z = standardized(codes, WIDTH, sigma), phases = [0, 1, 2, 3].filter(p => moments(LAMBDA[p]!, sigma).variance > 0);
  for (const [dx, dy] of [[1, 0], [2, 0], [4, 0], [0, 1], [0, 2], [1, 1], [2, 2]] as const) {
    const pairs = phases.map(p => lagPairs(z, WIDTH, HEIGHT, dx, dy, p));
    const a = pairs.flatMap(([x]) => x), b = pairs.flatMap(([, y]) => y);
    const keep = a.map((_, i) => Number.isFinite(a[i]!) && Number.isFinite(b[i]!));
    const af = a.filter((_, i) => keep[i]), bf = b.filter((_, i) => keep[i]);
    expect(Math.abs(pearson(af, bf))).toBeLessThan(5 / Math.sqrt(af.length));
    // Same-CFA-colour neighbours: every even lag keeps the phase.
    if (dx % 2 === 0 && dy % 2 === 0) for (const [ap, bp] of pairs) {
      expect(Math.abs(pearson(ap, bp))).toBeLessThan(5 / Math.sqrt(ap.length));
    }
  }
}

/** Independent byte-oriented MurmurHash3_x86_32 reference used only to check the engine's word form. */
function murmur3Bytes(bytes: Uint8Array, seed: number): number {
  const c1 = 0xcc9e2d51, c2 = 0x1b873593, blocks = bytes.length >> 2;
  let h = seed >>> 0;
  const rotl = (v: number, r: number): number => ((v << r) | (v >>> (32 - r))) >>> 0;
  for (let b = 0; b < blocks; b++) {
    let k = bytes[4 * b]! | bytes[4 * b + 1]! << 8 | bytes[4 * b + 2]! << 16 | bytes[4 * b + 3]! << 24;
    k = Math.imul(rotl(Math.imul(k, c1), 15), c2);
    h = (Math.imul(rotl(h ^ k, 13), 5) + 0xe6546b64) >>> 0;
  }
  let k = 0;
  const tail = bytes.length & 3, t = blocks * 4;
  if (tail === 3) k ^= bytes[t + 2]! << 16;
  if (tail >= 2) k ^= bytes[t + 1]! << 8;
  if (tail >= 1) { k ^= bytes[t]!; k = Math.imul(rotl(Math.imul(k, c1), 15), c2); h ^= k; }
  h ^= bytes.length; h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

describe("seeded native RAW noise independence (#270)", () => {
  it("derives stream seeds as MurmurHash3_x86_32 of (capture seed, absolute index, stream)", () => {
    // SMHasher verification procedure (Austin Appleby, SMHasher, public domain; KeysetTest.cpp VerificationTest):
    // hash the keys {0}, {0, 1}, …, {0, …, 254} of length i = 0…255 with seed 256 − i, hash the concatenation of those
    // 256 little-endian 32-bit hashes with seed 0, and compare with SMHasher's documented value for MurmurHash3_x86_32.
    const key = Uint8Array.from({ length: 256 }, (_, i) => i), hashes = new DataView(new ArrayBuffer(256 * 4));
    for (let i = 0; i < 256; i++) hashes.setUint32(i * 4, murmur3Bytes(key.subarray(0, i), 256 - i), true);
    expect(murmur3Bytes(new Uint8Array(hashes.buffer), 0)).toBe(0xb0f57ee3);
    // An empty key with seed 0 hashes to 0 by construction (h = 0 ^ 0, fmix32(0) = 0).
    expect(murmur3Bytes(new Uint8Array(0), 0)).toBe(0);
    for (const [seed, index, stream] of [[0, 0, 0], [12345, 7, 1], [0xffffffff, 0xffffffff, 1], [1, 4095, 0]] as const) {
      const words = new DataView(new ArrayBuffer(12));
      words.setUint32(0, seed, true); words.setUint32(4, index, true); words.setUint32(8, stream, true);
      expect(deriveNativeSiteStreamSeedUint32(seed, index, stream)).toBe(murmur3Bytes(new Uint8Array(words.buffer), 0));
    }
    expect(fmix32(0)).toBe(0);
    for (const bad of [-1, 1.5, 2 ** 32, NaN]) {
      expect(() => deriveNativeSiteStreamSeedUint32(bad, 0, 0)).toThrow(RangeError);
      expect(() => deriveNativeSiteStreamSeedUint32(0, bad, 0)).toThrow(RangeError);
      expect(() => deriveNativeSiteStreamSeedUint32(0, 0, bad)).toThrow(RangeError);
    }
  });

  it("records the hashed charge/read-noise seeds on every producer site", () => {
    const v = loadSensorRawProducerInput(), seed = v.frame.capture.noise.seedUint32, r = simulateSensorRawFrame(v).value;
    expect(r.seedSchedule).toBe("murmur3-capture-seed-native-index-stream-v2");
    r.frame.samples.forEach((s, i) => {
      expect(s.sourceChargeSeedUint32).toBe(deriveNativeSiteStreamSeedUint32(seed, i, 0));
      expect(s.sourceReadNoiseSeedUint32).toBe(deriveNativeSiteStreamSeedUint32(seed, i, 1));
    });
  });

  it("realizes Poisson shot-noise moments per CFA phase with read noise disabled", async () => {
    const codes = await runNative(WIDTH, HEIGHT, 12345, 0);
    for (let p = 0; p < 4; p++) {
      const sample = Array.from(codes).filter((_, i) => phase(i, WIDTH) === p), n = sample.length, m = moments(LAMBDA[p]!, 0);
      const mean = sample.reduce((a, b) => a + b, 0) / n, variance = sample.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
      expect(n).toBe(WIDTH * HEIGHT / 4);
      if (LAMBDA[p] === 0) { expect(sample.every(c => c === BLACK)).toBe(true); continue; }
      expect(Math.abs(mean - m.mean)).toBeLessThan(5 * Math.sqrt(m.variance / n));
      expect(Math.abs(variance - m.variance)).toBeLessThan(5 * Math.sqrt((m.kappa4 + 2 * m.variance ** 2) / n));
    }
    expectSpatiallyUncorrelated(codes, 0);
  }, 120_000);

  it("realizes Poisson plus Gaussian read-noise moments and near-zero spatial correlation", async () => {
    const sigma = 2, codes = await runNative(WIDTH, HEIGHT, 12345, sigma);
    for (let p = 0; p < 4; p++) {
      const sample = Array.from(codes).filter((_, i) => phase(i, WIDTH) === p), n = sample.length, m = moments(LAMBDA[p]!, sigma);
      const mean = sample.reduce((a, b) => a + b, 0) / n, variance = sample.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
      expect(Math.abs(mean - m.mean)).toBeLessThan(5 * Math.sqrt(m.variance / n));
      expect(Math.abs(variance - m.variance)).toBeLessThan(5 * Math.sqrt((m.kappa4 + 2 * m.variance ** 2) / n));
    }
    expectSpatiallyUncorrelated(codes, sigma);
  }, 120_000);

  it("keeps captures with nearby seeds independent, including index-shifted sites", async () => {
    const width = 64, height = 32, n = width * height, base = 0xfffffffe;
    const reference = standardized(await runNative(width, height, base), width, 2);
    for (const k of [1, 2, 3, 8, 256]) {
      const other = standardized(await runNative(width, height, (base + k) >>> 0), width, 2);
      // Shift m compares site i of seed s with site i+m of seed s+k; the old schedule made
      // seed s+2 at site i identical to seed s at site i+1.
      for (const m of [-2, -1, 0, 1, 2]) {
        const a: number[] = [], b: number[] = [];
        for (let i = Math.max(0, -m); i < n && i + m < n; i++) { a.push(reference[i]!); b.push(other[i + m]!); }
        expect(Math.abs(pearson(a, b))).toBeLessThan(5 / Math.sqrt(a.length));
      }
    }
    // Determinism: the same seed reproduces identical codes.
    expect(standardized(await runNative(width, height, base), width, 2)).toEqual(reference);
  }, 120_000);

  it("decorrelates the public charge primitive across consecutive seeds", () => {
    const site = loadSensorRawProducerInput().sites[2]!, n = 4000;
    const charge = simulateSensorRawFrame(loadSensorRawProducerInput()).value.sites[2]!.accumulatedCharge.value;
    expect(charge.photoExpectedElectronCount).toBe(100);
    const counts = Array.from({ length: n }, (_, seed) => simulateSensorChargeRealization({ accumulatedCharge: charge,
      samplingProfile: site.samplingProfile, seedUint32: seed }).value.photoRealizedElectronCount);
    const mean = counts.reduce((a, b) => a + b, 0) / n, variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
    expect(Math.abs(mean - 100)).toBeLessThan(5 * Math.sqrt(100 / n));
    expect(Math.abs(variance - 100)).toBeLessThan(5 * Math.sqrt((100 + 2 * 100 ** 2) / n));
    for (const lag of [1, 2]) expect(Math.abs(pearson(counts.slice(0, -lag), counts.slice(lag)))).toBeLessThan(5 / Math.sqrt(n - lag));
  });
});
