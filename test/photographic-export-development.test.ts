// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { createPhotographicExportPair, createSimulatedCapture, createSensorRawFrame, calculateProcessedSensorRaw, resolveCaptureColorModel,
  type PhotographicExportInput, type CaptureWhiteBalanceIntent } from "../src/index.js";
import { bradfordD65ToD50Matrix } from "../src/color/srgb-icc.js";
import { loadPhotographicExportInput } from "./helpers/photographic-export-fixture.js";
import { loadSensorRawFrameInput } from "./helpers/sensor-raw-frame-fixture.js";

type Tags = Map<number, { type: number; count: number; data: Uint8Array }>;
function directory(bytes: Uint8Array, offset = 8): Tags {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), result: Tags = new Map();
  for (let i = 0; i < view.getUint16(offset, true); i++) {
    const p = offset+2+i*12, type = view.getUint16(p+2, true), count = view.getUint32(p+4, true);
    const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8, 12: 8 } as Record<number, number>)[type]!*count, start = size <= 4 ? p+8 : view.getUint32(p+8, true);
    result.set(view.getUint16(p, true), { type, count, data: bytes.slice(start, start+size) });
  }
  return result;
}
function values(tags: Tags, id: number): number[] {
  const t = tags.get(id)!, v = new DataView(t.data.buffer);
  return Array.from({ length: t.count }, (_, i) => t.type === 3 ? v.getUint16(i*2, true) : t.type === 4 ? v.getUint32(i*4, true) : t.type === 1 ? v.getUint8(i) :
    t.type === 12 ? v.getFloat64(i*8, true) : t.type === 5 ? v.getUint32(i*8, true)/v.getUint32(i*8+4, true) : v.getInt32(i*8, true)/v.getUint32(i*8+4, true));
}
const cameraWhite = [.45, 1, .65];
interface Frame { width: number; height: number; active?: { x: number; y: number; width: number; height: number };
  code: (x: number, y: number, channel: string) => number; black?: (phase: number) => number; white?: (phase: number) => number;
  digitalSaturation?: (x: number, y: number) => boolean; gains?: [number, number, number]; nonSrgb?: boolean; gain?: number; readNoise?: number }
/** Owned synthetic post-ADC frame; no optical/radiometric acquisition claim. */
function exportInput(o: Frame): PhotographicExportInput {
  const input = loadPhotographicExportInput(), raw = loadSensorRawFrameInput(), c = input.reconstruction.rawFrame.capture;
  const { schemaVersion: _s, engineApiVersion: _e, resolvedGeometry: _g, equivalentFocalLength35Mm: _f, ...capture } = c;
  void _s; void _e; void _g; void _f;
  const native = { pixelWidth: o.width, pixelHeight: o.height }, output = o.active ? { pixelWidth: o.active.width, pixelHeight: o.active.height } : native;
  const intent: CaptureWhiteBalanceIntent | null = o.gains ? { stateId: "wb", source: "manual-gains", locked: true,
    channelGains: { red: o.gains[0], green: o.gains[1], blue: o.gains[2] }, sourceProfile: null } : null;
  raw.capture = createSimulatedCapture({ ...capture, whiteBalanceIntent: intent, geometry: { imagingArea: { widthMm: o.width*2, heightMm: o.height*2 }, nativeRaster: native,
    outputRaster: output, orientation: "landscape", ...(o.active ? { activeCaptureRect: o.active } : {}) },
    planes: [{ ...capture.planes[0]!, ...output, storage: { kind: "inline-float64", samples: Array<number>(output.pixelWidth*output.pixelHeight*3).fill(0) } }] }).value;
  raw.bindingProfile.nativeRaster = native;
  raw.captureModeProfile.modes = raw.captureModeProfile.modes.map((m) => ({ ...m, processedImageRaster: { ...m.processedImageRaster, value: native } }));
  const templates = raw.samples;
  raw.samples = Array.from({ length: o.width*o.height }, (_, i) => {
    const x = i%o.width, y = Math.floor(i/o.width), phase = (y%2)*2+x%2, template = templates[phase]!;
    const black = o.black?.(phase) ?? 64, white = o.white?.(phase) ?? 1023, digital = o.digitalSaturation?.(x, y) ?? false;
    const rawCode = digital ? 1023 : o.code(x, y, template.channelId);
    return { ...template, modeSampleIndexFullFrame: { x, y }, colorSamplingSite: { x, y }, rawCode, blackLevelCode: black,
      blackSubtractedNormalizedCode: (rawCode-black)/(1023-black), digitalSaturationApplied: digital, effectiveSaturationCode: white,
      systemConversionGainElectronsPerCode: o.gain ?? 1, readNoiseRmsElectrons: o.readNoise ?? 2, sourceChargeSeedUint32: i, sourceReadNoiseSeedUint32: i+o.width*o.height };
  });
  input.reconstruction = { ...input.reconstruction, rawFrame: createSensorRawFrame(raw), region: { x: 0, y: 0, width: o.width, height: o.height } };
  if (o.nonSrgb) input.colorProfile = { ...input.colorProfile, profileId: "owned-non-normalized-test",
    normalizedCameraChannelsToXyz: resolveCaptureColorModel().cameraRgbToXyz.map((r) => r.map((v, i) => v/cameraWhite[i]!)) };
  input.whiteBalance = o.gains ? "apply-resolved-sensor-gains" : "not-required";
  return input;
}
function processed(v: PhotographicExportInput): ReturnType<typeof calculateProcessedSensorRaw>["value"] {
  return calculateProcessedSensorRaw({ reconstruction: v.reconstruction, colorProfile: v.colorProfile, whiteBalance: v.whiteBalance, rendering: v.rendering,
    ...(v.highlightMode === undefined ? {} : { highlightMode: v.highlightMode }) }).value;
}
const pixel = (rgb: readonly number[], i: number): number[] => rgb.slice(i*3, i*3+3);

