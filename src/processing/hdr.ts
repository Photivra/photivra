// SPDX-License-Identifier: Apache-2.0

/**
 * HDR from linear RAW brackets and HDR output encoding.
 *
 * Merge (`createHdrBracketMergeTask`): per sample, every frame whose code is below its white level and
 * not flagged contributes an independent estimate of the photo-electron rate Φ (e⁻/s):
 *   e_k = (code_k − black_k)·K_k,  Φ̂_k = e_k / t_k,
 *   Var[e_k] = max(Φ, 0)·t_k + σ_read,k² + K_k²/12   (Poisson shot + Gaussian read + uniform quantization,
 *   the same shot+read variance as `calculateSignalToNoise`, plus the EMVA 1288 quantization term).
 * The estimates are combined with inverse-variance weights w_k = t_k²/Var[e_k], the noise-optimal
 * linear combination for a linear camera (Granados et al., CVPR 2010; Hasinoff, Durand & Freeman,
 * CVPR 2010). Φ in the variance is unknown, so it starts from the shot-noise-limited estimate
 * Σe_k/Σt_k and is refined by a fixed number of reweighting iterations. Var[Φ̂] = 1/Σw_k.
 * Samples saturated in every frame get the largest representable rate (a lower bound) and count 0.
 * Inputs must be linear RAW codes; non-linear (camera-response) inputs are not supported, so no
 * Debevec–Malik response recovery is performed. Works on any per-sample layout (CFA mosaic or RGB).
 *
 * Encoding (`createHdrImageEncodingTask`): linear RGB → BT.2020 primaries (matrices from
 * `resolveRgbColorSpace`), then ITU-R BT.2100 PQ (also SMPTE ST 2084) with relative 1.0 = reference white in cd/m² (default
 * 203, ITU-R BT.2408), or BT.2100 HLG with relative 1.0 at the HLG reference-white signal (default 0.75,
 * BT.2408), quantized as BT.2100 full or narrow range integer codes; or float32 linear BT.2020.
 * @see docs/PROCESSING.md for equations, sources and limits.
 */

import { InvalidConfigurationError } from "../core/configuration-error.js";
import { InvalidScientificInputError } from "../core/validation.js";
import { evaluateHlgInverseOetf, evaluateHlgOetf, evaluatePqInverseEotf, resolveRgbColorSpace } from "../color/rgb-color-spaces.js";
import { rgbSpaceOf } from "./image-ops.js";
import {
  createProcessingTask, finiteRows, maximumWorkingBytes, optionalFiniteIn, optionalIntegerIn, processingProvenance, requireEnum, requireFiniteIn,
  requireImage, requireIntegerIn, requireOptions, PROCESSING_MAX_FRAMES, PROCESSING_MAX_PIXELS,
  type ProcessingBody, type ProcessingLinearColorSpace, type ProcessingProvenance, type ProcessingProvider, type ProcessingRgbImage, type ProcessingTask
} from "./processing-task.js";

export interface HdrBracketFrame {
  exposureTimeSeconds: number;
  /** Linear RAW codes, one per sample. */
  codes: Uint16Array | Float32Array;
  blackLevelCode: number;
  /** Codes at or above this level are saturated and excluded. */
  whiteLevelCode: number;
  /** Optional per-sample flags; non-zero excludes the sample (e.g. physical/pre-ADC saturation). */
  saturationFlags?: Uint8Array;
  /** System conversion gain K, electrons per code (includes the frame's ISO gain). */
  conversionGainElectronsPerCode: number;
  /** RMS read noise in electrons for this frame's readout regime. */
  readNoiseElectrons: number;
}

export interface HdrBracketMergeInput {
  /** Samples per frame (e.g. width·height for a mosaic, width·height·3 for RGB). */
  sampleCount: number;
  frames: readonly HdrBracketFrame[];
  /** Variance reweighting iterations after the shot-noise-limited start; default 2. */
  iterations?: number;
  maximumWorkingBytes?: number;
}

export interface HdrBracketMergeOutput {
  /** Scene-linear photo-electron rate per sample, e⁻/s (relative scene radiance; not absolute). */
  radianceElectronsPerSecond: Float32Array;
  /** Model standard deviation of each estimate, e⁻/s. */
  standardDeviationElectronsPerSecond: Float32Array;
  /** Frames that contributed; 0 marks a sample saturated in every frame (value is a lower bound). */
  contributingFrameCount: Uint8Array;
  saturatedInAllFramesCount: number;
  provenance: ProcessingProvenance;
}

