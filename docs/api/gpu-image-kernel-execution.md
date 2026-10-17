# gpu/image-kernel-execution.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## ImageKernelBackend

Requested or actual execution backend.

```ts
export type ImageKernelBackend = "cpu-reference" | "webgpu-f32";
```

## ImageKernelCodeErrorBound

Integer output codes: |code_webgpu − code_reference| ≤ maximumAbsoluteCodeDifference for every sample.

```ts
export interface ImageKernelCodeErrorBound {
  kind: "integer-code-difference";
  maximumAbsoluteCodeDifference: number;
  /** Bound on the float32 linear value entering the sRGB transfer, after tone and gamut handling. */
  linearAbsoluteBound: number;
  /** Declared bound on the WGSL sRGB transfer evaluation (pow), see WEBGPU_F32_TRANSFER_ABSOLUTE_BOUND. */
  transferAbsoluteBound: number;
}
```

## ImageKernelExecution

Label attached to every accelerated result.

```ts
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
```

## ImageKernelExecutionError

Domain error for backend acquisition and execution. Input validation keeps the engine's existing errors.

```ts
export class ImageKernelExecutionError extends Error {
  readonly code = "IMAGE_KERNEL_EXECUTION";
  readonly reason: ImageKernelFailureReason;

  constructor(reason: ImageKernelFailureReason, message: string) {
    super(message);
    this.name = "ImageKernelExecutionError";
    this.reason = reason;
  }
}
```

## ImageKernelFailureReason

Failure classes reported by {@link ImageKernelExecutionError}.

```ts
export type ImageKernelFailureReason = ImageKernelFallbackReason | "device-lost" | "out-of-memory" | "gpu-validation" |
  "aborted" | "disposed" | "busy" | "unsupported-on-backend" | "unsupported-float32-domain" | "indeterminate-float32-classification";
```

## ImageKernelFallbackReason

Why a requested WebGPU backend was not used (only with `fallback: "cpu-reference"`).

```ts
export type ImageKernelFallbackReason = "webgpu-unavailable" | "adapter-unavailable" | "device-request-failed" |
  "insufficient-limits" | "unsupported-platform-endianness";
```

## ImageKernelRelativeErrorBound

Non-negative linear sums: |v_webgpu − v_reference| ≤ relative·v_reference + absolute for every sample.

```ts
export interface ImageKernelRelativeErrorBound {
  kind: "relative-to-reference";
  relative: number;
  absolute: number;
}
```

## WEBGPU_F32_TRANSFER_ABSOLUTE_BOUND

Declared absolute bound for the WGSL sRGB encode on [0, 1]: `1.055·pow(x, 1/2.4) − 0.055` with pow
inherited from exp2(y·log2 x) (log2: 3 ULP, or 2^-21 absolute on [0.5, 2]; exp2: 3 + 2|x| ULP). The
worst case over [0.0031308, 1] is about 2.5e-6; 2^-17 ≈ 7.6e-6 keeps a 3× margin, also covering the
sRGB segment-join discontinuity (< 1e-7).

```ts
WEBGPU_F32_TRANSFER_ABSOLUTE_BOUND = 2 ** -17
```

## WEBGPU_F32_UNIT_ROUNDOFF

IEEE 754 binary32 unit roundoff.

```ts
WEBGPU_F32_UNIT_ROUNDOFF = 2 ** -24
```
