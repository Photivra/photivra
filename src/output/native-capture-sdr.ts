// SPDX-License-Identifier: Apache-2.0

/** Engine-owned bounded tile execution; see docs/NATIVE_CAPTURE_SDR.md. */
import { parseSimulatedCapture, type SimulatedCapture, type CaptureLinearPlane } from "../capture/simulated-capture.js";
import { LINEAR_CAPTURE_RGB_PROFILE, resolveCaptureColorModel } from "../color/capture-color.js";
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireAllowlistedRecord, requirePublicOpaqueId } from "../core/record-validation.js";
import { freezeOwnedData } from "../core/owned-data.js";
import { encodeSrgbComponent } from "../color/srgb-transfer.js";
import { InvalidScientificResultError } from "../core/validation.js";
import { parseSdrRenderingProfile, prepareSdrPixelTone, type SdrPixelTone, type SdrRenderingProfile, type SdrRenderingResult } from "./sdr-rendering.js";

export const NATIVE_CAPTURE_SDR_SCHEMA_VERSION = "0.1.0" as const;
export const NATIVE_CAPTURE_SDR_LIMITS = Object.freeze({ maximumPixels: 24_000_000,
  maximumDimension: 16_384, tileWidth: 256, tileHeight: 32, maximumTileStorageSamples: 32_768 });
/** Metadata-only external float master. Samples must already be color/WB resolved. */
export interface NativeCaptureSdrInput {
  capture: SimulatedCapture;
  sourcePlaneId: string;
  outputImageStateId: string;
  profile: SdrRenderingProfile;
  /** Admission limit for retained integer output, before allocation or provider calls. */
  maximumOutputBytes: number;
}
/** Absolute coordinates in the selected plane's declared binding, never crop-local sensor indices. */
export interface NativeCaptureSdrTileRequest {
  captureId: string;
  sourcePlaneId: string;
  artifactId: string;
  sha256: string;
  x: number; y: number; width: number; height: number;
}
/** Returned tile is exclusively handed to this call; do not mutate/reuse it. Padding is not image data. */
export interface NativeCaptureSdrTile extends NativeCaptureSdrTileRequest {
  rowStrideSamples: number;
  samples: Float32Array | Float64Array;
}
/** One provider call at a time. Caller must release decoding/GPU resources on abort/settlement. */
export interface NativeCaptureSdrProvider {
  readTile(request: Readonly<NativeCaptureSdrTileRequest>, signal: AbortSignal): Promise<NativeCaptureSdrTile>;
  /** Must yield to the host event loop, allowing cancellation/input events between tiles. */
  yieldControl(signal: AbortSignal): Promise<void>;
  /**
   * Optional progress observer, called synchronously after each committed tile. It cannot change
   * output; an exception it throws fails the task like any other error.
   */
  onProgress?(progress: NativeTaskProgress): void;
}
/** Tile progress of a native task: `completedTileCount` of `totalTileCount` tiles are committed. */
export interface NativeTaskProgress { readonly completedTileCount: number; readonly totalTileCount: number }
export interface NativeCaptureSdrPlan {
  schemaVersion: typeof NATIVE_CAPTURE_SDR_SCHEMA_VERSION;
  capture: SimulatedCapture;
  sourcePlaneId: string;
  outputImageStateId: string;
  profile: SdrRenderingProfile;
  outputBytes: number;
  /** Logical array payload bound, not JS heap/GPU/process peak memory or device qualification. */
  maximumScratchPayloadBytes: number;
  tileCount: number;
}
export interface NativeCaptureSdrOutput {
  plan: NativeCaptureSdrPlan;
  /** Caller-owned packed row-major RGB; 16-bit codes are numeric, not serialized endian bytes. */
  integerSamples: Uint8Array | Uint16Array;
  diagnostics: SdrRenderingResult["diagnostics"];
  outputEncoding: SdrRenderingResult["outputEncoding"];
  displayAdaptation: SdrRenderingResult["displayAdaptation"];
}
export type NativeCaptureSdrTaskState = "ready" | "running" | "completed" | "cancelled" | "failed" | "disposed" | "transferred";

