// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { createHdrBracketMergeTask, createHdrImageEncodingTask, InvalidConfigurationError,
  InvalidScientificInputError, type HdrBracketFrame } from "../src/index.js";
import { gaussian, mulberry32, rgbImage, runTask } from "./helpers/processing-fixture.js";

function frame(codes: Float32Array | Uint16Array, t: number, extra: Partial<HdrBracketFrame> = {}): HdrBracketFrame {
  return { exposureTimeSeconds: t, codes, blackLevelCode: 64, whiteLevelCode: 4000, conversionGainElectronsPerCode: 2, readNoiseElectrons: 3, ...extra };
}

describe("HDR bracket merge", () => {
  it("recovers an exact noise-free rate and excludes saturated or flagged samples", async () => {
    const rates = [10, 1000, 30000, 2000000], times = [1, 1 / 8, 1 / 64];
    const frames = times.map((t) => frame(Float32Array.from(rates, (phi) => Math.min(64 + phi * t / 2, 4095)), t));
    const out = await runTask((p) => createHdrBracketMergeTask({ sampleCount: 4, frames }, p));
    for (let i = 0; i < 3; i++) expect(out.radianceElectronsPerSecond[i]).toBeCloseTo(rates[i]!, 1);
    expect(Array.from(out.contributingFrameCount)).toEqual([3, 3, 2, 0]);
    // 2e6 e⁻/s saturates every frame: the largest representable rate (64 s⁻¹·(4000 − 64)·2) is a lower bound.
    expect(out.radianceElectronsPerSecond[3]).toBe(Math.fround((4000 - 64) * 2 * 64)); expect(out.saturatedInAllFramesCount).toBe(1);
    // Changing a saturated code or flagging a sample changes only what is excluded.
    frames[0]!.codes[2] = 4090;
    const flags = new Uint8Array(4); flags[0] = 1;
    const flagged = await runTask((p) => createHdrBracketMergeTask({ sampleCount: 4, frames: [{ ...frames[0]!, saturationFlags: flags }, frames[1]!, frames[2]!] }, p));
    expect(flagged.radianceElectronsPerSecond[2]).toBe(out.radianceElectronsPerSecond[2]);
    expect(flagged.contributingFrameCount[0]).toBe(2); expect(flagged.radianceElectronsPerSecond[0]).toBeCloseTo(10, 1);
  });

  it("reduces to the Poisson maximum-likelihood Σe/Σt without read or quantization noise", async () => {
    const codes = [Float32Array.of(64 + 50 / 1e-3), Float32Array.of(64 + 130 / 1e-3)];
    const out = await runTask((p) => createHdrBracketMergeTask({ sampleCount: 1, frames: [
      frame(codes[0]!, 1, { readNoiseElectrons: 0, conversionGainElectronsPerCode: 1e-3, whiteLevelCode: 1e9 }),
      frame(codes[1]!, 3, { readNoiseElectrons: 0, conversionGainElectronsPerCode: 1e-3, whiteLevelCode: 1e9 })] }, p));
    expect(out.radianceElectronsPerSecond[0]).toBeCloseTo(180 / 4, 3);
    expect(out.standardDeviationElectronsPerSecond[0]).toBeCloseTo(Math.sqrt(45 / 4), 3);
  });

  it("is unbiased with the predicted variance and beats equal weighting on simulated shot + read noise", async () => {
    const random = mulberry32(42), n = 20000, phi = 200, times = [1, 1 / 8], read = 5, k = 1;
    const frames = times.map((t) => {
      const codes = new Uint16Array(n);
      for (let i = 0; i < n; i++) {
        const mean = phi * t, e = mean + Math.sqrt(mean) * gaussian(random) + read * gaussian(random);
        codes[i] = Math.max(0, Math.round(64 + e / k));
      }
      return frame(codes, t, { conversionGainElectronsPerCode: k, readNoiseElectrons: read });
    });
    const out = await runTask((p) => createHdrBracketMergeTask({ sampleCount: n, frames }, p));
    let sum = 0, sum2 = 0, naive2 = 0, predicted = 0;
    for (let i = 0; i < n; i++) {
      const v = out.radianceElectronsPerSecond[i]!; sum += v; sum2 += (v - phi) ** 2; predicted += out.standardDeviationElectronsPerSecond[i]! ** 2;
      const equal = (((frames[0]!.codes[i]! - 64) / 1) + (frames[1]!.codes[i]! - 64) * 8) / 2; naive2 += (equal - phi) ** 2;
    }
    const variance = sum2 / n;
    expect(Math.abs(sum / n - phi)).toBeLessThan(3 * Math.sqrt(variance / n));
    expect(variance / (predicted / n)).toBeGreaterThan(0.95); expect(variance / (predicted / n)).toBeLessThan(1.05);
    // Analytic optimum 1/(1/225.08 + 1/3205.3) ≈ 210 versus ≈ 857 for equal weights.
    expect(variance).toBeLessThan(230); expect(naive2 / n).toBeGreaterThan(3 * variance);
  });

  it("rejects malformed brackets with domain errors", () => {
    const p = { yieldControl: async (): Promise<void> => {} }, ok = frame(new Float32Array(2), 1);
    expect(() => createHdrBracketMergeTask({ sampleCount: 2, frames: [] }, p)).toThrow(InvalidConfigurationError);
    expect(() => createHdrBracketMergeTask({ sampleCount: 3, frames: [ok] }, p)).toThrow(InvalidConfigurationError);
    expect(() => createHdrBracketMergeTask({ sampleCount: 2, frames: [{ ...ok, exposureTimeSeconds: 0 }] }, p)).toThrow(InvalidScientificInputError);
    expect(() => createHdrBracketMergeTask({ sampleCount: 2, frames: [{ ...ok, whiteLevelCode: 10 }] }, p)).toThrow(InvalidScientificInputError);
    expect(() => createHdrBracketMergeTask({ sampleCount: 2, frames: [ok] }, null as never)).toThrow(InvalidConfigurationError);
  });

  it("never returns NaN or Infinity: exposure times below 1 ns are rejected and non-finite merges fail closed", async () => {
    const p = { yieldControl: async (): Promise<void> => {} }, codes = Float32Array.of(64, 1000, 3999);
    // t = 1e-170 s: t² underflows to 0 and the weights become 0/0 (the merge returned NaN and Infinity).
    for (const t of [1e-170, 1e-12, 9.99e-10]) {
      expect(() => createHdrBracketMergeTask({ sampleCount: 3, frames: [frame(codes, t)] }, p), String(t)).toThrow(InvalidScientificInputError);
    }
    // The 1 ns limit itself, with the largest white level and gain, still gives finite float32 rates and deviations.
    const extreme = await runTask((q) => createHdrBracketMergeTask({ sampleCount: 3, frames: [
      frame(Float32Array.of(64, 1e15, 9e15), 1e-9, { whiteLevelCode: Number.MAX_SAFE_INTEGER, conversionGainElectronsPerCode: 1e9 }), frame(codes, 1)] }, q));
    for (const v of [...extreme.radianceElectronsPerSecond, ...extreme.standardDeviationElectronsPerSecond]) expect(Number.isFinite(v)).toBe(true);
    // A degenerate merge fails instead of storing NaN: with a code at black, no read noise and a gain so small that K²/12
    // underflows, every variance is 0 and the weights are t²/0 = Infinity (Infinity · 0 = NaN).
    await expect(runTask((q) => createHdrBracketMergeTask({ sampleCount: 1, frames: [
      frame(Float32Array.of(64), 1, { conversionGainElectronsPerCode: 1e-170, readNoiseElectrons: 0 })] }, q))).rejects.toThrow(InvalidScientificInputError);
  });
});

