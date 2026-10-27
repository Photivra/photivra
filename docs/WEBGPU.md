# WebGPU image-kernel backend (`webgpu-f32`)

Status: **2.0.0 development, optional and opt-in.**

- The float64 CPU paths stay the engine reference, and the default.
- The `webgpu-f32` backend is a separate, explicitly labelled float32 approximation of six stages: chart scene radiance and its spectral integration, isoplanatic PSF convolution (with kernels sampled from the engine's lens PSF profiles), the temporal exposure sum (exposure and motion), the sensor stage (seeded charge, fixed-pattern noise, extra charge, read noise and ADC), native capture SDR and packed RAW development (all four tone curves).
- Its results carry an error bound against the reference, worked out in advance (a priori); the luminance tone curves report a running bound, a fixed formula evaluated during the run. The [accuracy contract](#accuracy-contract) states each stage's bound and how the bounds compose. A conformance suite on a real WebGPU device tests them on fixed test images.
- The [per-fixture rollout](#per-fixture-rollout-method-error) measures the image-formation method's error against the per-site engine for every built-in chart preset.

It is the GPU image-formation path proposed in [#277](https://github.com/Photivra/photivra/issues/277) for the engine's chart scenes. **One hardware conformance run exists** (Apple M5 Pro, Metal, Chrome 155, [#471](https://github.com/Photivra/photivra/issues/471)): 82 of 89 tests passed; the 7 failures (sensor stage with non-unit gains, one Siemens-star boundary point) led to the arithmetic assumptions and margins below, and the re-run on that device is pending ([#475](https://github.com/Photivra/photivra/issues/475)). Every hardware run, timings and conformance alike, is recorded in the [hardware record](WEBGPU_DEVICES.md). The development container has no GPU (see [Running on hardware](#running-on-hardware)).

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

- **Operations:** `evaluateChartRadiance`, `convolveIrradiance`, `sumTemporalExposure`, `simulateSensorRaw`, `renderNativeCaptureSdr` and `developNativeRaw`. Their float64 references are `calculateChartRadianceBatch`, `calculateIrradianceConvolution`, `calculateTemporalExposureSum`, `simulatePackedSensorRaw`, `createNativeCaptureSdrTask` and `createNativeRawDevelopmentTask`. A sensor result also lists its `flaggedSiteIndices`; a chart-radiance result lists its `hostRecomputedQueryIndices`.
- `createImageKernelAccelerator({ backend })` is the only entry point. `backend: "cpu-reference"` never touches WebGPU. `backend: "webgpu-f32"` requires `fallback: "cpu-reference" | "fail"`. When WebGPU cannot be acquired, the accelerator either runs the reference and records `fallbackReason` (`webgpu-unavailable`, `webgpu-disabled`, `adapter-unavailable`, `device-request-failed`, `insufficient-limits`, `unsupported-platform-endianness`), or throws `ImageKernelExecutionError` with that `reason`.
- **One boolean instead of the two fields:** `{ webgpu: true }` is `backend: "webgpu-f32"` with `fallback: "cpu-reference"` (add `fallback: "fail"` to fail instead), and `{ webgpu: false }` is `backend: "cpu-reference"`. Give `webgpu` or `backend`, not both.
- **The realm's switch:** `setWebGpuEnabled(false)` keeps every accelerator in this JavaScript realm on the CPU reference whatever callers ask: a request for `webgpu-f32` then runs the reference with `fallbackReason: "webgpu-disabled"`, or throws that reason in fail mode, and no adapter is requested. `setWebGpuEnabled(true)` is the default; `getWebGpuEnabled()` reads it. A Web Worker has its own switch. Flipping it never changes a result already computed, and an accelerator created while the switch was on keeps its device until it is disposed. This is the one place a developer turns the engine's GPU use off, for debugging, measuring or reproducing a result; every GPU path added later (#474) consults the same switch.
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
  - `signal` (an `AbortSignal`) aborts acquisition or a run. Pending GPU waits race the signal and device loss, and every buffer is destroyed when the operation settles. A device that arrives after acquisition was aborted is destroyed on arrival.
  - `dispose()` destroys the device. `state` reports `ready`, `lost` or `disposed`.
  - `maximumBandBytes` (at least 4 KiB, default min(64 MiB, the device limit)) bounds each band buffer. Each band's buffers, readback included, are destroyed before the next band, so peak GPU memory follows the band size, not the image size. Banding changes memory use only, never results. The conformance suite checks that banded and unbanded GPU output are identical.
- The package stays dependency-free and browser-safe. WebGPU typings come from TypeScript's DOM library at build time, and no WebGPU type appears in the published declarations. In Node or any runtime without `navigator.gpu`, the backend reports `webgpu-unavailable`. You can pass a worker's `navigator.gpu` explicitly through `gpu`.
- Every `webgpu-f32` accelerator reports its `adapter` (2.11, #481): the browser's `GPUAdapter.info` as `{ vendor, architecture, device, description }` (empty strings where the browser withholds them), or null without `info`. Diagnostic only.

## The three GPU entry points

The engine's GPU use has three entry points (owner's refinement of #481). Each is opt-in, each consults the realm's switch, each labels its result in the same words, and none is on by default. Captures and exports have no GPU option of their own.

| Entry point | What asks for the GPU | What it may touch | How the result is labelled |
| --- | --- | --- | --- |
| **Accelerator** `createImageKernelAccelerator({ webgpu: true })` or `{ backend: "webgpu-f32", fallback }` | The caller, per accelerator | The six typed-array operations above, on inputs the caller gives | `result.execution` (`ImageKernelExecution`): `backend`, `requestedBackend`, `fallbackReason`, `arithmetic`, `assurance`, `fast`, `errorBound`, `limitations`; `accelerator.adapter` |
| **Preview option** `prepareDisplayView(request, { gpu: "auto" \| "require", gpuDevice })` (2.11, #481) | The app, per prepared display view; default `"off"` | The display view's renders only (a GPU display-view renderer, #478, when one exists); never a capture | `diagnostics.fast.execution` (`DisplayViewExecution`): the same fields plus `gpu` (the mode), `adapter` and `conformance`; `diagnostics.fast.assurance` follows it; a GPU render adds the `view.execution` assumption |
| **Fast flag** `fast: true` on a capture request, or an option's record `fast` (#395, 2.10) | The caller, per option | A listed option's fast method; no option has one yet (#482 would route `lens.diffraction` to the GPU convolution) | `diagnostics.fast = { requested, applied, assurance }` and a `fast.<path>` assumption per fast method that ran |

**One vocabulary.** The preview option's `"auto"` is `backend: "webgpu-f32"` with `fallback: "cpu-reference"`; `"require"` is `fallback: "fail"`; `"off"` is `backend: "cpu-reference"`. `setWebGpuEnabled(false)` vetoes all three entry points before any adapter is requested: the accelerator and the preview option report `webgpu-disabled` (or throw it in fail or require mode). No environment variable reaches the engine; `PHOTIVRA_WEBGPU_*` are test-runner settings.

**Preview option rules** (`docs/DISPLAY_VIEW.md`, "Rendering on the GPU", has the detail):

- *Device.* One device per prepared view, shared by its parts. `gpuDevice` hands the view a device to share: a worker's `navigator.gpu` to acquire from, or an `ImageKernelAccelerator` whose device the view uses and leaves to its owner. Without it the engine acquires from `globalThis.navigator.gpu` and `prepared.dispose()` releases it. The request's `signal` aborts the acquisition; a render's `signal` aborts that render.
- *Fallback (`"auto"`).* The accelerator's acquisition reasons (`webgpu-unavailable`, `webgpu-disabled`, `adapter-unavailable`, `device-request-failed`, `insufficient-limits`, `unsupported-platform-endianness`), plus `unsupported-on-backend` (no GPU display-view renderer in this version, or it does not support the request), `conformance-failed` (the device failed the run-time self-check), `device-lost` (the rest of the view runs on the CPU) and `disposed`. The CPU result is the reference, labelled `backend: "cpu-reference"`, `assurance: "engine-reference"`, with the reason and, when a device was involved, the adapter.
- *Fail (`"require"`).* Each of those events throws `ImageKernelExecutionError` with that reason instead: acquisition failures from `prepareDisplayView`, later ones from `render`.
- *Conformance at run time.* Before a device's first display-view render the view runs a short self-check once: the built-in cases run the `webgpu-f32` convolution kernel on two small seeded images and compare with the float64 reference within its a-priori bound; a renderer adds its own cases. A failure keeps the whole view on the CPU, and the label records the adapter, the cases and the one that failed.
- *Single flight.* GPU renders of one prepared view run one at a time on its device; concurrent renders wait their turn rather than reject with `busy`.

## Stages

The first three stages were chosen because they cost the most CPU time per pixel. The measurements come from the 2.0 performance review (`findings-perf`, Node 24, single run), and from in-browser CPU timings taken while developing this backend (Chromium, loaded 4-core host).

| Stage | CPU reference | Measured CPU cost | GPU mapping |
| --- | --- | --- | --- |
| Isoplanatic PSF convolution | `calculateIrradianceConvolution` (new, float64) | ≈ 4 µs/px at radius 7 (225 taps), 1024×768 in Chromium: 3.2 s. 24 MP at radius 15 would take minutes. The per-site PSF path it replaces costs 19 ms to 1 s per site. | One invocation per output site; highest arithmetic intensity |
| Native capture SDR | `createNativeCaptureSdrTask` | 98–146 ns/px (Node); 24 MP in 2.7–3.5 s | Pointwise per sample |
| Packed RAW development | `createNativeRawDevelopmentTask` (typed kernel, #295) | ≈ 1.0 µs/px in Chromium on this host (1024×768: 0.8 s); 24 MP in tens of seconds | One invocation per output pixel |

Two image-formation stages were added later for #277. Their CPU references are new typed-array functions. Neither CPU-reference cost below has been benchmarked, so none is claimed:

| Stage | CPU reference | GPU mapping |
| --- | --- | --- |
| Temporal exposure sum (exposure, motion, rolling or global readout) | `calculateTemporalExposureSum` (new, float64) | One invocation per output site; K nodes × 4 bilinear taps |
| Sensor stage (seeded Poisson charge, capacity, read noise, pre-ADC limit, ADC) | `simulatePackedSensorRaw` (new, float64; bit-identical to the per-site producer) | One invocation per site; integer random streams |

Two more stages were added for #277 in 2.0, scene radiance of the engine's chart scenes and the spectral integration of that radiance (`calculateChartRadianceBatch`, see [Scene radiance on the GPU](#scene-radiance-on-the-gpu)). The per-site engine's own radiance and pupil sampling for arbitrary providers stays on the CPU. The batched CPU provider API exists (`evaluateRadianceBatch`, see [native RAW](NATIVE_RAW_AND_PRINT.md#batched-light-sampling-evaluateradiancebatch-20)); the adapter from it to the GPU chart radiance is listed as deferred.

### Supported domain (fails closed outside it)

- **SDR and RAW development:**
  - All four tone curves (2.0: the luminance curves too). `naka-rushton-luminance` needs exponent n ≥ 1 on the GPU (below 1 its ratio f(L)/L is unbounded as L → 0, so no useful bound exists there; `unsupported-on-backend`), 1/g(Lw) ≤ 2^60 and σⁿ ≥ 2^-60; `extended-reinhard-luminance` needs Lw ≥ 2^-20 (`unsupported-float32-domain` otherwise).
  - A luminance-toned sample whose value plus bound exceeds 2^100 fails closed (`unsupported-float32-domain`).
  - Only `borderHandling: "reject"`. Mirror borders (`borderHandling: "mirror"`) reject with `unsupported-on-backend`; use `cpu-reference` for them.
  - Sample magnitude times scale must stay ≤ 2^120 (`unsupported-float32-domain`).
  - In `reject-out-of-range` mode, any sample inside the float32 gamut classification band rejects with `indeterminate-float32-classification`. The backend fails closed rather than guessing whether the reference would reject.
- **RAW development** takes ownership of `input.raw` exactly like the reference task: the caller's arrays are detached. The a-priori exposed-value bound must not exceed 1.
- **Convolution:**
  - Samples must be finite, non-negative and ≤ 2^100.
  - Kernel weights must be in [0, 1], and each kernel must sum to ≤ 1 + 2^-20 (no energy creation).
  - Radius ≤ 32, ≤ 4096 patches, ≤ 4 194 304 weights, ≤ 24 MP (2.2: up to 2^27 with the input's `maximumPixels`).
- **Temporal exposure sum** (reference limits, which also bound the float32 range):
  - Samples finite, non-negative and ≤ 2^100; row weights in [0, 2^16]; 1–256 nodes; displacements within ±4096 sites; ≤ 24 MP (2.2: up to 2^27 with the input's `maximumPixels`).
- **Sensor stage:**
  - The packed input itself supports one readout regime with a uint16 ADC (≤ 16 bits), ≤ 16 read-noise components, one physical capacity for the frame, photo and dark charge, an optional fixed-pattern noise profile and up to 8 additional stored-charge components (2.0). The per-site producer allows 32 components; use `simulateSensorRawFrame` for more than 8.
  - On the GPU (`unsupported-float32-domain` otherwise): capacity ≤ 2^24 electrons (2.5: `simulateCapture`'s tier capacity, 60 000 e⁻ × pitch²/36 µm², reaches it at 100 µm, so whole-frame pitches above that need `cpu-reference`); expected photo and dark electrons (after the fixed-pattern factors) and each additional component < 2^30 per site; the deterministic components' sum < 2^30 per site; 2^-60 ≤ 1/gain ≤ 2^60 and capacity/gain ≤ 2^30; each read-noise RMS 0 or in [2^-100, 2^100], with 7·ΣRMS ≤ 2^28 electrons and ≤ 2^20 codes; |fixed-pattern readout offset| ≤ 2^28 electrons and ≤ 2^20 codes.

## Equations

**Convolution** (source-indexed, energy-conserving scatter written as a gather):

`out(x, y) = Σ_{v=-r..r} Σ_{u=-r..r} in(x − u, y − v) · K_{p(x − u, y − v)}(u, v)`

Here `p(s)` is the isoplanatic patch containing the *source* site, and `K_p(u, v)` is the fraction of that site's linear, additive quantity that lands at displacement (+u right, +v down).

- Incoherent imaging superposes intensity PSFs linearly ([MIT OpenCourseWare 2.71, lecture 22](https://ocw.mit.edu/courses/2-71-optics-spring-2009/resources/mit2_71s09_lec22/), free; isoplanatic subsections: van de Ketterij et al., [arXiv:2011.01738](https://arxiv.org/abs/2011.01738), sec. 1, free. Also see: Goodman, *Introduction to Fourier Optics*, 4th ed., 2017, §7.1).
- Treating the PSF as constant inside a patch is the declared piecewise shift-invariant approximation (isoplanatic patches; the method used by camera simulators such as ISETCam: Farrell et al., *Proc. SPIE* 8299, 2012). Patch size and kernels are the caller's declared choice.
- The grid is the whole source support. Quantity scattered outside it is lost; there is no padding or renormalization. `inputSum − outputSum` reports the loss.
- Kernels can come from the engine's sampled lens PSFs (2.0, next section); otherwise the caller supplies them. No PSF profile is inferred.

**Kernels from a lens PSF profile** (`resolveLensPsfConvolutionKernels`, schema 0.1.0):

- For each patch, the PSF is resolved with `resolveLensSampledPsf` at the patch centre's field point, in the per-site engine's own coordinates: native sensor millimetres from the optical axis (`grid.opticalAxisSite`, +Y down), field point (x, −y).
- Each PSF tap maps to a site displacement through the per-site quadrature's own inverse support (`sensorPsfSourcePoint`). Tap (kx, ky) lands at u = (kx − cx)·pₓ/sₓ, v = −(ky − cy)·p_y/s_y, where p is the PSF sample pitch and s the site pitch. When p equals s (the same number) the displacement is the tap offset itself, kx − cx and −(ky − cy), because the rounded quotient (n·p)/p can miss the integer n by one unit in the last place (2.2.1).
- **Exact site sampling** (`exactSiteSampling: true`): when every displacement is an integer, each tap's weight goes to one kernel cell. A destination whose PSF equals its patch's then gets exactly the per-site PSF quadrature with site-centre sources (tested at patch centres).
- **Labelled approximation, otherwise:** each weight is split over the four surrounding displacements with bilinear weights, the exact adjoint of bilinear interpolation. The convolution then equals the per-site quadrature applied to the bilinear interpolant of the site-centre samples (tested to 1e-12). Weights are conserved.
- **Several wavelengths:** the kernel is the weight-normalized sum of the per-wavelength kernels. For a spectrally neutral scene this is exactly the per-site engine's spectral sum when the weights are its spectral quadrature weights times the illuminant.
- The kernel radius is the smallest that holds every non-zero tap (at most 32). A smaller requested radius is rejected rather than dropping support. Each patch is accumulated in a fixed-size scratch map (radius 32), so memory stays proportional to the output; taps are added in kernel order, then the four bilinear corners. Relative pupil throughput is reported per patch and never folded into the unit-energy kernels, as in the per-site engine.
- The remaining approximation is the isoplanatic patch: one PSF per patch, indexed by the source site. Its method error is measured in the [per-fixture rollout](#per-fixture-rollout-method-error), not bounded.

**SDR** is exactly the `calculateSdrRendering` chain in the same order: rendering exposure, then per-channel tone, then gamut handling, then the sRGB transfer (W3C CSS Color 4; also IEC 61966-2-1), then nearest-ties-up quantization.

**RAW development** follows `raw-development-kernel.ts` and `prepareSensorColorDevelopment`:

1. Site normalization: a site is 1 when it is flagged or at/above its phase white level. Otherwise it is `(code − black)/(white − black)`, evaluated in float64 on the host and rounded once to float32.
2. CFA kernel sums, in declared contribution order.
3. Applied WB gains.
4. Highlight handling: clip at the smallest gain, or the declared neutral blend above 0.8.
5. Camera→XYZ, then XYZ→linear sRGB, in the documented row order.
6. The SDR chain above.

**Luminance tone curves** (2.0) follow `prepareSdrPixelTone`: when L = kr·r + kg·g + kb·b > 0 (the linear-sRGB/D65 luminance row), every component of the pixel is scaled by h(L) = f(L)/L; otherwise the pixel is unchanged. The kernel evaluates h directly, in a form algebraically equal to f(L)/L:

- extended Reinhard: h = (1 + L/Lw²)/(1 + L);
- Naka–Rushton: h = (1/g(Lw)) / (L·(1 + P)), P = (σ/L)ⁿ = exp2(n·log2(σ/L)); for P ≥ 1 the equal form (1/g(Lw))·P⁻¹/(L·(1 + P⁻¹)) keeps every intermediate finite.

The SDR kernel runs one invocation per pixel for these curves; RAW development applies them after XYZ → linear sRGB, as the reference does.

A saturated site normalizes to exactly 1, while every unsaturated value is ≤ 1 − 1/65535. The GPU can therefore detect saturated contributing sites exactly, so `highlight.saturatedPixelCount` is exact.

**Temporal exposure sum** (`calculateTemporalExposureSum`, schema 0.1.0):

`out(x, y) = Σ_k w_k(y) · E₀(x − dx_k, y − dy_k)`

- A site's exposure is the time integral of its rate over its own exposure window, H = ∫ E dt ([EMVA Standard 1288 Release 4.0 Linear](https://www.emva.org/wp-content/uploads/EMVA1288Linear_4.0Release.pdf), §2, free; [CIPA DC-004](https://www.cipa.jp/e/std/std-sec.html), §5.5, free).
- If the image translates rigidly by d(t), then E(x, t) = E₀(x − d(t)). A quadrature with nodes t_k and weights w_k gives the sum above. Motion blur is this superposition of displaced images (Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed., 2022, [free from the author](https://szeliski.org/Book/)).
- Row-dependent weights give a rolling shutter: each row starts and ends its exposure at a different time (Meingast, Geyer & Sastry, [arXiv:cs/0503076](https://arxiv.org/abs/cs/0503076), free). A global shutter uses the same weights on every row.
- **Declared approximations, owned by the caller:** the quadrature nodes and weights, and rigid translation (no rotation, warp or occlusion).
- **Labelled approximation:** a sub-site displacement uses bilinear interpolation between the four nearest site centres. This is linear interpolation, slightly low-pass, not exact resampling. Integer displacements need no interpolation (`plan.integerDisplacements`).
- Sources outside the grid are zero. There is no padding or renormalization.
- Summation order, shared with the WGSL kernel: node ascending, then taps 00, 10, 01, 11 left to right, then times the row weight.

**Sensor stage** (`simulatePackedSensorRaw`, schema 0.1.0, noise model `photivra-native-raw-noise` 0.4.0):

- **Equations:** the per-site producer's sensor steps on typed arrays, in its exact operation order (`calculateNativeRawSite`):
  1. Poisson photo and dark draws from the charge stream. With a fixed-pattern profile (`SENSOR_FIXED_PATTERN_NOISE_MODEL` 1.0.0) the means are first multiplied by the site's PRNU gain and DSNU or hot-pixel dark factor (`calculateSensorFixedPatternSite`, at colour-sampling site = native site + `fixedPatternNoise.siteOrigin`). Then each additional stored-charge component in declaration order: a Poisson draw from the same stream, or its deterministic expectation. The total is photo + dark + (sum of the components);
  2. min(realized, capacity);
  3. Box–Muller read noise from the read-noise stream, plus the fixed-pattern row and column offsets;
  4. the pre-ADC limit;
  5. `adcTransfer`: (signal/gain + black + INL), rounded half up, optional digital gain;
  6. the final clamp.
- **Seeds:** per-site stream seeds are MurmurHash3_x86_32 of (capture seed, absolute native row-major index, stream 0 or 1). A region or band never changes a code.
- **Reference identity:** for the same expected electrons and regime, the codes and saturation flags equal the per-site engine's bit for bit. `test/packed-sensor-raw.test.ts` checks this against `calculateNativeRawSite` for 160 sites in each of three regimes, covering INL, digital gain, fractional capacity and all four sampler branches (zero, multiplication, PTRS, normal approximation).
- The science and its sources are unchanged from the per-site model; see [Motion and signal](MOTION_AND_SIGNAL.md).

**How the GPU sensor stage reproduces the seeded noise:**

- **Integer state:** the MurmurHash3 seeds, the fmix32 scrambling and the xorshift32 streams are 32-bit integer arithmetic, so every random state is bit-identical to the reference.
- **Exact comparisons:** a comparison of a uniform value with a constant, or with another uniform value, is made exactly on the integer state. The reference's values there are exact dyadic rationals. This covers PTRS `uS ≥ 0.07`, `uS < 0.013` and `v > uS`.
- **Other decisions, with a bound:** every other decision is evaluated in float32 together with an a-priori bound on its distance from the float64 reference value. These are the multiplication-method threshold, the PTRS floor and acceptance tests, the physical and pre-ADC limits, and ADC and digital-gain rounding. A site where any decision falls inside its bound is **flagged**.
- **Accuracy techniques:**
  - PTRS's log-probability test is evaluated as k·g(t) − ½ ln k − ½ ln 2π − R(k), with g(t) = ln(1 + t) − t and t = (mean − k)/k. This is algebraically identical to the reference's −mean + k ln mean − log k! and avoids its cancellation. R(k) is the reference's own log k! minus Stirling's leading terms, tabulated in float64 for k < 256.
  - The ADC input (signal/gain + black) is formed as an exact integer part plus a float32 fraction. The host splits 1/gain and the digital gain (float64) into four 12-bit pieces m_j·2^(s_j) and sends m_j, s_j and 2^(s_j); the kernel multiplies the 12-bit halves of the integer signal by m_j in 32-bit integer arithmetic, shifts the integer part out and converts the masked low bits times 2^(s_j) to an exact float32 fraction below 1. No floating-point split can be broken by the evaluation order, and the kernel divides nowhere on this path (#471).
  - The INL offset is ao + (code − ac)·slope with the segment slopes computed on the host in float64, so the kernel does not divide there either.
  - WGSL's built-in `cos` has only a 2^-11 absolute bound, so the kernel uses its own octant-reduced Taylor polynomials.
- **Branch selection:** the zero and Poisson-branch categories (< 30, < 1e9, normal) are computed on the host in float64, so the GPU always takes the reference's branch. Means of 1e9 and above always exceed the capacity bound of 2^24, so their exact draw cannot change a code. Partial charge sums saturate at 2^30 on the GPU, above every supported capacity, so saturating cannot change a decision either.
- **Fixed-pattern noise and additional charge (2.0), same guarantee:**
  - The host evaluates every site's fixed-pattern values in float64 with the model's own functions (row and column offsets once per row and column). It packs the Poisson means already multiplied by the factors, which are exactly the reference's float64 products, so the Poisson branch and draws are unchanged.
  - The readout offset enters twice, both formed in float64 on the host: the pre-ADC test becomes afterPhysical − (threshold − offset) + noise > 0, and the ADC input gains offset/gain as an exact integer part plus a float32 fraction. Their bounds add the reference's own float64 rounding of the offset sum (2^-47 relative slack, as for the other terms) and the fraction's float32 rounding.
  - Deterministic components make the stored charge non-integer. Their sum enters as an exact integer part plus a float32 fraction, and the capacity test becomes a float32 difference with its own bound (both fractions' roundings and the reference's rounding of the total), so a near-tie at the capacity is flagged.
  - With either feature, the noise-free exact-tie mode is off, so every ADC rounding decision carries its bound.

## Scene radiance on the GPU

`accelerator.evaluateChartRadiance(input)` (2.0) answers many radiance queries on the engine's procedural chart scenes in one call. The float64 reference is `calculateChartRadianceBatch` (schema 0.1.0), and the query shape mirrors a batched provider: queries in, results in the same order.

- **Queries:** frame points (u right, v up, as in `resolveChartScene`), with either one wavelength index per point (spectral radiance in W·m⁻²·sr⁻¹·nm⁻¹) or 1–4 rows of channel weights over 1–256 wavelengths (the spectral integral Σ_j w_cj·L(u, v, λ_j), summed in wavelength order). `mapEnvironmentDirectionsToChartPoints` turns environment-direction queries into frame points exactly as the planar provider's `evaluateRadiance` does.
- **Reference:** every value comes from the planar provider's own `radianceAt`: a Lambertian reflectance ρ(λ) under the scaled illuminant, L = ρ·k·S(λ)/π (see `createPlanarSceneRadianceProvider`).
- **How the GPU evaluates it:** the charts are uniform-illuminant Lambertian patterns, so a query's value depends only on its material and wavelength (or channel). The host computes each material's value in float64 with the reference's own operations and order. The GPU classifies each point's material in float32 and reads the table.
- **Classification bounds:** every decision (half-plane, disk, sector, cell and gap boundaries) carries an a-priori bound on the distance between the float32 decision value and the float64 reference value. The bound covers the point's float32 rounding, each float32 operation (ε = 2^-23, one WGSL rounding in either direction; see [Error bounds](#error-bounds-a-priori-reported-per-result)), the constants' float32 rounding and the reference's own float64 rounding (10^-14 relative slack). A point within four times its bound of a boundary is flagged.
- **Siemens star without `atan2`:** the sector boundaries b_k = π(k/cycles − 1) are directions (cos b_k, sin b_k) computed on the host in float64 and rounded once to float32. The sign of v picks the half-plane (v ≥ 0: boundaries cycles … 2·cycles; v < 0: 0 … cycles), where sign(v·cos b_k − u·sin b_k) = sign(θ − b_k), so a binary search over the half-plane's boundaries on these cross-product signs finds the sector; the two enclosing cross products then carry the bound ε·(3|v·cos b| + 3|u·sin b| + |d|) + 10^-14·(|u| + |v|): the point's and the direction's float32 roundings, the two products and the difference, the reference's float64 `atan2`, division and scaling (≤ 2.8·10^-15·ρ) and the float64 rounding of b_k. The kernel evaluates no transcendental function, so neither WGSL's 4096-ULP `atan2` bound nor the realm's float64 `Math.atan2` enters. A point on the u-axis (v = ±0) or on the ±π cut lies on boundary cycles or 0/2·cycles and is flagged by those checks.
- **The reference depends on the realm's `Math.atan2`.** ECMAScript does not fix the last bit of `Math.atan2`, and Node 24 and Chrome 153 differ by one ulp for some arguments. For a point placed exactly on a sector boundary the reference's `floor(phase · 2 · cycles)` can therefore fall on either side in different realms (#471: the conformance suite's point 60 039 classified light in Node and dark in the browser, on SwiftShader and on Metal alike). The GPU flags such points and recomputes them with the reference of its own realm, so a `webgpu-f32` result equals `cpu-reference` in the realm that produced it; the conformance suite compares against the browser realm's reference and reports the realm differences (all of them boundary points).
- **Flagged points are recomputed on the host** with the reference (`hostRecomputedQueryIndices`), and so are points whose material spectrum fails, which then raise the reference's own error.
- **Bound (`relative-to-reference`):** every value, flagged or not, is the reference value rounded once to float32: |v_gpu − v_ref| ≤ 2^-24·|v_ref| + 2^-126. This holds for negative channel weights too.
- **Domain (`unsupported-float32-domain` otherwise):** |u|, |v| ≤ 2^20 frame units; table values ≤ 2^120.
- **Presets (2.3):** the kernel classifies the eight 2.0 presets, a Siemens star only with the bar profile. The 2.3 chart elements (`dead-leaves`, `bar-groups`, `hyperbolic-wedge`, `zone-plate`, `slanted-squares`, `line-grid`, `fiducial`), `composite` charts and the sine star reject with `unsupported-on-backend`; use `cpu-reference` for them. Why: their continuous profiles need WGSL `sin`, `cos` and `atan2`, whose accuracy bounds (absolute 2^-11 for `sin`/`cos`, 4096 ULP for `atan2`) are wider than many of the 1024 level steps, so a large share of points would be flagged for host recomputation; dead leaves, bar groups and composites need per-element tables and loops that have not been written and measured on a device. The float64 reference (`calculateChartRadianceBatch`) covers every preset.
- **Measured on SwiftShader** (`test/webgpu/stages.webgpu.ts`, all eight presets, 60 000 random points plus boundary points, radiance and three-channel integration; Chrome for Testing 153 after #471): every value equalled the browser realm's reference rounded once to float32 (largest relative difference 5.9e-8). Boundary points were flagged and recomputed as designed (275 of the star's 60 219 points). Random points were recomputed at most 3 in 60 000 times, except for the 1024-level grey ramp (81 in 60 000; 42 before the margins were written in ε). One realm difference, the star boundary point of #471, was a flagged boundary point.

## Display view (Speed) on the GPU

The display view's Speed path (#478: the exact area mean without diffraction, with the bilinear demosaic and chart materials; `docs/DISPLAY_VIEW.md`) has a WGSL kernel, `src/gpu/wgsl-display-view-speed-kernel.ts`, with its host side in `src/gpu/display-view-speed-gpu.ts`. It is internal and implements the renderer contract of #481 (`DisplayViewGpuRenderer`: `createDisplayViewSpeedGpuRenderer`, `displayViewSpeedGpuRendererFactory`); the GPU session module (`display-view-gpu-session.ts`, loaded when a prepared view first asks for the GPU) registers it unless a caller registered a renderer before, so `prepareDisplayView(request, { gpu: "auto" })` renders the chart presets it covers on the device after the run-time self-check and runs the CPU reference, labelled, for everything else (see "What remains" below). The float64 reference is `renderDisplayView`.

**What one invocation computes**, per display pixel, in float32 and in the reference's operation order where the order matters:

1. the real pixels the footprint covers and their overlap weights a_j = w_j / A: the host computes the 1-D overlaps divided by the scale and the closed-form axis sums of B_c divided by the squared scale in float64 (`overlaps`, `axisSums`), the kernel multiplies the two axes;
2. for every native site the footprint's real pixels read (the footprint plus one site of reach, each site once): the scene material at the pixel aperture's query offsets (the 2 × 2 box: four points) through the **material module** (`material_at`), the material's channel signal Σ_λ A_c(λ)·L_m(λ) from a table the host computed in float64 (`materialSignalDirect`'s sum), summed over the offsets in `directSite`'s order, plus the dark electrons; the query point of offset o at site (x, y) is (x + 0.5 + o_x − W/2)·g, formed as an exact float32 sum times a float64 scale rounded once (two roundings, ≤ 2E relative), and the host checks that model against the reference's own `queryPoint` at the frame's four corners (2^-40) and refuses a request it does not describe;
3. the readout moments (mean k·e, variance k²·e + c₀, third cumulant k³·e) and the clip at the white level;
4. per real pixel the bilinear kernels (weights, Σw² and 1/Σw² from the host), white balance and the highlight clip, the colour matrix, the tone curve (identity, or positive Reinhard by the reference's 4 × 16-point Gauss–Legendre rule with the host's nodes) and the clip to [0, 1] with the first-order skewness term;
5. the display pixel's expected value Σ_j a_j·E[L_j], the linear (Stein) covariance Σ_c B_c·σ_c²·a_c·a_cᵀ and the independent residual Σ_j a_j²·max(0, Var − aᵀCa).

It writes, per display pixel, the three means, the three variances (linear plus residual), the three covariances and two running bound terms (below), plus a flag when a query point's classification was uncertain. The whole region is one dispatch when it fits the band (`maximumBandBytes`, 48 bytes per display pixel: the app's 2028 × 1352 view needs 132 MB, so it is one dispatch with a 256 MiB band and two with the 64 MiB default); banding never changes a byte (tested).

**The clipped-normal moments without cancellation.** The reference forms Var = E[Y²] − E[Y]² in float64; in float32 that subtraction loses the variance wherever the mean is far above the noise (m ≈ 1, s ≈ 10⁻³: an error of 5 % at the first attempt). The kernel evaluates algebraically equal forms in standardized units: for min(Y, t), Var = v·(Φ − zφ + z²Q − δ²) with z = (t − m)/s, Q = 1 − Φ and δ = φ − zQ; for clip(Y, 0, 1), with Z standard normal and g = clip(Z, a, b), E[g] = aΦ_a + φ_a − φ_b + bQ_b and E[g²] = a²Φ_a + (Φ_b − Φ_a) − (bφ_b − aφ_a) + b²Q_b, so E[W] = m + s·E[g] and Var = v·(E[g²] − E[g]²). The reference adds its Edgeworth skewness shift to E[Y] *before* squaring, so its variance also carries −shift·(2·E[Y] + shift); the kernel adds the same term. The Reinhard quadrature's nodes are formed in standardized units (z_k directly, x = m + s·z_k, weight = zhalf·w_k·φ(z_k)), which is the reference's weight half·w_k·φ((x − m)/s)/s without the cancellation x − m, and its variance is accumulated about h(m) (a shift, exact for normalized weights; the Gauss–Legendre weights sum to 1 − ε with ε from the quadrature of φ over ±8.5σ, below 10⁻¹² in a scan of the panel layouts).

**The material module (the seam of #477).** `DisplayViewGpuMaterialModule` is WGSL that defines `fn material_at(p: vec2<f32>) -> u32` and `var<private> material_uncertain: bool`, with its buffers in `@group(1)`; it must flag a point within its bound of a material boundary, the point carrying ≤ 2E + 10⁻¹⁴ relative error. The display pixel of a flagged point is **recomputed on the host** with the reference (a one-pixel region render of `renderDisplayView`, which is byte-identical to the whole view's pixel: tested), so flagged pixels are exact. `display-view-chart-material-module.ts` supplies the module for the eight 2.0 chart presets by reusing the chart kernel's own classification (`wgsl-chart-kernel.ts`, its `material` function renamed and bound at group 1) with its SAFETY factor doubled from 4 to 8 for the second rounding of the point. The composite chart, label masks and caller material functions are #477's module; `supports()` refuses them (`unsupported-on-backend`), and so does a framed chart whose surround adds a material the chart does not have.

**The noise draw: on the host, bit for bit.** Three choices were open: draw z on the GPU from the integer streams, draw on the host, or draw on the host and finish on the GPU. The CPU's draw is `samplePortableStandardNormal` (`createDeterministicUniformStream(deriveNativeSiteStreamSeedUint32(seed, index, 33))`, two uniforms, the portable float64 log and cos in double-double), so a float32 Box–Muller on the GPU reproduces the uniforms' bits but not the normal's; only a host draw is bit-identical, and the kernel therefore ends at the moments. The host then runs the reference's own finishing per display pixel (`finishDisplayViewPixel`: the output quantization term `quantizationVariance`, the three draws, the Cholesky factor, `clipCentre`, `encodeSrgbComponentPortable` and the rounding, the same float64 functions in the same order), so the only approximation in a sample is the moments' bound; a sample equals the CPU's except where that bounded difference crosses a code boundary (at most one code; 0–3 of 82 215 samples in the small fixtures, 35 of 8.2 million at 2028 × 1352). **Measured cost of the host finishing** (Node 24, this 4-vCPU host, one thread, 2.74 million display pixels): 1.22 µs per display pixel, 3.36 s for a whole 2028 × 1352 view (of which the three draws 0.28 µs, the three encodes 0.22 µs and the quantization term's three `portablePow` evaluations 0.56 µs per pixel; `clipCentre`'s bisection, 4.2 µs, runs only where the noise reaches 0 or 1). That is a floor on the whole-view time of this design whatever the GPU takes (the CPU reference takes 39 s here); it parallelizes over the app's parts and workers, and two reductions are open without touching the draw: the quantization term on the GPU (its pow has the 2^-17 bound) and the encode on the GPU with the drawn z uploaded (12 bytes per pixel), leaving 0.28 µs per pixel on the host. Neither is built.

**Error bounds (a priori; `relative-to-reference` for the expected value, reported in `execution.errorBound`; the variance's in `varianceBound`).** E = 2⁻²³, one WGSL rounding of + − × in either direction (the table fixes no rounding direction; #471, #487), γ_k = k·E/(1 − k·E); division 2.5 ULP, sqrt ≤ 4.5 ULP, exp 3 + 2|x| ULP; no trigonometric built-in is used. Every bound is doubled (`MARGIN`).

| Step | Form | Roundings or bound |
| --- | --- | --- |
| Site table value, offset sum, dark | non-negative products and sums | table rounding 1, 4 products, 3 sums, dark 1: γ_9 |
| Readout mean k·e; variance k²e + c₀; κ₃ | non-negative | γ_11; γ_13; γ_13 |
| Demosaic Σ w·mean over ≤ 4 taps (weights exact) | non-negative | γ_15 (variance: squares, γ_17) |
| White balance g·m, highlight clip, matrix Σ r·m | g, r rounded once | γ_17; γ_21 (variance γ_25) |
| Weights a_j = (w_x/s_x)·(w_y/s_y) (host float64, two roundings) and the sum over ≤ 36 real pixels | non-negative | γ_3 + 35 additions |
| **Expected value, relative** | all of the above | γ_64 + 2⁻⁴⁰ (the reference's own float64 chains); + 256E with Reinhard (below) |
| **Variance, relative** | the squared chains | γ_80 + 2⁻⁴⁰; + 512E with Reinhard |
| φ(z) = 0.3989·exp(−z²/2), |z| ≤ 8.5 | z carries 8E (subtraction, sqrt 4.5 ULP, division 2.5 ULP) | |Δφ| ≤ φ·(16E·z² + 76E) ≤ 31E absolute (its maximum over z) |
| Q(z) by Abramowitz–Stegun 26.2.17 (t = 1/(1 + 0.2316x), a degree-5 Horner polynomial) | t: 13.5E relative; polynomial: |p′| ≤ 14.7 on [0, 1], evaluation 40E, coefficients 6E | |ΔQ| ≤ 147E absolute; Φ = 1 − Q the same |
| Clipped mean m − s·δ, δ = φ − zQ | |Δδ| ≤ 31E + 8.5·147E + 8.5·8E + 2E | ≤ 1 350E in units of s: **CLIP_MEAN_U = 1 400** (in units of E) per clip side (the reference's inputs enter through the 1-Lipschitz clip and |∂/∂s| ≤ 8.9, folded into the relative term) |
| Clipped variance v·(Φ − zφ + z²Q − δ²) | 148E + 267E + 72.25·147E + 2·8E·72.25 + 2·8.9·1 350E | ≤ 36 000E in units of v: **CLIP_VARIANCE_U = 36 000** per clip side |
| Two-sided clip to [0, 1] | both sides | 2 × the above |
| Reinhard quadrature (64 nodes, weights ∝ φ(z_k)) | weight error w_k(16E·z_k² + 80E), Σ w_k z_k² = 1 (the second moment of Z); 64-term sums γ_66 | ≤ 176E relative on the mean, declared 256E; 512E on the variance; the shift ε < 10⁻¹² |
| Flagged material lookups | — | recomputed on the host: exact |

The clip terms are absolute in units of each clipped quantity's standard deviation (or variance) and propagate through weights that sum to one (demosaic, footprint), the gains and the matrix's absolute row sums; the kernel evaluates them per display pixel from its own float32 values as it goes (a fixed formula, as the luminance tone curves' running bound) and the host reports the largest term as `errorBound.absolute` and `varianceBound.absolute`, keeping every pixel's term for the tests (`expectedValueAbsoluteBound`, `varianceAbsoluteBound`). A pixel whose clips never act has a zero absolute term and only the relative bound: 2·γ_64 ≈ 1.5 × 10⁻⁵ of the value, about 0.004 of an 8-bit code at mid grey.

**Measured agreement with the CPU reference**, per display pixel, every component inside its bound (the bound's largest fraction used: 4.1 % for the expected value, 4.0 % for the variance). ΔE2000 is between the GPU's and the CPU's expected values (linear sRGB clipped to [0, 1] → XYZ by the capture colour model → CIELAB, D65); σ units are |ΔE|/σ_cpu per component.

| Fixture (600 × 400 frame of 6 µm sites, 2 × 2 box, 203 × 135 view, 82 215 components) | ΔE2000 max / RMS | σ units max / RMS | σ relative max | Samples differing (≤ 1 code) | Flagged, recomputed |
| --- | --- | --- | --- | --- | --- |
| Slanted edge, ISO 100 | 2.3e-5 / 9.4e-6 | 7.0e-5 / 1.7e-5 | 2.9e-7 | 1 | 0 |
| Siemens star (bar), ISO 100 | 4.2e-5 / — | 9.2e-5 / — | 2.7e-6 | 1 | 597 (points exactly on the diagonals) |
| Step wedge, ISO 100 | 3.8e-5 / — | 8.2e-5 / — | 3.0e-7 | 0 | 0 |
| Checkerboard, ISO 100 | 4.3e-5 / — | 9.3e-5 / — | 4.0e-7 | 2 | 0 |
| Spectral patches, ISO 100 | 3.9e-5 / — | 9.1e-5 / — | 3.0e-7 | 0 | 0 |
| Step wedge at the white clip (1/15 s) | 3.6e-5 / — | 3.3e-4 / — | 2.9e-4 | 0 | 0 |
| Step wedge at ISO 6400 | 3.8e-5 / — | 1.0e-5 / — | 3.0e-7 | 1 | 0 |
| Step wedge, Reinhard | 2.6e-5 / — | 2.5e-4 / — | 5.9e-6 | 3 | 0 |
| Uniform 18 % grey | 2.2e-5 / — | 3.7e-5 / — | 3.0e-7 | 1 | 0 |
| **Checkerboard, 24 MP 6 µm 6000 × 4000, 2028 × 1352 (8.2 million components)** | 4.2e-5 / 1.0e-5 | 1.0e-4 / 1.9e-5 | 3.4e-7 | 35 | 0 |

The same numbers come from the float32 JavaScript emulation of the kernel (`test/helpers/fake-webgpu-display-view.ts`, every CI run: `test/display-view-speed-gpu.test.ts`, and the 2028 × 1352 fixture in `test/display-view-speed-gpu-full.test.ts`, 63 s on this host of which 39 s is the CPU reference) and from SwiftShader (`test/webgpu/display-view.webgpu.ts`, Chromium 141 headless, the small fixtures: the largest differences agree with the emulation's to the digits shown, so the emulation describes the device). On SwiftShader the browser's own CPU reference equals Node's bytes except on the Siemens star (81 of 82 215 samples: Chromium's `Math.atan2` in the star's geometry, docs/DISPLAY_VIEW.md "Same bytes in every engine"), so the device is compared with the reference of its own realm. The run-time self-check case of the renderer (`display-view:speed:checkerboard-13x9`, a 38 × 26 checkerboard with light squares at the white clip against `renderDisplayView` within the bounds) passes on the emulation and on SwiftShader.

**Timing: unmeasured.** No GPU time is recorded for this kernel; SwiftShader took 1.3–1.6 s per 203 × 135 view (27 405 display pixels, including upload, readback and the host finishing) on this loaded host, which says nothing about a GPU. The gain over the CPU pool is TBD-TIMING until the owner's hardware run (#475):

```sh
PHOTIVRA_WEBGPU_REQUIRED=1 npm run test:webgpu -- test/webgpu/display-view.webgpu.ts   # SwiftShader: accuracy, and the software-adapter times in the report
npm run test:webgpu:hardware -- test/webgpu/display-view.webgpu.ts                      # the same on a hardware adapter (refuses SwiftShader); `softwareAdapterMilliseconds` is then the device's time
```

The report line `[test:webgpu display-view]` lists the adapter, per fixture the agreement and the wall-clock milliseconds of one render (upload, dispatch, readback and host finishing); a whole 2028 × 1352 view is `test/display-view-speed-gpu-full.test.ts` on the emulation and, for the device, the same request through `displayViewSpeed` of `test/webgpu/page-runner.ts` (not in the suite: 24 MP in the browser also runs the CPU reference there). Record the numbers on #277 and #478 with the GPU model, driver, browser and OS.

**What remains for the integration.** The composite-chart and label-mask material module of #477 (the request shape of the app is a caller material function, which `supports()` refuses today); the stand-in module's host recomputation of flagged pixels costs one CPU pixel each (597 of 27 405 on the star's diagonals); the host finishing's 1.2 µs per display pixel and its two possible reductions above; views coarser than the exact area mean (the stratified estimator) and footprints of more than 6 real pixels per axis refuse with `unsupported-on-backend`; AHD, diffraction and the four-spot filter are the Quality kernel (#479).

## Error bounds (a priori, reported per result)

**Assumptions: the WGSL accuracy table.** The bounds assume a device that meets the W3C WebGPU Shading Language specification, §15.7 *Floating Point Evaluation* ([W3C Candidate Recommendation Draft, 26 October 2026](https://www.w3.org/TR/WGSL/#floating-point-evaluation); the table is §15.7.4 *Floating Point Accuracy*, the ULP definition follows Muller 2005), and nothing more:

- WGSL specifies no rounding mode: a *correctly rounded* operation returns one of the two float32 neighbours of the exact result, up or down. One operation is therefore within one ULP, that is within **ε = 2^-23** relative (ULP(x) ≤ 2^-23·|x|). This applies to `+ − ×`, `floor`, `round`, `fma` as a product and a sum, and the conversions `f32(u32)`, `f32(i32)`.
- `x / y`: 2.5 ULP for |y| in [2^-126, 2^126], so ≤ 2.5ε relative. `sqrt(x)`: inherited from `1.0 / inverseSqrt(x)` with `inverseSqrt` at 2 ULP, so ≤ 4.5ε. `exp(x)`: (3 + 2|x|) ULP. `log(x)`: 2^-21 absolute on [0.5, 2], 3 ULP outside. `atan2`: 4096 ULP. `cos`, `sin`: 2^-11 absolute on [−π, π]. `pow`: inherited from `exp2(y·log2(x))`. The kernels use none of `atan2`, `cos`, `sin`; `pow` enters only the sRGB transfer, whose bound is stated separately below.
- An implementation **may reassociate** floating-point operations (§15.7.5), and may fuse a multiply and an add when the result is at least as accurate. Subnormal inputs and outputs may be flushed to zero.

Let γ_k = k·u/(1 − k·u) with u = 2^-24. These are the standard forward-error bounds for recursive summation and dot products (Rump & Jeannerod, *SIAM J. Matrix Anal. Appl.* 35(2), 2014, sec. 1, [free author copy](https://www.tuhh.de/ti3/paper/rump/RuJea13.pdf). Also see: Higham, *Accuracy and Stability of Numerical Algorithms*, 2nd ed., SIAM 2002, §2–§4; the summation bound of §4.2 holds for any order of the additions). The convolution, temporal-sum, SDR and RAW-development bounds below are written with u = 2^-24, the unit roundoff of round-to-nearest; on a device that rounds in another direction, the same derivations hold with u replaced by ε = 2^-23. Every device measured so far rounds `+ − ×` to nearest. The sensor-stage and chart margins are written directly in ε (next section, [Sensor-stage margins](#sensor-stage-margins-derivation)).

- **Convolution (`relative-to-reference`).** Every term is non-negative, so for every sample `|v_gpu − v_ref| ≤ (γ_{T+3} + 2^-40)·v_ref + 2·T·2^-126 + 2·S_max·Σ_t max_p w̃_{p,t}`, where T = (2r+1)² taps. The three extra roundings cover the f32 conversion of the sample, the weight and the product. The 2·T·2^-126 term covers subnormal flush-to-zero of samples and products.
  - The last term covers kernel weights below the float32 normal range. w̃_{p,t} is weight t of patch p when it lies in (0, 2^-126), and 0 otherwise; S_max is the largest input sample. The host conversion can round such a weight to zero or to a subnormal (an error of at most w), and the GPU may flush it, so the whole product w·s is at risk. The factor 2 covers that and the later roundings. The term is 0 when no weight lies in that range, so ordinary kernels keep the bound above. Gaussian tails do reach this range (the conformance corpora have weights near 10^-108), so the backend widens the bound instead of rejecting them.
- **Integer codes (`integer-code-difference`).** If the float32 linear value entering the transfer is within δ_L of the reference, then `|Δcode| ≤ ⌊max·(12.92·δ_L + δ_E)⌋ + 1`, capped at the code maximum.
  - 12.92 is the largest slope of the sRGB encode on [0, 1].
  - δ_E = 2^-17 is the declared bound on the WGSL encode. The worst case derived from the WGSL `log2`/`exp2` accuracy is about 2.5e-6, so the bound keeps a 3× margin. The sRGB segment join is discontinuous by only −2.85e-8.
  - **SDR:** δ_L = γ_6, so the bound is 1 code at 8 and 16 bits.
  - **RAW development:** δ_L is propagated through every step (channel sums γ_{n+2}, gains, clip or blend, two 3×3 products, exposure), using the run's largest normalized site magnitude, Σ|w|, the largest gain and the ∞-norms of both matrices. It is therefore input-dependent. For example, it was 1 code at 8 bits and 12–67 codes at 16 bits on the conformance corpora.
- **Luminance tone curves (`integer-code-difference`, a running bound).** The bound has the same form, with δ_L the largest per-sample linear bound of the run. The per-sample formula below is fixed in advance, but unlike the other stages its value is known only after the run: the kernel evaluates it from each pixel's own float32 values (a running error bound), inflated (×1.001, and ×1.01 on the factors) so that the float32 evaluation can only over-estimate, and collects the largest value with an atomic maximum. Every term is a non-negative bound in terms of the computed values, so the result is still a rigorous bound for every sample:
  - Inputs: each exposed component carries a bound ε (SDR: 4u·|e| for the source, scale and product roundings and the reference's own; RAW development: the propagated development bound). The luminance then carries λ = Σk·ε + 6u·Σk|e| (coefficient rounding, products and additions).
  - Branch: the reference maps a pixel only if L > 0. When |L̃| > 2λ both sides take the same branch. Inside that band either branch may run, and the bound covers both: 2(|e| + ε)(1 + sup h) over (0, 3λ], where sup h is max(1, 1/Lw²) for extended Reinhard and (1/g(Lw))·(3λ)^(n−1)/σⁿ for Naka–Rushton with n ≥ 1.
  - Mapped pixels: |m_gpu − m| ≤ H·ε·(1 + Fq) + (|e| + ε)·(H·(η + Fq) + a) + 2u|m|, where H bounds h(L̃), η and a are the relative and absolute errors of evaluating h in float32, q = λ/L̃ ≤ 1/2, and F = ((1 + q)/(1 − q))^T/(1 − q) bounds h's change over [L̃ − λ, L̃ + λ]. T bounds h's elasticity |d ln h/d ln L|: 1 for extended Reinhard, max(1, n − 1) for Naka–Rushton.
  - η: 14u for extended Reinhard, counting WGSL division as 2.5 ULP. For Naka–Rushton, η = 2ρ + 16u, where ρ is the relative error of P from the WGSL `log2` (2^-21 absolute or 3 ULP) and `exp2` (3 + 2|z| ULP) entries, plus slack for the reference's float64 `pow`. Below 2^-120 the power may flush to zero, which adds an absolute term.
  - Clipping is 1-Lipschitz, and a sample whose interval [m − δ, m + δ] lies entirely above 1 or below 0 contributes 0. In reject mode, a sample whose interval straddles 0 or 1 fails closed (`indeterminate-float32-classification`).
  - So the bound is tight for ordinary colours: 1 code at 8 bits and 3–30 codes at 16 bits on the conformance corpora. It grows near L = 0 when components have mixed signs (18–102 codes at 8 bits on the mixed-sign corpus), and with the absolute development bound in RAW development (152–1652 codes at 16 bits on random RAW codes). Measured differences were at most 1 code everywhere.
- **Diagnostics.** A sample is *uncertain* when its float32 value lies inside a classification band where float32 and float64 decisions can differ:
  - near 0 or 1, in band δ_e;
  - tiny positive Reinhard inputs below 2^-20;
  - zero results from non-zero sources (underflow);
  - the WB-clip level or the 0.8 reconstruction start (RAW);
  - luminance curves: a ratio h within its bound of 1 (the tone-changed count), a luminance inside its branch band, or a toned value whose bound interval straddles 0 or 1.

  Every diagnostic count then differs from the reference by at most `diagnosticUncertaintySampleCount`. When that count is 0, `diagnosticsExact` is true and the counts equal the reference.
- **Temporal exposure sum (`relative-to-reference`).** Every term is non-negative and carries at most K + 7 roundings (sample, bilinear weight, their product, three inner additions, row weight, its product, K − 1 outer additions). So `|v_gpu − v_ref| ≤ (γ_{K+8} + 2^-40)·v_ref + K·(8·w_max + 2)·2^-126 + R`, where K is the node count and w_max the largest row weight.
  - R covers weights below the float32 normal range, for the same reason as the convolution's last term: `R = 2·S_max·Σ_k (max_y ρ̃_k(y) + w_max·Σ_j β̃_{k,j})`. Here ρ̃_k(y) is node k's row weight for row y and β̃_{k,j} its four bilinear weights, each counted only when it lies in (0, 2^-126). R is 0 when no weight lies in that range.
- **Sensor stage (`exact-except-flagged-sites`).** Not a numeric tolerance. Every unflagged site has exactly the reference code and saturation flags. Only flagged sites (`errorBound.flaggedSiteCount`, listed in `flaggedSiteIndices`) may differ. Each diagnostic count differs by at most the flagged count. The per-decision margins are derived from the WGSL accuracy table (next section), then doubled; they are in `src/gpu/wgsl-sensor-kernel.ts`. Recomputing only the flagged sites with the reference makes the region bit-identical, and the tests do exactly that.

### Sensor-stage margins (derivation)

Notation: ε = 2^-23 (one WGSL rounding, either direction); a quantity "≤ kε" has relative error at most kε against the exact real value, first order in ε (products of errors are dropped; the kernel doubles every margin, `MARGIN = 2`, which covers them with room to spare). "The reference" is the float64 `simulatePackedSensorSite`; its own roundings enter through `CPU_REL = 2^-47` terms (64 float64 ulps). A sum of n float32 terms t_i, however associated, is within (n − 1)·ε·Σ|t_i| of the exact sum (Higham §4.2), so every multi-term margin below holds under reassociation. Integer arithmetic is exact. The emulation test `test/webgpu-adversarial-arithmetic.test.ts` evaluates the same kernel logic with each of these liberties taken adversarially (random rounding direction, 2.5-ULP division, table-bounded `sqrt`, `log`, `exp`, random summation order) and checks that no unflagged site changes.

- **Uniforms.** `unit(bits) = (f32(bits) + 0.5)·2^-32`: the conversion and the sum round, the power-of-two scale is exact: ≤ 2ε. Comparisons of uniforms with constants and with each other are made on the integer state and are exact.
- **Box–Muller normal.** `ln_unit`: for `unit < 1/2`, WGSL `log` of an argument ≤ 2ε off is within 3 ULP + 2ε, and |ln| ≥ ln 2, so ≤ 6ε. For `unit ≥ 1/2` the kernel evaluates 2·atanh(r), r = −w/(2 − w) with w = 1 − unit exact to 2ε: w (2ε), 2 − w (ε), the division (2.5ε): r ≤ 5.5ε, |r| ≤ 1/3; r² ≤ 12ε; the degree-11 Horner polynomial in r² with positive, decreasing coefficients adds ≤ 4ε (two roundings per step, weighted by (1/9)^steps, plus the coefficients' roundings and r²'s error through a derivative ≤ 0.4); the final product ε: ≤ 10.5ε. Take **ln_unit ≤ 11ε**. radius = sqrt(−2·ln): the scaling is exact, `sqrt` ≤ 4.5ε, half of ln's error: **radius ≤ 10ε**. `cos_unit`: the reduced argument g ≤ π/4 carries 4ε (conversion, sum, the constant 2π/2^32, the product), g² 9ε; the cosine polynomial's own roundings ≤ 3.3ε and g²'s error through a derivative ≤ 1/2 add ≤ 2.8ε; the sine branch, g·(1 + g²·s(g²)), ≤ 10ε relative on a value ≤ 0.71: **|cos_unit − cos| ≤ 8ε** absolute. z = radius·cos: radius·(10ε·|cos| + 8ε + ε) ≤ **20ε·radius** (`Z_ERR`). A read-noise term z·σ adds σ's float32 rounding and the product (2ε), and the sum of up to c terms in any order adds (c − 1)ε·Σ|z_c σ_c|; the kernel bounds each |z_c σ_c| by radius_c·σ_c: `noise_bound = Σ σ_c·radius_c·(20 + 2 + c)·ε`.
- **Multiplication method** (mean < 30). The float32 mean is within ε·(mean + 1) of the reference's (the host-rounded fraction and the sum), so exp(−mean) carries (3 + 2·mean) ULP + ε·(mean + 1) ≤ (4 + 3·mean)·ε. The product of n uniforms carries 3ε per factor (the uniform and the multiplication). Margin: (3n + 4 + 3·mean)·ε·max(product, threshold).
- **PTRS** (30 ≤ mean < 10^9). mean ≤ 2.1ε (f32(mi) for mi ≥ 2^24, the fraction, the sum; mean ≥ 30); sq = √mean ≤ 5.6ε; b = 0.931 + 2.53·sq: 2.53 (ε), the product (ε), 0.931 (ε, ≤ 0.063·b), the sum (ε): ≤ 8.7ε; a = −0.059 + 0.02483·b ≥ 0.308 with 0.02483·b ≤ 1.2·a: ≤ 14ε; inv_alpha = 1.1239 + 1.1328/(b − 3.4): b − 3.4 ≤ 12.3ε (b/(b − 3.4) ≤ 1.3), the quotient ≤ 15.8ε on a value ≤ 0.0994, the constant and the sum ε each: ≤ 3.9ε absolute, ≤ 3.5ε relative; v_r = 0.9277 − 3.6224/(b − 2): the quotient ≤ 14.6ε on ≤ 0.283, the constant and the difference: **≤ 6ε absolute**.
  - *Floor test.* scale = 2a/us + b: 2a/us ≤ 18.5ε (a 14ε, us 2ε, the division 2.5ε), plus b and the sum: ≤ 19.5ε; t = scale·u ≤ 22.5ε. x = (t + mf) + 0.43 in any order: ≤ 22.5ε|t| + 2ε(|t| + 1.43) + 2ε = **25ε|t| + 4ε**, plus the reference's float64 rounding of t + mean + 0.43, 4.5·10^-16·(|t| + mean + 1).
  - *Acceptance.* v ≤ 2ε·v, v_r ≤ 6ε: margin **7ε + 2ε·v**.
  - *Log-probability test.* lhs = log(v·inv_alpha/(a/us² + b)): us² 5ε, a/us² 21.5ε, the denominator ≤ 22.5ε, the numerator 6.5ε, the quotient 31.5ε; `log` adds 3 ULP outside [0.5, 2] or 2^-21 inside: **dl = 32ε + 2^-21 + 3ε|lhs|**. rhs for k = 0 is −mean: **3ε·mean**. For k > 0: kf = f32(k) exact below 2^24, else ε; dd = f32(mi − k) + mf ≤ 2ε|dd| + ε; t = dd/kf ≤ 5.5ε|t| + ε/kf. For |t| ≤ 1/2, g(t) = ln(1 + t) − t is evaluated as −t²/(2 + t) + 2s³(1/3 + s²/5 + …), s = t/(2 + t): the first term carries 4.5ε (two roundings and a division), the second 17.5ε (s 3.5ε, s² 8ε, the polynomial 4ε, two products) on at most 0.14 of |g|, the sum ε: ≤ 8.2ε|g| of evaluation error; the input's 5.5ε enters through g's elasticity |t·g′/g| ≤ 2.6 (14.3ε), its absolute part ε/kf through |g′| ≤ 2|t|: δg ≤ 22.5ε|g| + ε/kf, and kg = kf·g: **dk = 25ε|kg| + ε**. For |t| > 1/2, lr = log(mean/kf): the quotient 5.6ε, `log` 3 ULP or 2^-21; kg = kf·lr − dd: **dk = kf·(6ε + 2^-21 + 5ε|lr|) + 2ε|dd| + ε + ε|kg|**. lnk = log(kf) ≤ 2^-21 or 3ε·lnk, plus ε from kf; the Stirling remainder R(k) is tabulated (ε·|R| ≤ 0.1ε) or 1/(12k) − 1/(360k³) (≤ 0.01ε); ½ln 2π rounds (ε); three subtractions: **dr = dk + 2^-22 + 1.5ε·lnk + 2ε + 3ε(|kg| + ½lnk + 1) + 2^-47·(mean + k(|ln mean| + lnk + 1))**, the last term the reference's float64 evaluation of −mean + k·ln mean − log k!. The test flags when |lhs − rhs| ≤ 2(dl + dr).
- **Capacity test with a deterministic fraction.** dcap = w + (r_frac − c_frac) with w = f32(realized − ⌊capacity⌋) (ε|w|), the two host-rounded fractions (ε each) and a three-term sum in any order (2ε(|w| + 2)): **3ε|w| + 6ε + 2^-47·(realized + 1)**.
- **Pre-ADC test.** diff = (whole + (a_frac − t_frac)) + noise, four terms in any order: 3ε(|whole| + 2 + |noise|), whole's conversion ε|whole|, the two fractions 2ε, the noise bound: **noise_bound + 4ε|whole| + 3ε|noise| + 8ε + 2^-47·(a_int + |noise|)** plus the fixed-pattern slack (the reference's float64 threshold − offset) and the deterministic fraction's rounding.
- **ADC rounding.** The integer part of signal/gain comes from integer arithmetic (exact). The fraction is a sum of at most eleven float32 terms (the fixed-pattern offset fraction, the eight piece fractions, each below 1, frac_codes = a_frac·(1/gain) and noise_codes = noise·(1/gain)), then a floor split, with INL a second floor split, and the comparison with ½: 13 roundings in any association on terms whose magnitudes sum to at most 13 + frac_codes + |noise_codes|: **13ε·(13 + frac_codes + |noise_codes|)**. frac_codes carries 3ε (the fraction, 1/gain's float32 rounding, the product), noise_codes 2ε|noise_codes| + noise_bound/gain; the pieces leave 1/gain short by a residual below 2^-44/gain, which times a_int enters directly; the reference's float64 division and sum: 2^-47·(a_codes + |noise_codes| + black). With INL the margin is multiplied by (1 + slope_max) for the offset's dependence on the ideal code, and the offset evaluation adds slope_max·2ε·(|ideal| + 1 + max|knot code|) (the ideal's and the knot's roundings), 11ε·(max|offset| + 1) (the slope, the difference, the product, the knot offset, the sum and the second split in any association) and 2^-47·(|ideal| + max|offset|)·(1 + slope_max) for the reference's float64 interpolation. A noise-free power-of-two-gain regime with an integer capacity and no INL is exact on both sides, so its ties need no flag.
- **Digital gain.** |delta|·g from the integer pieces (exact integer part), eight fractions below 1 summed in any order with the floor split and the ½ comparison (≤ 10 roundings on values below 9): **90ε** + |delta|·residual + 2^-47·(|estimate| + black). A digital gain with at most 12 significant bits is exact on both sides and its ties need no flag.
- **Domain.** 1/gain and the digital gain in [2^-60, 2^60] keep every piece scale 2^(s_j) ≥ 2^-115, so no fraction is subnormal and flush-to-zero cannot act; capacity/gain ≤ 2^30 keeps the integer shifts below 31 bits.

## Accuracy contract

This section states what the `webgpu-f32` path promises for each stage, relative to the CPU reference, and how the stage bounds combine along the image-formation chain: optics → exposure and motion → sensor → development and SDR.

**Two kinds of error, kept separate:**

1. **Arithmetic error:** GPU float32 against the CPU float64 reference of the *same* equations. It is stated a priori in every result and tested below.
2. **Method error:** the image-formation method against today's per-site engine. The method uses isoplanatic convolution, temporal quadrature and bilinear shifts; the per-site engine uses per-site radiance queries, PSF quadrature and temporal sampling. The bounds here do not cover method error.
   - Each fixture's rollout measures it on sampled tiles against the per-site engine before the fast path is used for that fixture: see [Per-fixture rollout](#per-fixture-rollout-method-error). It is measured, not bounded.
   - The sensor stage is the exception: it has no method error, because its reference is bit-identical to the per-site producer. Scene radiance is the other exception: every value is the reference rounded once to float32.

**Per-stage bounds:**

| Stage | Quantity | `errorBound.kind` | Bound (a priori) | Tests |
| --- | --- | --- | --- | --- |
| Optics: convolution | expected irradiance or photons per site | `relative-to-reference` | (γ_{T+3} + 2^-40)·v + 2T·2^-126 (+ a term for weights below 2^-126, see above) | `test/image-kernel-accelerator.test.ts`, `test/webgpu/conformance.webgpu.ts` |
| Exposure and motion: temporal sum | expected exposure (photons or electrons) per site | `relative-to-reference` | (γ_{K+8} + 2^-40)·v + K·(8·w_max + 2)·2^-126 + R (R = 0 unless a weight is below 2^-126) | `test/temporal-exposure-sum.test.ts`, `test/webgpu/stages.webgpu.ts` |
| Sensor | RAW codes, saturation counts, noise moments | `exact-except-flagged-sites` | unflagged sites identical; counts within ± flagged; flagged sites listed | `test/packed-sensor-raw.test.ts`, `test/webgpu/stages.webgpu.ts` |
| Native capture SDR | 8- or 16-bit codes | `integer-code-difference` | 1 code | `test/image-kernel-accelerator.test.ts`, `test/webgpu/conformance.webgpu.ts` |
| RAW development | 8- or 16-bit codes | `integer-code-difference` | propagated per run (see above) | same |
| Luminance tone curves (SDR and RAW development) | 8- or 16-bit codes | `integer-code-difference` | largest per-sample bound of the run (see above) | `test/webgpu-luminance-tone.test.ts`, `test/webgpu/conformance.webgpu.ts` |
| Scene radiance and spectral integration (chart presets) | spectral radiance or its channel integrals per query | `relative-to-reference` | 2^-24·v + 2^-126 (flagged points recomputed on the host) | `test/chart-radiance-batch.test.ts`, `test/webgpu/stages.webgpu.ts` |
| Display view, Speed (#478; registered by the GPU session) | expected linear-light value and noise covariance per display pixel | `relative-to-reference` (plus `varianceBound`) | 2·(γ_64 + 2^-40)·value + the clip steps' running term (0 where no clip acts), γ with E = 2^-23; variance 2·(γ_80 + 2^-40)·V + its term; the noise draw bit-identical; flagged pixels recomputed | `test/display-view-speed-gpu.test.ts`, `test/display-view-speed-gpu-full.test.ts`, `test/webgpu/display-view.webgpu.ts` |

**How the bounds compose:**

- **Through linear stages** (optics, then exposure and motion):
  - `composeRelativeErrorBounds(first, second, W)` returns r = r₁ + r₂ + r₁r₂ and a = a₂ + W·a₁·(1 + r₂).
  - W is the second stage's largest weight sum per output: `plan.maximumRowWeightSum` for the temporal sum, `plan.maximumKernelSum` for the convolution.
  - **Proof.** The second stage has non-negative weights. With |ã − a| ≤ r₁a + a₁ elementwise, |B̃ã − Bã| ≤ r₂·Bã + a₂ and Bã ≤ (1 + r₁)Ba + W·a₁. Also |B(ã − a)| ≤ r₁Ba + W·a₁. Adding the two gives the result.
  - **Tests:** a randomized worst-case check, and the convolution → temporal-sum chain on the in-process device (`test/temporal-exposure-sum.test.ts`).
- **Into the sensor stage:**
  - For given expected electrons, the sensor contract is exact except at flagged sites.
  - When the expected electrons come from GPU stages with a relative bound (r, a), each site's realized code is a valid draw for its perturbed mean. A pointwise code bound does not exist, because a Poisson draw is not continuous in its mean.
  - The bound holds for expected values instead. The noise-free code, and the mean code of a uniform patch, shift by at most (r·e + a)/gain codes before quantization. The shot-noise variance shifts by at most (r·e + a)/gain² codes².
  - **Example:** r = 1e-5 at e = 60 000 electrons and gain 1 e⁻/code gives a mean shift of at most 0.6 codes, against a shot-noise σ of 245 codes.
- **Into development and SDR:** these stages consume integer RAW codes. Their own bounds apply to whichever codes they receive. Where the sensor codes equal the reference, the whole chain from codes onward is bounded by the development or SDR bound alone.

**Noise:** the GPU uses the same seeded model as the CPU (`photivra-native-raw-noise` 0.4.0, MurmurHash3 per-site seeds).

- Realized noise is exactly equal to the reference at every unflagged site.
- Exact equality is not guaranteed at flagged sites.
- A statistical-equivalence test covers the whole output, flagged sites included (`test/webgpu/stages.webgpu.ts`). Uniform patches of 4096 sites at 3 to 20 000 electrons must satisfy all of these:
  - the GPU patch mean is within 4·√(2σ²/N) of the reference mean;
  - the GPU variance is within 1 ± 4·√(2/(N − 1)) of the reference variance;
  - both GPU moments are within 5 sampling standard deviations of the model's mean E/g + black and variance (E + σ_read²)/g² + 1/12.
- A caller that needs bit identity recomputes the `flaggedSiteIndices` with the reference.

## Per-fixture rollout (method error)

For every built-in chart preset, `test/webgpu/rollout.webgpu.ts` measures the method error of the GPU image-formation path against the per-site CPU engine on sampled tiles. These are accuracy numbers, not speed. The setup is declared and synthetic (`test/helpers/rollout-fixture.ts`):

- **Frame:** `simulateCapture` defaults (professional tier, 50 mm at f/8, Planckian 6500 K), 192×128 output (194×130 native sites with the demosaic border), 6 µm sites, 40 nm spectral steps (10 nodes).
- **Lens PSF:** a synthetic, field-varying `LensSampledPsfProfile`: anisotropic Gaussians with σx = 4 + 10·r µm and σy = 4 + 6·r µm (r is the field radius in mm) and a centroid shift of 2 µm per mm. It is wavelength-independent. It is a stress test, not a measured lens: σ grows about 2.7× from the axis to the corner of this small frame.
- **Reference:** the per-site engine, `calculateEnvironmentSensorPhotoSignal` with the facade's own site inputs and the PSF as `sampled-local`. It makes radiance queries at every PSF tap and spectral node and reports expected generated electrons per site.
- **Method, GPU path:** `evaluateChartRadiance` (spectral integral per Bayer channel at site centres, with the per-site engine's own spectral weights read by probing it with single-wavelength radiance), then `convolveIrradiance` per channel plane with `resolveLensPsfConvolutionKernels` kernels (8-site patches), then each site's own channel. The scene is static, so the temporal sum is one node and adds no method error. The facade's optics factor is the same at every site (checked), so one weight row per channel is exact.
- **Tiles:** the frame centre (8×8 sites) and an off-axis tile at native (150, 20) (8×8) with 6 µm PSF samples (exact site sampling), and the off-axis tile (4×4) with 2 µm PSF samples (bilinear splatting).
- **Metric:** the largest |method − per-site| over the tile's peak, then the RMS over the peak.
- **Asserted:** the GPU path stays within the composed a-priori arithmetic bound of the float64 method at every site (bound 1.03e-5 relative; measured at most 8.1e-7), and each method error stays within its pinned value (measured plus 5 %, two significant digits; `ROLLOUT_PINNED_METHOD_ERROR`). `test/webgpu-rollout.test.ts` checks four of the cases in every CI run, on the in-process float32 emulation.

Measured on SwiftShader (Chromium 141 headless; float64 gives the same numbers to 1e-6):

| Preset | Exact sampling, centre: max / RMS of peak | Exact sampling, off-axis | Sub-site PSF, off-axis |
| --- | --- | --- | --- |
| uniform | 2.38 % / 0.95 % | 1.70 % / 0.70 % | 1.52 % / 0.82 % |
| slanted-edge | 1.79 % / 0.46 % | 1.65 % / 0.71 % | 1.48 % / 0.82 % |
| siemens-star | 24.9 % / 6.5 % | 1.65 % / 0.71 % | 1.48 % / 0.82 % |
| step-wedge | 2.36 % / 0.97 % | 1.46 % / 0.63 % | 1.48 % / 0.82 % |
| grey-ramp | 2.24 % / 0.93 % | 1.59 % / 0.69 % | 1.48 % / 0.82 % |
| checkerboard | 2.38 % / 0.76 % | 1.65 % / 0.71 % | 1.48 % / 0.83 % |
| point-grid | 2.55 % / 0.71 % | 1.22 % / 0.51 % | 16.8 % / 7.4 % |
| patches | 2.35 % / 0.89 % | 1.71 % / 0.71 % | 1.97 % / 0.98 % |

What the numbers show:

- **Isoplanatic patches (1.2–2.5 % everywhere):** even a uniform scene shows this error. The convolution scatters each source with its own patch's kernel, so where the kernel changes at a patch boundary a flat field is no longer flat, although energy is conserved overall. The per-site engine gathers with each destination's own PSF and stays flat. The error grows with the PSF change across one patch; this stress-test PSF changes by up to 12 % in width over 8 sites. Smaller patches or a slower-varying PSF reduce it.
- **Sub-site PSF sampling (point-grid, 16.8 %):** with 2 µm PSF samples the per-site engine samples the scene at points between site centres and resolves a disk edge inside the tile. The method sees only site-centre radiance and interpolates bilinearly.
- **Siemens-star centre (24.9 %):** near the centre the sectors are narrower than a site, and both paths take one radiance sample per site or per PSF tap. Diagonal site centres lie exactly on sector boundaries (36 cycles), where float rounding decides the material. This is point-sampling aliasing that neither path resolves, rather than an error of one path.
- **Rollout status:** each fixture's numbers above are what a caller accepts when using the fast path for that fixture with this kind of PSF. None of them is a bound, and none applies to another lens without measuring it again.

## Measured conformance (SwiftShader, Chromium 141 headless)

`npm run test:webgpu` (89 tests in three files, including the [rollout](#per-fixture-rollout-method-error)) runs the WGSL kernels on a real WebGPU device. It compares every sample against the float64 reference computed in Node and asserts the bound. Measured during development of this backend with Google SwiftShader (a Vulkan CPU implementation):

| Stage | Corpus | Measured maximum | Reported bound |
| --- | --- | --- | --- |
| Temporal sum, rolling and global, sub-site and integer motion | 257×129 K=1, 200×150 K=9, 160×120 K=32, 120×160 K=5; nine-decade samples | relative 2.1e-7 … 5.3e-7 | relative 5.4e-7 … 2.4e-6 |
| Sensor stage, six regimes (unit and fractional gain, 12–16 bit, three noise sources, INL, exact and inexact digital gain, noise-free) | 256×128 sites: zero, multiplication, PTRS and normal-approximation means; capacity and pre-ADC saturation; dark signal | 0 differing sites. 111–143 flagged (0.3–0.4 %; 95–117 before the #471 margins); 823 flagged (2.5 %; 804 before) with the inexact digital gain 1.3, whose products land on exact half-code ties | exact except flagged sites |
| Sensor stage with fixed-pattern noise (PRNU 1 %, DSNU 20 %, 1 % hot pixels × 40, row 1.5 e⁻ and column 0.75 e⁻ RMS) and three additional components (two Poisson, one fractional deterministic), five regimes | 256×128 sites, same corpus plus the extras | 0 differing sites. 131–154 flagged (0.4–0.5 %; 104–129 before #471); 1466 flagged (4.5 %; 1443 before) with the inexact digital gain 1.3 | exact except flagged sites |
| Sensor statistics | five uniform patches × 4096 sites, 3–20 000 e⁻ | GPU and reference moments identical (18 flagged sites); both within the model tolerances | statistical (above) |
| Convolution | 257×193 r=0 … 64×64 r=32, nine-decade grids, field-varying anisotropic kernels | relative 1.4e-7 (r=0) … 3.8e-6 (r=32) | relative 2.4e-7 … 2.5e-4 |
| SDR, 8 and 16 bit, identity/Reinhard, clip/reject, f32/f64 | 300×41 with code centres, near-ties, transfer breakpoints, ±0, clipping | 1 code (0.0–4.9 % of samples differ) | 1 code |
| RAW development, all four orientations, clip/reconstruct, ideal and non-white-normalized cameras, with and without WB gains | 96×64 synthetic Bayer RAW (random codes, black levels, flags, white levels) | 1 code (≤ 0.3 % of samples differ) | 1 (8 bit) … 67 (16 bit) |
| SDR, luminance tone curves: extended Reinhard Lw 2 and 0.5; Naka–Rushton n = 1, 1.6, 4 | 300×41: colours over eight decades of luminance, greys, zeros; 8 bit f32, 16 bit f64, and a mixed-sign 8-bit corpus with luminance cancelling to near zero | 1 code (≤ 0.08 % of samples differ) | 1 (8 bit); 3–30 (16 bit); 1–102 (mixed signs) |
| RAW development, luminance tone curves (same five), WB gains, clip (8 bit) and reconstruct (16 bit) | 96×64 synthetic Bayer RAW | 1 code (≤ 0.15 % of samples differ) | 1 (8 bit); 152–1652 (16 bit) |

Reject-mode corpora that contain samples exactly at 1 ± 2^-52 fail closed with `indeterminate-float32-classification`, as designed. Banded and unbanded GPU output are identical. Abort, busy, out-of-range rejection, and in-flight dispose return the documented domain errors on the real device.

**Speed: no GPU speedup is claimed.** SwiftShader emulates the GPU on the CPU, so its timings say nothing about GPU performance. On this loaded 4-core host it was *slower* than the CPU reference:

| Stage | CPU reference | webgpu-f32 on SwiftShader |
| --- | --- | --- |
| Convolution 1024×768, r=7 | 3.2 s | 5.2 s |
| SDR 1024×768 | 0.28 s | 4.2 s |
| RAW development 1024×768 | 0.8 s | 3.1 s |

The browser test prints these numbers on each run. No SwiftShader timings are given for the temporal sum or the sensor stage, because they would not describe a GPU either. Until hardware timings exist, choose the backend by measuring on the target device.

## Timings at 6–24 MP

**Hardware timings are recorded per device in the [hardware record](WEBGPU_DEVICES.md)**, with the adapter, browser, OS and engine commit of each run. One device, an Apple M5 Pro, has been measured so far: the 6–24 MP benchmark of October 26 and 27, 2026 ([#277](https://github.com/Photivra/photivra/issues/277)) and the 1024 × 768 stage timings of the conformance run in #471 (convolution r7 349 ms CPU / 7.6 ms GPU, SDR 19.2 / 15.5, RAW development 74.9 / 35.4). The development container has no hardware GPU, so no number below is a GPU measurement. `npm run bench:webgpu:hardware` is the reproducible measurement (steps in [Running on hardware](#running-on-hardware)); after its JSON report it prints one line per frame and stage with the GPU milliseconds, the CPU milliseconds (with `PHOTIVRA_WEBGPU_TIMING_CPU=1`) and their ratio CPU ÷ GPU, so a record row copies them without hand arithmetic.

**Workload** (built inside the page, so no large payload crosses the DevTools socket): one 3:2 frame per size. 6 MP is 3000×2000, 12 MP is 4242×2828 and 24 MP is 6000×4000. Each frame goes through:

- the temporal sum, with 8 sub-site nodes;
- the convolution, at radius 7 with 256-site patches;
- the sensor stage, with a 14-bit regime, 2.5 e⁻ read noise, a 50 000 e⁻ capacity and up to 22 800 expected electrons.

**What is measured:** wall-clock milliseconds per stage on the second run, with warm pipelines. Host packing, upload, dispatch and readback are included. The float64 CPU reference is timed on the same inputs only on request.

- The hardware run refuses a software adapter, so its numbers are GPU numbers. Still check the report's `adapter`: `softwareAdapter` must be false.
- The script was run in this container only at 0.06 MP on SwiftShader, to check that it works. That run measured nothing about GPUs, and its numbers are deliberately not recorded.

## Running on hardware

The conformance suite and the timing run are the two checks to make on a real GPU. Every hardware run goes into the [hardware record](WEBGPU_DEVICES.md) (device, adapter, driver, browser, OS, engine commit, result, timings file); so far one device, an Apple M5 Pro, has been run, and the re-run of the suite after the #471 changes is pending (#475). In this container, `npm run test:webgpu:hardware` was run only to confirm that it refuses SwiftShader.

**Once:**

1. Use a machine with a WebGPU-capable GPU and an up-to-date Chrome or Chromium (WebGPU ships in Chrome 113+ on Windows and macOS; on Linux it needs Vulkan drivers).
2. In the repository: `npm ci`.

**Conformance (accuracy on your GPU):**

```sh
npm run test:webgpu:hardware
```

- This runs all three suite files with `PHOTIVRA_WEBGPU_ADAPTER=hardware` (hardware Chromium flags), `PHOTIVRA_WEBGPU_REQUIRED=1` (fail instead of skip) and `PHOTIVRA_WEBGPU_REQUIRE_HARDWARE=1`. A software adapter such as SwiftShader then fails every test instead of passing on the CPU. The script (`scripts/run-webgpu-hardware.mjs`) works the same on Linux, macOS and Windows.
- One file only: `npm run test:webgpu:hardware -- test/webgpu/conformance.webgpu.ts`. The rollout file spends about two minutes computing the per-site CPU reference.
- **If it reports a software adapter or no adapter:** first try a visible window, `PHOTIVRA_WEBGPU_HEADLESS=0` (headless mode exposes the GPU on fewer platforms). Then point to your browser with `PHOTIVRA_WEBGPU_BROWSER=/path/to/chrome`. Then set your own flags with `PHOTIVRA_WEBGPU_FLAGS="…"`. Chrome's `chrome://gpu` page shows whether WebGPU is hardware accelerated.
- A pass means every float32 result on your device was within its stated bound. A failure names the stage, the sample and the bound, which is the evidence for a non-conforming driver (see [Limitations](#limitations)).

**Timings (speed on your GPU):**

```sh
PHOTIVRA_WEBGPU_TIMING_OUT=webgpu-timings.json npm run bench:webgpu:hardware
```

- Optional settings: `PHOTIVRA_WEBGPU_TIMING_MP=6,12,24` (the default sizes) and `PHOTIVRA_WEBGPU_TIMING_CPU=1` (also time the float64 CPU reference on the same inputs; this takes minutes at 24 MP).
- On Windows `cmd`, set variables first: `set PHOTIVRA_WEBGPU_TIMING_OUT=webgpu-timings.json`, then `npm run bench:webgpu:hardware`.

- After the JSON report, the run prints one summary line per frame and stage: GPU milliseconds, CPU milliseconds (when timed) and the ratio CPU ÷ GPU, formatted for the record.

**Record** each run as a row of the [hardware record](WEBGPU_DEVICES.md) ("Adding a row" there), and post the same facts in the tracking issue (#277 for the capture path): the JSON report (it includes the adapter vendor and architecture), the GPU model, driver version, browser version, OS and engine commit. Only these runs can support a GPU speed claim. The suites never assert a speed.

## Preview acceptance

The display view (the app's preview, [Display view](DISPLAY_VIEW.md)) has no GPU kernel yet (#478, #479 in the #473 epic). Its acceptance harness exists first, built against the CPU path so it is ready when the kernels are: `scripts/accept-display-view-gpu.mjs` (#480) renders the app's request with a "reference" producer and a "candidate" producer and compares their noise-free expected images per pixel. The reference is always the CPU display view. The candidate is the CPU display view too until a GPU producer exists (the self-check, which must show exact equality); `--candidate path/to/producer.mjs` selects another producer module, whose contract (`createProducer(context)` returning `{ name, render(options, view) }` with the expected values, noise σ, samples and its own whole-view time) is documented in `scripts/lib/display-view-cpu-producer.mjs`. A GPU producer will consult the [switch](#contract) (`getWebGpuEnabled`) like every other GPU path.

```sh
node scripts/accept-display-view-gpu.mjs --timing --record display-view-acceptance-<device>-<date>
node scripts/accept-display-view-gpu.mjs --candidate scripts/lib/display-view-cpu-producer.mjs   # the self-check through the hook
```

- **Cases:** the five fixture charts (slanted edge, Siemens star, bar groups, dead leaves, step wedge) at the app's view sizes 2028 × 1352 and 2800 × 1867, Speed and Quality, in the app's request shape (`scripts/benchmark-display-view.mjs --app`: 24 MP 6 µm, the 2 × 2 box, a caller material scene with the stand-in label, f/8, ISO 100): 20 whole-view renders per producer. `--sizes`, `--charts`, `--options`, `--f` and `--workers` select subsets and parallelism.
- **Metrics, per pixel:** ΔE2000 between the two noise-free expected sRGB display colours (the engine's own CIEDE2000 and CIELAB, the formula of `calculateColorDifference` after Sharma, Wu and Dalal 2005, with the sRGB matrix and D65 white of `resolveRgbColorSpace("srgb")`; the reduction is `scripts/lib/display-view-acceptance.mjs`, tested in `test/display-view-acceptance.test.mjs` on identities computed from the definitions, since no published CIEDE2000 test pairs are asserted in this repository, `THIRD_PARTY.md`), and the expected-value difference of each component in units of the reference's noise σ for that component. It also reports the maximum difference in 8-bit codes, the identical-pixel fraction and whether the drawn samples and the noise σ are identical.
- **Thresholds** (parameters; the defaults are #473's, pending the owner's confirmation in #483): at least 99 % of pixels within ΔE2000 1 (`--within-fraction`, `--within-de`), none above 2.3 (`--max-de`), no pixel's expected value moved by more than 1 σ (`--max-sigma`). The script prints pass or fail per threshold per case and exits non-zero on a failure.
- **Difference images:** one PNG per case (the engine's own encoder; |Δ| in 8-bit codes × `--gain`, default 16, black is no difference) with "Difference image, not a capture" in its text metadata. The "no structured difference at 1:1" check is the owner's visual review of these images, which the product rules require for shipped imagery; the script lists the files and does not judge it.
- **`--timing`:** the candidate's whole-view time as the producer measures it (for a GPU: setup, upload, kernels and readback; a GPU producer may add labelled times for adapter acquisition, the conformance self-check #481 and the app's timing probe, which the script prints as given) next to the reference timed as the benchmark does (prepare once, sampled 96 × 96 parts, the whole view's CPU time extrapolated). The CPU pool's wall time to fully sharp with 4 and 12 workers is measured in the app (Photivra/apps), not here.
- **Record:** `--record <name>` writes `docs/validation/<name>/README.md` and `results.jsonl` in the format of [display-view-2026-10-26](validation/display-view-2026-10-26/README.md); one folder per device and date. The self-check record is [display-view-acceptance-self-check-2026-10-27](validation/display-view-acceptance-self-check-2026-10-27/README.md). Hardware runs (the M5 Pro, the integrated-GPU laptop and a phone, #475) and the SwiftShader smoke run in CI wait for the GPU producer.

## Browser support and running the suite

- WebGPU requires a secure context (HTTPS or localhost).
  - Shipped: Chromium-based browsers (Chrome/Edge 113+ on Windows, macOS and ChromeOS; Android 121+).
  - Behind flags or partial: Safari and Firefox, depending on version and platform.
  - Elsewhere the accelerator reports `webgpu-unavailable` and, with `fallback: "cpu-reference"`, runs the reference.
- Little-endian hosts only (all current WebGPU platforms).
- The device is requested with `maxStorageBufferBindingSize` and `maxBufferSize` set to the adapter maximum, capped at 1 GiB. Adapters below 16 MiB are refused (`insufficient-limits`).

To run the conformance suite on SwiftShader (the default; see [Running on hardware](#running-on-hardware) for a GPU):

```sh
npm run test:webgpu                       # skips with a message when no browser/adapter is available
PHOTIVRA_WEBGPU_REQUIRED=1 npm run test:webgpu   # fail instead of skip
```

How the suite finds and launches a browser:

- **Browser lookup:**
  1. `PHOTIVRA_WEBGPU_BROWSER` (path to a Chromium/Chrome binary);
  2. Playwright's Chromium under `PLAYWRIGHT_BROWSERS_PATH`, `/opt/pw-browsers`, `~/.cache/ms-playwright`, `~/Library/Caches/ms-playwright` or `%LOCALAPPDATA%\ms-playwright`;
  3. the usual Chrome and Chromium locations on Linux, macOS and Windows.
- **Default flags** expose SwiftShader in headless mode: `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=swiftshader --use-webgpu-adapter=swiftshader`. `PHOTIVRA_WEBGPU_ADAPTER=hardware` switches to hardware flags (`--enable-unsafe-webgpu --ignore-gpu-blocklist`, plus `--enable-features=Vulkan --use-angle=vulkan` on Linux; not verified here, since the container has no GPU). `PHOTIVRA_WEBGPU_FLAGS` overrides both, and `PHOTIVRA_WEBGPU_HEADLESS=0` opens a visible window.
- **Adapter policy:** each run reports the adapter and whether it is a software adapter. `PHOTIVRA_WEBGPU_REQUIRE_HARDWARE=1` turns a software adapter into a failure.
- **No dependencies:** the driver talks to the browser over the DevTools protocol and serves `src/` transpiled over loopback. It adds no npm dependency.

**CI.** The suite runs as its own workflow, [`webgpu.yml`](../.github/workflows/webgpu.yml) (job `webgpu conformance (SwiftShader)`), on `ubuntu-latest` with `PHOTIVRA_WEBGPU_REQUIRED=1` in Playwright's Chromium, installed in the job with `npx playwright@1.63.0 install --with-deps chromium` (Chromium build 1243, Chrome for Testing 153.0.8010.12; the suite adds no npm dependency, and the pin is bumped only after a local run on the new build). It runs on every pull request that changes `src/gpu/`, `test/webgpu/`, `vitest.webgpu*.config.ts` or the workflow, on every push to `main`, and on manual dispatch; a run takes about four minutes (the three suite files took 184 s on the 4-core development host). It is a software-adapter check of the kernels' arithmetic, not a GPU measurement; hardware runs are recorded in the [hardware record](WEBGPU_DEVICES.md). The in-process unit tests (`test/image-kernel-accelerator.test.ts`, `test/packed-sensor-raw.test.ts`, `test/packed-sensor-fixed-pattern.test.ts`, `test/temporal-exposure-sum.test.ts`, `test/webgpu-luminance-tone.test.ts`, `test/chart-radiance-batch.test.ts`, `test/lens-psf-kernels.test.ts`, `test/webgpu-rollout.test.ts`) run in every CI leg. They drive the complete host path (acquisition, banding, readback, counters, loss, error scopes, abort, dispose) against a float32 JavaScript emulation of the kernels.

## Limitations

- These are approximations within the stated bounds, not the reference. Use `cpu-reference` for evidence, hashes, fixtures and anything that needs bit identity.
- The bounds assume a device that meets the WGSL accuracy table ([Error bounds](#error-bounds-a-priori-reported-per-result)). A `log`, `exp`, `sqrt`, `pow` or flush-to-zero behaviour outside the table would void them; the conformance suite is how a device is checked, and an unflagged differing site in `test/webgpu/stages.webgpu.ts` is the evidence. The sensor-stage margins no longer assume correctly rounded division or a fixed summation order (#471): the integer parts of the ADC input are integer arithmetic and every sum carries an order-independent bound. What they still assume is that each `+`, `−`, `×` written in the kernel is one WGSL operation (one rounding, either direction) and that `floor` is exact; an implementation that evaluated `x − floor(x)` in extended precision or fused it with a neighbouring sum would not break them either, since the result could only be closer to exact. Polynomial evaluations (the Box–Muller logarithm and cosine, PTRS's g(t)) assume Horner order; another association changes their constants by a small factor that the doubled margin absorbs.
- The convolution, temporal-sum, SDR and RAW-development bounds take u = 2^-24 (round-to-nearest). On a device that rounds `+ − ×` in another direction, which WGSL permits, they hold with u = 2^-23, that is doubled. Every device measured so far rounds to nearest.
- The float64 reference itself is realm-dependent in one place: ECMAScript does not fix the last bit of `Math.atan2`, so the Siemens-star material of a point exactly on a sector boundary can differ between JavaScript engines (see [Scene radiance on the GPU](#scene-radiance-on-the-gpu)). `webgpu-f32` flags and recomputes such points in its own realm.
- The convolution is a primitive. `resolveLensPsfConvolutionKernels` builds its kernels from a `LensPsfProfile` (with spectral weighting); vignetting, depth-dependent defocus and occlusion are not part of it.
- The sensor stage's fixed-pattern values are evaluated on the host (float64, once per site). They depend only on the sensor instance, so a caller rendering many frames of one sensor pays this per frame; caching them across frames is not built. The temporal sum covers rigid translation only.
- GPU scene radiance covers the engine's chart presets only. Caller scene functions run on the CPU, and the native environment task's batched provider (#319) is not yet connected to `evaluateChartRadiance`; `mapEnvironmentDirectionsToChartPoints` is the seam.
- The rollout's method errors hold for its synthetic PSF, patch size and tiles only, and are not bounds.
- Still open for #277: hardware-GPU timings at 6–24 MP (the wiring is in place; nothing has been measured) and the hardware re-run of the conformance suite (#475).