interface ParsedFrame { t: number; codes: Uint16Array | Float32Array; black: number; white: number; flags: Uint8Array | null; k: number; read2: number }

/** Noise-optimal merge of linear RAW exposure brackets into a scene-linear photo-electron rate. */
export function createHdrBracketMergeTask(input: HdrBracketMergeInput, provider: ProcessingProvider): ProcessingTask<HdrBracketMergeOutput> {
  const r = requireOptions(input, ["sampleCount", "frames", "iterations", "maximumWorkingBytes"], "createHdrBracketMergeTask input");
  const n = requireIntegerIn(r.sampleCount, "sampleCount", 1, 3 * PROCESSING_MAX_PIXELS);
  if (!Array.isArray(r.frames) || r.frames.length < 1 || r.frames.length > PROCESSING_MAX_FRAMES) {
    throw new InvalidConfigurationError("frames must contain 1 to " + PROCESSING_MAX_FRAMES + " brackets.");
  }
  const frames: ParsedFrame[] = r.frames.map((value: unknown, i: number) => {
    const f = requireOptions(value, ["exposureTimeSeconds", "codes", "blackLevelCode", "whiteLevelCode", "saturationFlags",
      "conversionGainElectronsPerCode", "readNoiseElectrons"], "frames[" + i + "]");
    if (!(f.codes instanceof Uint16Array || f.codes instanceof Float32Array) || f.codes.length !== n) {
      throw new InvalidConfigurationError("frames[" + i + "].codes must be a Uint16Array or Float32Array of sampleCount codes.");
    }
    if (f.saturationFlags !== undefined && (!(f.saturationFlags instanceof Uint8Array) || f.saturationFlags.length !== n)) {
      throw new InvalidConfigurationError("frames[" + i + "].saturationFlags must be a Uint8Array of sampleCount flags.");
    }
    const black = requireFiniteIn(f.blackLevelCode, "frames[" + i + "].blackLevelCode", 0, Number.MAX_SAFE_INTEGER);
    const white = requireFiniteIn(f.whiteLevelCode, "frames[" + i + "].whiteLevelCode", black, Number.MAX_SAFE_INTEGER, true);
    const read = requireFiniteIn(f.readNoiseElectrons, "frames[" + i + "].readNoiseElectrons", 0, 1e9);
    return { t: requireFiniteIn(f.exposureTimeSeconds, "frames[" + i + "].exposureTimeSeconds", 0, 1e6, true), codes: f.codes, black, white,
      flags: (f.saturationFlags as Uint8Array | undefined) ?? null,
      k: requireFiniteIn(f.conversionGainElectronsPerCode, "frames[" + i + "].conversionGainElectronsPerCode", 0, 1e9, true), read2: read * read };
  });
  const iterations = optionalIntegerIn(r.iterations, 2, "iterations", 0, 16);
  // Saturated everywhere: the largest representable rate of any frame is a lower bound.
  const ceiling = Math.max(...frames.map((f) => (f.white - f.black) * f.k / f.t));
  const rows = Math.ceil(n / 4096);
  return createProcessingTask({
    provider, totalTileCount: rows * (frames.length + 1), estimatedWorkingBytes: n * 9, maximumWorkingBytes: maximumWorkingBytes(r.maximumWorkingBytes),
    body: function* (): ProcessingBody<HdrBracketMergeOutput> {
      for (const [i, f] of frames.entries()) for (let row = 0; row < rows; row++) {
        for (let j = row * 4096, end = Math.min(n, j + 4096); j < end; j++) {
          if (!Number.isFinite(f.codes[j]!)) throw new InvalidScientificInputError("frames[" + i + "].codes must be finite.");
        }
        yield;
      }
      const rate = new Float32Array(n), sd = new Float32Array(n), count = new Uint8Array(n);
      let allSaturated = 0;
      for (let row = 0; row < rows; row++) {
        for (let j = row * 4096, end = Math.min(n, j + 4096); j < end; j++) {
          let sumE = 0, sumT = 0, used = 0;
          for (const f of frames) {
            const code = f.codes[j]!;
            if (code >= f.white || (f.flags !== null && f.flags[j] !== 0)) continue;
            sumE += (code - f.black) * f.k; sumT += f.t; used++;
          }
          if (used === 0) { rate[j] = ceiling; sd[j] = 0; allSaturated++; continue; }
          let phi = sumE / sumT, weightSum = 0;
          // Pass `it` weights by the current Φ; passes 1..iterations update Φ, the last pass also gives Var[Φ̂].
          for (let it = 0; it <= iterations; it++) {
            let num = 0; weightSum = 0;
            for (const f of frames) {
              const code = f.codes[j]!;
              if (code >= f.white || (f.flags !== null && f.flags[j] !== 0)) continue;
              const variance = Math.max(phi, 0) * f.t + f.read2 + f.k * f.k / 12, w = f.t * f.t / variance;
              num += w * ((code - f.black) * f.k / f.t); weightSum += w;
            }
            if (it < iterations) phi = num / weightSum;
          }
          rate[j] = phi; sd[j] = Math.sqrt(1 / weightSum); count[j] = used;
        }
        yield;
      }
      return { radianceElectronsPerSecond: rate, standardDeviationElectronsPerSecond: sd, contributingFrameCount: count, saturatedInAllFramesCount: allSaturated,
        provenance: processingProvenance("hdr-linear-raw-bracket-merge-inverse-variance", [
          "Linear RAW only: Phi_k = (code - black)K/t per unsaturated, unflagged frame.",
          "Inverse-variance weights t^2/(Phi t + read^2 + K^2/12) (Granados et al. 2010; Hasinoff et al. 2010), Phi refined by fixed reweighting iterations.",
          "Dark current, fixed-pattern noise and inter-frame motion are not modelled; frames must be registered.",
          "Samples saturated in all frames carry the largest representable rate as a lower bound."]) };
    }
  });
}