describe("HDR output encoding", () => {
  it("converts to BT.2020 primaries (BT.2087 matrix) as unclipped float32 linear values", async () => {
    const lin = await runTask((p) => createHdrImageEncodingTask({ image: rgbImage(3, 1, (x, _y, c) => x === c ? 1 : 0), inputColorSpace: "linear-srgb-d65",
      transfer: "linear-float32" }, p));
    // Columns of the sRGB → BT.2020 matrix (ITU-R BT.2087 publishes 0.6274, 0.3293, 0.0433 / 0.0691, 0.9195, 0.0114 / 0.0164, 0.0880, 0.8956).
    expect(lin.linear[0]).toBeCloseTo(0.6274, 3); expect(lin.linear[3]).toBeCloseTo(0.3293, 3); expect(lin.linear[8]).toBeCloseTo(0.8956, 3);
    expect(lin.colorSpace).toBe("rec2020"); expect(lin.transfer).toBe("linear-float32");
    // Negative and over-range values are kept (no clipping without a transfer function).
    const kept = await runTask((p) => createHdrImageEncodingTask({ image: rgbImage(1, 1, (_x, _y, c) => c === 0 ? -0.1 : 5), inputColorSpace: "linear-rec2020-d65",
      transfer: "linear-float32" }, p));
    expect(Array.from(kept.linear)).toEqual([Math.fround(-0.1), 5, 5]);
    // PQ and HLG are not part of 2.0 (licence-on-request patent declarations; THIRD_PARTY.md).
    for (const transfer of ["pq", "hlg"]) expect(() => createHdrImageEncodingTask({ image: rgbImage(1, 1, () => 1), inputColorSpace: "linear-srgb-d65",
      transfer: transfer as "linear-float32" }, { yieldControl: async () => {} })).toThrow(InvalidConfigurationError);
    expect(() => createHdrImageEncodingTask({ image: rgbImage(1, 1, () => 1), inputColorSpace: "linear-srgb-d65", transfer: "linear-float32", bitDepth: 10 } as never,
      { yieldControl: async () => {} })).toThrow(InvalidConfigurationError);
  });
});
