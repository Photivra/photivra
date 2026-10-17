// SPDX-License-Identifier: Apache-2.0

/**
 * Execution-backend labels, error bounds and domain errors for the optional image-kernel accelerator.
 * `cpu-reference` is the float64 engine reference and the default. `webgpu-f32` is a distinct float32
 * approximation backend whose every result carries an a-priori forward-error bound derived from IEEE 754
 * binary32 rounding (unit roundoff u = 2^-24; Higham, Accuracy and Stability of Numerical Algorithms,
 * 2nd ed., SIAM 2002, §2–§3, γ_k = k·u/(1 − k·u)) and the WGSL built-in accuracy table (W3C WebGPU
 * Shading Language, §"Floating Point Accuracy"). See docs/WEBGPU.md.
 */

/** Requested or actual execution backend. */
export type ImageKernelBackend = "cpu-reference" | "webgpu-f32";

/** Why a requested WebGPU backend was not used (only with `fallback: "cpu-reference"`). */
export type ImageKernelFallbackReason = "webgpu-unavailable" | "adapter-unavailable" | "device-request-failed" |
  "insufficient-limits" | "unsupported-platform-endianness";

/** Failure classes reported by {@link ImageKernelExecutionError}. */
export type ImageKernelFailureReason = ImageKernelFallbackReason | "device-lost" | "out-of-memory" | "gpu-validation" |
  "aborted" | "disposed" | "busy" | "unsupported-on-backend" | "unsupported-float32-domain" | "indeterminate-float32-classification";

/** Domain error for backend acquisition and execution. Input validation keeps the engine's existing errors. */
export class ImageKernelExecutionError extends Error {
  readonly code = "IMAGE_KERNEL_EXECUTION";
  readonly reason: ImageKernelFailureReason;

  constructor(reason: ImageKernelFailureReason, message: string) {
    super(message);
    this.name = "ImageKernelExecutionError";
    this.reason = reason;
  }
}

/** Integer output codes: |code_webgpu − code_reference| ≤ maximumAbsoluteCodeDifference for every sample. */
export interface ImageKernelCodeErrorBound {
  kind: "integer-code-difference";
  maximumAbsoluteCodeDifference: number;
  /** Bound on the float32 linear value entering the sRGB transfer, after tone and gamut handling. */
  linearAbsoluteBound: number;
  /** Declared bound on the WGSL sRGB transfer evaluation (pow), see WEBGPU_F32_TRANSFER_ABSOLUTE_BOUND. */
  transferAbsoluteBound: number;
}

/** Non-negative linear sums: |v_webgpu − v_reference| ≤ relative·v_reference + absolute for every sample. */
export interface ImageKernelRelativeErrorBound {
  kind: "relative-to-reference";
  relative: number;
  absolute: number;
}

/** Label attached to every accelerated result. */
export interface ImageKernelExecution {
  backend: ImageKernelBackend;
  requestedBackend: ImageKernelBackend;
  fallbackReason: ImageKernelFallbackReason | null;
  arithmetic: "float64" | "float32";
  assurance: "engine-reference" | "approximation-with-a-priori-bound";
  /**
   * True only for `cpu-reference`. Bit-exact identities (SHA-256 artifact bindings, byte-parity fixtures,
   * cross-engine determinism hashes) are CPU-only and must never be computed from a `webgpu-f32` result.
   */
  bitIdenticalToReference: boolean;
  errorBound: ImageKernelCodeErrorBound | ImageKernelRelativeErrorBound | null;
  /**
   * Diagnostic counts equal the reference when no sample fell inside a float32 classification band
   * (`diagnosticUncertaintySampleCount === 0`); otherwise each count differs by at most that many samples.
   */
  diagnosticsExact: boolean;
  diagnosticUncertaintySampleCount: number;
  limitations: readonly string[];
}

/** IEEE 754 binary32 unit roundoff. */
export const WEBGPU_F32_UNIT_ROUNDOFF = 2 ** -24;
/**
 * Declared absolute bound for the WGSL sRGB encode on [0, 1]: `1.055·pow(x, 1/2.4) − 0.055` with pow
 * inherited from exp2(y·log2 x) (log2: 3 ULP, or 2^-21 absolute on [0.5, 2]; exp2: 3 + 2|x| ULP). The
 * worst case over [0.0031308, 1] is about 2.5e-6; 2^-17 ≈ 7.6e-6 keeps a 3× margin, also covering the
 * sRGB segment-join discontinuity (< 1e-7).
 */
export const WEBGPU_F32_TRANSFER_ABSOLUTE_BOUND = 2 ** -17;
/** Largest slope of the sRGB encode on [0, 1] (the linear segment, 12.92). */
export const SRGB_ENCODE_LIPSCHITZ = 12.92;

/** Higham's γ_k for binary32. */
export function float32Gamma(k: number): number {
  const ku = k * WEBGPU_F32_UNIT_ROUNDOFF;
  return ku < 1 ? ku / (1 - ku) : Number.POSITIVE_INFINITY;
}

/** Integer-code bound from a bound on the linear value: |Δcode| ≤ ⌊maximum·(12.92·δ_L + δ_E)⌋ + 1, capped at maximum. */
export function integerCodeBound(maximum: number, linearAbsoluteBound: number): ImageKernelCodeErrorBound {
  const linear = Math.min(1, linearAbsoluteBound);
  const real = maximum * (SRGB_ENCODE_LIPSCHITZ * linear + WEBGPU_F32_TRANSFER_ABSOLUTE_BOUND);
  return { kind: "integer-code-difference", maximumAbsoluteCodeDifference: Math.min(maximum, Math.floor(real) + 1),
    linearAbsoluteBound: linear, transferAbsoluteBound: WEBGPU_F32_TRANSFER_ABSOLUTE_BOUND };
}

export const CPU_REFERENCE_LIMITATIONS = Object.freeze(["Float64 engine reference execution; results are the reference by definition"]);
export const WEBGPU_F32_LIMITATIONS = Object.freeze([
  "Float32 WebGPU execution is an approximation of the float64 reference within the reported a-priori bound",
  "Not bit-identical to the reference: never use for SHA-256 artifact identities, byte-parity evidence or determinism hashes",
  "Bound assumes a conforming WebGPU implementation (correctly rounded f32 add/multiply/divide, WGSL accuracy table)",
  "Execution speed depends on the adapter; software adapters do not represent GPU performance"
]);

export function cpuExecution(requestedBackend: ImageKernelBackend, fallbackReason: ImageKernelFallbackReason | null): ImageKernelExecution {
  return { backend: "cpu-reference", requestedBackend, fallbackReason, arithmetic: "float64", assurance: "engine-reference",
    bitIdenticalToReference: true, errorBound: null, diagnosticsExact: true, diagnosticUncertaintySampleCount: 0, limitations: CPU_REFERENCE_LIMITATIONS };
}

export function webGpuExecution(errorBound: ImageKernelExecution["errorBound"], uncertainty: number): ImageKernelExecution {
  return { backend: "webgpu-f32", requestedBackend: "webgpu-f32", fallbackReason: null, arithmetic: "float32",
    assurance: "approximation-with-a-priori-bound", bitIdenticalToReference: false, errorBound, diagnosticsExact: uncertainty === 0,
    diagnosticUncertaintySampleCount: uncertainty, limitations: WEBGPU_F32_LIMITATIONS };
}
