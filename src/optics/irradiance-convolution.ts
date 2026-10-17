// SPDX-License-Identifier: Apache-2.0

/**
 * Piecewise shift-invariant (isoplanatic-patch) convolution of a sampled, linear, additive image-plane
 * quantity with caller-supplied incoherent intensity PSF kernels. This is the CPU float64 reference for
 * the optics-as-convolution step proposed in #277; `webgpu-f32` executes the same equation (see
 * docs/WEBGPU.md).
 *
 * Equation (source-indexed, energy-conserving scatter written as a gather):
 *   out(x, y) = Σ_{v=-r..r} Σ_{u=-r..r} in(x − u, y − v) · K_{p(x − u, y − v)}(u, v)
 * where `p(s)` is the patch containing the **source** site and `K_p(u, v)` is the fraction of the source
 * site's quantity that lands at displacement (+u right, +v down) in grid sites. Incoherent imaging is a
 * linear superposition of intensity PSFs (Goodman, Introduction to Fourier Optics, 4th ed., 2017, §6.1);
 * a field-dependent PSF is approximated as constant inside each isoplanatic patch (Goodman §6.1; the
 * piecewise shift-invariant method used by camera simulators such as ISETCam, Farrell et al., Proc.
 * SPIE 8299, 2012). The patch approximation is the caller's declared choice of patch size and kernels.
 *
 * Boundary: the grid is the complete source support. Sources outside the grid are not represented and
 * quantity scattered outside the grid is lost (reported through `inputSum`/`outputSum`); no padding,
 * reflection or renormalization is performed.
 */
import { InvalidConfigurationError } from "../core/configuration-error.js";
import { requireAllowlistedRecord } from "../core/record-validation.js";

export const IRRADIANCE_CONVOLUTION_SCHEMA_VERSION = "0.1.0" as const;
export const IRRADIANCE_CONVOLUTION_LIMITS = Object.freeze({
  maximumPixels: 24_000_000,
  maximumDimension: 16_384,
  maximumKernelRadius: 32,
  maximumPatchCount: 4_096,
  maximumKernelWeights: 4_194_304,
  /** A kernel may lose energy (vignetting/transmission) but never create it beyond rounding slack. */
  maximumKernelSum: 1 + 2 ** -20,
  /** Inputs above this magnitude are rejected so float32 execution cannot overflow. */
  maximumSampleMagnitude: 2 ** 100
});

export interface IrradianceConvolutionInput {
  schemaVersion: typeof IRRADIANCE_CONVOLUTION_SCHEMA_VERSION;
  width: number;
  height: number;
  /** Row-major, finite, non-negative, linear and additive (e.g. irradiance or expected photons per site). */
  samples: Float32Array | Float64Array;
  /** Kernel half-width in grid sites; each kernel is (2r+1)×(2r+1). */
  kernelRadius: number;
  /** Isoplanatic patch size in grid sites; the last row/column of patches may be partial. */
  patchWidth: number;
  patchHeight: number;
  /**
   * Finite non-negative weights, `[patchRow][patchColumn][v + r][u + r]`, one kernel per patch in
   * row-major patch order. Each kernel sums to at most 1 (+2^-20 rounding slack).
   */
  kernels: Float32Array | Float64Array;
  boundary: "zero-outside-grid";
}

/** Validated, immutable geometry of a convolution request (sample arrays are borrowed, not copied). */
export interface IrradianceConvolutionPlan {
  width: number;
  height: number;
  kernelRadius: number;
  kernelSize: number;
  tapCount: number;
  patchWidth: number;
  patchHeight: number;
  patchColumns: number;
  patchRows: number;
  /** Largest single kernel sum and input magnitude, used by the float32 error bound. */
  maximumKernelSum: number;
  maximumSampleMagnitude: number;
}

function positiveInteger(value: unknown, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new InvalidConfigurationError("Invalid irradiance convolution geometry.");
  }
  return value;
}

