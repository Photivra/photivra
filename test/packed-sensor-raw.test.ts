// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { calculatePackedSensorRawPlan, createImageKernelAccelerator, ImageKernelExecutionError, simulatePackedSensorRaw, type PackedSensorRawInput,
  type SensorRawProducerSiteInput, type SensorReadoutConversionProfile } from "../src/index.js";
import { calculateNativeRawSite } from "../src/capture/sensor-raw-producer.js";
import { simulatePackedSensorSite } from "../src/capture/packed-sensor-raw.js";
import { sensorGpuConstants, stirlingRemainderTable, twelveBitPieces } from "../src/gpu/sensor-stage-gpu.js";
import { uniformThresholdInteger } from "../src/gpu/wgsl-sensor-kernel.js";
import { createFakeGpu } from "./helpers/fake-webgpu.js";
import { loadSensorRawProducerInput } from "./helpers/sensor-raw-producer-fixture.js";
import { corpusRandom, readoutProfile, sensorCorpus, sensorStageInput } from "./helpers/sensor-stage-fixtures.js";

/** A value e with (e / d) * d === e, so constant-rate products stay exact. */
function exactProduct(e: number, d: number): number {
  let x = e;
  for (let i = 0; i < 8 && (x / d) * d !== x; i++) x = (x / d) * d;
  return x;
}

/** A producer site with the given expected photo and dark electrons and readout profile. */
function producerSite(base: SensorRawProducerSiteInput, photo: number, dark: number, readout: SensorReadoutConversionProfile, capacity: number): SensorRawProducerSiteInput {
  const s = structuredClone(base), p = s.charge.photoSignal as unknown as Record<string, number>, d = s.charge.darkCharge;
  const duration = p.localExposureDurationSeconds!, e = exactProduct(photo, duration), incident = exactProduct(2 * e, duration);
  Object.assign(p, { expectedGeneratedElectronCount: e, expectedGeneratedElectronRatePerSecond: e / duration,
    expectedIncidentPhotonCount: incident, incidentPhotonRatePerSecond: incident / duration });
  const de = exactProduct(dark, duration);
  Object.assign(d, { expectedDarkElectronCount: de, darkCurrentElectronsPerSecond: de / duration });
  s.capacityProfile.capacityElectrons = capacity;
  s.readoutProfile = { ...structuredClone(readout), channelId: base.readoutProfile.channelId };
  return s;
}

describe("packed sensor stage reference", () => {
  const regimes: [string, SensorReadoutConversionProfile][] = [
    ["unit gain", readoutProfile({ gain: 1, bitDepth: 10, black: 64, preAdc: 1000, sigmas: [2] })],
    ["fractional gain, two noise sources", readoutProfile({ gain: 3.7, bitDepth: 14, black: 512, preAdc: 50_000, sigmas: [1.5, 0, 4.25] })],
    ["INL and digital gain", readoutProfile({ gain: 0.37, bitDepth: 12, black: 256, saturation: 4000, preAdc: 1400, sigmas: [3],
      digitalGain: 1.75, inl: [{ code: 0, offsetCodes: 0 }, { code: 1000, offsetCodes: 1.5 }, { code: 3000, offsetCodes: -2.25 }, { code: 4095, offsetCodes: 0.5 }] })]
  ];
  it.each(regimes)("is bit-identical to the per-site engine (calculateNativeRawSite): %s", (_, readout) => {
    const base = loadSensorRawProducerInput().sites, random = corpusRandom(7), seed = 0x1234abcd;
    const levels = [0, 0.4, 7, 29.99, 30, 31.5, 400, 999.5, 1001, 30_000, 2e5, 1.5e9];
    for (let n = 0; n < 160; n++) {
      const photo = levels[n % levels.length]! * (n < levels.length ? 1 : 0.8 + 0.4 * random()), dark = n % 3 === 0 ? 3 * random() : 0;
      const capacity = n % 2 ? 1000 : 1000.5, index = Math.floor(random() * 2 ** 32);
      const site = producerSite(base[n % 4]!, photo, dark, readout, capacity);
      const reference = calculateNativeRawSite(site, seed, index);
      const input = sensorStageInput({ width: 1, height: 1, nativeWidth: 65_535, nativeHeight: 65_535, x: index % 65_535, y: Math.floor(index / 65_535),
        seed, capacity: reference.capacity.value.physicalChargeCapacityElectrons, readout, photo: () => reference.accumulatedCharge.value.photoExpectedElectronCount,
        dark: () => reference.accumulatedCharge.value.darkExpectedElectronCount });
      if (input.region.y >= 65_535) continue;
      const packed = simulatePackedSensorSite(calculatePackedSensorRawPlan(input), input.photoElectrons[0]!, input.darkElectrons[0]!, index - index % 65_535 + index % 65_535);
      const r = reference.readout.value;
      expect(packed.code).toBe(r.rawCode);
      expect(packed.flags).toBe(Number(r.physicalScalarSaturationApplied) | Number(r.preAdcSaturationApplied) << 1 |
        Number(r.digitalSaturationApplied) << 2 | Number(r.lowerCodeClampApplied) << 3);
    }
  });
  it("seeds by absolute native index, so a region equals the matching part of the full frame", () => {
    const full = sensorCorpus(23, 11, 3);
    const region = { ...full, region: { x: 5, y: 4, width: 9, height: 6 }, photoElectrons: new Float64Array(54), darkElectrons: new Float64Array(54) };
    for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) {
      region.photoElectrons[r * 9 + c] = full.photoElectrons[(r + 4) * 23 + c + 5]!;
      region.darkElectrons[r * 9 + c] = full.darkElectrons[(r + 4) * 23 + c + 5]!;
    }
    const a = simulatePackedSensorRaw(full).codes, b = simulatePackedSensorRaw(region).codes;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) expect(b[r * 9 + c]).toBe(a[(r + 4) * 23 + c + 5]);
  });
  it("validates geometry, arrays and the readout regime", () => {
    const bad: ((v: PackedSensorRawInput) => void)[] = [
      (v): void => { (v as { schemaVersion: string }).schemaVersion = "9"; }, (v): void => { v.region.width = 99; }, (v): void => { v.region.x = -1; },
      (v): void => { v.photoElectrons = new Float64Array(3); }, (v): void => { v.photoElectrons[0] = -1; }, (v): void => { v.darkElectrons[1] = NaN; },
      (v): void => { v.photoElectrons[2] = Infinity; }, (v): void => { v.physicalChargeCapacityElectrons = 0; }, (v): void => { v.captureSeedUint32 = 2 ** 32; },
      (v): void => { v.regimeId = "missing"; }, (v): void => { v.readoutProfile = readoutProfile({ bitDepth: 18 }); },
      (v): void => { (v as unknown as Record<string, unknown>).extra = 1; }, (v): void => { v.nativeWidth = 70_000; }
    ];
    for (const mutate of bad) { const v = sensorCorpus(4, 3, 1); mutate(v); expect(() => calculatePackedSensorRawPlan(v)).toThrow(); }
  });
});

