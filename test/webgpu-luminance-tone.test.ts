// SPDX-License-Identifier: Apache-2.0
/**
 * Luminance tone curves on the `webgpu-f32` backend (#277): native capture SDR and packed RAW development
 * with `extended-reinhard-luminance` and `naka-rushton-luminance`, against the float64 references, on the
 * in-process fake device (float32 emulation of the WGSL kernels). Real-device conformance is in
 * test/webgpu/conformance.webgpu.ts.
 */
import { describe, expect, it } from "vitest";
import { createImageKernelAccelerator, createNativeCaptureSdrTask, createNativeRawDevelopmentTask, ImageKernelExecutionError,
  type NativeCaptureSdrProvider, type NativeCaptureSdrTile, type SdrRenderingProfile } from "../src/index.js";
import { toneUniform } from "../src/gpu/image-kernel-accelerator.js";
import { createFakeGpu } from "./helpers/fake-webgpu.js";
import { copyRawDevelopmentInput, luminanceCorpus, nonSrgbColorProfile, sdrInput, sdrProfile, syntheticRawDevelopment } from "./helpers/webgpu-fixtures.js";

function tiles(packed: Float32Array | Float64Array, width: number): NativeCaptureSdrProvider {
  return {
    async readTile(r): Promise<NativeCaptureSdrTile> {
      const samples = new (packed.constructor as Float64ArrayConstructor)(r.width * r.height * 3);
      for (let y = 0; y < r.height; y++) samples.set(packed.subarray(((r.y + y) * width + r.x) * 3, ((r.y + y) * width + r.x + r.width) * 3), y * r.width * 3);
      return { ...r, rowStrideSamples: r.width * 3, samples };
    },
    async yieldControl(): Promise<void> {}
  };
}
async function gpu(maximumBandBytes?: number): Promise<Awaited<ReturnType<typeof createImageKernelAccelerator>>> {
  return createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "fail", gpu: createFakeGpu().gpu, ...(maximumBandBytes ? { maximumBandBytes } : {}) });
}
async function reason(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => "resolved", (error: unknown) => error instanceof ImageKernelExecutionError ? error.reason : (error as Error).name);
}
function maxDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
}
const REINHARD = (w: number): Pick<SdrRenderingProfile, "toneCurve" | "toneCurveParameters"> =>
  ({ toneCurve: "extended-reinhard-luminance", toneCurveParameters: { whiteLuminance: w } });
const NAKA = (n: number, sigma: number, w: number): Pick<SdrRenderingProfile, "toneCurve" | "toneCurveParameters"> =>
  ({ toneCurve: "naka-rushton-luminance", toneCurveParameters: { exponent: n, semiSaturation: sigma, whiteLuminance: w } });
const CURVES: [string, Pick<SdrRenderingProfile, "toneCurve" | "toneCurveParameters">][] = [
  ["extended Reinhard Lw=2", REINHARD(2)], ["extended Reinhard Lw=0.5", REINHARD(0.5)], ["extended Reinhard Lw=40", REINHARD(40)],
  ["Naka–Rushton n=1", NAKA(1, 0.18, 4)], ["Naka–Rushton n=1.6", NAKA(1.6, 0.25, 2)], ["Naka–Rushton n=4", NAKA(4, 1, 8)]
];

