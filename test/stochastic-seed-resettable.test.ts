// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { createDeterministicUniformStream, createResettableUniformStream, deriveNativeSiteStreamSeedUint32, NATIVE_SITE_CHARGE_STREAM_ID,
  NATIVE_SITE_READ_NOISE_STREAM_ID } from "../src/sensor/stochastic-seed.js";

/*
 * #418: the lean sensor stage reseeds two streams in place for every site instead of creating two new ones. The draws must be
 * exactly those of a fresh createDeterministicUniformStream, for every seed, including the seed whose scrambled state is zero
 * (the fallback state) and after the stream has already been used.
 */
const draws = (stream: { next(): number }, count: number): number[] => Array.from({ length: count }, () => stream.next());

describe("createResettableUniformStream (#418)", () => {
  it("draws what a fresh createDeterministicUniformStream draws after every reset", () => {
    const seeds = [0, 1, 2, 0x7fffffff, 0x80000000, 0xffffffff, 0x9e3779b9, 12345, 20261025];
    for (let index = 0; index < 64; index++) {
      for (const id of [NATIVE_SITE_CHARGE_STREAM_ID, NATIVE_SITE_READ_NOISE_STREAM_ID]) seeds.push(deriveNativeSiteStreamSeedUint32(20261025, index * 7919, id));
    }
    const stream = createResettableUniformStream();
    for (const seed of seeds) {
      // Reused stream: its earlier draws must not leak into the next site's.
      stream.reset(seed);
      expect(draws(stream, 40)).toEqual(draws(createDeterministicUniformStream(seed), 40));
    }
  });

  it("uses the fallback state for the seed whose scrambled state is zero", () => {
    // fmix32(0) = 0, so seed 0x9e3779b9 scrambles to 0, which xorshift could never leave.
    const stream = createResettableUniformStream();
    stream.reset(0x9e3779b9);
    const values = draws(stream, 8);
    expect(values).toEqual(draws(createDeterministicUniformStream(0x9e3779b9), 8));
    for (const value of values) expect(value > 0 && value < 1).toBe(true);
  });
});
