// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from "vitest";
import { createNativeCaptureSdrTask, createSimulatedCapture, calculateSdrRendering, LINEAR_CAPTURE_RGB_PROFILE, resolveCaptureColorModel,
  type NativeCaptureSdrInput, type NativeCaptureSdrTile, type SdrRenderingProfile } from "../src/index.js";
import { nativeSrgb8QuantizerForTest } from "../src/output/native-capture-sdr.js";
import { encodeSrgbComponent } from "../src/color/srgb-transfer.js";
import { loadLinearCaptureInput } from "./helpers/linear-capture-fixture.js";

const reference = (x: number): number => Math.round(encodeSrgbComponent(x) * 255);
function neighbour(x: number, n: number): number {
  const f = new Float64Array([x]), w = new BigInt64Array(f.buffer); w[0] = w[0]! + BigInt(n); return f[0]!;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
describe("exact 8-bit sRGB quantizer used by the typed SDR kernels", () => {
  it("equals Math.round(encodeSrgbComponent(x)·255) at, around and between every code threshold", () => {
    const { quantizer, quantize } = nativeSrgb8QuantizerForTest();
    expect(quantizer).not.toBeNull();
    const t = quantizer!.thresholds;
    expect(t[0]).toBe(0); expect(t[256]).toBe(Infinity);
    let mismatches = 0, checked = 0;
    for (let k = 1; k < 256; k++) {
      expect(reference(t[k]!)).toBe(k); expect(reference(neighbour(t[k]!, -1))).toBe(k - 1);
      for (let n = -2048; n <= 2048; n++) { const x = neighbour(t[k]!, n); if (x >= 0 && x <= 1) { checked++; if (quantize(x) !== reference(x)) mismatches++; } }
    }
    const random = mulberry32(275);
    for (let i = 0; i < 500_000; i++) { const x = random(); checked++; if (quantize(x) !== reference(x)) mismatches++; }
    expect(mismatches).toBe(0); expect(checked).toBeGreaterThan(1_500_000);
    for (const x of [0, Number.MIN_VALUE, .0031308, .00313080000001, .5, 1 - Number.EPSILON / 2, 1]) expect(quantize(x)).toBe(reference(x));
    for (let i = 0; i <= 4096; i++) expect(quantize(i / 4096)).toBe(reference(i / 4096));
  }, 60_000);
});

function input(width: number, height: number, profile: SdrRenderingProfile): NativeCaptureSdrInput {
  const raw = loadLinearCaptureInput();
  raw.geometry = { imagingArea: { widthMm: 36, heightMm: 24 }, nativeRaster: { pixelWidth: width, pixelHeight: height }, orientation: "landscape" };
  raw.planes = [{ ...raw.planes[0]!, pixelWidth: width, pixelHeight: height, rasterBinding: "oriented-active-capture",
    imageState: "color-transformed-linear-rgb", channelIds: ["red", "green", "blue"], colorProfile: LINEAR_CAPTURE_RGB_PROFILE,
    encodingReferenceWhiteXyz: resolveCaptureColorModel().referenceWhiteXyz, appliedTransforms: [{ kind: "linear-color", profile: LINEAR_CAPTURE_RGB_PROFILE }],
    storage: { kind: "external-float64", artifactId: "rgb-master", sha256: "b".repeat(64), sampleCount: width * height * 3, byteOrder: "little-endian" } }];
  return { capture: createSimulatedCapture(raw).value, sourcePlaneId: "source", outputImageStateId: "sdr-state", maximumOutputBytes: width * height * 6, profile };
}
const base: SdrRenderingProfile = { schemaVersion: "0.1.0", profileId: "neutral", profileVersion: "1", renderingExposureEv: 0, toneCurve: "identity",
  gamutHandling: "clip-components", outputDynamicRange: "sdr", transferFunction: "srgb", bitDepth: 8, rounding: "nearest-ties-up", dither: "none" };
describe("native SDR luminance tone curves and progress", () => {
  it("matches the reference renderer for every tone curve on seeded random pixels and reports tile progress", async () => {
    const width = 300, height = 40, random = mulberry32(9), values = Float64Array.from({ length: width * height * 3 }, () => random() * 3 - .2);
    for (const profile of [base, { ...base, toneCurve: "positive-reinhard-per-channel" as const },
      { ...base, toneCurve: "extended-reinhard-luminance" as const, toneCurveParameters: { whiteLuminance: 2 } },
      { ...base, toneCurve: "naka-rushton-luminance" as const, toneCurveParameters: { exponent: 1.6, semiSaturation: .3, whiteLuminance: 2.5 }, bitDepth: 16 as const }]) {
      const progress = vi.fn();
      const task = createNativeCaptureSdrTask(input(width, height, profile), { readTile: async (r): Promise<NativeCaptureSdrTile> => {
        const samples = new Float64Array(r.width * r.height * 3);
        for (let y = 0; y < r.height; y++) samples.set(values.subarray(((r.y + y) * width + r.x) * 3, ((r.y + y) * width + r.x + r.width) * 3), y * r.width * 3);
        return { ...r, rowStrideSamples: r.width * 3, samples };
      }, yieldControl: async (): Promise<void> => {}, onProgress: progress });
      await task.run(); const out = task.takeOutput();
      expect(progress).toHaveBeenCalledTimes(task.plan.tileCount);
      expect(progress.mock.calls.at(-1)![0]).toEqual({ completedTileCount: task.plan.tileCount, totalTileCount: task.plan.tileCount });
      for (let y = 0; y < height; y += 13) {
        const row = calculateSdrRendering({ sourceImageStateId: "x", inputImageState: "color-transformed-linear-rgb", inputColorSpace: "linear-srgb-d65",
          whiteBalanceHandling: "not-required", pixelWidth: width, pixelHeight: 1, referenceWhiteValue: 1, samples: Array.from(values.subarray(y * width * 3, (y + 1) * width * 3)), profile }).value;
        expect(Array.from(out.integerSamples.subarray(y * width * 3, (y + 1) * width * 3))).toEqual(row.integerSamples);
      }
    }
    expect(() => createNativeCaptureSdrTask(input(2, 1, base), { readTile: async (): Promise<never> => { throw Error("unused"); }, yieldControl: async (): Promise<void> => {}, onProgress: 1 } as never)).toThrow();
  });
});
