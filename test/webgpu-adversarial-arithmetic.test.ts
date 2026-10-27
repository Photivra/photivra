// SPDX-License-Identifier: Apache-2.0
/**
 * The `webgpu-f32` sensor and chart stages under adversarial float32 arithmetic (#471): the fake device
 * evaluates the kernels with every liberty the WGSL accuracy table grants (either-direction rounding of
 * + − ×, 2.5 ULP division, table-bounded sqrt/log/exp, reassociated sums). The "exact except flagged
 * sites" and "reference rounded once" guarantees must survive it.
 */
import { describe, expect, it } from "vitest";
import { calculateChartRadianceBatch, calculatePackedSensorRawPlan, createImageKernelAccelerator, simulatePackedSensorRaw,
  type PackedSensorRawInput, type SensorReadoutConversionProfile } from "../src/index.js";
import { createPackedFixedPattern, simulatePackedSensorSite } from "../src/capture/packed-sensor-raw.js";
import { pieceWords, sensorGpuConstants, twelveBitPieces } from "../src/gpu/sensor-stage-gpu.js";
import { SENSOR_AUX, SENSOR_PIECE_WORDS } from "../src/gpu/wgsl-sensor-kernel.js";
import { chartBatchInput, chartPoints, CHART_PRESET_SCENES } from "./helpers/chart-radiance-fixtures.js";
import { createFakeGpu } from "./helpers/fake-webgpu.js";
import { adversarialArithmetic, moveUlps, nearestArithmetic, type EmulationArithmetic } from "./helpers/fake-webgpu-stages.js";
import { fixedPatternCorpus, readoutProfile, sensorCorpus } from "./helpers/sensor-stage-fixtures.js";

const ULP = (x: number): number => Math.abs(moveUlps(x, 1) - x);

async function gpu(arithmetic: EmulationArithmetic): Promise<Awaited<ReturnType<typeof createImageKernelAccelerator>>> {
  return createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: createFakeGpu({ arithmetic }).gpu });
}

/** Unflagged sites equal the reference; repairing the flagged ones with the reference restores it bit for bit. */
function assertExactExceptFlagged(input: PackedSensorRawInput, out: { codes: Uint16Array; flaggedSiteIndices: Uint32Array }, label: string): number {
  const reference = simulatePackedSensorRaw(input), plan = calculatePackedSensorRawPlan(input), pattern = createPackedFixedPattern(plan);
  const flagged = new Set(out.flaggedSiteIndices);
  let differing = 0;
  for (let i = 0; i < reference.codes.length; i++) {
    if (out.codes[i] !== reference.codes[i]) { differing++; expect(flagged.has(i), `${label}: site ${i} differs but is not flagged`).toBe(true); }
  }
  const repaired = out.codes.slice();
  for (const i of out.flaggedSiteIndices) {
    const row = Math.floor(i / input.region.width), column = i % input.region.width;
    repaired[i] = simulatePackedSensorSite(plan, input.photoElectrons[i]!, input.darkElectrons[i]!,
      (input.region.y + row) * input.nativeWidth + input.region.x + column, pattern === null ? null : pattern(column, row),
      (input.additionalChargeComponents ?? []).map(c => c.expectedElectrons[i]!)).code;
  }
  expect(repaired).toEqual(reference.codes);
  return differing;
}

const cases: [string, SensorReadoutConversionProfile, number][] = [
  ["12-bit unit gain", readoutProfile(), 60_000],
  ["14-bit fractional gain, three noise sources", readoutProfile({ gain: 3.7, bitDepth: 14, black: 512, preAdc: 70_000, sigmas: [1.5, 0, 4.25] }), 60_000.5],
  ["16-bit low gain", readoutProfile({ gain: 0.95, bitDepth: 16, black: 1024, preAdc: 61_000, sigmas: [2.5] }), 60_000],
  ["INL and digital gain", readoutProfile({ gain: 18, bitDepth: 12, black: 256, saturation: 4000, preAdc: 66_000, sigmas: [3], digitalGain: 1.75,
    inl: [{ code: 0, offsetCodes: 0 }, { code: 1000, offsetCodes: 1.5 }, { code: 3000, offsetCodes: -2.25 }, { code: 4095, offsetCodes: 0.5 }] }), 60_000],
  ["inexact digital gain", readoutProfile({ gain: 15.3, bitDepth: 12, black: 128, preAdc: 66_000, sigmas: [2], digitalGain: 1.3 }), 60_000],
  ["noise-free power-of-two gain", readoutProfile({ gain: 2, bitDepth: 16, black: 0, preAdc: 70_000, sigmas: [0] }), 60_000]
];