/** Validates/admission-plans without reading external samples or allocating a raster. */
export function calculateNativeCaptureSdrPlan(input: NativeCaptureSdrInput): NativeCaptureSdrPlan {
  const r = requireAllowlistedRecord(input, ["capture", "sourcePlaneId", "outputImageStateId", "profile", "maximumOutputBytes"], "Invalid native SDR input.");
  // This contract accepts manifests only: do not copy unrelated inline master buffers.
  const c = r.capture as SimulatedCapture | undefined;
  if (!c || !Array.isArray(c.planes) || c.planes.length > 32 || c.planes.some(p => !p || p.storage?.kind === "inline-float64")) {
    throw new InvalidConfigurationError("Native SDR requires external-only capture manifests.");
  }
  const capture = parseSimulatedCapture(c);
  const sourcePlaneId = requirePublicOpaqueId(r.sourcePlaneId, "Invalid native SDR plane ID.");
  const outputImageStateId = requirePublicOpaqueId(r.outputImageStateId, "Invalid native SDR output state ID.");
  const plane = capture.planes.find(p => p.id === sourcePlaneId);
  const white = resolveCaptureColorModel().referenceWhiteXyz;
  if (!plane || plane.imageState !== "color-transformed-linear-rgb" ||
      plane.colorProfile?.id !== LINEAR_CAPTURE_RGB_PROFILE.id || plane.colorProfile.version !== LINEAR_CAPTURE_RGB_PROFILE.version ||
      plane.encodingReferenceWhiteXyz?.x !== white.x || plane.encodingReferenceWhiteXyz.y !== white.y || plane.encodingReferenceWhiteXyz.z !== white.z ||
      plane.whiteBalanceApplication === "intent-only" || (plane.whiteBalanceApplication === "not-applicable" && capture.whiteBalanceIntent !== null) ||
      capture.planes.some(p => p.imageStateId === outputImageStateId)) {
    throw new InvalidConfigurationError("Native SDR requires exact resolved linear-sRGB/D65 and a new output state ID.");
  }
  const pixels = plane.pixelWidth * plane.pixelHeight, profile = parseSdrRenderingProfile(r.profile);
  const outputBytes = pixels * 3 * (profile.bitDepth / 8);
  const scale = 2 ** profile.renderingExposureEv / plane.referenceWhiteValue;
  if (!Number.isFinite(scale) || scale <= 0) throw new InvalidConfigurationError("Native SDR scale is unrepresentable.");
  if (pixels > NATIVE_CAPTURE_SDR_LIMITS.maximumPixels || plane.pixelWidth > NATIVE_CAPTURE_SDR_LIMITS.maximumDimension ||
      plane.pixelHeight > NATIVE_CAPTURE_SDR_LIMITS.maximumDimension || typeof r.maximumOutputBytes !== "number" ||
      !Number.isSafeInteger(r.maximumOutputBytes) || r.maximumOutputBytes < outputBytes) {
    throw new InvalidConfigurationError("Native SDR raster/output exceeds declared admission limits.");
  }
  // Conservative declared bound, unchanged from the reference-delegating executor (provider payload + packed copy +
  // reference parser copy + four reference output arrays). The typed kernel itself retains only the provider payload.
  const maximumScratchPayloadBytes = NATIVE_CAPTURE_SDR_LIMITS.maximumTileStorageSamples * 8 +
    NATIVE_CAPTURE_SDR_LIMITS.tileWidth * NATIVE_CAPTURE_SDR_LIMITS.tileHeight * 3 * 8 * 6;
  return freezeOwnedData({ schemaVersion: NATIVE_CAPTURE_SDR_SCHEMA_VERSION, capture, sourcePlaneId, outputImageStateId, profile,
    outputBytes, maximumScratchPayloadBytes,
    tileCount: Math.ceil(plane.pixelWidth / NATIVE_CAPTURE_SDR_LIMITS.tileWidth) * Math.ceil(plane.pixelHeight / NATIVE_CAPTURE_SDR_LIMITS.tileHeight) });
}

