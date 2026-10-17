// SPDX-License-Identifier: Apache-2.0

/**
 * Internal image operations on typed arrays, shared by the processing operators. Not exported from
 * the package root.
 *
 * Every spatial operation uses symmetric whole-sample (reflect-101) borders, the same mapping as the
 * RAW mirror border handling. Row generators yield once per output row of each pass. The matching
 * `*Rows` functions return exactly that count, so task plans know their total in advance.
 *
 * Pyramids follow Burt & Adelson (1983):
 * - REDUCE blurs with the separable 5-tap kernel w = [1, 4, 6, 4, 1]/16 (a = 0.375) and keeps every
 *   second sample (size ⌈n/2⌉).
 * - EXPAND upsamples with the same kernel, times two per axis.
 * - A Laplacian level is G_l − EXPAND(G_{l+1}). Collapsing with the same EXPAND rebuilds G_0 exactly,
 *   up to float32 rounding, whatever the border rule.
 */

import { reflectRawSiteIndex as reflect } from "../sensor/raw-reconstruction.js";
import type { ProcessingBody, ProcessingLinearColorSpace } from "./processing-task.js";
import { resolveRgbColorSpace, type RgbColorSpaceId } from "../color/rgb-color-spaces.js";

export { reflect };

/** Normalized 1-D Gaussian taps for standard deviation σ (pixels), truncated at ⌈3σ⌉; σ = 0 → [1]. */
export function gaussianKernel(sigma: number): Float64Array {
  if (sigma === 0) return Float64Array.of(1);
  const radius = Math.max(1, Math.ceil(3 * sigma)), k = new Float64Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) sum += (k[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma)));
  for (let i = 0; i < k.length; i++) k[i] = k[i]! / sum;
  return k;
}

/** Rows yielded by `convolveSeparable`. */
export const convolveRows = (height: number): number => 2 * height;

/** Separable convolution of a `channels`-interleaved plane with a symmetric kernel; `tmp` and `dst` have the source length. */
export function* convolveSeparable(src: Float32Array, width: number, height: number, channels: number, kernel: Float64Array,
  tmp: Float32Array, dst: Float32Array): ProcessingBody<void> {
  const r = (kernel.length - 1) / 2, stride = width * channels;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += kernel[k + r]! * src[row + reflect(x + k, width) * channels + c]!;
      tmp[row + x * channels + c] = s;
    }
    yield;
  }
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let k = -r; k <= r; k++) {
      const w = kernel[k + r]!, from = reflect(y + k, height) * stride;
      if (k === -r) for (let i = 0; i < stride; i++) dst[row + i] = w * tmp[from + i]!;
      else for (let i = 0; i < stride; i++) dst[row + i] = dst[row + i]! + w * tmp[from + i]!;
    }
    yield;
  }
}

const BURT = [0.0625, 0.25, 0.375, 0.25, 0.0625] as const;

/** Size of the next coarser pyramid level. */
export const half = (n: number): number => Math.ceil(n / 2);

/** Level dimensions for `levels` levels starting at (width, height). */
export function levelSizes(width: number, height: number, levels: number): { width: number; height: number }[] {
  const out = [{ width, height }];
  for (let l = 1; l < levels; l++) out.push({ width: half(out[l - 1]!.width), height: half(out[l - 1]!.height) });
  return out;
}

/** Automatic level count: halve until the smaller side is 1 (at most `cap`). */
export function autoLevels(width: number, height: number, cap: number): number {
  return Math.min(cap, 1 + Math.floor(Math.log2(Math.min(width, height))));
}

export const reduceRows = (height: number): number => height + half(height);
/** REDUCE: blur with the Burt–Adelson kernel and keep even samples. */
export function* reduce(src: Float32Array, width: number, height: number, channels: number, dst: Float32Array): ProcessingBody<void> {
  const w2 = half(width), h2 = half(height), tmp = new Float32Array(w2 * height * channels);
  for (let y = 0; y < height; y++) {
    const row = y * width * channels, out = y * w2 * channels;
    for (let x = 0; x < w2; x++) for (let c = 0; c < channels; c++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) s += BURT[k + 2]! * src[row + reflect(2 * x + k, width) * channels + c]!;
      tmp[out + x * channels + c] = s;
    }
    yield;
  }
  const stride = w2 * channels;
  for (let y = 0; y < h2; y++) {
    for (let i = 0; i < stride; i++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) s += BURT[k + 2]! * tmp[reflect(2 * y + k, height) * stride + i]!;
      dst[y * stride + i] = s;
    }
    yield;
  }
}

export const expandRows = (coarseHeight: number, height: number): number => coarseHeight + height;
/**
 * EXPAND a (cw × ch) level to (width × height): out(x) = 2 Σ_k w(k) in((x − k)/2) per axis over even
 * x − k, coarse indices mirrored. `mode` "set" writes, "add" adds, "subtract-from" writes dst − expand.
 */