describe("webgpu-f32 luminance tone curves: native capture SDR", () => {
  it.each(CURVES)("%s: every code within the reported bound; diagnostics within the uncertainty", async (_, curve) => {
    for (const [bits, precision, mixed] of [[8, 32, false], [16, 64, false], [8, 64, true]] as const) {
      const profile = { ...sdrProfile(bits, "identity", "clip-components", 0.5), ...curve };
      const sdr = sdrInput(200, 40, precision, 1.5, profile), packed = luminanceCorpus(200, 40, precision, 1.5, bits + Number(mixed), mixed);
      const task = createNativeCaptureSdrTask(sdr, tiles(packed, 200));
      await task.run();
      const reference = task.takeOutput();
      const a = await gpu(), out = await a.renderNativeCaptureSdr(sdr, tiles(packed, 200));
      const bound = out.execution.errorBound;
      if (bound?.kind !== "integer-code-difference") throw new Error("expected a code bound");
      expect(maxDiff(out.integerSamples, reference.integerSamples)).toBeLessThanOrEqual(bound.maximumAbsoluteCodeDifference);
      // Non-negative corpora keep the bound tight: within 2 codes at 8 bits and 300 at 16 bits.
      if (!mixed) expect(bound.maximumAbsoluteCodeDifference).toBeLessThanOrEqual(bits === 8 ? 2 : 300);
      for (const key of ["renderingNegativeSampleCount", "renderingAboveReferenceSampleCount", "toneChangedSampleCount", "gamutClippedLowSampleCount",
        "gamutClippedHighSampleCount"] as const) {
        expect(Math.abs(out.diagnostics[key] - reference.diagnostics[key]), key).toBeLessThanOrEqual(out.execution.diagnosticUncertaintySampleCount);
      }
      const banded = await (await gpu(4096)).renderNativeCaptureSdr(sdr, tiles(packed, 200));
      expect(banded.integerSamples).toEqual(out.integerSamples);
      expect(banded.execution).toEqual(out.execution);
      a.dispose();
    }
  });
  it("reject mode matches the reference or fails closed", async () => {
    for (const [, curve] of CURVES) {
      const profile = { ...sdrProfile(8, "identity", "reject-out-of-range", 0), ...curve };
      const sdr = sdrInput(64, 16, 64, 1, profile), packed = luminanceCorpus(64, 16, 64, 1, 3, false).map(v => Math.min(v, 0.05));
      const task = createNativeCaptureSdrTask(sdr, tiles(packed, 64));
      const referenceOutcome = await task.run().then(() => task.takeOutput(), (error: unknown) => error as Error);
      const outcome = await (await gpu()).renderNativeCaptureSdr(sdr, tiles(packed, 64)).then(r => r, (error: unknown) => error as Error);
      if (referenceOutcome instanceof Error || outcome instanceof Error) {
        if (outcome instanceof ImageKernelExecutionError) expect(outcome.reason).toBe("indeterminate-float32-classification");
        else expect((outcome as Error).name).toBe((referenceOutcome as Error).name);
        continue;
      }
      const bound = outcome.execution.errorBound as { maximumAbsoluteCodeDifference: number };
      expect(maxDiff(outcome.integerSamples, referenceOutcome.integerSamples)).toBeLessThanOrEqual(bound.maximumAbsoluteCodeDifference);
    }
  });
  it("keeps the float32 domain and fails closed outside it", async () => {
    expect(() => toneUniform(NAKA(0.5, 0.18, 4))).toThrow(ImageKernelExecutionError);
    expect(() => toneUniform(REINHARD(2 ** -21))).toThrow(/float32/u);
    expect(toneUniform(NAKA(2, 0.25, 2))).toMatchObject({ mode: 2, lum: [expect.any(Number), expect.any(Number), expect.any(Number), 1] });
    const sdr = sdrInput(4, 2, 64, 1, { ...sdrProfile(8, "identity", "clip-components", 0), ...NAKA(0.5, 0.18, 4) });
    expect(await reason((await gpu()).renderNativeCaptureSdr(sdr, tiles(new Float64Array(24).fill(0.1), 4)))).toBe("unsupported-on-backend");
  });
});

describe("webgpu-f32 luminance tone curves: packed RAW development", () => {
  it.each(CURVES)("%s: every code within the reported bound", async (_, curve) => {
    for (const [orientation, highlight, bits, gains] of [["landscape", "clip", 8, undefined], ["portrait-clockwise", "reconstruct", 16, [1.8, 1, 1.3]]] as const) {
      const input = syntheticRawDevelopment({ width: 24, height: 16, orientation, seed: bits, ...(gains ? { gains: [...gains] as [number, number, number] } : {}) },
        { ...sdrProfile(bits, "identity", "clip-components", 0), ...curve }, nonSrgbColorProfile(), highlight);
      const task = createNativeRawDevelopmentTask(copyRawDevelopmentInput(input), async () => {});
      await task.run();
      const reference = task.takeOutput();
      const out = await (await gpu(4096)).developNativeRaw(input, async () => {});
      const bound = out.execution.errorBound!;
      expect(bound.kind === "integer-code-difference" && maxDiff(out.integerSamples, reference.integerSamples) <= bound.maximumAbsoluteCodeDifference).toBe(true);
      for (const key of ["renderingNegativeSampleCount", "renderingAboveReferenceSampleCount", "toneChangedSampleCount", "gamutClippedLowSampleCount",
        "gamutClippedHighSampleCount"] as const) {
        expect(Math.abs(out.diagnostics[key] - reference.diagnostics[key]), key).toBeLessThanOrEqual(out.execution.diagnosticUncertaintySampleCount);
      }
    }
  });
});
