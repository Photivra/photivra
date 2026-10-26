// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { hypot3 } from "../src/core/portable-math.js";

// hypot3 is V8's three-argument Math.hypot as a fixed sequence of correctly rounded operations (#452). The fixed vectors
// hold in every engine; the comparison with the native Math.hypot holds only where that builtin is V8's.
const isV8 = typeof process !== "undefined" && typeof process.versions?.v8 === "string";
if (!isV8) console.warn("portable-hypot3: not running on V8, so the comparison with Math.hypot is skipped (its bits are engine-specific).");

const view = new DataView(new ArrayBuffer(8));
const bitsOf = (x: number): string => { view.setFloat64(0, x); return view.getBigUint64(0).toString(16).padStart(16, "0"); };
const fromBits = (hi: number, lo: number): number => { view.setUint32(0, hi >>> 0); view.setUint32(4, lo >>> 0); return view.getFloat64(0); };

/** xorshift128 (Marsaglia 2003), fixed seed: a deterministic uint32 stream. */
function stream(seed: number): () => number {
  let x = seed >>> 0 || 1, y = 362436069, z = 521288629, w = 88675123;
  return () => {
    const t = (x ^ (x << 11)) >>> 0;
    x = y; y = z; z = w;
    w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    return w;
  };
}

/** 10^6 triples across magnitude regimes: random bit patterns, extreme exponents, subnormals, zeros, near ties, equal arguments, query points. */
function triples(count: number): Float64Array {
  const next = stream(0x452);
  const unit = (): number => next() / 2 ** 32;
  const sign = (): number => (next() & 1 ? -1 : 1);
  const withExponent = (exponent: number): number => fromBits(((next() & 1) << 31) | (exponent << 20) | (next() & 0xfffff), next());
  const subnormal = (): number => fromBits(((next() & 1) << 31) | (next() & 0xfffff), next());
  const out = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) {
    const regime = i % 10;
    let a: number, b: number, c: number;
    if (regime === 0) { a = fromBits(next(), next()); b = fromBits(next(), next()); c = fromBits(next(), next()); }
    else if (regime === 1) { a = withExponent(1923 + (next() % 124)); b = withExponent(1923 + (next() % 124)); c = withExponent(1923 + (next() % 124)); }
    else if (regime === 2) { a = withExponent(1 + (next() % 23)); b = withExponent(1 + (next() % 23)); c = withExponent(1 + (next() % 23)); }
    else if (regime === 3) { a = subnormal(); b = subnormal(); c = next() & 1 ? subnormal() : withExponent(1 + (next() % 2046)); }
    else if (regime === 4) { a = withExponent(963 + (next() % 120)); b = withExponent(963 + (next() % 120)); c = withExponent(963 + (next() % 120)); }
    else if (regime === 5) {
      const zero = (): number => (next() & 1 ? -0 : 0), value = withExponent(1 + (next() % 2046));
      const k = next() % 6;
      a = k === 0 ? zero() : value; b = k === 1 || k >= 3 ? zero() : withExponent(1 + (next() % 2046)); c = k === 2 || k >= 4 ? zero() : value;
      if (k === 5) a = zero();
    } else if (regime === 6) {
      // Near-tie squares: arguments a few ulps apart, so the normalised squares sit next to rounding boundaries.
      a = withExponent(1023 + (next() % 64) - 32); view.setFloat64(0, a);
      const hi = view.getUint32(0), lo = view.getUint32(4), d1 = (next() % 7) - 3, d2 = (next() % 7) - 3;
      b = fromBits(hi, lo + d1); c = fromBits(hi, lo + d2) * (next() & 1 ? 1 : 2 ** -26);
    } else if (regime === 7) {
      const x = withExponent(1 + (next() % 2046)), y = withExponent(1 + (next() % 2046)), k = next() % 4;
      [a, b, c] = k === 0 ? [x, x, x] : k === 1 ? [x, x, y] : k === 2 ? [x, y, x] : [y, x, -x];
    } else if (regime === 8) {
      // Query points of the capture's rectilinear ray (rx, ry, projection distance) for sensors up to 54 × 40 mm.
      const pd = 4 + unit() * 200;
      a = pd * ((unit() - 0.5) * 54 / pd); b = pd * (-((unit() - 0.5) * 40) / pd); c = pd;
    } else {
      // Mixed magnitudes within 2^±60 of each other.
      const base = 1023 + (next() % 200) - 100;
      a = sign() * withExponent(base) * 1; b = withExponent(base + (next() % 121) - 60); c = withExponent(base + (next() % 121) - 60);
    }
    out[i * 3] = a; out[i * 3 + 1] = b; out[i * 3 + 2] = c;
  }
  return out;
}