/** Validates the request and returns its plan. Every sample and weight is checked once. */
export function calculateIrradianceConvolutionPlan(input: IrradianceConvolutionInput): IrradianceConvolutionPlan {
  const r = requireAllowlistedRecord(input, ["schemaVersion", "width", "height", "samples", "kernelRadius", "patchWidth",
    "patchHeight", "kernels", "boundary"], "Invalid irradiance convolution input.");
  const L = IRRADIANCE_CONVOLUTION_LIMITS;
  if (r.schemaVersion !== IRRADIANCE_CONVOLUTION_SCHEMA_VERSION || r.boundary !== "zero-outside-grid") {
    throw new InvalidConfigurationError("Unsupported irradiance convolution schema or boundary.");
  }
  const width = positiveInteger(r.width, L.maximumDimension), height = positiveInteger(r.height, L.maximumDimension);
  if (width * height > L.maximumPixels) throw new InvalidConfigurationError("Irradiance convolution grid exceeds the pixel limit.");
  const radius = r.kernelRadius;
  if (typeof radius !== "number" || !Number.isSafeInteger(radius) || radius < 0 || radius > L.maximumKernelRadius) {
    throw new InvalidConfigurationError("Invalid irradiance convolution kernel radius.");
  }
  const patchWidth = positiveInteger(r.patchWidth, width), patchHeight = positiveInteger(r.patchHeight, height);
  const patchColumns = Math.ceil(width / patchWidth), patchRows = Math.ceil(height / patchHeight);
  const kernelSize = 2 * radius + 1, tapCount = kernelSize * kernelSize, patchCount = patchColumns * patchRows;
  if (patchCount > L.maximumPatchCount || patchCount * tapCount > L.maximumKernelWeights) {
    throw new InvalidConfigurationError("Irradiance convolution kernels exceed the declared limits.");
  }
  const samples = r.samples, kernels = r.kernels;
  if (!(samples instanceof Float32Array || samples instanceof Float64Array) || samples.length !== width * height ||
      !(kernels instanceof Float32Array || kernels instanceof Float64Array) || kernels.length !== patchCount * tapCount) {
    throw new InvalidConfigurationError("Irradiance convolution arrays do not match the declared geometry.");
  }
  let maximumSampleMagnitude = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    // Negated comparison also rejects NaN.
    if (!(v >= 0 && v <= L.maximumSampleMagnitude)) {
      throw new InvalidConfigurationError("Irradiance samples must be finite, non-negative and within the declared magnitude.");
    }
    if (v > maximumSampleMagnitude) maximumSampleMagnitude = v;
  }
  let maximumKernelSum = 0;
  for (let p = 0; p < patchCount; p++) {
    let sum = 0;
    for (let t = p * tapCount, end = t + tapCount; t < end; t++) {
      const w = kernels[t]!;
      if (!(w >= 0 && w <= 1)) throw new InvalidConfigurationError("PSF kernel weights must be finite and within [0, 1].");
      sum += w;
    }
    if (sum > L.maximumKernelSum) throw new InvalidConfigurationError("A PSF kernel may not create energy (sum exceeds 1).");
    if (sum > maximumKernelSum) maximumKernelSum = sum;
  }
  return Object.freeze({ width, height, kernelRadius: radius, kernelSize, tapCount, patchWidth, patchHeight, patchColumns, patchRows,
    maximumKernelSum, maximumSampleMagnitude });
}

/**
 * Reference gather for output rows `[y0, y1)`, written into `output` at `(y - y0) * width + x`.
 * Summation order (v outer, u inner, ascending) is part of the contract shared with the WGSL kernel.
 * @internal
 */
export function convolveIrradianceRows(plan: IrradianceConvolutionPlan, samples: Float32Array | Float64Array,
  kernels: Float32Array | Float64Array, y0: number, y1: number, output: Float64Array): void {
  const { width, height, kernelRadius: r, kernelSize, tapCount, patchWidth, patchHeight, patchColumns, patchRows } = plan;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let v = -r; v <= r; v++) {
        const sy = y - v;
        if (sy < 0 || sy >= height) continue;
        const patchRowBase = Math.min(Math.floor(sy / patchHeight), patchRows - 1) * patchColumns;
        const kernelRow = (v + r) * kernelSize + r, sampleRow = sy * width;
        for (let u = -r; u <= r; u++) {
          const sx = x - u;
          if (sx < 0 || sx >= width) continue;
          const patch = patchRowBase + Math.min(Math.floor(sx / patchWidth), patchColumns - 1);
          sum += samples[sampleRow + sx]! * kernels[patch * tapCount + kernelRow + u]!;
        }
      }
      output[(y - y0) * width + x] = sum;
    }
  }
}

/** Synchronous float64 reference for bounded grids. Use the image-kernel accelerator for large grids. */
export function calculateIrradianceConvolution(input: IrradianceConvolutionInput): { plan: IrradianceConvolutionPlan; values: Float64Array } {
  const plan = calculateIrradianceConvolutionPlan(input);
  const values = new Float64Array(plan.width * plan.height);
  convolveIrradianceRows(plan, input.samples, input.kernels, 0, plan.height, values);
  return { plan, values };
}