/**
 * Tile identity/precision/stride/storage and input-domain validation shared by every native SDR backend.
 * Returns the borrowed sample view; padding is excluded from the finiteness scan. Not a root export.
 */
export function validateNativeCaptureSdrTile(tile: NativeCaptureSdrTile, request: NativeCaptureSdrTileRequest,
  plane: CaptureLinearPlane): { source: Float32Array | Float64Array; stride: number } {
  const r = requireAllowlistedRecord(tile, ["captureId", "sourcePlaneId", "artifactId", "sha256", "x", "y", "width", "height", "rowStrideSamples", "samples"], "Invalid native SDR tile.");
  for (const key of Object.keys(request) as (keyof NativeCaptureSdrTileRequest)[]) {
    if (r[key] !== request[key]) throw new InvalidConfigurationError("Native SDR tile identity/rectangle mismatch.");
  }
  const samples = r.samples;
  const expectedType = plane.storage.kind === "external-float32" ? Float32Array : Float64Array;
  if (!(samples instanceof expectedType) || !(samples.buffer instanceof ArrayBuffer) ||
      samples.buffer.byteLength > NATIVE_CAPTURE_SDR_LIMITS.maximumTileStorageSamples * expectedType.BYTES_PER_ELEMENT ||
      typeof r.rowStrideSamples !== "number" || !Number.isSafeInteger(r.rowStrideSamples) || r.rowStrideSamples < request.width * 3 ||
      samples.length !== r.rowStrideSamples * request.height || samples.length > NATIVE_CAPTURE_SDR_LIMITS.maximumTileStorageSamples) {
    throw new InvalidConfigurationError("Native SDR tile precision/stride/storage mismatch.");
  }
  const source: Float32Array | Float64Array = samples, stride = r.rowStrideSamples, rowLength = request.width * 3;
  // Reference input-domain validation covers every image sample (padding excluded) before any rendering.
  for (let y = 0; y < request.height; y++) {
    for (let i = y * stride, end = i + rowLength; i < end; i++) {
      if (!Number.isFinite(source[i]!)) throw new InvalidConfigurationError("Unsupported SDR input domain/raster.");
    }
  }
  return { source, stride };
}

type NativeSdrDiagnosticCounts = Omit<SdrRenderingResult["diagnostics"], "captureSaturation">;
/**
 * Typed-array tile kernel. It applies the bounded SDR reference (`calculateSdrRendering`) equations in the
 * same per-sample floating-point operation order and with the same error precedence, writing integer codes
 * directly into the packed output: input-domain check → rendering exposure → tone → gamut → sRGB transfer →
 * nearest-ties-up quantization. `test/native-capture-sdr-kernel-parity.test.ts` proves identical codes and
 * diagnostics against the unchanged reference.
 */
function renderTileInto(tile: NativeCaptureSdrTile, request: NativeCaptureSdrTileRequest, plane: CaptureLinearPlane,
  profile: SdrRenderingProfile, tone: SdrPixelTone, scale: number, maximum: number, codes: Uint8Array | Uint16Array, diagnostics: NativeSdrDiagnosticCounts): void {
  const { source, stride } = validateNativeCaptureSdrTile(tile, request, plane);
  // Engine-declared tiling is valid because every supported rendering operation is per pixel.
  const outputRowStride = plane.pixelWidth * 3;
  const counts = { negative: 0, above: 0, changed: 0, low: 0, high: 0, outOfGamut: false }, scratch = new Float64Array(3);
  for (let y = 0; y < request.height; y++) {
    renderSdrRunInto(source, y * stride, request.width, profile, tone, scale, maximum, codes, (request.y + y) * outputRowStride + request.x * 3, scratch, counts);
  }
  if (counts.outOfGamut) throw new InvalidConfigurationError("Tone output exceeds the declared SDR gamut range.");
  diagnostics.renderingNegativeSampleCount += counts.negative; diagnostics.renderingAboveReferenceSampleCount += counts.above;
  diagnostics.toneChangedSampleCount += counts.changed; diagnostics.gamutClippedLowSampleCount += counts.low; diagnostics.gamutClippedHighSampleCount += counts.high;
}
/** Reference 8-bit code of a linear sample in [0,1]: Math.round(encodeSrgbComponent(x)·255). */
function referenceSrgb8(linear: number): number { return Math.round(encodeSrgbComponent(linear) * 255); }
/** Exact 8-bit sRGB quantizer tables; see {@link srgb8Quantizer}. */
export interface Srgb8Quantizer {
  /** t[k]: smallest binary64 x in [0,1] with referenceSrgb8(x) ≥ k; t[256] = +∞ sentinel. */
  readonly thresholds: Float64Array;
  /** start[b]: reference code of b/4096, the first code of bucket [b/4096, (b+1)/4096). */
  readonly start: Uint8Array;
}
let srgb8: Srgb8Quantizer | null | undefined;
/**
 * Exact 8-bit sRGB quantization without evaluating the transfer per sample. Thresholds are found by
 * bisection on this engine's own `encodeSrgbComponent`, so comparing against them equals
 * Math.round(encodeSrgbComponent(x)·255) for every x provided that reference is non-decreasing (true
 * when pow is monotone). Construction checks every threshold and its 16 neighbouring doubles on each
 * side; if any check fails the direct transfer is used, so output never silently depends on the
 * assumption. A 4097-entry bucket index (x·4096 is exact) gives the starting code; the steepest part
 * of the curve (slope 12.92·255) spans less than one code per bucket, so one or two comparisons finish.
 */