describe("hypot3: V8's three-argument Math.hypot sequence (#452)", () => {
  it("returns fixed bits in every engine", () => {
    const MIN = Number.MIN_VALUE, MAX = Number.MAX_VALUE, MIN_NORMAL = 2 ** -1022;
    const cases: [number, number, number, string][] = [
      [3, 4, 12, "402a000000000000"], [1, 2, 2, "4008000000000000"], [-3, -4, -12, "402a000000000000"],
      [0, 0, 0, "0000000000000000"], [-0, -0, -0, "0000000000000000"], [-0, 0, -0, "0000000000000000"],
      [5, 0, 0, "4014000000000000"], [0, -7, 0, "401c000000000000"], [0, 0, 1e-320, "00000000000007e8"],
      [1, 1, 1, "3ffbb67ae8584caa"], [1 / 3, 2 / 3, 2 / 3, "3ff0000000000000"], [0.1, 0.2, 0.3, "3fd7f254dab9cc3b"],
      [1, 1 + 2 ** -52, 1 - 2 ** -53, "3ffbb67ae8584cab"], [2 ** 511, 2 ** 511, 2 ** -511, "5fe6a09e667f3bcd"],
      [1e308, 1e308, 1e308, "7feed4df0150215a"], [MAX, MAX, MAX, "7ff0000000000000"], [MAX, 1, 1, "7fefffffffffffff"],
      [MIN, MIN, MIN, "0000000000000002"], [MIN, 0, 0, "0000000000000001"], [MIN, MIN_NORMAL, 0, "0010000000000000"],
      [MIN_NORMAL, MIN_NORMAL, MIN_NORMAL, "001bb67ae8584caa"], [1e-310, 3e-310, 2e-310, "000044e0ba479dcb"],
      [1e-300, 1e300, 1, "7e37e43c8800759c"], [23.6, 15.7, 50.8, "404d1622a17fa2fc"], [-17.997, 11.997, 50.8125, "404b9cb7e6143737"],
      [0.006, 0.004, 51.282051282051285, "4049a41a45e4e073"], [Math.PI, Math.E, Math.SQRT2, "40118dcad3dbd646"],
      [123456789, 987654321, 192837465, "41ce370cfd624548"],
      // The compensation changes the last bit here (an uncompensated sum gives ...0a, ...5d and ...c2).
      [8.176205158233643, 8.358519077301025, 7.425072193145752, "402bb3a681b7c30b"],
      [7.440856695175171, 8.986176252365112, 8.741925954818726, "402d284d8f0d515e"],
      [9.865699112415314, 3.1333255767822266, 1.5276622772216797, "4024ed47876125c3"]
    ];
    for (const [a, b, c, expected] of cases) expect(bitsOf(hypot3(a, b, c)), `hypot3(${a}, ${b}, ${c})`).toBe(expected);
    // Signed zeros give +0.
    expect(Object.is(hypot3(-0, -0, -0), 0)).toBe(true);
  });

  it("follows Math.hypot's non-finite rules on every combination of a non-finite alphabet", () => {
    const alphabet = [NaN, Infinity, -Infinity, 0, -0, 1, -1, Number.MIN_VALUE, Number.MAX_VALUE, -3];
    const results: string[] = [];
    for (const a of alphabet) for (const b of alphabet) for (const c of alphabet) {
      const value = hypot3(a, b, c), args = [a, b, c];
      if (args.some((x) => x === Infinity || x === -Infinity)) expect(value, `${args}`).toBe(Infinity);
      else if (args.some(Number.isNaN)) expect(value, `${args}`).toBeNaN();
      else if (args.every((x) => x === 0)) expect(Object.is(value, 0), `${args}`).toBe(true);
      results.push(Number.isNaN(value) ? "nan" : bitsOf(value));
      if (isV8) expect(Object.is(value, Math.hypot(a, b, c)), `${args}`).toBe(true);
    }
    expect(hypot3(NaN, NaN, NaN)).toBeNaN();
    expect(hypot3(NaN, Infinity, 1)).toBe(Infinity);
    expect(hypot3(NaN, -Infinity, NaN)).toBe(Infinity);
    // Every result's bits (a NaN's payload is not observable portably, so it is recorded as "nan"), the same in every engine.
    expect(createHash("sha256").update(results.join(",")).digest("hex")).toBe("a5d07395338b7b1670dc3f54198ba5b61178a759f27ad2bfc1e5da4e72ec8548");
  });

  it.skipIf(!isV8)("equals V8's Math.hypot bit for bit on 10^6 seeded triples (skipped with a warning on engines other than V8)", () => {
    const data = triples(1_000_000);
    let mismatches = 0, first = "";
    for (let i = 0; i < data.length; i += 3) {
      const a = data[i]!, b = data[i + 1]!, c = data[i + 2]!;
      if (!Object.is(hypot3(a, b, c), Math.hypot(a, b, c))) {
        if (mismatches++ === 0) first = `hypot3(${a}, ${b}, ${c}) = ${hypot3(a, b, c)}, Math.hypot ${Math.hypot(a, b, c)}`;
      }
    }
    expect(mismatches, first).toBe(0);
  });
});
