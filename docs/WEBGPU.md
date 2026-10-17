# WebGPU image-kernel backend (`webgpu-f32`)

Status: **2.0.0 development, optional and opt-in.**

- The float64 CPU paths stay the engine reference, and the default.
- The `webgpu-f32` backend is a separate, explicitly labelled float32 approximation of five stages: isoplanatic PSF convolution, the temporal exposure sum (exposure and motion), the sensor stage (seeded charge, read noise and ADC), native capture SDR and packed RAW development.
- Its results carry an error bound against the reference, worked out in advance (a priori). The [accuracy contract](#accuracy-contract) states each stage's bound and how the bounds compose. A conformance suite on a real WebGPU device tests them on fixed test images.

It is a bounded part of the GPU image-formation path proposed in [#277](https://github.com/Photivra/photivra/issues/277), not the whole path. Still missing: scene radiance on the GPU and the batched provider API, kernel sampling from `LensPsfProfile`, the per-fixture rollout, and **hardware-GPU timings at 6–24 MP, which have not been measured yet** (see [Timings](#timings-at-624-mp)).

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

- **Operations:** `convolveIrradiance`, `sumTemporalExposure`, `simulateSensorRaw`, `renderNativeCaptureSdr` and `developNativeRaw`. Their float64 references are `calculateIrradianceConvolution`, `calculateTemporalExposureSum`, `simulatePackedSensorRaw`, `createNativeCaptureSdrTask` and `createNativeRawDevelopmentTask`. A sensor result also lists its `flaggedSiteIndices`.
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

Per-site radiance and pupil sampling (the 75-hour path in #277) stay on the CPU. They need the batched provider API, which is not built yet.

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
  - Radius ≤ 32, ≤ 4096 patches, ≤ 4 194 304 weights, ≤ 24 MP.
- **Temporal exposure sum** (reference limits, which also bound the float32 range):
  - Samples finite, non-negative and ≤ 2^100; row weights in [0, 2^16]; 1–256 nodes; displacements within ±4096 sites; ≤ 24 MP.
- **Sensor stage:**
  - The packed input itself supports one readout regime with a uint16 ADC (≤ 16 bits), ≤ 16 read-noise components, one physical capacity for the frame, photo and dark charge, an optional fixed-pattern noise profile and up to 8 additional stored-charge components (2.0). The per-site producer allows 32 components; use `simulateSensorRawFrame` for more than 8.
  - On the GPU (`unsupported-float32-domain` otherwise): capacity ≤ 2^24 electrons; expected photo and dark electrons (after the fixed-pattern factors) and each additional component < 2^30 per site; the deterministic components' sum < 2^30 per site; 2^-60 ≤ 1/gain ≤ 2^60 and capacity/gain ≤ 2^30; each read-noise RMS 0 or in [2^-100, 2^100], with 7·ΣRMS ≤ 2^28 electrons and ≤ 2^20 codes; |fixed-pattern readout offset| ≤ 2^28 electrons and ≤ 2^20 codes.

## Equations

**Convolution** (source-indexed, energy-conserving scatter written as a gather):

`out(x, y) = Σ_{v=-r..r} Σ_{u=-r..r} in(x − u, y − v) · K_{p(x − u, y − v)}(u, v)`

Here `p(s)` is the isoplanatic patch containing the *source* site, and `K_p(u, v)` is the fraction of that site's linear, additive quantity that lands at displacement (+u right, +v down).

- Incoherent imaging superposes intensity PSFs linearly ([MIT OpenCourseWare 2.71, lecture 22](https://ocw.mit.edu/courses/2-71-optics-spring-2009/resources/mit2_71s09_lec22/), free; isoplanatic subsections: van de Ketterij et al., [arXiv:2011.01738](https://arxiv.org/abs/2011.01738), sec. 1, free. Also see: Goodman, *Introduction to Fourier Optics*, 4th ed., 2017, §6.1).
- Treating the PSF as constant inside a patch is the declared piecewise shift-invariant approximation (isoplanatic patches; the method used by camera simulators such as ISETCam: Farrell et al., *Proc. SPIE* 8299, 2012). Patch size and kernels are the caller's declared choice.
- The grid is the whole source support. Quantity scattered outside it is lost; there is no padding or renormalization. `inputSum − outputSum` reports the loss.
- Kernels can come from the engine's sampled lens PSFs (2.0, next section); otherwise the caller supplies them. No PSF profile is inferred.

**Kernels from a lens PSF profile** (`sampleLensPsfConvolutionKernels`, schema 0.1.0):

- For each patch, the PSF is resolved with `resolveLensSampledPsf` at the patch centre's field point, in the per-site engine's own coordinates: native sensor millimetres from the optical axis (`grid.opticalAxisSite`, +Y down), field point (x, −y).
- Each PSF tap maps to a site displacement through the per-site quadrature's own inverse support (`sensorPsfSourcePoint`). Tap (kx, ky) lands at u = (kx − cx)·pₓ/sₓ, v = −(ky − cy)·p_y/s_y, where p is the PSF sample pitch and s the site pitch.
- **Exact site sampling** (`exactSiteSampling: true`): when every displacement is an integer, each tap's weight goes to one kernel cell. A destination whose PSF equals its patch's then gets exactly the per-site PSF quadrature with site-centre sources (tested at patch centres).
- **Labelled approximation, otherwise:** each weight is split over the four surrounding displacements with bilinear weights, the exact adjoint of bilinear interpolation. The convolution then equals the per-site quadrature applied to the bilinear interpolant of the site-centre samples (tested to 1e-12). Weights are conserved.
- **Several wavelengths:** the kernel is the weight-normalized sum of the per-wavelength kernels. For a spectrally neutral scene this is exactly the per-site engine's spectral sum when the weights are its spectral quadrature weights times the illuminant.
- The kernel radius is the smallest that holds every non-zero tap (at most 32). A smaller requested radius is rejected rather than dropping support. Relative pupil throughput is reported per patch and never folded into the unit-energy kernels, as in the per-site engine.
- The remaining approximation is the isoplanatic patch: one PSF per patch, indexed by the source site. Its method error is measured, not bounded (#277 per-fixture rollout).

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
  - The ADC input (signal/gain + black) is formed exactly: an exact integer part plus a float32 fraction, using 12-bit splits of 1/gain and of the digital gain.
  - WGSL's built-in `cos` has only a 2^-11 absolute bound, so the kernel uses its own octant-reduced Taylor polynomials.
- **Branch selection:** the zero and Poisson-branch categories (< 30, < 1e9, normal) are computed on the host in float64, so the GPU always takes the reference's branch. Means of 1e9 and above always exceed the capacity bound of 2^24, so their exact draw cannot change a code. Partial charge sums saturate at 2^30 on the GPU, above every supported capacity, so saturating cannot change a decision either.
- **Fixed-pattern noise and additional charge (2.0), same guarantee:**
  - The host evaluates every site's fixed-pattern values in float64 with the model's own functions (row and column offsets once per row and column). It packs the Poisson means already multiplied by the factors, which are exactly the reference's float64 products, so the Poisson branch and draws are unchanged.
  - The readout offset enters twice, both formed in float64 on the host: the pre-ADC test becomes afterPhysical − (threshold − offset) + noise > 0, and the ADC input gains offset/gain as an exact integer part plus a float32 fraction. Their bounds add the reference's own float64 rounding of the offset sum (2^-47 relative slack, as for the other terms) and the fraction's float32 rounding.
  - Deterministic components make the stored charge non-integer. Their sum enters as an exact integer part plus a float32 fraction, and the capacity test becomes a float32 difference with its own bound (both fractions' roundings and the reference's rounding of the total), so a near-tie at the capacity is flagged.
  - With either feature, the noise-free exact-tie mode is off, so every ADC rounding decision carries its bound.

## Error bounds (a priori, reported per result)

Let u = 2^-24 (binary32 unit roundoff) and γ_k = k·u/(1 − k·u). These are the standard forward-error bounds for recursive summation and dot products (Rump & Jeannerod, *SIAM J. Matrix Anal. Appl.* 35(2), 2014, sec. 1, [free author copy](https://www.tuhh.de/ti3/paper/rump/RuJea13.pdf). Also see: Higham, *Accuracy and Stability of Numerical Algorithms*, 2nd ed., SIAM 2002, §2–§3). They assume a conforming WebGPU implementation: correctly rounded f32 `+ − × ÷`, and the WGSL accuracy table for `pow` (W3C WGSL, *Floating Point Accuracy*).

- **Convolution (`relative-to-reference`).** Every term is non-negative, so for every sample `|v_gpu − v_ref| ≤ (γ_{T+3} + 2^-40)·v_ref + 2·T·2^-126`, where T = (2r+1)² taps. The three extra roundings cover the f32 conversion of the sample, the weight and the product. The absolute term covers subnormal flush-to-zero.
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
- **Temporal exposure sum (`relative-to-reference`).** Every term is non-negative and carries at most K + 7 roundings (sample, bilinear weight, their product, three inner additions, row weight, its product, K − 1 outer additions). So `|v_gpu − v_ref| ≤ (γ_{K+8} + 2^-40)·v_ref + K·(8·w_max + 2)·2^-126`, where K is the node count and w_max the largest row weight.
- **Sensor stage (`exact-except-flagged-sites`).** Not a numeric tolerance. Every unflagged site has exactly the reference code and saturation flags. Only flagged sites (`errorBound.flaggedSiteCount`, listed in `flaggedSiteIndices`) may differ. Each diagnostic count differs by at most the flagged count. The per-decision margins are derived from u and the WGSL accuracy table, then doubled; they are listed in `src/gpu/wgsl-sensor-kernel.ts`. Recomputing only the flagged sites with the reference makes the region bit-identical, and the tests do exactly that.

## Accuracy contract

This section states what the `webgpu-f32` path promises for each stage, relative to the CPU reference, and how the stage bounds combine along the image-formation chain: optics → exposure and motion → sensor → development and SDR.

**Two kinds of error, kept separate:**

1. **Arithmetic error:** GPU float32 against the CPU float64 reference of the *same* equations. It is stated a priori in every result and tested below.
2. **Method error:** the image-formation method against today's per-site engine. The method uses isoplanatic convolution, temporal quadrature and bilinear shifts; the per-site engine uses per-site radiance queries, PSF quadrature and temporal sampling. The bounds here do not cover method error.
   - Each fixture's rollout must measure it on sampled tiles against the per-site engine before the fast path is used for that fixture. That comparison has not been made yet. It needs scene radiance on the GPU and kernels sampled from `LensPsfProfile`.
   - The sensor stage is the exception: it has no method error, because its reference is bit-identical to the per-site producer.

**Per-stage bounds:**

| Stage | Quantity | `errorBound.kind` | Bound (a priori) | Tests |
| --- | --- | --- | --- | --- |
| Optics: convolution | expected irradiance or photons per site | `relative-to-reference` | (γ_{T+3} + 2^-40)·v + 2T·2^-126 | `test/image-kernel-accelerator.test.ts`, `test/webgpu/conformance.webgpu.ts` |
| Exposure and motion: temporal sum | expected exposure (photons or electrons) per site | `relative-to-reference` | (γ_{K+8} + 2^-40)·v + K·(8·w_max + 2)·2^-126 | `test/temporal-exposure-sum.test.ts`, `test/webgpu/stages.webgpu.ts` |
| Sensor | RAW codes, saturation counts, noise moments | `exact-except-flagged-sites` | unflagged sites identical; counts within ± flagged; flagged sites listed | `test/packed-sensor-raw.test.ts`, `test/webgpu/stages.webgpu.ts` |
| Native capture SDR | 8- or 16-bit codes | `integer-code-difference` | 1 code | `test/image-kernel-accelerator.test.ts`, `test/webgpu/conformance.webgpu.ts` |
| RAW development | 8- or 16-bit codes | `integer-code-difference` | propagated per run (see above) | same |
| Luminance tone curves (SDR and RAW development) | 8- or 16-bit codes | `integer-code-difference` | largest per-sample bound of the run (see above) | `test/webgpu-luminance-tone.test.ts`, `test/webgpu/conformance.webgpu.ts` |

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

## Measured conformance (SwiftShader, Chromium 141 headless)

`npm run test:webgpu` (43 tests in two files) runs the WGSL kernels on a real WebGPU device. It compares every sample against the float64 reference computed in Node and asserts the bound. Measured during development of this backend with Google SwiftShader (a Vulkan CPU implementation):

| Stage | Corpus | Measured maximum | Reported bound |
| --- | --- | --- | --- |
| Temporal sum, rolling and global, sub-site and integer motion | 257×129 K=1, 200×150 K=9, 160×120 K=32, 120×160 K=5; nine-decade samples | relative 2.1e-7 … 5.3e-7 | relative 5.4e-7 … 2.4e-6 |
| Sensor stage, six regimes (unit and fractional gain, 12–16 bit, three noise sources, INL, exact and inexact digital gain, noise-free) | 256×128 sites: zero, multiplication, PTRS and normal-approximation means; capacity and pre-ADC saturation; dark signal | 0 differing sites. 95–117 flagged (0.3–0.4 %); 804 flagged (2.5 %) with the inexact digital gain 1.3, whose products land on near-ties | exact except flagged sites |
| Sensor stage with fixed-pattern noise (PRNU 1 %, DSNU 20 %, 1 % hot pixels × 40, row 1.5 e⁻ and column 0.75 e⁻ RMS) and three additional components (two Poisson, one fractional deterministic), five regimes | 256×128 sites, same corpus plus the extras | 0 differing sites. 104–129 flagged (0.3–0.4 %); 1443 flagged (4.4 %) with the inexact digital gain 1.3 | exact except flagged sites |
| Sensor statistics | five uniform patches × 4096 sites, 3–20 000 e⁻ | GPU and reference moments identical (16 flagged sites); both within the model tolerances | statistical (above) |
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

**Hardware-GPU timings have not been measured yet.** The development container has no hardware GPU, so no hardware number is recorded anywhere in this repository. `npm run bench:webgpu` is the reproducible measurement for the owner to run on a desktop GPU.

**Workload** (built inside the page, so no large payload crosses the DevTools socket): one 3:2 frame per size. 6 MP is 3000×2000, 12 MP is 4242×2828 and 24 MP is 6000×4000. Each frame goes through:

- the temporal sum, with 8 sub-site nodes;
- the convolution, at radius 7 with 256-site patches;
- the sensor stage, with a 14-bit regime, 2.5 e⁻ read noise, a 50 000 e⁻ capacity and up to 22 800 expected electrons.

**What is measured:** wall-clock milliseconds per stage on the second run, with warm pipelines. Host packing, upload, dispatch and readback are included. The float64 CPU reference is timed on the same inputs only on request.

```sh
# Linux, Chrome or Chromium with a Vulkan GPU (use "--enable-unsafe-webgpu" alone on macOS and Windows)
PHOTIVRA_WEBGPU_BROWSER=/path/to/chrome \
PHOTIVRA_WEBGPU_FLAGS="--enable-unsafe-webgpu --enable-features=Vulkan" \
PHOTIVRA_WEBGPU_TIMING_MP=6,12,24 \
PHOTIVRA_WEBGPU_TIMING_CPU=1 \
PHOTIVRA_WEBGPU_TIMING_OUT=webgpu-timings.json \
npm run bench:webgpu
```

- **Check the report's `adapter` first.** `softwareAdapter` must be false, and `architecture` must not be `swiftshader`. Otherwise the browser did not expose the hardware GPU in headless mode, and the numbers are not GPU performance. Whether headless Chrome exposes a hardware adapter depends on the platform and driver; this was not verified here.
- **Record with the numbers:** the GPU model, driver, browser version and OS (in #277).
- The script was run in this container only at 0.06 MP on SwiftShader, to check that it works. That run measured nothing about GPUs, and its numbers are deliberately not recorded.

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

**CI.** The suite is not part of `ci.yml`. It passes reliably here with Playwright's Chromium 141. Whether ubuntu-latest's preinstalled Chrome exposes a SwiftShader WebGPU adapter headlessly has not been verified, so wiring it in is left as a follow-up. The in-process unit tests (`test/image-kernel-accelerator.test.ts`, `test/packed-sensor-raw.test.ts`, `test/temporal-exposure-sum.test.ts`) run in every CI leg. They drive the complete host path (acquisition, banding, readback, counters, loss, error scopes, abort, dispose) against a float32 JavaScript emulation of the kernels.

## Limitations

- These are approximations within the stated bounds, not the reference. Use `cpu-reference` for evidence, hashes, fixtures and anything that needs bit identity.
- The bounds assume conforming hardware and drivers. Non-conforming flush-to-zero or `pow` behaviour outside the WGSL accuracy table would void them; the conformance suite is how a device is checked.
- The convolution is a primitive. `sampleLensPsfConvolutionKernels` builds its kernels from a `LensPsfProfile` (with spectral weighting); vignetting, depth-dependent defocus and occlusion are not part of it.
- The sensor bounds also assume the compiler does not reassociate the kernel's float32 expressions; fused multiply-add contraction only removes roundings and is harmless. The exact integer-plus-fraction ADC sums rely on this. A device that breaks it shows up as an unflagged differing site in `test/webgpu/stages.webgpu.ts`.
- The sensor stage's fixed-pattern values are evaluated on the host (float64, once per site). They depend only on the sensor instance, so a caller rendering many frames of one sensor pays this per frame; caching them across frames is not built. The temporal sum covers rigid translation only.
- Still open for #277:
  - scene radiance on the GPU and the batched provider API;
  - the per-fixture rollout, with method-error comparisons against the per-site engine on sampled tiles (Color, IQ, DR, Motion, Focus);
  - hardware-GPU timings at 6–24 MP.
