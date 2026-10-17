# gpu/image-kernel-accelerator.ts public contracts

The package and root API versions are recorded once in [Navigation](../API_REFERENCE.md) · [Developer guide](https://github.com/Photivra/photivra/blob/main/docs/DEVELOPERS.md). Generated signatures retain independent schema/model versions. Only the exports listed here are root-package contracts; module-local helpers are not supported deep imports.

## AcceleratedNativeCaptureSdrOutput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AcceleratedNativeCaptureSdrOutput extends NativeCaptureSdrOutput { execution: ImageKernelExecution }
```

## AcceleratedNativeRawDevelopmentOutput

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface AcceleratedNativeRawDevelopmentOutput extends NativeRawDevelopmentOutput { execution: ImageKernelExecution }
```

## createImageKernelAccelerator

Requests a backend. Never silently substitutes: a fallback is explicit in options and in every result label.

```ts
export async function createImageKernelAccelerator(options: ImageKernelAcceleratorOptions): Promise<ImageKernelAccelerator>;
```

This call is asynchronous; byte hashing uses the caller runtime's Web Crypto.

## ImageKernelAccelerator

Single-flight owner: one operation at a time; dispose releases the device and every buffer.

```ts
export interface ImageKernelAccelerator {
  readonly backend: ImageKernelBackend;
  readonly requestedBackend: ImageKernelBackend;
  readonly fallbackReason: ImageKernelFallbackReason | null;
  readonly state: ImageKernelAcceleratorState;
  renderNativeCaptureSdr(input: NativeCaptureSdrInput, provider: NativeCaptureSdrProvider, options?: ImageKernelRunOptions): Promise<AcceleratedNativeCaptureSdrOutput>;
  /** Takes ownership of `input.raw` exactly like `createNativeRawDevelopmentTask` (the caller's arrays are detached). */
  developNativeRaw(input: NativeRawDevelopmentInput, provider: NativeRawDevelopmentProvider | ((signal: AbortSignal) => Promise<void>),
    options?: ImageKernelRunOptions): Promise<AcceleratedNativeRawDevelopmentOutput>;
  convolveIrradiance(input: IrradianceConvolutionInput, options?: ImageKernelRunOptions): Promise<IrradianceConvolutionResult>;
  dispose(): void;
}
```

## ImageKernelAcceleratorOptions

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ImageKernelAcceleratorOptions {
  /** Requested backend. `cpu-reference` is the reference and never touches WebGPU. */
  backend: ImageKernelBackend;
  /** Required with `webgpu-f32`: use the CPU reference (labelled) or fail when WebGPU cannot be acquired. */
  fallback?: "cpu-reference" | "fail";
  /** WebGPU entry point; defaults to `navigator.gpu`. Supply a worker's `navigator.gpu` explicitly if needed. */
  gpu?: unknown;
  powerPreference?: "low-power" | "high-performance";
  /** Largest single GPU band buffer in bytes (4 KiB … device limit); default min(64 MiB, device limit). Memory only, never results. */
  maximumBandBytes?: number;
  /** Aborts adapter/device acquisition. */
  signal?: AbortSignal;
}
```

## ImageKernelAcceleratorState

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export type ImageKernelAcceleratorState = "ready" | "lost" | "disposed";
```

## ImageKernelRunOptions

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface ImageKernelRunOptions {
  signal?: AbortSignal;
  /** Host event-loop yield between CPU reference chunks and GPU bands (convolution only; tasks keep their own yields). */
  yieldControl?: (signal: AbortSignal) => Promise<void>;
}
```

## IrradianceConvolutionResult

The exact contract is declared below; use the domain guide for assumptions and staged integration.

```ts
export interface IrradianceConvolutionResult {
  plan: IrradianceConvolutionPlan;
  /** Float64 for `cpu-reference`, float32 for `webgpu-f32`; row-major, same grid as the input. */
  values: Float64Array | Float32Array;
  /** Float64 sums of the input and output samples; their difference is quantity lost across the grid boundary. */
  inputSum: number;
  outputSum: number;
  execution: ImageKernelExecution;
}
```