function srgb8Quantizer(): Srgb8Quantizer | null {
  if (srgb8 !== undefined) return srgb8;
  const t = new Float64Array(257), bits = new Float64Array(1), word = new BigUint64Array(bits.buffer);
  const step = (x: number, n: number): number => { bits[0] = x; word[0] = word[0]! + BigInt(n); return bits[0]!; };
  for (let k = 1; k < 256; k++) {
    let lo = t[k - 1]!, hi = 1;
    for (;;) {
      const mid = lo + (hi - lo) / 2;
      if (mid === lo || mid === hi) break;
      if (referenceSrgb8(mid) >= k) hi = mid; else lo = mid;
    }
    t[k] = hi;
  }
  t[256] = Infinity;
  let valid = referenceSrgb8(0) === 0 && referenceSrgb8(1) === 255;
  for (let k = 1; valid && k < 256; k++) {
    const x = t[k]!;
    if (!(x > t[k - 1]!) || referenceSrgb8(x) !== k) valid = false;
    for (let n = 1; valid && n <= 16; n++) {
      const below = step(x, -n), above = step(x, n);
      if ((below >= 0 && referenceSrgb8(below) >= k) || (above <= 1 && referenceSrgb8(above) < k)) valid = false;
    }
  }
  const start = new Uint8Array(4097);
  for (let i = 0; valid && i <= 4096; i++) { start[i] = referenceSrgb8(i / 4096); if (i > 0 && start[i]! < start[i - 1]!) valid = false; }
  srgb8 = valid ? { thresholds: t, start } : null;
  return srgb8;
}
/** Largest k with t[k] ≤ x for x in [0,1]. */
function quantizeSrgb8(q: Srgb8Quantizer, x: number): number {
  const t = q.thresholds;
  let k = q.start[(x * 4096) | 0]!;
  while (x >= t[k + 1]!) k++;
  return k;
}
/** Internal, for tests: the exact quantizer (null when its construction check failed). */
export function nativeSrgb8QuantizerForTest(): { quantizer: Srgb8Quantizer | null; quantize(x: number): number } {
  const quantizer = srgb8Quantizer();
  return { quantizer, quantize: (x) => quantizer ? quantizeSrgb8(quantizer, x) : referenceSrgb8(x) };
}
/** Mutable per-tile counters for {@link renderSdrRunInto}. `outOfGamut` defers rejection like the reference. */
export interface SdrPixelCounts { negative: number; above: number; changed: number; low: number; high: number; outOfGamut: boolean }
/**
 * Internal typed SDR kernel shared by native SDR and RAW development: for `pixelCount` interleaved
 * linear-sRGB pixels from `source[start]`, exactly the reference (`calculateSdrRendering`) operations and
 * order per pixel: -0 normalization → rendering exposure → shared tone operator → gamut → sRGB transfer →
 * nearest-ties-up quantization into `codes[outOffset]`. Gamut rejection is deferred through
 * `counts.outOfGamut` because the reference finishes the whole tone pass (and its exposure errors)
 * first. `scratch` holds at least 3 values. Not a root export.
 */
