// SPDX-License-Identifier: Apache-2.0

/**
 * Module boundary and integration notes.
 * Focus stacking of registered frames focused at different distances. Sharpness per frame and pixel
 * is the locally averaged Laplacian energy S_k = G_σ ⊗ (∇²Y_k)² of Rec.709-weighted luma Y (a
 * Laplacian-based focus measure, cf. Nayar & Nakagawa 1994 and the survey of Pertuz, Puig & García
 * 2013). Each pixel selects the sharpest frame (ties → lowest index), and the one-hot selection masks
 * blend the frames with Laplacian pyramids (Burt & Adelson 1983; pyramid image fusion as in Burt &
 * Kolczynski 1993), which hides selection seams at every scale. No registration, magnification
 * (focus-breathing) correction or depth estimation is performed; the index map is only the selected
 * frame, not calibrated depth.
 * @see docs/PROCESSING.md for equations, sources and limits.
 */

import {
  autoLevels, collapse, collapseRows, convolveRows, convolveSeparable, gaussianKernel, gaussianPyramid, gaussianPyramidRows, laplacianPyramid,
  laplacianPyramidRows, luminanceWeights, pyramidBytes, reflect
} from "./image-ops.js";
import {
  createProcessingTask, finiteRows, maximumWorkingBytes, optionalFiniteIn, optionalIntegerIn, processingProvenance, requireImageList, requireOptions,
  type ProcessingBody, type ProcessingProvenance, type ProcessingProvider, type ProcessingRgbImage, type ProcessingTask
} from "./processing-task.js";

export interface FocusStackInput {
  /** Registered frames of one scene, ordered by focus distance (any consistent order). */
  frames: readonly ProcessingRgbImage[];
  /** σ (pixels) of the Gaussian window averaging the squared Laplacian; default 2. */
  sharpnessSigmaPixels?: number;
  /** Pyramid levels for seam-free blending; default down to a 1-pixel side (at most 10). */
  pyramidLevels?: number;
  maximumWorkingBytes?: number;
}

export interface FocusStackOutput extends ProcessingRgbImage {
  /** Index of the sharpest frame per pixel (the blending selection). */
  selectedFrameIndex: Uint8Array;
  provenance: ProcessingProvenance;
}

/** Laplacian-energy focus stacking with Laplacian-pyramid blending. */
export function createFocusStackTask(input: FocusStackInput, provider: ProcessingProvider): ProcessingTask<FocusStackOutput> {
  const r = requireOptions(input, ["frames", "sharpnessSigmaPixels", "pyramidLevels", "maximumWorkingBytes"], "createFocusStackTask input");
  const frames = requireImageList(r.frames, "frames", 1), W = frames[0]!.width, H = frames[0]!.height, n = W * H, K = frames.length;
  const sigma = optionalFiniteIn(r.sharpnessSigmaPixels, 2, "sharpnessSigmaPixels", 0, 1000);
  const levels = optionalIntegerIn(r.pyramidLevels, autoLevels(W, H, 10), "pyramidLevels", 1, autoLevels(W, H, 32));
  const kernel = gaussianKernel(sigma);
  const total = K * H + K * (H + convolveRows(H)) + K * (laplacianPyramidRows(W, H, levels) + gaussianPyramidRows(W, H, levels) + H) + collapseRows(W, H, levels);
  return createProcessingTask({
    provider, totalTileCount: total, estimatedWorkingBytes: n * 4 * 4 + n + 2 * pyramidBytes(W, H, 3, levels) + 2 * pyramidBytes(W, H, 1, levels),
    maximumWorkingBytes: maximumWorkingBytes(r.maximumWorkingBytes),
    body: function* (): ProcessingBody<FocusStackOutput> {
      for (const [k, f] of frames.entries()) yield* finiteRows(f.data, W, H, 3, "frames[" + k + "]");
      const [lr, lg, lb] = luminanceWeights("linear-srgb-d65");
      const energy = new Float32Array(n), tmp = new Float32Array(n), smooth = new Float32Array(n), best = new Float32Array(n).fill(-1);
      const index = new Uint8Array(n);
      for (const [k, f] of frames.entries()) {
        const d = f.data;
        const y709 = (x: number, y: number): number => { const i = 3 * (reflect(y, H) * W + reflect(x, W)); return lr * d[i]! + lg * d[i + 1]! + lb * d[i + 2]!; };
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const lap = y709(x - 1, y) + y709(x + 1, y) + y709(x, y - 1) + y709(x, y + 1) - 4 * y709(x, y);
            energy[y * W + x] = lap * lap;
          }
          yield;
        }
        yield* convolveSeparable(energy, W, H, 1, kernel, tmp, smooth);
        for (let i = 0; i < n; i++) if (smooth[i]! > best[i]!) { best[i] = smooth[i]!; index[i] = k; }
      }
      let acc: Float32Array[] | null = null, sizes: { width: number; height: number }[] = [];
      const mask = new Float32Array(n);
      for (const [k, f] of frames.entries()) {
        for (let y = 0; y < H; y++) {
          for (let i = y * W; i < (y + 1) * W; i++) mask[i] = index[i] === k ? 1 : 0;
          yield;
        }
        const lap = yield* laplacianPyramid(f.data, W, H, 3, levels), gw = yield* gaussianPyramid(mask, W, H, 1, levels);
        sizes = lap.sizes;
        acc ??= lap.sizes.map((s) => new Float32Array(s.width * s.height * 3));
        for (let l = 0; l < levels; l++) {
          const a = acc[l]!, L = lap.levels[l]!, G = gw.levels[l]!;
          for (let i = 0; i < G.length; i++) for (let c = 0; c < 3; c++) a[3 * i + c] = a[3 * i + c]! + G[i]! * L[3 * i + c]!;
        }
      }
      const data = yield* collapse({ levels: acc!, sizes, channels: 3 });
      return { width: W, height: H, data, selectedFrameIndex: index, provenance: processingProvenance("focus-stack-laplacian-energy-pyramid", [
        "Sharpness: Gaussian-averaged squared 3x3 Laplacian of Rec.709-weighted luma; argmax per pixel, ties to the lowest index.",
        "One-hot masks blended with Burt-Adelson Laplacian pyramids (reflect-101 borders); values are not clipped.",
        "Frames must be registered; no alignment, focus-breathing correction or calibrated depth is produced."]) };
    }
  });
}
