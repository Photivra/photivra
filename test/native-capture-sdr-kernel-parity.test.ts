// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { createNativeCaptureSdrTask, createSimulatedCapture, calculateSdrRendering, LINEAR_CAPTURE_RGB_PROFILE, resolveCaptureColorModel,
  type NativeCaptureSdrInput, type NativeCaptureSdrOutput, type SdrRenderingResult, type NativeCaptureSdrTile, type NativeCaptureSdrTileRequest, type SdrRenderingProfile } from "../src/index.js";
import { decodeSrgbComponent } from "../src/color/srgb-transfer.js";
import { loadLinearCaptureInput } from "./helpers/linear-capture-fixture.js";

/**
 * Bit-identity of the #275 typed-array native SDR kernel against the unchanged bounded reference
 * (`calculateSdrRendering`), over a fixed-seed randomized corpus that includes transfer-breakpoint,
 * clipping, signed-zero and near-tie quantization samples, every policy combination and both precisions.
 */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function nativeInput(width: number, height: number, precision: 32 | 64, referenceWhiteValue: number, profile: SdrRenderingProfile): NativeCaptureSdrInput {
  const raw = loadLinearCaptureInput();
  raw.geometry = { imagingArea: { widthMm: 36, heightMm: 24 }, nativeRaster: { pixelWidth: width, pixelHeight: height }, orientation: "landscape" };
  raw.planes = [{ ...raw.planes[0]!, pixelWidth: width, pixelHeight: height, rasterBinding: "oriented-active-capture", referenceWhiteValue,
    imageState: "color-transformed-linear-rgb", channelIds: ["red", "green", "blue"], colorProfile: LINEAR_CAPTURE_RGB_PROFILE,
    encodingReferenceWhiteXyz: resolveCaptureColorModel().referenceWhiteXyz, appliedTransforms: [{ kind: "linear-color", profile: LINEAR_CAPTURE_RGB_PROFILE }],
    storage: { kind: precision === 32 ? "external-float32" : "external-float64", artifactId: "rgb-master", sha256: "b".repeat(64),
      sampleCount: width * height * 3, byteOrder: "little-endian" } }];
  return { capture: createSimulatedCapture(raw).value, sourcePlaneId: "source", outputImageStateId: "sdr-state",
    maximumOutputBytes: width * height * 3 * profile.bitDepth / 8, profile };
}
/** Runs the native task over a packed raster, served as padded tiles (padding is NaN and must be ignored). */
async function runNative(input: NativeCaptureSdrInput, packed: Float32Array | Float64Array, width: number): Promise<NativeCaptureSdrOutput> {
  const task = createNativeCaptureSdrTask(input, {
    async readTile(request: NativeCaptureSdrTileRequest): Promise<NativeCaptureSdrTile> {
      const stride = request.width * 3 + 3, samples = new (packed.constructor as Float64ArrayConstructor)(stride * request.height).fill(NaN);
      for (let y = 0; y < request.height; y++) for (let i = 0; i < request.width * 3; i++) {
        samples[y * stride + i] = packed[(request.y + y) * width * 3 + request.x * 3 + i]!;
      }
      return { ...request, rowStrideSamples: stride, samples };
    },
    async yieldControl(): Promise<void> {}
  });
  await task.run();
  return task.takeOutput();
}
function reference(input: NativeCaptureSdrInput, packed: Float32Array | Float64Array, width: number, height: number): SdrRenderingResult {
  const plane = input.capture.planes[0]!;
  return calculateSdrRendering({ sourceImageStateId: plane.imageStateId, inputImageState: "color-transformed-linear-rgb", inputColorSpace: "linear-srgb-d65",
    whiteBalanceHandling: "not-required", pixelWidth: width, pixelHeight: height, referenceWhiteValue: plane.referenceWhiteValue,
    samples: Array.from(packed), profile: input.profile }).value;
}
function errorOf(action: () => unknown): string {
  try { action(); } catch (error) { return `${(error as Error).name}: ${(error as Error).message}`; }
  return "no error";
}
function profile(bitDepth: 8 | 16, toneCurve: SdrRenderingProfile["toneCurve"], gamutHandling: SdrRenderingProfile["gamutHandling"],
  renderingExposureEv: number): SdrRenderingProfile {
  return { schemaVersion: "0.1.0", profileId: "parity", profileVersion: "1", renderingExposureEv, toneCurve, gamutHandling,
    outputDynamicRange: "sdr", transferFunction: "srgb", bitDepth, rounding: "nearest-ties-up", dither: "none" };
}