describe("adversarial float32 arithmetic model", () => {
  it("stays inside the WGSL accuracy table and perturbs most results", () => {
    const A = adversarialArithmetic(5);
    let moved = 0, trials = 0;
    const random = (() => { let s = 99; return (): number => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; }; })();
    for (let i = 0; i < 20_000; i++) {
      const a = Math.fround((random() - 0.5) * 10 ** (6 * random() - 3)), b = Math.fround((random() + 0.1) * 10 ** (4 * random() - 2)), x = Math.fround(random() * 40 + 0.01);
      // + − ×: one of the two neighbours of the exact value.
      for (const [got, exact] of [[A.add(a, b), a + b], [A.sub(a, b), a - b], [A.mul(a, b), a * b]] as const) {
        const nearest = Math.fround(exact);
        expect(got === nearest || Math.abs(got - exact) < ULP(nearest), `op ${a} ${b}`).toBe(true);
        trials++; if (got !== nearest) moved++;
      }
      const q = A.div(a, b), e = a / b;
      expect(Math.abs(q - e)).toBeLessThanOrEqual(2.5 * ULP(Math.fround(e)) + 1e-45);
      const r = A.sqrt(x), er = Math.sqrt(x);
      expect(Math.abs(r - er)).toBeLessThanOrEqual(4.5 * ULP(Math.fround(er)));
      const l = A.log(x), el = Math.log(x);
      if (x >= 0.5 && x <= 2) expect(Math.abs(l - el)).toBeLessThanOrEqual(2 ** -21);
      else expect(Math.abs(l - el)).toBeLessThanOrEqual(3 * ULP(Math.fround(el)));
      const ex = A.exp(-x), ee = Math.exp(-x);
      expect(Math.abs(ex - ee)).toBeLessThanOrEqual((3 + 2 * x) * ULP(Math.fround(ee)));
      const n = Math.floor(random() * 2 ** 30), c = A.convert(n);
      expect(c === Math.fround(n) || Math.abs(c - n) < ULP(Math.fround(n))).toBe(true);
    }
    // Directed rounding moves a large share of inexact results off the nearest value; exact results never move.
    expect(moved / trials).toBeGreaterThan(0.3);
    expect(A.add(0.5, 0.25)).toBe(0.75);
    expect(A.mul(3, 4096)).toBe(12288);
    // Reassociation: a sum of many terms is taken in a different order yet stays a float32 sum of those terms.
    const terms = Array.from({ length: 12 }, (_, i) => Math.fround(0.1 * (i + 1)));
    const sums = new Set(Array.from({ length: 20 }, () => A.sum(terms)));
    expect(sums.size).toBeGreaterThan(1);
    for (const s of sums) expect(Math.abs(s - terms.reduce((acc, t) => acc + t, 0))).toBeLessThan(12 * 2 ** -23 * 8);
    expect(nearestArithmetic.sum(terms)).toBe(terms.reduce((acc, t) => Math.fround(acc + t), 0));
  });
  it("splits a gain into exact mantissa, exponent and scale words", () => {
    for (const v of [1, 1 / 3.7, 1 / 0.95, 1 / 15.3, 1.3, 1.75, 2 ** 40 / 3, 2 ** -59]) {
      const { pieces, residual } = twelveBitPieces(v);
      let sum = 0;
      for (const piece of pieces) {
        const [m, s, scale] = pieceWords(piece);
        expect(Number.isInteger(m) && m >= 0 && m < 4096).toBe(true);
        expect(scale).toBe(2 ** s);
        expect(Math.fround(scale)).toBe(scale);
        expect(m * scale).toBe(piece);
        sum += m * scale;
      }
      expect(sum + residual).toBe(v);
    }
    expect(pieceWords(0)).toEqual([0, 0, 1]);
    const aux = sensorGpuConstants(calculatePackedSensorRawPlan(sensorCorpus(4, 2, 1, cases[3]![1], 60_000))).aux;
    expect(aux[SENSOR_AUX.inversePieces]! * aux[SENSOR_AUX.inversePieces + 2]!).toBe(twelveBitPieces(1 / 18).pieces[0]);
    // Knots: codes, offsets, then host float64 segment slopes.
    expect(Array.from(aux.subarray(SENSOR_AUX.knots, SENSOR_AUX.knots + 12))).toEqual([0, 1000, 3000, 4095, 0, 1.5, -2.25, 0.5,
      Math.fround(1.5 / 1000), Math.fround(-3.75 / 2000), Math.fround(2.75 / 1095), 0]);
    expect(SENSOR_PIECE_WORDS * 4).toBe(SENSOR_AUX.digitalPieces - SENSOR_AUX.inversePieces);
  });
});

