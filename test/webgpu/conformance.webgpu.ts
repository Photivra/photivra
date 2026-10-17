// SPDX-License-Identifier: Apache-2.0
/**
 * Real-GPU conformance of the `webgpu-f32` backend against the float64 CPU reference (`npm run test:webgpu`).
 * Node builds fixed-seed corpora and computes the reference; headless Chromium runs the WGSL kernels.
 * Every sample must lie within the result's a-priori bound, and every diagnostic count within the
 * reported uncertainty. Skips (with a message) when no browser or adapter is available, unless
 * PHOTIVRA_WEBGPU_REQUIRED=1. Timings from a software adapter (SwiftShader) are not GPU performance.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { calculateIrradianceConvolution, createNativeCaptureSdrTask, createNativeRawDevelopmentTask, type ImageKernelExecution,
  type NativeCaptureSdrInput, type NativeRawDevelopmentInput, type SdrRenderingResult, type RawHighlightDiagnostics } from "../../src/index.js";
import { convolutionCorpus, copyRawDevelopmentInput, nonSrgbColorProfile, sdrCorpus, sdrInput, sdrProfile, syntheticRawDevelopment } from "../helpers/webgpu-fixtures.js";
import { loadPhotographicExportInput } from "../helpers/photographic-export-fixture.js";
import { findChromium, openBrowserPage, type BrowserPage } from "./chromium.js";
import { decodeTransport, encodeTransport } from "./codec.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const required = process.env.PHOTIVRA_WEBGPU_REQUIRED === "1";
let page: BrowserPage | null = null, skip: string | null = null;
const report: Record<string, unknown>[] = [];

async function call<T>(fn: string, payload: unknown): Promise<T> {
  const text = await page!.evaluate<string>(`import('/test/webgpu/page-runner.js').then(m => m.${fn}(${JSON.stringify(encodeTransport(payload))}))`);
  return decodeTransport<T>(text);
}
function guard(): boolean {
  if (skip === null) return false;
  if (required) throw new Error(`WebGPU conformance required but unavailable: ${skip}`);
  console.warn(`[test:webgpu] skipped: ${skip}`);
  return true;
}

beforeAll(async () => {
  const binary = findChromium();
  if (!binary) { skip = "no Chromium binary found (set PHOTIVRA_WEBGPU_BROWSER or PLAYWRIGHT_BROWSERS_PATH)"; return; }
  page = await openBrowserPage(binary, root);
  const probe = await page.evaluate<{ available: boolean; adapter?: unknown }>("import('/test/webgpu/page-runner.js').then(m => m.probe())");
  if (!probe.available) skip = "the browser exposes no WebGPU adapter (see docs/WEBGPU.md for flags)";
  else report.push({ adapter: probe.adapter });
});
afterAll(async () => {
  await page?.close();
  if (report.length) console.info(`[test:webgpu] ${JSON.stringify(report, null, 1)}`);
});

interface CodesResult { codes: Uint8Array | Uint16Array; diagnostics: SdrRenderingResult["diagnostics"]; execution: ImageKernelExecution;
  gpuMilliseconds: number; cpuMilliseconds: number | null; highlight?: RawHighlightDiagnostics }

function maximumCodeDifference(a: ArrayLike<number>, b: ArrayLike<number>): { maximum: number; differing: number } {
  expect(a.length).toBe(b.length);
  let maximum = 0, differing = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i]! - b[i]!); if (d) differing++; if (d > maximum) maximum = d; }
  return { maximum, differing };
}
function expectDiagnosticsWithin(gpu: Record<string, unknown>, cpu: Record<string, unknown>, uncertainty: number): number {
  let worst = 0;
  for (const key of Object.keys(cpu)) {
    if (typeof cpu[key] !== "number") { expect(gpu[key]).toBe(cpu[key]); continue; }
    const d = Math.abs((gpu[key] as number) - (cpu[key] as number));
    worst = Math.max(worst, d);
    expect(d, key).toBeLessThanOrEqual(uncertainty);
  }
  return worst;
}

describe("webgpu-f32 irradiance convolution vs float64 reference", () => {
  const cases = [[257, 193, 0, 64, 48], [257, 193, 1, 64, 48], [200, 150, 3, 37, 41], [160, 120, 7, 160, 120], [128, 96, 15, 32, 32], [64, 64, 32, 16, 16]] as const;
  it.each(cases)("%i×%i radius %i, patches %i×%i", async (w, h, r, pw, ph) => {
    if (guard()) return;
    const input = convolutionCorpus(w, h, r, pw, ph, w * 7 + r);
    const reference = calculateIrradianceConvolution(input).values;
    const gpu = await call<{ values: Float32Array; execution: ImageKernelExecution }>("convolve", { input });
    const bound = gpu.execution.errorBound;
    expect(gpu.execution.backend).toBe("webgpu-f32");
    expect(bound?.kind).toBe("relative-to-reference");
    let worstRelative = 0;
    for (let i = 0; i < reference.length; i++) {
      const c = reference[i]!, d = Math.abs(gpu.values[i]! - c);
      if (bound?.kind === "relative-to-reference") expect(d).toBeLessThanOrEqual(bound.relative * c + bound.absolute);
      if (c > 0) worstRelative = Math.max(worstRelative, d / c);
    }
    report.push({ stage: "convolution", grid: `${w}x${h}`, radius: r, measuredMaximumRelative: worstRelative,
      boundRelative: bound?.kind === "relative-to-reference" ? bound.relative : null });
  });
  it("banding and float32 input precision do not change GPU results", async () => {
    if (guard()) return;
    const input = convolutionCorpus(150, 97, 4, 50, 33, 99);
    const whole = await call<{ values: Float32Array }>("convolve", { input });
    const banded = await call<{ values: Float32Array }>("convolve", { input, maximumBandBytes: 4096 });
    expect(banded.values).toEqual(whole.values);
  });
});

describe("webgpu-f32 native capture SDR vs float64 reference", () => {
  const combinations = ([8, 16] as const).flatMap(bits => (["identity", "positive-reinhard-per-channel"] as const).flatMap(tone =>
    (["clip-components", "reject-out-of-range"] as const).flatMap(gamut => ([32, 64] as const).map(precision => [bits, tone, gamut, precision] as const))));
  it.each(combinations)("%i-bit %s %s float%i", async (bits, tone, gamut, precision) => {
    if (guard()) return;
    const width = 300, height = 41, ev = tone === "identity" ? .25 : 1.5, white = precision === 32 ? 2 : .75;
    const sdr = sdrInput(width, height, precision, white, sdrProfile(bits, tone, gamut, ev));
    const packed = sdrCorpus(width, height, precision, sdr.profile, white, bits + precision + tone.length + gamut.length);
    const reference = await runSdrReference(sdr, packed, width);
    let gpu: CodesResult;
    try { gpu = await call<CodesResult>("renderSdr", { input: { sdr, packed, width } }); } catch (error) {
      // Reject mode may fail closed when a sample lies inside the float32 gamut band; never silently differ.
      expect(String(error)).toContain("not decidable in float32");
      report.push({ stage: "sdr", case: `${bits}/${tone}/${gamut}/f${precision}`, failedClosed: true });
      return;
    }
    const bound = gpu.execution.errorBound;
    const diff = maximumCodeDifference(gpu.codes, reference.integerSamples);
    expect(bound?.kind === "integer-code-difference" && diff.maximum <= bound.maximumAbsoluteCodeDifference).toBe(true);
    const worst = expectDiagnosticsWithin(gpu.diagnostics as unknown as Record<string, unknown>, reference.diagnostics as unknown as Record<string, unknown>,
      gpu.execution.diagnosticUncertaintySampleCount);
    report.push({ stage: "sdr", case: `${bits}/${tone}/${gamut}/f${precision}`, maximumCodeDifference: diff.maximum, differingSamples: diff.differing,
      samples: gpu.codes.length, bound: bound?.kind === "integer-code-difference" ? bound.maximumAbsoluteCodeDifference : null,
      diagnosticUncertainty: gpu.execution.diagnosticUncertaintySampleCount, worstDiagnosticDifference: worst });
  });
  it("banding does not change GPU codes; lifecycle failures are domain errors", async () => {
    if (guard()) return;
    const sdr = sdrInput(300, 70, 32, 1, sdrProfile(16, "identity", "clip-components", 0)), packed = sdrCorpus(300, 70, 32, sdr.profile, 1, 5);
    const whole = await call<CodesResult>("renderSdr", { input: { sdr, packed, width: 300 } });
    const banded = await call<CodesResult>("renderSdr", { input: { sdr, packed, width: 300 }, maximumBandBytes: 4096 });
    expect(banded.codes).toEqual(whole.codes);
    const reject = sdrInput(300, 70, 32, 1, sdrProfile(8, "identity", "reject-out-of-range", 3));
    const outcomes = await page!.evaluate<Record<string, string>>(`import('/test/webgpu/page-runner.js').then(m => m.lifecycle(${JSON.stringify(encodeTransport({ input: { sdr, packed, width: 300, reject } }))}))`);
    expect(outcomes).toEqual({ abort: "ImageKernelExecutionError:aborted", afterAbort: "resolved:webgpu-f32",
      reject: "InvalidConfigurationError:Tone output exceeds the declared SDR gamut range.", busy: "ImageKernelExecutionError:busy",
      disposeInFlight: "ImageKernelExecutionError:disposed", state: "disposed", afterDispose: "ImageKernelExecutionError:disposed" });
  });
});

async function runSdrReference(input: NativeCaptureSdrInput, packed: Float32Array | Float64Array, width: number): Promise<{ integerSamples: Uint8Array | Uint16Array; diagnostics: SdrRenderingResult["diagnostics"] }> {
  const task = createNativeCaptureSdrTask(input, {
    async readTile(r) {
      const samples = new (packed.constructor as Float64ArrayConstructor)(r.width * r.height * 3);
      for (let y = 0; y < r.height; y++) samples.set(packed.subarray(((r.y + y) * width + r.x) * 3, ((r.y + y) * width + r.x + r.width) * 3), y * r.width * 3);
      return { ...r, rowStrideSamples: r.width * 3, samples };
    },
    async yieldControl() {}
  });
  await task.run();
  return task.takeOutput();
}

async function runRawReference(input: NativeRawDevelopmentInput): Promise<{ integerSamples: Uint8Array | Uint16Array; diagnostics: SdrRenderingResult["diagnostics"]; highlight: RawHighlightDiagnostics }> {
  const task = createNativeRawDevelopmentTask(copyRawDevelopmentInput(input), { yieldControl: async () => {} });
  await task.run();
  return task.takeOutput();
}

describe("webgpu-f32 packed RAW development vs float64 reference", () => {
  const base = loadPhotographicExportInput();
  const cases = [
    ["landscape", "clip", 8, "identity", "ideal", undefined],
    ["portrait-clockwise", "clip", 16, "positive-reinhard-per-channel", "non-normalized", undefined],
    ["landscape-inverted", "reconstruct", 8, "positive-reinhard-per-channel", "non-normalized", undefined],
    ["portrait-counter-clockwise", "reconstruct", 16, "identity", "ideal", [1.9, 1, 1.4]],
    ["landscape", "clip", 16, "identity", "non-normalized", [2.1, 1, 1.6]]
  ] as const;
  it.each(cases)("%s %s %i-bit %s %s gains %j", async (orientation, highlight, bits, tone, color, gains) => {
    if (guard()) return;
    const colorProfile = color === "ideal" ? base.colorProfile : nonSrgbColorProfile();
    const input = syntheticRawDevelopment({ width: 96, height: 64, orientation, seed: bits + highlight.length + orientation.length, ...(gains ? { gains: [...gains] as [number, number, number] } : {}) },
      sdrProfile(bits, tone, "clip-components", tone === "identity" ? 0 : 1), colorProfile, highlight);
    const reference = await runRawReference(input);
    const gpu = await call<CodesResult>("developRaw", { input });
    const bound = gpu.execution.errorBound;
    const diff = maximumCodeDifference(gpu.codes, reference.integerSamples);
    expect(bound?.kind === "integer-code-difference" && diff.maximum <= bound.maximumAbsoluteCodeDifference).toBe(true);
    const uncertainty = gpu.execution.diagnosticUncertaintySampleCount;
    const worst = expectDiagnosticsWithin(gpu.diagnostics as unknown as Record<string, unknown>, reference.diagnostics as unknown as Record<string, unknown>, uncertainty);
    expect(gpu.highlight!.saturatedPixelCount).toBe(reference.highlight.saturatedPixelCount);
    expectDiagnosticsWithin(gpu.highlight as unknown as Record<string, unknown>, reference.highlight as unknown as Record<string, unknown>, uncertainty);
    report.push({ stage: "raw-development", case: `${orientation}/${highlight}/${bits}/${tone}/${color}`, maximumCodeDifference: diff.maximum,
      differingSamples: diff.differing, samples: gpu.codes.length, bound: bound?.kind === "integer-code-difference" ? bound.maximumAbsoluteCodeDifference : null,
      diagnosticUncertainty: uncertainty, worstDiagnosticDifference: worst });
  });
  it("banding does not change GPU codes", async () => {
    if (guard()) return;
    const input = syntheticRawDevelopment({ width: 64, height: 48, orientation: "portrait-clockwise", seed: 3 },
      sdrProfile(8, "identity", "clip-components", 0), nonSrgbColorProfile(), "clip");
    const whole = await call<CodesResult>("developRaw", { input });
    const banded = await call<CodesResult>("developRaw", { input, maximumBandBytes: 4096 });
    expect(banded.codes).toEqual(whole.codes);
  });
});

describe("measured timings (informational; software adapters are not GPU performance)", () => {
  it("times CPU reference and webgpu-f32 on the same inputs", async () => {
    if (guard()) return;
    const convolution = convolutionCorpus(1024, 768, 7, 128, 128, 11, 32);
    const c = await call<{ gpuMilliseconds: number; cpuMilliseconds: number }>("convolve", { input: convolution, timeCpu: true, repeat: 2 });
    const sdr = sdrInput(1024, 768, 32, 1, sdrProfile(8, "positive-reinhard-per-channel", "clip-components", 0));
    const s = await call<CodesResult>("renderSdr", { input: { sdr, packed: sdrCorpus(1024, 768, 32, sdr.profile, 1, 12), width: 1024 }, timeCpu: true, repeat: 2 });
    const raw = syntheticRawDevelopment({ width: 1024, height: 768, orientation: "landscape", seed: 13 }, sdrProfile(8, "identity", "clip-components", 0),
      nonSrgbColorProfile(), "clip");
    const d = await call<CodesResult>("developRaw", { input: raw, timeCpu: true, repeat: 2 });
    report.push({ timings: { convolution1024x768r7: { cpuMs: c.cpuMilliseconds, gpuMs: c.gpuMilliseconds },
      sdr1024x768: { cpuMs: s.cpuMilliseconds, gpuMs: s.gpuMilliseconds }, rawDevelopment1024x768: { cpuMs: d.cpuMilliseconds, gpuMs: d.gpuMilliseconds } } });
    expect(c.gpuMilliseconds).toBeGreaterThan(0);
  });
});