export function renderSdrRunInto(source: Float32Array | Float64Array, start: number, pixelCount: number, profile: SdrRenderingProfile,
  tone: SdrPixelTone, scale: number, maximum: number, codes: Uint8Array | Uint16Array, outOffset: number, scratch: Float64Array, counts: SdrPixelCounts): void {
  const reject = profile.gamutHandling === "reject-out-of-range", quantizer = maximum === 255 ? srgb8Quantizer() : null;
  let negative = 0, above = 0, changed = 0, low = 0, high = 0, outOfGamut = false;
  for (let p = 0, i = start, o = outOffset; p < pixelCount; p++, i += 3) {
    // The reference parser normalizes -0 to +0 before exposure.
    const red = source[i]!, green = source[i + 1]!, blue = source[i + 2]!;
    const er = (red === 0 ? 0 : red) * scale, eg = (green === 0 ? 0 : green) * scale, eb = (blue === 0 ? 0 : blue) * scale;
    if (!Number.isFinite(er) || !Number.isFinite(eg) || !Number.isFinite(eb)) throw new InvalidScientificResultError("Rendering exposure produced a non-finite sample.");
    tone(er, eg, eb, scratch);
    for (let c = 0; c < 3; c++, o++) {
      const exposed = c === 0 ? er : c === 1 ? eg : eb;
      if (exposed < 0) negative++;
      if (exposed > 1) above++;
      let mapped = scratch[c]!;
      if (mapped !== exposed) changed++;
      if (mapped === 0) mapped = 0;
      let linear = mapped;
      if (mapped < 0 || mapped > 1) {
        if (reject) outOfGamut = true;
        else if (mapped < 0) { low++; linear = 0; }
        else { high++; linear = 1; }
      }
      // Encoded values are in [0,1]: Math.round is exact nearest-ties-up here.
      codes[o] = quantizer ? quantizeSrgb8(quantizer, linear) : Math.round(encodeSrgbComponent(linear) * maximum);
    }
  }
  counts.negative += negative; counts.above += above; counts.changed += changed; counts.low += low; counts.high += high;
  if (outOfGamut) counts.outOfGamut = true;
}

/** The reference's output-encoding declaration for the given code maximum. */
export function sdrOutputEncoding(maximum: number): SdrRenderingResult["outputEncoding"] {
  return { imageState: "output-referred-sdr", colorSpace: "srgb", primariesXy: { red: [.64, .33], green: [.30, .60], blue: [.15, .06] },
    whitePointXy: [.3127, .3290], referenceWhiteLuminanceCdM2: 80, codeMinimum: 0, codeMaximum: maximum };
}

