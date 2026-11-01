// SPDX-License-Identifier: Apache-2.0

/**
 * Exposure and motion as a weighted sum of shifted frames (#277, image-formation step 3). The CPU
 * float64 reference for the `webgpu-f32` temporal stage; see docs/WEBGPU.md.
 *
 * A site's exposure is the time integral of its image-plane rate quantity over its own exposure window,
 * H = ∫ E(x, t) dt (EMVA Standard 1288 Release 4.0 Linear, §2, free; CIPA DC-004-2020 §5.5, free). For an
 * image that translates rigidly by d(t) on the sensor, E(x, t) = E₀(x − d(t)), so a temporal quadrature
 * with nodes t_k and weights w_k gives
 *
 *   out(x, y) = Σ_k w_k(y) · E₀(x − dx_k, y − dy_k).
 *
 * Motion blur is this superposition of displaced images (Szeliski, *Computer Vision: Algorithms and
 * Applications*, 2nd ed., 2022, free at https://szeliski.org/Book/). The weights depend on the row so a
 * rolling shutter, whose rows start and end their exposure at different times, is the same sum with
 * row-dependent windows (Meingast, Geyer & Sastry, "Geometric Models of Rolling-Shutter Cameras",
 * arXiv:cs/0503076, free); a global shutter uses the same weights on every row.
 *
 * Declared approximations, owned by the caller: the quadrature nodes and weights, and rigid translation
 * (no rotation, warp or occlusion). Sub-site displacements use bilinear interpolation between the four
 * nearest site centres, which is linear interpolation and slightly low-pass; it is labelled as an
 * approximation, not exact resampling. Sources outside the grid are zero; no padding or renormalization.
 */
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireAllowlistedRecord } from "../core/record-validation.js";
import { FULL_RESOLUTION_CEILING_PIXELS, resolveRaisedLimit } from "../core/pixel-limits.js";

export const TEMPORAL_EXPOSURE_SUM_SCHEMA_VERSION = "0.1.0" as const;
/** `maximumPixels` is the default grid limit; a request may raise it with its own `maximumPixels`, up to `ceilingPixels`. */
export const TEMPORAL_EXPOSURE_SUM_LIMITS = /* @__PURE__ */ Object.freeze({
  maximumPixels: 24_000_000,
  ceilingPixels: FULL_RESOLUTION_CEILING_PIXELS,
  maximumDimension: 16_384,
  maximumTemporalSamples: 256,
  maximumDisplacementSites: 4_096,
  maximumRowWeights: 4_194_304,
  /** Keeps every float32 partial sum finite: 256 · 2^16 · 2^100 < 2^128. */
  maximumSampleMagnitude: 2 ** 100,
  maximumWeight: 2 ** 16
});

export interface TemporalExposureSumInput {
  schemaVersion: typeof TEMPORAL_EXPOSURE_SUM_SCHEMA_VERSION;
  width: number;
  height: number;
  /** Row-major rate samples E₀ at site centres. Finite, non-negative, linear and additive (irradiance, photon or electron rate). */
  samples: Float32Array | Float64Array;
  /** Image displacement at each temporal node in grid sites, interleaved (dx₀, dy₀, dx₁, dy₁, …); +x right, +y down. */
  displacements: Float64Array;
  /** Quadrature weights `[k][row]` (nodes × height), finite and non-negative, for example seconds of each row's window near t_k. */
  rowWeights: Float32Array | Float64Array;
  boundary: "zero-outside-grid";
  /**
   * Optional opt-in grid limit for large images: an integer from 1 to `TEMPORAL_EXPOSURE_SUM_LIMITS.ceilingPixels`.
   * Default `TEMPORAL_EXPOSURE_SUM_LIMITS.maximumPixels` (24 000 000). It does not change the result.
   */
  maximumPixels?: number;
}

/** One temporal node: integer source offset of the top-left tap and the four bilinear weights (float64). */
export interface TemporalExposureSumNode {
  offsetX: number;
  offsetY: number;
  weights: readonly [number, number, number, number];
}

export interface TemporalExposureSumPlan {
  width: number;
  height: number;
  nodeCount: number;
  nodes: readonly TemporalExposureSumNode[];
  maximumSampleMagnitude: number;
  /** Largest Σ_k w_k(y) over rows; the operator's weight sum for error composition. */
  maximumRowWeightSum: number;
  maximumWeight: number;
  /** True when every displacement is a whole number of sites (no interpolation). */
  integerDisplacements: boolean;
}

function positiveInteger(value: unknown, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new InvalidConfigurationError("Invalid temporal exposure sum geometry.");
  }
  return value;
}