describe("webgpu-f32 sensor stage helpers", () => {
  it("splits values into exact 12-bit pieces", () => {
    for (const v of [1, 1 / 3.7, 0.37, 1 / 0.37, 2 ** 40 / 3, 65536, 1.75]) {
      const { pieces, residual } = twelveBitPieces(v);
      expect(pieces.reduce((s, p) => s + p, 0) + residual).toBe(v);
      expect(residual).toBeGreaterThanOrEqual(0);
      expect(residual).toBeLessThan(v * 2 ** -44);
      for (const p of pieces) {
        expect(Math.fround(p)).toBe(p);
        if (p > 0) { const scale = 2 ** (Math.floor(Math.log2(p)) - 11); expect(Number.isInteger(p / scale)).toBe(true); }
      }
    }
  });
  it("compares uniforms with constants exactly on the integer state", () => {
    for (const t of [0.07, 0.013]) {
      const m = uniformThresholdInteger(t);
      expect((m + 0.5) / 2 ** 32 >= t).toBe(true);
      expect((m - 0.5) / 2 ** 32 >= t).toBe(false);
    }
  });
  it("tabulates the Stirling remainder of the reference's log k!", () => {
    const table = stirlingRemainderTable();
    expect(table[1]).toBeCloseTo(1 - 0.5 * Math.log(2 * Math.PI), 14);
    for (const k of [10, 100, 255]) expect(table[k]).toBeCloseTo(1 / (12 * k) - 1 / (360 * k ** 3), k < 50 ? 7 : 11);
  });
  it("rejects inputs outside the float32 domain before touching the device", () => {
    const plan = (v: PackedSensorRawInput): ReturnType<typeof calculatePackedSensorRawPlan> => calculatePackedSensorRawPlan(v);
    expect(() => sensorGpuConstants(plan(sensorCorpus(4, 3, 1, readoutProfile(), 2 ** 24 + 1)))).toThrow(ImageKernelExecutionError);
    expect(() => sensorGpuConstants(plan(sensorStageInput({ width: 2, height: 1, photo: () => 2 ** 30 })))).toThrow(/2\^30/u);
    expect(() => sensorGpuConstants(plan(sensorStageInput({ width: 2, height: 1, photo: () => 1, readout: readoutProfile({ gain: 1e-5 }) })))).toThrow(/domain/u);
    expect(() => sensorGpuConstants(plan(sensorStageInput({ width: 2, height: 1, photo: () => 1, readout: readoutProfile({ sigmas: [1e8] }) })))).toThrow(/domain/u);
  });
});