export function* expand(src: Float32Array, cw: number, ch: number, width: number, height: number, channels: number, dst: Float32Array,
  mode: "set" | "add" | "subtract-from"): ProcessingBody<void> {
  const tmp = new Float32Array(width * ch * channels);
  for (let y = 0; y < ch; y++) {
    const row = y * cw * channels, out = y * width * channels;
    for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) if (((x - k) & 1) === 0) s += BURT[k + 2]! * src[row + reflect((x - k) / 2, cw) * channels + c]!;
      tmp[out + x * channels + c] = 2 * s;
    }
    yield;
  }
  const stride = width * channels;
  for (let y = 0; y < height; y++) {
    const at = y * stride;
    for (let i = 0; i < stride; i++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) if (((y - k) & 1) === 0) s += BURT[k + 2]! * tmp[reflect((y - k) / 2, ch) * stride + i]!;
      const v = 2 * s;
      dst[at + i] = mode === "set" ? v : mode === "add" ? dst[at + i]! + v : dst[at + i]! - v;
    }
    yield;
  }
}

export interface Pyramid { levels: Float32Array[]; sizes: { width: number; height: number }[]; channels: number }

export function gaussianPyramidRows(width: number, height: number, levels: number): number {
  return levelSizes(width, height, levels).slice(0, -1).reduce((s, l) => s + reduceRows(l.height), 0);
}
/** Gaussian pyramid; level 0 is a copy of `src`. */
export function* gaussianPyramid(src: Float32Array, width: number, height: number, channels: number, levels: number): ProcessingBody<Pyramid> {
  const sizes = levelSizes(width, height, levels), out = [src.slice()];
  for (let l = 1; l < levels; l++) {
    const s = sizes[l]!, dst = new Float32Array(s.width * s.height * channels);
    yield* reduce(out[l - 1]!, sizes[l - 1]!.width, sizes[l - 1]!.height, channels, dst);
    out.push(dst);
  }
  return { levels: out, sizes, channels };
}

export function laplacianPyramidRows(width: number, height: number, levels: number): number {
  const sizes = levelSizes(width, height, levels);
  let rows = gaussianPyramidRows(width, height, levels);
  for (let l = 0; l < levels - 1; l++) rows += expandRows(sizes[l + 1]!.height, sizes[l]!.height);
  return rows;
}
/** Laplacian pyramid: L_l = G_l − EXPAND(G_{l+1}); the last level is the coarsest Gaussian level. */
export function* laplacianPyramid(src: Float32Array, width: number, height: number, channels: number, levels: number): ProcessingBody<Pyramid> {
  const g = yield* gaussianPyramid(src, width, height, channels, levels);
  for (let l = 0; l < levels - 1; l++) {
    const a = g.sizes[l]!, b = g.sizes[l + 1]!;
    yield* expand(g.levels[l + 1]!, b.width, b.height, a.width, a.height, channels, g.levels[l]!, "subtract-from");
  }
  return g;
}

export function collapseRows(width: number, height: number, levels: number): number {
  const sizes = levelSizes(width, height, levels);
  let rows = 0;
  for (let l = 0; l < levels - 1; l++) rows += expandRows(sizes[l + 1]!.height, sizes[l]!.height);
  return rows;
}
/** Collapses a Laplacian pyramid in place (level 0 becomes the image). */
export function* collapse(p: Pyramid): ProcessingBody<Float32Array> {
  for (let l = p.levels.length - 2; l >= 0; l--) {
    const a = p.sizes[l]!, b = p.sizes[l + 1]!;
    yield* expand(p.levels[l + 1]!, b.width, b.height, a.width, a.height, p.channels, p.levels[l]!, "add");
  }
  return p.levels[0]!;
}

/** Bytes of a pyramid of `levels` levels for float32 storage. */
export function pyramidBytes(width: number, height: number, channels: number, levels: number): number {
  return levelSizes(width, height, levels).reduce((s, l) => s + l.width * l.height * channels * 4, 0);
}

/** Named colour space of a processing linear space. */
export function rgbSpaceOf(space: ProcessingLinearColorSpace): RgbColorSpaceId {
  return space === "linear-srgb-d65" ? "srgb" : space === "linear-display-p3-d65" ? "display-p3" : "rec2020";
}
/** Luminance weights: the Y row of the space's RGB→XYZ matrix (SMPTE RP 177 derivation, white Y = 1). */
export function luminanceWeights(space: ProcessingLinearColorSpace): readonly [number, number, number] {
  const row = resolveRgbColorSpace(rgbSpaceOf(space)).value.rgbToXyz[1];
  return [row[0], row[1], row[2]];
}