// ------------------------------------------------------------------ HDR output encoding

export type HdrTransfer = "pq" | "hlg" | "linear-float32";

export interface HdrImageEncodingInput {
  image: ProcessingRgbImage;
  inputColorSpace: ProcessingLinearColorSpace;
  transfer: HdrTransfer;
  /** PQ: luminance of relative value 1.0, cd/m². Default 203 (ITU-R BT.2408 HDR reference white). */
  referenceWhiteLuminanceCdPerSquareMeter?: number;
  /** HLG: signal of relative value 1.0. Default 0.75 (ITU-R BT.2408 HLG reference white). */
  hlgReferenceWhiteSignal?: number;
  /** PQ/HLG integer depth: 10 (default), 12 or 16. */
  bitDepth?: 10 | 12 | 16;
  /** BT.2100 full range D = round((2ⁿ−1)E′) (default) or narrow range D = round((219E′ + 16)·2ⁿ⁻⁸). */
  signalRange?: "full" | "narrow";
  maximumWorkingBytes?: number;
}

export interface HdrImageEncodingOutput {
  width: number;
  height: number;
  colorSpace: "rec2020";
  transfer: HdrTransfer;
  /** Interleaved RGB codes for PQ/HLG. */
  codes: Uint16Array | null;
  /** Interleaved linear BT.2020 RGB (relative, unclipped) for `linear-float32`. */
  linear: Float32Array | null;
  bitDepth: number | null;
  signalRange: "full" | "narrow" | null;
  /** Components below 0 after conversion to BT.2020 that were clipped (PQ/HLG). */
  negativeClippedSampleCount: number;
  /** Components above the PQ 10000 cd/m² or HLG E = 1 limit that were clipped. */
  overRangeClippedSampleCount: number;
  provenance: ProcessingProvenance;
}