describe("webgpu-f32 sensor stage under adversarial arithmetic (fake device)", () => {
  it.each(cases)("%s: no unflagged site differs under either-direction rounding, 2.5 ULP division and reassociation", async (name, readout, capacity) => {
    const input = sensorCorpus(128, 64, name.length, readout, capacity);
    const nearest = await (await gpu(nearestArithmetic)).simulateSensorRaw(input);
    const baseline = assertExactExceptFlagged(input, nearest, `${name} nearest`);
    expect(baseline).toBe(0);
    for (const seed of [1, 2, 3]) {
      const out = await (await gpu(adversarialArithmetic(seed))).simulateSensorRaw(input);
      assertExactExceptFlagged(input, out, `${name} adversarial seed ${seed}`);
      // The adversarial device flags the same order of sites: the margins, not luck, hold the guarantee.
      expect(out.flaggedSiteIndices.length).toBeLessThan(2 * nearest.flaggedSiteIndices.length + 32);
    }
  });
  it.each(cases.slice(0, 5))("%s, with fixed-pattern noise and three additional charge components: the guarantee holds under adversarial arithmetic", async (name, readout, capacity) => {
    const input = fixedPatternCorpus(128, 64, name.length + 100, readout, capacity);
    assertExactExceptFlagged(input, await (await gpu(nearestArithmetic)).simulateSensorRaw(input), `${name} nearest`);
    for (const seed of [4, 5]) assertExactExceptFlagged(input, await (await gpu(adversarialArithmetic(seed))).simulateSensorRaw(input), `${name} adversarial seed ${seed}`);
  });
});

describe("webgpu-f32 chart radiance under adversarial arithmetic (fake device)", () => {
  it.each(CHART_PRESET_SCENES)("%s: every value is the reference rounded once, for either-direction rounding", async (name, scene) => {
    const input = chartBatchInput(scene, chartPoints(scene, 2 / 3, 4000, name.length), "spectral-integral"), reference = calculateChartRadianceBatch(input).values;
    for (const seed of [1, 2]) {
      const out = await (await gpu(adversarialArithmetic(seed))).evaluateChartRadiance(input);
      for (let i = 0; i < reference.length; i++) expect(out.values[i], `${name} seed ${seed} value ${i}`).toBe(Math.fround(reference[i]!));
    }
  });
  it("Siemens star: points on, beside and at float32 distance from every sector boundary, the u-axis and the ±π cut", async () => {
    const scene = CHART_PRESET_SCENES[2]![1], cycles = 36, r = 0.9 * (2 / 3), values: number[] = [];
    let s = 17;
    const random = (): number => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; };
    for (let k = 0; k <= 2 * cycles; k++) {
      const b = Math.PI * (k / cycles - 1);
      for (let j = 0; j < 12; j++) {
        const rho = r * (0.02 + 0.97 * random()), u = rho * Math.cos(b), v = rho * Math.sin(b);
        values.push(u, v, moveUlps(Math.fround(u), 1), v, u, moveUlps(Math.fround(v), -1), u + 1e-9, v - 1e-9, u - 1e-5, v + 1e-5);
      }
    }
    for (const u of [-0.5, -0.1, 0.1, 0.5]) values.push(u, 0, u, -0, u, 2 ** -140, u, -(2 ** -140), u, 1e-17, u, -1e-17);
    for (const v of [-0.5, -0.1, 0.1, 0.5]) values.push(0, v, -0, v, 1e-17, v);
    values.push(0, 0, -0, 0, 0, -0, -0, -0);
    const input = chartBatchInput(scene, Float64Array.from(values), "radiance"), reference = calculateChartRadianceBatch(input).values;
    for (const arithmetic of [nearestArithmetic, adversarialArithmetic(9), adversarialArithmetic(10)]) {
      const out = await (await gpu(arithmetic)).evaluateChartRadiance(input);
      for (let i = 0; i < reference.length; i++) expect(out.values[i], `value ${i}`).toBe(Math.fround(reference[i]!));
      // Every point placed exactly on a boundary is recomputed; the points 1e-5 off a boundary mostly are not.
      const recomputed = new Set(out.hostRecomputedQueryIndices);
      for (let k = 0; k <= 2 * cycles; k++) for (let j = 0; j < 12; j++) expect(recomputed.has((k * 12 + j) * 5), `boundary ${k} point ${j}`).toBe(true);
      let far = 0;
      for (let k = 0; k <= 2 * cycles; k++) for (let j = 0; j < 12; j++) if (recomputed.has((k * 12 + j) * 5 + 4)) far++;
      expect(far).toBeLessThan(12 * (2 * cycles + 1) / 4);
    }
  });
});