/** Single-use task: no partial output escapes; cancel/dispose prevents late publication. */
export interface NativeCaptureSdrTask {
  readonly plan: NativeCaptureSdrPlan;
  readonly state: NativeCaptureSdrTaskState;
  readonly completedTileCount: number;
  run(): Promise<void>;
  cancel(): void;
  dispose(): void;
  /** Transfers sole retained buffer ownership once. Dispose cannot revoke a transferred buffer. */
  takeOutput(): NativeCaptureSdrOutput;
}
/** Creates a single-use execution owner. Admission is validated before any buffer/provider work. */
export function createNativeCaptureSdrTask(input: NativeCaptureSdrInput, provider: NativeCaptureSdrProvider): NativeCaptureSdrTask {
  const plan = calculateNativeCaptureSdrPlan(input);
  if (!provider || typeof provider.readTile !== "function" || typeof provider.yieldControl !== "function") {
    throw new InvalidConfigurationError("Native SDR requires a tile reader and event-loop yield.");
  }
  if (provider.onProgress !== undefined && typeof provider.onProgress !== "function") throw new InvalidConfigurationError("Native SDR onProgress must be a function.");
  // Snapshot callback identities too; later app mutations cannot replace an in-flight reader.
  const readTile = provider.readTile.bind(provider), yieldControl = provider.yieldControl.bind(provider),
    onProgress = provider.onProgress?.bind(provider);
  const plane = plan.capture.planes.find(p => p.id === plan.sourcePlaneId)!;
  if (plane.storage.kind === "inline-float64") throw new InvalidConfigurationError("External native source required.");
  const storage = plane.storage, abort = new AbortController();
  let state: NativeCaptureSdrTaskState = "ready", count = 0, output: NativeCaptureSdrOutput | null = null;
  let codes: Uint8Array | Uint16Array | null = null;
  function release(): void { codes?.fill(0); codes = null; output = null; }
  function checkActive(): void {
    if (abort.signal.aborted) throw new InvalidConfigurationError("Native SDR task cancelled/disposed; no output available.");
  }
  return {
    plan,
    get state(): NativeCaptureSdrTaskState { return state; },
    get completedTileCount(): number { return count; },
    async run(): Promise<void> {
      if (state !== "ready") throw new InvalidConfigurationError("Native SDR task is single-use.");
      state = "running";
      try {
        codes = plan.profile.bitDepth === 8 ? new Uint8Array(plan.outputBytes) : new Uint16Array(plan.outputBytes / 2);
        const diagnostics: SdrRenderingResult["diagnostics"] = { renderingNegativeSampleCount: 0, renderingAboveReferenceSampleCount: 0,
          toneChangedSampleCount: 0, gamutClippedLowSampleCount: 0, gamutClippedHighSampleCount: 0, captureSaturation: "not-consumed" };
        // Same scale expression and code range as the reference; the plan already rejected an unrepresentable scale.
        const scale = 2 ** plan.profile.renderingExposureEv / plane.referenceWhiteValue, maximum = 2 ** plan.profile.bitDepth - 1,
          tone = prepareSdrPixelTone(plan.profile);
        for (let y = 0; y < plane.pixelHeight; y += NATIVE_CAPTURE_SDR_LIMITS.tileHeight) {
          for (let x = 0; x < plane.pixelWidth; x += NATIVE_CAPTURE_SDR_LIMITS.tileWidth) {
            checkActive();
            const request = Object.freeze({ captureId: plan.capture.captureId, sourcePlaneId: plane.id,
              artifactId: storage.artifactId, sha256: storage.sha256, x, y,
              width: Math.min(NATIVE_CAPTURE_SDR_LIMITS.tileWidth, plane.pixelWidth - x),
              height: Math.min(NATIVE_CAPTURE_SDR_LIMITS.tileHeight, plane.pixelHeight - y) });
            {
              const tile = await readTile(request, abort.signal);
              checkActive();
              // Diagnostics are aggregated only after the whole tile renders.
              renderTileInto(tile, request, plane, plan.profile, tone, scale, maximum, codes!, diagnostics);
              count++;
              onProgress?.({ completedTileCount: count, totalTileCount: plan.tileCount });
            }
            // Do not retain tile/reference arrays across the next provider/yield boundary.
            await yieldControl(abort.signal);
            checkActive();
          }
        }
        output = { plan, integerSamples: codes!, diagnostics, outputEncoding: sdrOutputEncoding(maximum),
          displayAdaptation: { kind: "external-platform", applied: false, displayCapabilities: "unknown" } };
        state = "completed";
      } catch (error) {
        release();
        if (!abort.signal.aborted) { state = "failed"; abort.abort(); }
        throw error;
      }
    },
    cancel(): void {
      if (state === "ready" || state === "running" || state === "completed") { state = "cancelled"; abort.abort(); release(); }
    },
    dispose(): void { if (state !== "transferred") { state = "disposed"; abort.abort(); release(); } },
    takeOutput(): NativeCaptureSdrOutput {
      if (state !== "completed" || !output) throw new InvalidConfigurationError("Native SDR output is unavailable.");
      const result = output; output = null; codes = null; state = "transferred";
      return result;
    }
  };
}