/** Encodes linear RGB as BT.2020/BT.2100 PQ or HLG integer codes, or as float32 linear BT.2020. */
export function createHdrImageEncodingTask(input: HdrImageEncodingInput, provider: ProcessingProvider): ProcessingTask<HdrImageEncodingOutput> {
  const r = requireOptions(input, ["image", "inputColorSpace", "transfer", "referenceWhiteLuminanceCdPerSquareMeter", "hlgReferenceWhiteSignal",
    "bitDepth", "signalRange", "maximumWorkingBytes"], "createHdrImageEncodingTask input");
  const image = requireImage(r.image, "image");
  const space = requireEnum(r.inputColorSpace, ["linear-srgb-d65", "linear-display-p3-d65", "linear-rec2020-d65"] as const, "inputColorSpace");
  const transfer = requireEnum(r.transfer, ["pq", "hlg", "linear-float32"] as const, "transfer");
  const whiteNits = optionalFiniteIn(r.referenceWhiteLuminanceCdPerSquareMeter, 203, "referenceWhiteLuminanceCdPerSquareMeter", 0, 10000, true);
  const hlgWhite = optionalFiniteIn(r.hlgReferenceWhiteSignal, 0.75, "hlgReferenceWhiteSignal", 0, 1, true);
  const bitDepth = r.bitDepth === undefined ? 10 : r.bitDepth;
  if (bitDepth !== 10 && bitDepth !== 12 && bitDepth !== 16) throw new InvalidConfigurationError("bitDepth must be 10, 12 or 16.");
  const range = requireEnum(r.signalRange, ["full", "narrow"] as const, "signalRange", "full");
  const src = resolveRgbColorSpace(rgbSpaceOf(space)).value, dst = resolveRgbColorSpace("rec2020").value;
  const m = [0, 1, 2].map((i) => [0, 1, 2].map((j) => dst.xyzToRgb[i]![0] * src.rgbToXyz[0][j]! + dst.xyzToRgb[i]![1] * src.rgbToXyz[1][j]! +
    dst.xyzToRgb[i]![2] * src.rgbToXyz[2][j]!));
  if (space === "linear-rec2020-d65") for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i]![j] = i === j ? 1 : 0;
  const hlgScale = evaluateHlgInverseOetf(hlgWhite), max = 2 ** bitDepth - 1, samples = image.width * image.height * 3;
  return createProcessingTask({
    provider, totalTileCount: 2 * image.height, estimatedWorkingBytes: samples * (transfer === "linear-float32" ? 4 : 2),
    maximumWorkingBytes: maximumWorkingBytes(r.maximumWorkingBytes),
    body: function* (): ProcessingBody<HdrImageEncodingOutput> {
      yield* finiteRows(image.data, image.width, image.height, 3, "image");
      const linear = transfer === "linear-float32" ? new Float32Array(samples) : null, codes = linear === null ? new Uint16Array(samples) : null;
      let negative = 0, over = 0;
      const d = image.data, stride = image.width * 3;
      for (let y = 0; y < image.height; y++) {
        for (let i = y * stride; i < (y + 1) * stride; i += 3) {
          const a = d[i]!, b = d[i + 1]!, c = d[i + 2]!;
          for (let k = 0; k < 3; k++) {
            const v = m[k]![0]! * a + m[k]![1]! * b + m[k]![2]! * c;
            if (linear !== null) { linear[i + k] = v; continue; }
            let signal: number;
            if (v < 0) negative++;
            if (transfer === "pq") {
              let nits = Math.max(0, v) * whiteNits;
              if (nits > 10000) { nits = 10000; over++; }
              signal = evaluatePqInverseEotf(nits);
            } else {
              let e = Math.max(0, v) * hlgScale;
              if (e > 1) { e = 1; over++; }
              signal = evaluateHlgOetf(e);
            }
            codes![i + k] = range === "full" ? Math.floor(max * signal + 0.5) : Math.floor((219 * signal + 16) * 2 ** (bitDepth - 8) + 0.5);
          }
        }
        yield;
      }
      return { width: image.width, height: image.height, colorSpace: "rec2020", transfer, codes, linear,
        bitDepth: linear === null ? bitDepth : null, signalRange: linear === null ? range : null,
        negativeClippedSampleCount: negative, overRangeClippedSampleCount: over,
        provenance: processingProvenance("hdr-bt2100-output-encoding", [
          "Linear input converted to BT.2020 primaries through XYZ with matrices derived from the published primaries (SMPTE RP 177).",
          transfer === "pq" ? "SMPTE ST 2084 inverse EOTF with relative 1.0 = " + whiteNits + " cd/m2; components clipped to [0, 10000] cd/m2." :
            transfer === "hlg" ? "BT.2100 HLG OETF with relative 1.0 at signal " + hlgWhite + "; scene-linear E clipped to [0, 1]." :
              "Unclipped float32 linear BT.2020; no transfer function or quantization.",
          "Component clipping is not perceptual gamut mapping; no display adaptation or metadata (e.g. MaxCLL) is produced."]) };
    }
  });
}