describe("native SDR typed-array kernel bit-identity", () => {
  const width = 300, height = 41; // 2 × 2 tiles with partial right/bottom edges.
  const combinations = ([8, 16] as const).flatMap(bitDepth => (["identity", "positive-reinhard-per-channel"] as const).flatMap(tone =>
    (["clip-components", "reject-out-of-range"] as const).flatMap(gamut => ([32, 64] as const).map(precision => [bitDepth, tone, gamut, precision] as const))));
  it.each(combinations)("matches reference codes and diagnostics: %i-bit, %s, %s, float%i", async (bitDepth, tone, gamut, precision) => {
    const next = random(bitDepth * 1000 + precision + (tone === "identity" ? 1 : 2) * 7 + (gamut === "clip-components" ? 3 : 5) * 11);
    const ev = [0, -1, .25, 1.5, -2.75][Math.floor(next() * 5)]!, white = [1, 2, .75, 3.3][Math.floor(next() * 4)]!;
    const input = nativeInput(width, height, precision, white, profile(bitDepth, tone, gamut, ev));
    const scale = 2 ** ev / white, maximum = 2 ** bitDepth - 1;
    const packed = precision === 32 ? new Float32Array(width * height * 3) : new Float64Array(width * height * 3);
    for (let i = 0; i < packed.length; i++) {
      const k = Math.floor(next() * (maximum + 1)), kind = Math.floor(next() * 10);
      let linear: number;
      switch (kind) {
        case 0: linear = decodeSrgbComponent(k / maximum); break; // exact code centers
        case 1: linear = decodeSrgbComponent(Math.min(1, (k + .5) / maximum)); break; // near quantization ties
        case 2: linear = [0, -0, .0031308, .0031308 + 2 ** -60, .04045 / 12.92, 1, 1 - 2 ** -52, 1 + 2 ** -52][k % 8]!; break;
        case 3: linear = next() * 4 - 1; break; // clipping both ways
        default: linear = next();
      }
      // Express the desired post-exposure value as a source sample; Reinhard is reached for every positive value.
      packed[i] = linear / scale;
    }
    if (gamut === "reject-out-of-range") {
      // Keep reject-mode rasters in range so the full raster renders (rejection is tested separately).
      for (let i = 0; i < packed.length; i++) {
        if (!(packed[i]! * scale >= 0) || (tone === "identity" && packed[i]! * scale > 1)) packed[i] = 0;
      }
    }
    const expected = reference(input, packed, width, height);
    const actual = await runNative(input, packed, width);
    expect(actual.integerSamples).toBeInstanceOf(bitDepth === 8 ? Uint8Array : Uint16Array);
    expect(Array.from(actual.integerSamples)).toEqual(expected.integerSamples);
    expect(actual.diagnostics).toEqual(expected.diagnostics);
    expect(actual.outputEncoding).toEqual(expected.outputEncoding);
    expect(actual.displayAdaptation).toEqual(expected.displayAdaptation);
  }, 60_000);

  it("preserves the reference error precedence: input domain, then exposure, then gamut rejection", async () => {
    const cases: [number, SdrRenderingProfile["gamutHandling"], number[]][] = [
      [0, "reject-out-of-range", [.5, 2, .5]], // gamut rejection only
      [32, "reject-out-of-range", [2, .5, 1e308]], // earlier out-of-gamut, later exposure overflow: exposure error wins
      [32, "clip-components", [1e308, .5, NaN]], // exposure overflow before a non-finite input: input domain wins
      [0, "reject-out-of-range", [-1, .5, Infinity]]
    ];
    for (const [ev, gamut, values] of cases) {
      const input = nativeInput(1, 1, 64, 1, profile(8, "identity", gamut, ev));
      const packed = Float64Array.from(values);
      const expected = errorOf(() => reference(input, packed, 1, 1));
      expect(expected).not.toBe("no error");
      const actual = await runNative(input, packed, 1).then(() => "no error", (error: Error) => `${error.name}: ${error.message}`);
      expect(actual).toBe(expected);
    }
  });
});