async function gpuAccelerator(maximumBandBytes?: number): Promise<Awaited<ReturnType<typeof createImageKernelAccelerator>>> {
  return createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: createFakeGpu().gpu, ...(maximumBandBytes ? { maximumBandBytes } : {}) });
}

describe("accelerated sensor stage", () => {
  it("CPU backend returns the reference with a reference label", async () => {
    const input = sensorCorpus(31, 9, 4), a = await createImageKernelAccelerator({ backend: "cpu-reference" });
    const out = await a.simulateSensorRaw(input, { yieldControl: async () => {} });
    const reference = simulatePackedSensorRaw(input);
    expect(out.codes).toEqual(reference.codes);
    expect(out.diagnostics).toEqual(reference.diagnostics);
    expect(out.execution).toMatchObject({ backend: "cpu-reference", bitIdenticalToReference: true, errorBound: null });
  });
  const cases: [string, SensorReadoutConversionProfile, number, number][] = [
    ["12-bit unit gain", readoutProfile(), 60_000, 0.01],
    ["14-bit fractional gain, three noise sources", readoutProfile({ gain: 3.7, bitDepth: 14, black: 512, preAdc: 70_000, sigmas: [1.5, 0, 4.25] }), 60_000.5, 0.01],
    ["16-bit low gain", readoutProfile({ gain: 0.95, bitDepth: 16, black: 1024, preAdc: 61_000, sigmas: [2.5] }), 60_000, 0.01],
    ["INL and digital gain", readoutProfile({ gain: 18, bitDepth: 12, black: 256, saturation: 4000, preAdc: 66_000, sigmas: [3], digitalGain: 1.75,
      inl: [{ code: 0, offsetCodes: 0 }, { code: 1000, offsetCodes: 1.5 }, { code: 3000, offsetCodes: -2.25 }, { code: 4095, offsetCodes: 0.5 }] }), 60_000, 0.01],
    ["inexact digital gain", readoutProfile({ gain: 15.3, bitDepth: 12, black: 128, preAdc: 66_000, sigmas: [2], digitalGain: 1.3 }), 60_000, 0.05],
    ["noise-free power-of-two gain (exact ties)", readoutProfile({ gain: 2, bitDepth: 16, black: 0, preAdc: 70_000, sigmas: [0] }), 60_000, 0.01]
  ];
  it.each(cases)("equals the reference at every unflagged site (fake device, float32 emulation): %s", async (_, readout, capacity, flaggedFraction) => {
    const input = sensorCorpus(97, 41, 11, readout, capacity), reference = simulatePackedSensorRaw(input);
    const a = await gpuAccelerator(), out = await a.simulateSensorRaw(input);
    expect(out.execution).toMatchObject({ backend: "webgpu-f32", arithmetic: "float32", bitIdenticalToReference: false,
      errorBound: { kind: "exact-except-flagged-sites", noiseModel: { id: "photivra-native-raw-noise", version: "0.4.0" } } });
    const bound = out.execution.errorBound as { flaggedSiteCount: number };
    expect(bound.flaggedSiteCount).toBe(out.execution.diagnosticUncertaintySampleCount);
    expect(out.flaggedSiteIndices.length).toBe(bound.flaggedSiteCount);
    const flagged = new Set(out.flaggedSiteIndices);
    for (let i = 0; i < reference.codes.length; i++) if (!flagged.has(i)) expect(out.codes[i], `unflagged site ${i}`).toBe(reference.codes[i]);
    // Recomputing only the flagged sites with the reference makes the region bit-identical.
    const repaired = out.codes.slice();
    for (const i of out.flaggedSiteIndices) repaired[i] = simulatePackedSensorSite(reference.plan, input.photoElectrons[i]!, input.darkElectrons[i]!, i).code;
    expect(repaired).toEqual(reference.codes);
    expect(bound.flaggedSiteCount).toBeLessThan(reference.codes.length * flaggedFraction);
    for (const key of Object.keys(reference.diagnostics) as (keyof typeof reference.diagnostics)[]) {
      expect(Math.abs(out.diagnostics[key] - reference.diagnostics[key])).toBeLessThanOrEqual(bound.flaggedSiteCount);
    }
    a.dispose();
  });
  it("banding changes memory only, never codes", async () => {
    const input = sensorCorpus(64, 37, 5);
    const whole = await (await gpuAccelerator()).simulateSensorRaw(input), banded = await (await gpuAccelerator(4096)).simulateSensorRaw(input);
    expect(banded.codes).toEqual(whole.codes);
    expect(banded.execution).toEqual(whole.execution);
  });
  it("fails closed outside the float32 domain", async () => {
    const a = await gpuAccelerator();
    await expect(a.simulateSensorRaw(sensorCorpus(4, 3, 1, readoutProfile(), 2 ** 25))).rejects.toMatchObject({ reason: "unsupported-float32-domain" });
    a.dispose();
  });
});