/** Validates the request (every value once) and returns its plan. */
export function calculateTemporalExposureSumPlan(input: TemporalExposureSumInput): TemporalExposureSumPlan {
  const r = requireAllowlistedRecord(input, ["schemaVersion", "width", "height", "samples", "displacements", "rowWeights", "boundary", "maximumPixels"],
    "Invalid temporal exposure sum input.");
  const L = TEMPORAL_EXPOSURE_SUM_LIMITS;
  if (r.schemaVersion !== TEMPORAL_EXPOSURE_SUM_SCHEMA_VERSION || r.boundary !== "zero-outside-grid") {
    throw new InvalidConfigurationError("Unsupported temporal exposure sum schema or boundary.");
  }
  const width = positiveInteger(r.width, L.maximumDimension), height = positiveInteger(r.height, L.maximumDimension);
  const maximumPixels = resolveRaisedLimit(r.maximumPixels, L.maximumPixels, L.ceilingPixels,
    "Temporal exposure sum maximumPixels must be an integer from 1 to " + L.ceilingPixels + ".");
  if (width * height > maximumPixels) throw new InvalidConfigurationError("Temporal exposure sum grid exceeds the pixel limit.");
  const samples = r.samples, displacements = r.displacements, weights = r.rowWeights;
  if (!(displacements instanceof Float64Array) || displacements.length < 2 || displacements.length % 2 !== 0 ||
      displacements.length / 2 > L.maximumTemporalSamples) {
    throw new InvalidConfigurationError("Temporal exposure sum needs 1 to 256 displacement pairs.");
  }
  const nodeCount = displacements.length / 2;
  if (!(samples instanceof Float32Array || samples instanceof Float64Array) || samples.length !== width * height ||
      !(weights instanceof Float32Array || weights instanceof Float64Array) || weights.length !== nodeCount * height ||
      weights.length > L.maximumRowWeights) {
    throw new InvalidConfigurationError("Temporal exposure sum arrays do not match the declared geometry.");
  }
  let maximumSampleMagnitude = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    if (!(v >= 0 && v <= L.maximumSampleMagnitude)) throw new InvalidConfigurationError("Temporal samples must be finite, non-negative and bounded.");
    if (v > maximumSampleMagnitude) maximumSampleMagnitude = v;
  }
  let maximumWeight = 0, maximumRowWeightSum = 0;
  const rowSums = new Float64Array(height);
  for (let k = 0; k < nodeCount; k++) {
    for (let y = 0; y < height; y++) {
      const w = weights[k * height + y]!;
      if (!(w >= 0 && w <= L.maximumWeight)) throw new InvalidConfigurationError("Temporal row weights must be finite, non-negative and bounded.");
      if (w > maximumWeight) maximumWeight = w;
      rowSums[y]! += w;
    }
  }
  for (const s of rowSums) if (s > maximumRowWeightSum) maximumRowWeightSum = s;
  let integerDisplacements = true;
  const nodes: TemporalExposureSumNode[] = [];
  for (let k = 0; k < nodeCount; k++) {
    const dx = displacements[2 * k]!, dy = displacements[2 * k + 1]!;
    if (!(Math.abs(dx) <= L.maximumDisplacementSites && Math.abs(dy) <= L.maximumDisplacementSites)) {
      throw new InvalidConfigurationError("Temporal displacements must be finite and within 4096 sites.");
    }
    // Source position x − dx = x + offsetX + ax with ax in [0, 1).
    const offsetX = Math.floor(-dx), offsetY = Math.floor(-dy), ax = -dx - offsetX, ay = -dy - offsetY;
    if (ax !== 0 || ay !== 0) integerDisplacements = false;
    nodes.push(Object.freeze({ offsetX, offsetY,
      weights: Object.freeze([(1 - ax) * (1 - ay), ax * (1 - ay), (1 - ax) * ay, ax * ay] as const) }));
  }
  return Object.freeze({ width, height, nodeCount, nodes: Object.freeze(nodes), maximumSampleMagnitude, maximumRowWeightSum, maximumWeight,
    integerDisplacements });
}

/**
 * Reference rows `[y0, y1)` into `output` at `(y − y0)·width + x`. The order (node ascending; taps 00,
 * 10, 01, 11 summed left to right; then times the row weight) is part of the contract shared with the
 * WGSL kernel.
 * @internal
 */
export function sumTemporalExposureRows(plan: TemporalExposureSumPlan, samples: Float32Array | Float64Array, rowWeights: Float32Array | Float64Array,
  y0: number, y1: number, output: Float64Array): void {
  const { width, height, nodes } = plan;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < nodes.length; k++) {
        const node = nodes[k]!, sx = x + node.offsetX, sy = y + node.offsetY, b = node.weights;
        const left = sx >= 0 && sx < width, right = sx + 1 >= 0 && sx + 1 < width;
        const top = sy >= 0 && sy < height, bottom = sy + 1 >= 0 && sy + 1 < height;
        let inner = 0;
        if (top && left) inner += b[0] * samples[sy * width + sx]!;
        if (top && right) inner += b[1] * samples[sy * width + sx + 1]!;
        if (bottom && left) inner += b[2] * samples[(sy + 1) * width + sx]!;
        if (bottom && right) inner += b[3] * samples[(sy + 1) * width + sx + 1]!;
        sum += rowWeights[k * height + y]! * inner;
      }
      output[(y - y0) * width + x] = sum;
    }
  }
}

/** Synchronous float64 reference for bounded grids. Use the image-kernel accelerator for large grids. */
export function calculateTemporalExposureSum(input: TemporalExposureSumInput): { plan: TemporalExposureSumPlan; values: Float64Array } {
  const plan = calculateTemporalExposureSumPlan(input);
  const values = new Float64Array(plan.width * plan.height);
  sumTemporalExposureRows(plan, input.samples, input.rowWeights, 0, plan.height, values);
  return { plan, values };
}
