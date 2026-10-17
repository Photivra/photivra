# WebGPU image-kernel backend (`webgpu-f32`)

Status: **2.0.0 development, optional and opt-in.**

- The float64 CPU paths stay the engine reference, and the default.
- The `webgpu-f32` backend is a separate, explicitly labelled float32 approximation of three per-pixel stages.
- Its results carry an error bound against the reference, worked out in advance (a priori). A conformance suite on a real WebGPU device tests that bound on fixed test images.

It is the first, bounded step of the GPU image-formation path proposed in [#277](https://github.com/Photivra/photivra/issues/277). It is not that whole path: there is no scene radiance, exposure/motion or sensor stage on the GPU yet.

## Contract

```ts
import { createImageKernelAccelerator, type IrradianceConvolutionInput } from "@photivra/engine";

const width = 64, height = 48, kernelRadius = 2, size = 2 * kernelRadius + 1;
const input: IrradianceConvolutionInput = {
  schemaVersion: "0.1.0", width, height, kernelRadius, patchWidth: 32, patchHeight: 24, boundary: "zero-outside-grid",
  samples: new Float64Array(width * height).fill(1),
  // One normalized box kernel per patch (2 × 2 patches).
  kernels: new Float64Array(4 * size * size).fill(1 / (size * size))
};

// The caller opts in and chooses the fallback explicitly; nothing is substituted silently.
const accelerator = await createImageKernelAccelerator({ backend: "webgpu-f32", fallback: "cpu-reference" });
const result = await accelerator.convolveIrradiance(input);
console.log(result.execution.backend, result.execution.fallbackReason); // "cpu-reference" "webgpu-unavailable" in Node
console.log(result.execution.errorBound); // null for the reference; a bound for webgpu-f32
console.log(result.inputSum - result.outputSum); // quantity scattered outside the grid
accelerator.dispose();
```

- `createImageKernelAccelerator({ backend })` is the only entry point. `backend: "cpu-reference"` never touches WebGPU. `backend: "webgpu-f32"` requires `fallback: "cpu-reference" | "fail"`. When WebGPU cannot be acquired, the accelerator either runs the reference and records `fallbackReason` (`webgpu-unavailable`, `adapter-unavailable`, `device-request-failed`, `insufficient-limits`, `unsupported-platform-endianness`), or throws `ImageKernelExecutionError` with that `reason`.
- Fallback happens only at acquisition. After a device has been acquired, failures are errors: `device-lost`, `out-of-memory`, `gpu-validation`, `aborted`, `disposed`, `busy`, `unsupported-on-backend`, `unsupported-float32-domain` and `indeterminate-float32-classification`. The backend never re-runs work on the CPU mid-flight. Create a new accelerator to recover. Input validation keeps the reference's own errors (`InvalidConfigurationError`, `InvalidScientificResultError`), because the GPU path calls the same validators.
- Every result carries `execution: ImageKernelExecution`:
  - `backend`, `requestedBackend`, `fallbackReason`;
  - `arithmetic`: `float64` or `float32`;
  - `assurance`: `engine-reference` or `approximation-with-a-priori-bound`;
  - `bitIdenticalToReference`;
  - `errorBound`;
  - `diagnosticsExact` and `diagnosticUncertaintySampleCount`;
  - `limitations`.
- **Bit-exact identities are CPU-only.** SHA-256 artifact bindings, byte-parity fixtures, export evidence and cross-engine determinism hashes must be computed from `cpu-reference` output only. A `webgpu-f32` result is never bit-identical to the reference, and it states so.
- **Runtime resources:**
  - Single flight: an overlapping call rejects with `busy`.
  - `signal` (an `AbortSignal`) aborts acquisition or a run. Pending GPU waits race the signal and device loss, and every buffer is destroyed when the operation settles.
  - `dispose()` destroys the device. `state` reports `ready`, `lost` or `disposed`.
  - `maximumBandBytes` (at least 4 KiB, default min(64 MiB, the device limit)) bounds each band buffer. Banding changes memory use only, never results. The conformance suite checks that banded and unbanded GPU output are identical.
- The package stays dependency-free and browser-safe. WebGPU typings come from TypeScript's DOM library at build time, and no WebGPU type appears in the published declarations. In Node or any runtime without `navigator.gpu`, the backend reports `webgpu-unavailable`. You can pass a worker's `navigator.gpu` explicitly through `gpu`.

## Stages and why these three

The three stages were chosen because they cost the most CPU time per pixel. The measurements come from the 2.0 performance review (`findings-perf`, Node 24, single run), and from in-browser CPU timings taken while developing this backend (Chromium, loaded 4-core host).

| Stage | CPU reference | Measured CPU cost | GPU mapping |
| --- | --- | --- | --- |
| Isoplanatic PSF convolution | `calculateIrradianceConvolution` (new, float64) | ≈ 4 µs/px at radius 7 (225 taps), 1024×768 in Chromium: 3.2 s. 24 MP at radius 15 would take minutes. The per-site PSF path it replaces costs 19 ms to 1 s per site. | One invocation per output site; highest arithmetic intensity |
| Native capture SDR | `createNativeCaptureSdrTask` | 98–146 ns/px (Node); 24 MP in 2.7–3.5 s | Pointwise per sample |
| Packed RAW development | `createNativeRawDevelopmentTask` (typed kernel, #295) | ≈ 1.0 µs/px in Chromium on this host (1024×768: 0.8 s); 24 MP in tens of seconds | One invocation per output pixel |

Per-site radiance, pupil, PSF quadrature and sensor noise (the 75-hour path in #277) do not map cleanly to a compute shader yet. They need the batched provider API and the per-stage accuracy contracts that #277 schedules after 2.0.0. They stay on the CPU.

### Supported domain (fails closed outside it)

- **SDR and RAW development:**
  - Only the `identity` and `positive-reinhard-per-channel` tone curves. Luminance curves (`extended-reinhard-luminance`, `naka-rushton-luminance`) reject with `unsupported-on-backend`.
  - Only `borderHandling: "reject"`. Mirror borders (`borderHandling: "mirror"`) reject with `unsupported-on-backend`; use `cpu-reference` for them.
  - Sample magnitude times scale must stay ≤ 2^120 (`unsupported-float32-domain`).
  - In `reject-out-of-range` mode, any sample inside the float32 gamut classification band rejects with `indeterminate-float32-classification`. The backend fails closed rather than guessing whether the reference would reject.
- **RAW development** takes ownership of `input.raw` exactly like the reference task: the caller's arrays are detached. The a-priori exposed-value bound must not exceed 1.
- **Convolution:**
  - Samples must be finite, non-negative and ≤ 2^100.
  - Kernel weights must be in [0, 1], and each kernel must sum to ≤ 1 + 2^-20 (no energy creation).
  - Radius ≤ 32, ≤ 4096 patches, ≤ 4 194 304 weights, ≤ 24 MP.

## Equations

**Convolution** (source-indexed, energy-conserving scatter written as a gather):

`out(x, y) = Σ_{v=-r..r} Σ_{u=-r..r} in(x − u, y − v) · K_{p(x − u, y − v)}(u, v)`

Here `p(s)` is the isoplanatic patch containing the *source* site, and `K_p(u, v)` is the fraction of that site's linear, additive quantity that lands at displacement (+u right, +v down).

- Incoherent imaging superposes intensity PSFs linearly ([MIT OpenCourseWare 2.71, lecture 22](https://ocw.mit.edu/courses/2-71-optics-spring-2009/resources/mit2_71s09_lec22/), free; isoplanatic subsections: van de Ketterij et al., [arXiv:2011.01738](https://arxiv.org/abs/2011.01738), sec. 1, free. Also see: Goodman, *Introduction to Fourier Optics*, 4th ed., 2017, §6.1).
- Treating the PSF as constant inside a patch is the declared piecewise shift-invariant approximation (isoplanatic patches; the method used by camera simulators such as ISETCam: Farrell et al., *Proc. SPIE* 8299, 2012). Patch size and kernels are the caller's declared choice.
- The grid is the whole source support. Quantity scattered outside it is lost; there is no padding or renormalization. `inputSum − outputSum` reports the loss.
- Kernel sampling from a lens PSF profile is the caller's responsibility; no PSF profile is inferred.

**SDR** is exactly the `calculateSdrRendering` chain in the same order: rendering exposure, then per-channel tone, then gamut handling, then the sRGB transfer (W3C CSS Color 4; also IEC 61966-2-1), then nearest-ties-up quantization.

**RAW development** follows `raw-development-kernel.ts` and `prepareSensorColorDevelopment`:

1. Site normalization: a site is 1 when it is flagged or at/above its phase white level. Otherwise it is `(code − black)/(white − black)`, evaluated in float64 on the host and rounded once to float32.
2. CFA kernel sums, in declared contribution order.
3. Applied WB gains.
4. Highlight handling: clip at the smallest gain, or the declared neutral blend above 0.8.
5. Camera→XYZ, then XYZ→linear sRGB, in the documented row order.
6. The SDR chain above.

A saturated site normalizes to exactly 1, while every unsaturated value is ≤ 1 − 1/65535. The GPU can therefore detect saturated contributing sites exactly, so `highlight.saturatedPixelCount` is exact.

## Error bounds (a priori, reported per result)

Let u = 2^-24 (binary32 unit roundoff) and γ_k = k·u/(1 − k·u). These are the standard forward-error bounds for recursive summation and dot products (Rump & Jeannerod, *SIAM J. Matrix Anal. Appl.* 35(2), 2014, sec. 1, [free author copy](https://www.tuhh.de/ti3/paper/rump/RuJea13.pdf). Also see: Higham, *Accuracy and Stability of Numerical Algorithms*, 2nd ed., SIAM 2002, §2–§3). They assume a conforming WebGPU implementation: correctly rounded f32 `+ − × ÷`, and the WGSL accuracy table for `pow` (W3C WGSL, *Floating Point Accuracy*).

- **Convolution (`relative-to-reference`).** Every term is non-negative, so for every sample `|v_gpu − v_ref| ≤ (γ_{T+3} + 2^-40)·v_ref + 2·T·2^-126`, where T = (2r+1)² taps. The three extra roundings cover the f32 conversion of the sample, the weight and the product. The absolute term covers subnormal flush-to-zero.
- **Integer codes (`integer-code-difference`).** If the float32 linear value entering the transfer is within δ_L of the reference, then `|Δcode| ≤ ⌊max·(12.92·δ_L + δ_E)⌋ + 1`, capped at the code maximum.
  - 12.92 is the largest slope of the sRGB encode on [0, 1].
  - δ_E = 2^-17 is the declared bound on the WGSL encode. The worst case derived from the WGSL `log2`/`exp2` accuracy is about 2.5e-6, so the bound keeps a 3× margin. The sRGB segment join is discontinuous by only −2.85e-8.
  - **SDR:** δ_L = γ_6, so the bound is 1 code at 8 and 16 bits.
  - **RAW development:** δ_L is propagated through every step (channel sums γ_{n+2}, gains, clip or blend, two 3×3 products, exposure), using the run's largest normalized site magnitude, Σ|w|, the largest gain and the ∞-norms of both matrices. It is therefore input-dependent. For example, it was 1 code at 8 bits and 12–67 codes at 16 bits on the conformance corpora.
- **Diagnostics.** A sample is *uncertain* when its float32 value lies inside a classification band where float32 and float64 decisions can differ:
  - near 0 or 1, in band δ_e;
  - tiny positive Reinhard inputs below 2^-20;
  - zero results from non-zero sources (underflow);
  - the WB-clip level or the 0.8 reconstruction start (RAW).

  Every diagnostic count then differs from the reference by at most `diagnosticUncertaintySampleCount`. When that count is 0, `diagnosticsExact` is true and the counts equal the reference.

## Measured conformance (SwiftShader, Chromium 141 headless)

`npm run test:webgpu` (31 tests) runs the WGSL kernels on a real WebGPU device. It compares every sample against the float64 reference computed in Node and asserts the bound. Measured during development of this backend with Google SwiftShader (a Vulkan CPU implementation):

| Stage | Corpus | Measured maximum | Reported bound |
| --- | --- | --- | --- |
| Convolution | 257×193 r=0 … 64×64 r=32, nine-decade grids, field-varying anisotropic kernels | relative 1.4e-7 (r=0) … 3.8e-6 (r=32) | relative 2.4e-7 … 2.5e-4 |
| SDR, 8 and 16 bit, identity/Reinhard, clip/reject, f32/f64 | 300×41 with code centres, near-ties, transfer breakpoints, ±0, clipping | 1 code (0.0–4.9 % of samples differ) | 1 code |
| RAW development, all four orientations, clip/reconstruct, ideal and non-white-normalized cameras, with and without WB gains | 96×64 synthetic Bayer RAW (random codes, black levels, flags, white levels) | 1 code (≤ 0.3 % of samples differ) | 1 (8 bit) … 67 (16 bit) |

Reject-mode corpora that contain samples exactly at 1 ± 2^-52 fail closed with `indeterminate-float32-classification`, as designed. Banded and unbanded GPU output are identical. Abort, busy, out-of-range rejection, and in-flight dispose return the documented domain errors on the real device.

**Speed: no GPU speedup is claimed.** SwiftShader emulates the GPU on the CPU, so its timings say nothing about GPU performance. On this loaded 4-core host it was *slower* than the CPU reference:

| Stage | CPU reference | webgpu-f32 on SwiftShader |
| --- | --- | --- |
| Convolution 1024×768, r=7 | 3.2 s | 5.2 s |
| SDR 1024×768 | 0.28 s | 4.2 s |
| RAW development 1024×768 | 0.8 s | 3.1 s |

The browser test prints these numbers on each run. Hardware-GPU measurements at 6–24 MP remain an open item for #277. Until then, choose the backend by measuring on the target device.

## Browser support and running the suite

- WebGPU requires a secure context (HTTPS or localhost).
  - Shipped: Chromium-based browsers (Chrome/Edge 113+ on Windows, macOS and ChromeOS; Android 121+).
  - Behind flags or partial: Safari and Firefox, depending on version and platform.
  - Elsewhere the accelerator reports `webgpu-unavailable` and, with `fallback: "cpu-reference"`, runs the reference.
- Little-endian hosts only (all current WebGPU platforms).
- The device is requested with `maxStorageBufferBindingSize` and `maxBufferSize` set to the adapter maximum, capped at 1 GiB. Adapters below 16 MiB are refused (`insufficient-limits`).

To run the conformance suite:

```sh
npm run test:webgpu                       # skips with a message when no browser/adapter is available
PHOTIVRA_WEBGPU_REQUIRED=1 npm run test:webgpu   # fail instead of skip
```

How the suite finds and launches a browser:

- **Browser lookup:**
  1. `PHOTIVRA_WEBGPU_BROWSER` (path to a Chromium/Chrome binary);
  2. Playwright's Chromium under `PLAYWRIGHT_BROWSERS_PATH`, `/opt/pw-browsers` or `~/.cache/ms-playwright`;
  3. `/usr/bin/google-chrome` or `/usr/bin/chromium`.
- **Default flags** expose SwiftShader in headless mode: `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=swiftshader --use-webgpu-adapter=swiftshader`. Override them with `PHOTIVRA_WEBGPU_FLAGS`, for example to use a hardware adapter.
- **No dependencies:** the driver talks to the browser over the DevTools protocol and serves `src/` transpiled over loopback. It adds no npm dependency.

**CI.** The suite is not part of `ci.yml`. It passes reliably here with Playwright's Chromium 141. Whether ubuntu-latest's preinstalled Chrome exposes a SwiftShader WebGPU adapter headlessly has not been verified, so wiring it in is left as a follow-up. The in-process unit tests (`test/image-kernel-accelerator.test.ts`) run in every CI leg. They drive the complete host path (acquisition, banding, readback, counters, loss, error scopes, abort, dispose) against a float32 JavaScript emulation of the kernels.

## Limitations

- These are approximations within the stated bounds, not the reference. Use `cpu-reference` for evidence, hashes, fixtures and anything that needs bit identity.
- The bounds assume conforming hardware and drivers. Non-conforming flush-to-zero or `pow` behaviour outside the WGSL accuracy table would void them; the conformance suite is how a device is checked.
- The convolution is a primitive. Building kernels from `LensPsfProfile` nodes, spectral weighting, vignetting and depth handling stay with the #277 work items.