describe("paired export development and DNG levels", () => {
  it("writes AsShotNeutral as the scene-white camera neutral and develops a grey card neutral for a non-white-normalized camera", async () => {
    // Grey card under D65 in the r1 camera: camera values 0.18·[0.45,1,0.65] of the code span; custom WB neutralizes it.
    const grey = (channel: string): number => Math.round(64+959*.5*cameraWhite[["red", "green", "blue"].indexOf(channel)]!);
    const codes = ["red", "green", "blue"].map(grey), measured = codes.map((c) => c-64);
    const input = exportInput({ width: 4, height: 4, code: (_x, _y, ch) => grey(ch), nonSrgb: true, gains: [measured[1]!/measured[0]!, 1, measured[1]!/measured[2]!] });
    const pair = await createPhotographicExportPair(input), tags = directory(pair.dng.bytes);
    const neutral = values(tags, 50728);
    measured.forEach((m, i) => expect(neutral[i]).toBeCloseTo(m/measured[1]!, 6));
    for (let i = 0; i < 16; i++) { const p = pixel(pair.rendering.value.integerSamples, i); expect(p[0]).toBe(p[1]); expect(p[2]).toBe(p[1]); }
    // Without WB the same profile develops the D65 grey card neutral too, and AsShotNeutral is the D65 camera neutral.
    const d65 = await createPhotographicExportPair(exportInput({ width: 4, height: 4, code: (_x, _y, ch) => grey(ch), nonSrgb: true }));
    values(directory(d65.dng.bytes), 50728).forEach((v, i) => expect(v).toBeCloseTo(cameraWhite[i]!, 6));
    const p = pixel(d65.rendering.value.integerSamples, 5); expect(Math.abs(p[0]!-p[1]!)).toBeLessThanOrEqual(1); expect(Math.abs(p[2]!-p[1]!)).toBeLessThanOrEqual(1);
  });
  it("normalizes to the effective white level, writes it as WhiteLevel and keeps clipped highlights neutral", async () => {
    const white = 700, input = exportInput({ width: 4, height: 4, white: () => white, gains: [2, 1, 1.5],
      code: (x, y) => x < 2 ? 1000 : y < 2 ? white : 64+(white-64)/2 });
    const result = processed(input), rgb = result.rendering.value.integerSamples;
    expect(values(directory((await createPhotographicExportPair(input)).dng.bytes), 50717)).toEqual([white]);
    // Codes at or above the effective white level are fully saturated: neutral 255 under daylight-like gains.
    expect(pixel(rgb, 0)).toEqual([255, 255, 255]); expect(pixel(rgb, 2)).toEqual([255, 255, 255]);
    expect(result.highlight).toEqual({ mode: "clip", saturatedPixelCount: 12, whiteBalanceClippedSampleCount: 24, reconstructedPixelCount: 0 });
    // Half of the effective span develops to linear 0.5 in green (gain 1), not 0.5·(700−64)/959.
    expect(pixel(rgb, 10)[1]).toBe(Math.round(255*(1.055*.5**(1/2.4)-.055)));
    // A digitally saturated flag is consumed even though the reference sample sits below white in other channels.
    const flagged = processed(exportInput({ width: 4, height: 4, code: () => 300, digitalSaturation: (x, y) => x === 0 && y === 0 }));
    expect(flagged.highlight.saturatedPixelCount).toBe(4);
  });
  it("reconstruct mode blends near-white pixels toward neutral and keeps colour below the start level", async () => {
    const input = { ...exportInput({ width: 4, height: 4, gains: [2.4, 1, 1.8], code: (x, _y, ch) => x < 2 ? 1023 : ch === "green" ? 400 : 700 }), highlightMode: "reconstruct" as const };
    const clip = processed({ ...input, highlightMode: "clip" }), rec = processed(input);
    expect(pixel(rec.rendering.value.integerSamples, 0)).toEqual(pixel(clip.rendering.value.integerSamples, 0));
    expect(rec.highlight.reconstructedPixelCount).toBe(8); expect(rec.highlight.whiteBalanceClippedSampleCount).toBe(0);
    const pair = await createPhotographicExportPair(input); expect(pair.highlight.mode).toBe("reconstruct");
    expect(pair.simulationHash).not.toBe((await createPhotographicExportPair({ ...input, highlightMode: "clip" })).simulationHash);
    expect(() => processed({ ...input, highlightMode: "recover" as never })).toThrow("highlight mode");
  });
  it("phases BlackLevel and CFAPattern from the ActiveArea origin for odd active offsets", async () => {
    const black = (phase: number): number => 60+phase, input = exportInput({ width: 8, height: 6, active: { x: 1, y: 1, width: 6, height: 4 }, black, code: () => 300 });
    const pair = await createPhotographicExportPair(input), tags = directory(pair.dng.bytes);
    expect(values(tags, 50829)).toEqual([1, 1, 5, 7]);
    // Native phases: (0,0)=red 60, (1,0)=green 61, (0,1)=green 62, (1,1)=blue 63. Active origin (1,1) starts on blue.
    expect(values(tags, 50714)).toEqual([63, 62, 61, 60]);
    expect(values(tags, 33422)).toEqual([2, 1, 1, 0]);
    const even = directory((await createPhotographicExportPair(exportInput({ width: 4, height: 4, black, code: () => 300 }))).dng.bytes);
    expect(values(even, 50714)).toEqual([60, 61, 62, 63]); expect(values(even, 33422)).toEqual([0, 1, 1, 2]);
  });
  it("adds DNG 1.4 ForwardMatrix1, NoiseProfile, BaselineExposure and AnalogBalance from known engine values", async () => {
    const input = exportInput({ width: 4, height: 4, nonSrgb: true, white: () => 900, gain: 2, readNoise: 3, code: () => 300 });
    input.rendering = { ...input.rendering, renderingExposureEv: -.5 };
    const tags = directory((await createPhotographicExportPair(input)).dng.bytes);
    expect(values(tags, 50706)).toEqual([1, 4, 0, 0]); expect(values(tags, 50707)).toEqual([1, 1, 0, 0]);
    expect(values(tags, 50727)).toEqual([1, 1, 1]); expect(values(tags, 50730)).toEqual([-.5]);
    // ForwardMatrix1 maps white-balanced camera [1,1,1] to the D50 white.
    const fm = values(tags, 50964), d50 = [.9642, 1, .8249];
    [0, 1, 2].forEach((r) => expect(fm[r*3]!+fm[r*3+1]!+fm[r*3+2]!).toBeCloseTo(d50[r]!, 6));
    const m = input.colorProfile.normalizedCameraChannelsToXyz, chad = bradfordD65ToD50Matrix();
    expect(fm[0]).toBeCloseTo(chad[0]!.reduce((s, v, k) => s+v*m[k]![0]!*cameraWhite[0]!, 0), 6);
    // NoiseProfile: var(x) = S·x + O with x normalized by (WhiteLevel − black): S = 1/(G·span), O = (σ²/G² + 1/12)/span².
    const span = 900-64, noise = values(tags, 51041);
    expect(tags.get(51041)!.type).toBe(12); expect(noise).toHaveLength(6);
    for (let plane = 0; plane < 3; plane++) {
      expect(noise[plane*2]).toBe(1/(2*span)); expect(noise[plane*2+1]).toBe((9/4+1/12)/(span*span));
    }
  });
  it("omits NoiseProfile when a channel's phases disagree and uses the smallest per-phase white level", async () => {
    const tags = directory((await createPhotographicExportPair(exportInput({ width: 4, height: 4, white: (p) => 800+p, black: (p) => p === 2 ? 66 : 64, code: () => 300 }))).dng.bytes);
    expect(values(tags, 50717)).toEqual([800]); expect(tags.has(51041)).toBe(false);
  });
  it("honours an AbortSignal and reports missing Web Crypto as a secure-context domain error", async () => {
    const v = loadPhotographicExportInput(), controller = new AbortController(); controller.abort();
    await expect(createPhotographicExportPair(v, { signal: controller.signal })).rejects.toThrow("Photographic export aborted.");
    const late = new AbortController(), pending = createPhotographicExportPair(v, { signal: late.signal }); late.abort();
    await expect(pending).rejects.toThrow("Photographic export aborted.");
    await expect(createPhotographicExportPair(v, { signal: "stop" as never })).rejects.toThrow("AbortSignal");
    await expect(createPhotographicExportPair(v, { other: 1 } as never)).rejects.toThrow();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    try { await expect(createPhotographicExportPair(v)).rejects.toThrow("secure contexts"); }
    finally { Object.defineProperty(globalThis, "crypto", descriptor); }
    expect((await createPhotographicExportPair(v, {})).dng.bytes.length).toBeGreaterThan(0);
  });
});
