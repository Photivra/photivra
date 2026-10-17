// SPDX-License-Identifier: Apache-2.0
/**
 * Browser half of `npm run test:webgpu`: runs the `webgpu-f32` backend (and, for timing only, the CPU
 * reference) on payloads built by the Node driver. All comparison against the reference happens in Node.
 */
import { createImageKernelAccelerator, ImageKernelExecutionError, type ImageKernelAccelerator, type IrradianceConvolutionInput,
  type NativeCaptureSdrInput, type NativeCaptureSdrProvider, type NativeCaptureSdrTile, type NativeCaptureSdrTileRequest,
  type NativeRawDevelopmentInput } from "../../src/index.js";
import { decodeTransport, encodeTransport } from "./codec.js";

interface RunRequest<T> { input: T; maximumBandBytes?: number; timeCpu?: boolean; repeat?: number }

export async function probe(): Promise<{ available: boolean; adapter?: { vendor: string; architecture: string; isFallbackAdapter: boolean } }> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return { available: false };
  const adapter = await gpu.requestAdapter();
  if (!adapter) return { available: false };
  const info = adapter.info;
  return { available: true, adapter: { vendor: info.vendor, architecture: info.architecture,
    isFallbackAdapter: (info as GPUAdapterInfo & { isFallbackAdapter?: boolean }).isFallbackAdapter ?? false } };
}

function provider(packed: Float32Array | Float64Array, width: number): NativeCaptureSdrProvider {
  return {
    async readTile(request: NativeCaptureSdrTileRequest): Promise<NativeCaptureSdrTile> {
      const stride = request.width * 3 + 3, samples = new (packed.constructor as Float64ArrayConstructor)(stride * request.height).fill(NaN);
      for (let y = 0; y < request.height; y++) {
        samples.set(packed.subarray(((request.y + y) * width + request.x) * 3, ((request.y + y) * width + request.x + request.width) * 3), y * stride);
      }
      return { ...request, rowStrideSamples: stride, samples };
    },
    async yieldControl(): Promise<void> {}
  };
}

async function accelerator(backend: "webgpu-f32" | "cpu-reference", maximumBandBytes?: number): Promise<ImageKernelAccelerator> {
  return backend === "cpu-reference" ? createImageKernelAccelerator({ backend })
    : createImageKernelAccelerator({ backend, fallback: "fail", ...(maximumBandBytes ? { maximumBandBytes } : {}) });
}

/** Runs `body` `repeat` times on a fresh accelerator; reports the last run (warm pipelines) and its time. */
async function timed<T>(backend: "webgpu-f32" | "cpu-reference", maximumBandBytes: number | undefined, repeat: number,
  body: (a: ImageKernelAccelerator) => Promise<T>): Promise<{ result: T; milliseconds: number }> {
  const a = await accelerator(backend, maximumBandBytes);
  try {
    let result: T | undefined, milliseconds = 0;
    for (let i = 0; i < repeat; i++) { const start = performance.now(); result = await body(a); milliseconds = performance.now() - start; }
    return { result: result!, milliseconds };
  } finally { a.dispose(); }
}

export async function convolve(payload: string): Promise<string> {
  const request = decodeTransport<RunRequest<IrradianceConvolutionInput>>(payload);
  const gpu = await timed("webgpu-f32", request.maximumBandBytes, request.repeat ?? 1, a => a.convolveIrradiance(request.input));
  const cpu = request.timeCpu ? await timed("cpu-reference", undefined, 1, a => a.convolveIrradiance(request.input)) : null;
  return encodeTransport({ values: gpu.result.values, execution: gpu.result.execution, gpuMilliseconds: gpu.milliseconds, cpuMilliseconds: cpu?.milliseconds ?? null });
}

export async function renderSdr(payload: string): Promise<string> {
  const request = decodeTransport<RunRequest<{ sdr: NativeCaptureSdrInput; packed: Float32Array | Float64Array; width: number }>>(payload);
  const { sdr, packed, width } = request.input;
  const gpu = await timed("webgpu-f32", request.maximumBandBytes, request.repeat ?? 1, a => a.renderNativeCaptureSdr(sdr, provider(packed, width)));
  const cpu = request.timeCpu ? await timed("cpu-reference", undefined, 1, a => a.renderNativeCaptureSdr(sdr, provider(packed, width))) : null;
  return encodeTransport({ codes: gpu.result.integerSamples, diagnostics: gpu.result.diagnostics, execution: gpu.result.execution,
    gpuMilliseconds: gpu.milliseconds, cpuMilliseconds: cpu?.milliseconds ?? null });
}

export async function developRaw(payload: string): Promise<string> {
  const request = decodeTransport<RunRequest<NativeRawDevelopmentInput>>(payload);
  // Development takes RAW ownership, so every run gets its own decoded copy.
  const fresh = (): NativeRawDevelopmentInput => decodeTransport<RunRequest<NativeRawDevelopmentInput>>(payload).input;
  const gpu = await timed("webgpu-f32", request.maximumBandBytes, request.repeat ?? 1, a => a.developNativeRaw(fresh(), async () => {}));
  const cpu = request.timeCpu ? await timed("cpu-reference", undefined, 1, a => a.developNativeRaw(fresh(), async () => {})) : null;
  return encodeTransport({ codes: gpu.result.integerSamples, diagnostics: gpu.result.diagnostics, highlight: gpu.result.highlight,
    execution: gpu.result.execution, gpuMilliseconds: gpu.milliseconds, cpuMilliseconds: cpu?.milliseconds ?? null });
}

function describe(error: unknown): string {
  return error instanceof ImageKernelExecutionError ? `${error.name}:${error.reason}` : error instanceof Error ? `${error.name}:${error.message}` : String(error);
}

/** Abort, dispose and rejection behaviour on a real device. */
export async function lifecycle(payload: string): Promise<Record<string, string>> {
  const request = decodeTransport<RunRequest<{ sdr: NativeCaptureSdrInput; packed: Float32Array | Float64Array; width: number; reject: NativeCaptureSdrInput }>>(payload);
  const { sdr, packed, width, reject } = request.input, outcomes: Record<string, string> = {};
  const a = await accelerator("webgpu-f32");
  const controller = new AbortController();
  const tiles = provider(packed, width);
  let reads = 0;
  outcomes.abort = await a.renderNativeCaptureSdr(sdr, { ...tiles, readTile: (r, s) => { if (++reads === 2) controller.abort(); return tiles.readTile(r, s); } },
    { signal: controller.signal }).then(() => "resolved", describe);
  outcomes.afterAbort = await a.renderNativeCaptureSdr(sdr, tiles).then(r => `resolved:${r.execution.backend}`, describe);
  outcomes.reject = await a.renderNativeCaptureSdr(reject, tiles).then(() => "resolved", describe);
  const pending = a.renderNativeCaptureSdr(sdr, tiles);
  outcomes.busy = await a.renderNativeCaptureSdr(sdr, tiles).then(() => "resolved", describe);
  await pending;
  const inFlight = a.renderNativeCaptureSdr(sdr, { ...tiles, readTile: (r, s) => { a.dispose(); return tiles.readTile(r, s); } });
  outcomes.disposeInFlight = await inFlight.then(() => "resolved", describe);
  outcomes.state = a.state;
  outcomes.afterDispose = await a.renderNativeCaptureSdr(sdr, tiles).then(() => "resolved", describe);
  return outcomes;
}
