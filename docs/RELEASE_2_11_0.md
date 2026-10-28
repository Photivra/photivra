# 2.11.0 release candidate

> **Prepared October 27, 2026; proposed, awaiting owner approval; not published.** Publishing runs only from the owner's `v2.11.0` tag, after `main` CI on the tagged commit has passed and after the owner's hardware acceptance of the GPU preview on an Apple M5 Pro (see [Release gates](#release-gates)).

## At a glance

- **What is proposed:** publish `@photivra/engine@2.11.0`, with `ENGINE_API_VERSION = "2.11.0"`. `POC_SIMULATION_API_VERSION` stays `1.0.0`.
- **Why a minor version:** new root exports, request fields and options, and no breaking change to the 2.x API. The GPU display view: `prepareDisplayView(request, { gpu, gpuDevice })`, `PreparedDisplayView.dispose()` and `diagnostics.fast.execution` (#481), with Speed (#478) and Quality (#479) kernels, composite charts and `material-layers` scenes (#477, #491) and defocus (#492). `lens.defocus` in captures and display views (#492). One realm switch for the engine's GPU use, `setWebGpuEnabled`/`getWebGpuEnabled`, and the accelerator's `webgpu` boolean (#474). Twenty root exports are added and none is removed or changed incompatibly (see [Compatibility](#compatibility)).
- **Same results:** in all 24 fingerprinted results, every sample, RAW code and file (PNG, JPEG, DNG) equals 2.10.0's, with only the engine version normalized. The 18 captures and 3 ideal references are identical whole; the 3 display views differ in one field only, the new `diagnostics.fast.execution` label (`backend: "cpu-reference"`). No hash lock changed.
- **Not measured:** GPU timing on hardware is TBD (#475); no speed is claimed for the GPU display view. The GPU preview's accuracy is measured on a float32 emulation and on SwiftShader, a software adapter, not on a hardware GPU. **The owner's Apple M5 Pro run of `npm run accept:gpu:hardware` and `npm run test:webgpu:hardware` is the release gate for the GPU preview and has not been done yet.**

## Scope

Every pull request merged since `v2.10.0` (`git log v2.10.0..origin/main`):

| Change | Pull request |
| --- | --- |
| Record the 2.10.0 publication (documentation only) | #472 |
| WebGPU: one boolean to turn the engine's GPU use on or off (#474) | #484 |
| Preview acceptance harness for the GPU display view, built against the CPU path (#480) | #486 |
| WebGPU sensor stage and Siemens star: margins from the WGSL accuracy table, no correctly rounded division (#471) | #487 |
| Display view: `prepareDisplayView(request, { gpu })` chooses the GPU or the CPU reference and labels which ran (#481) | #485 |
| WebGPU conformance suite in CI, a hardware record, and per-stage timing summaries (#476) | #488 |
| WebGPU: chart radiance for every composite-chart element and mask layers (#477) | #489 |
| Display view: the Speed kernel on the GPU, bit-identical noise draw, bounds and tests (#478) | #490 |
| Defocus: the geometric disc kernel on the site lattice and the `lens.defocus` option (#492, step 1) | #494 |
| Display view: the composite chart and mask-layer material module for the GPU Speed kernel (#491) | #493 |
| Defocus in the capture: `lens.defocus` as an object-space convolution, with diffraction (#492, step 2a) | #497 |
| Display view: render `lens.defocus` out of focus on the CPU (#492, step 2b) | #498 |
| Display view: the Quality kernels on the GPU (#479) | #495 |
| Display view: defocus in the GPU kernels, Speed and Quality (#492, step 2c) | #499 |
| Preview acceptance harness: run the app's request on the GPU (#480) | #500 |
| GPU Speed kernel: the quantization-variance term in the variance bound (#496) | #501 |

Out of scope: the Quality display-view noise limit (#379) and the Quality AHD colour error at the Siemens star's centre (#457) are unchanged from 2.10.0, and the GPU reproduces both; see [Known issues](#known-issues).

## What changed, with evidence

The figures below are quoted from the changelog entries and pull requests of each change. **Every GPU figure is measured on the float32 emulation of the kernels (in Node) or on Google SwiftShader (Vulkan on the CPU, in headless Chromium): they check the kernels' arithmetic against the float64 reference, and they say nothing about GPU speed.** CPU timings are Node 24 on one thread of the 4-vCPU development host.

### One switch for the engine's GPU use (#484, issue #474)

**Change:** `createImageKernelAccelerator({ webgpu: true })` is `backend: "webgpu-f32"` with `fallback: "cpu-reference"`, `{ webgpu: false }` is `backend: "cpu-reference"`; `webgpu` and `backend` exclude each other. `setWebGpuEnabled(false)` keeps every accelerator and GPU path of the JavaScript realm on the CPU reference (`fallbackReason: "webgpu-disabled"`, or `ImageKernelExecutionError` in fail mode) and requests no adapter; `getWebGpuEnabled()` reads it. A Web Worker has its own switch.

**Values:** no result changes. `test/image-kernel-accelerator.test.ts` checks the boolean form, the refusal of mixed and non-boolean forms, that a (fake) GPU is never asked for with the switch off, and that the reference's bytes are returned.

### WebGPU margins from the WGSL accuracy table (#487, issue #471)

**Why:** the first hardware conformance run (Apple M5 Pro, Metal, October 27; [hardware record](WEBGPU_DEVICES.md)) passed 82 of 89 tests: the sensor stage differed on unflagged sites in every non-unit-gain regime (6 failures), and one Siemens-star boundary point fell in the wrong sector (1).

**Change:** the sensor kernel no longer relies on correctly rounded division or on the order of float32 sums, and every margin is derived from the W3C WGSL "Floating Point Accuracy" table (one ULP per `+ − ×`, 2.5 ULP division). The Siemens star's sector is found by cross-product signs against host float64 boundary directions, with no transcendental function. The star failure was a realm difference: Node's and Chrome's `Math.atan2` differ by one ulp at that point, which the GPU had flagged; the suite now compares with the browser realm's reference.

**Values:** the CPU reference and its hashes are unchanged. On the adversarial float32 emulation (random rounding direction, division off by up to 2.5 ULP, random summation order) no unflagged site or point changes on the six sensor regimes, their fixed-pattern variants and all eight chart presets. SwiftShader passes. The flagged share rises modestly (95–117 → 109–144 sites per 256 × 128 regime). **The hardware re-run on the M5 Pro is pending (#475);** SwiftShader divides exactly, so for the sensor failures the emulation is the evidence until then.

### Preview acceptance harness (#486 and #500, issue #480)

**Change:** `scripts/accept-display-view-gpu.mjs` renders the app's display-view request with the CPU display view (the reference) and a candidate, compares the noise-free expected images per pixel in ΔE2000 and in units of the reference's noise σ, writes a difference image per case ("Difference image, not a capture") and prints pass or fail against #473's thresholds (99 % within ΔE2000 1, none above 2.3, no pixel beyond 1 σ). With `--gpu` (#500; `npm run accept:gpu`, `npm run accept:gpu:hardware`) the candidate is the built engine in headless Chromium through `prepareDisplayView(request, { gpu: "require", gpuDevice })`, judged against the CPU reference rendered in the same page; a case that did not render on the GPU fails the run. The scene is the app's form (`material-layers`) with a generic engine-authored stand-in label, not the app's artwork.

**Values (CPU self-check, #486):** with the CPU display view as the candidate, all 20 cases at both sizes are exactly equal (every expected value, σ and drawn sample; [record](validation/display-view-acceptance-self-check-2026-10-27/README.md)).

**Values (SwiftShader, #500, full-width bands, not whole views):** every compared case passed every threshold: the app's request and the five fixtures in Speed at 2028 × 1352 (128 rows each; 100 % within ΔE2000 1, largest ΔE2000 2.4–4.2 × 10⁻⁵, largest |Δ|/σ 5.2–6.3 × 10⁻⁵), and the app's request in Quality at 2028 × 1352 and in Speed and Quality at 2800 × 1867 (32 rows each; largest ΔE2000 at most 3.2 × 10⁻⁴, |Δ|/σ at most 5.4 × 10⁻⁴). The SwiftShader times (33–291 s per band) are CPU times of a software adapter. `app-defocus` was then an expected fallback, because #499 had not merged when those bands ran.

**Values (SwiftShader, `app-defocus` on this candidate):** run for this record on `main` at `63934af` with `npm run accept:gpu -- --charts app-defocus --options speed --sizes 2028x1352 --region 0,612,2028,32` (Node 24.21.0, HeadlessChrome 153, SwiftShader). The case rendered on `webgpu-f32` (conformance self-check passed, 5 cases) and was compared, not a fallback: 64 896 pixels, 100 % within ΔE2000 1, largest ΔE2000 6.3 × 10⁻⁵, largest |Δ|/σ 8.4 × 10⁻⁵, every drawn sample identical to the browser's CPU reference; `PASS`. The 37 s SwiftShader render is not GPU performance.

### `prepareDisplayView(request, { gpu, gpuDevice })` and the execution label (#485, issue #481)

**Change:** `gpu: "off" | "auto" | "require"` (default `"off"`). `"auto"` renders on WebGPU when a conforming device is available and the request is supported, else on the CPU, labelled; `"require"` fails instead. `gpuDevice` is a worker's `navigator.gpu` or an `ImageKernelAccelerator` to share; otherwise the engine acquires one device per prepared view and `prepared.dispose()` releases it. Before a device's first display-view render a short self-check runs once against the float64 reference (`conformance-failed` keeps the view on the CPU). `diagnostics.fast.execution` (`DisplayViewExecution`) records the backend, its bound, the adapter (`GPUAdapter.info`) and the conformance result; a GPU render reports `assurance: "approximation-with-a-priori-bound"` and adds the assumption `view.execution`, so an app can label a preview "estimated on the GPU". The GPU code loads on demand.

**Values:** `"off"` equals `simulateDisplayView` byte for byte and the display-view hash locks are unchanged (`test/display-view-gpu-option.test.ts`, with a fake device and renderer).

### WebGPU conformance in CI and the hardware record (#488, issue #476)

**Change:** `.github/workflows/webgpu.yml` (job `webgpu conformance (SwiftShader)`) runs `npm run test:webgpu` with `PHOTIVRA_WEBGPU_REQUIRED=1` in Playwright's Chromium (pinned `playwright@1.63.0`, installed in the job; no npm dependency) on pull requests that change the GPU code, on every push to `main` and on dispatch. [`docs/WEBGPU_DEVICES.md`](WEBGPU_DEVICES.md) records each hardware run. `npm run bench:webgpu` and `bench:webgpu:hardware` print one summary line per frame and stage (GPU ms, CPU ms, ratio), computed from the report.

**Values:** tooling only; no engine result changes. `test/webgpu-timing-summary.test.ts` checks the summary against the values posted on #277. The hardware rows in the record predate this release's GPU display view; none covers it (see [Release gates](#release-gates)).

### Chart radiance for composite charts and mask layers on the GPU (#489, issue #477)

**Change:** a second `webgpu-f32` chart-radiance kernel classifies composite charts, the 2.3 elements, the sine Siemens star and declared `material-layers` scenes, each decision with an a-priori bound and host recomputation of undecided points; no WGSL `sin`, `cos` or `atan2` decides a material, and a device probe refuses the kernel on a device without round-to-nearest, unreassociated arithmetic. New root exports: `resolveChartMaterialLayers`, `ChartMaterialLayerScene` and the mask-layer types and limits.

**Values (emulation and SwiftShader, pixel centres of a 2028 × 1352 view):** every unflagged value equals the reference rounded once to float32; flagged fractions 0 for twelve element kinds and at most 0.50 % for the others.

### The display view's Speed kernel on the GPU (#490, issue #478)

**Change:** the display view's exact area mean without diffraction (2 × 2 box, bilinear, chart materials, identity or positive Reinhard tone) runs one display pixel per invocation; the host finishes each pixel with the reference's own float64 functions, so **the seeded noise draw is bit-identical to the CPU's**. Requests it does not cover run the CPU reference, labelled `unsupported-on-backend`.

**Values (emulation; SwiftShader for the small fixtures):** on nine fixtures and the 24 MP 6 µm frame at 2028 × 1352, every component inside its bound using at most 4.1 % of it; ΔE2000 at most 4.3 × 10⁻⁵, at most 3.3 × 10⁻⁴ noise σ; a sample differs from the CPU's by at most one code.

**Variance bound's quantization term (#501, issue #496):** the host evaluates the quantization variance at the GPU's mean, which moves it by up to 6.04·Δ²/12 per unit of mean error; the Speed bound now adds that term explicitly, as the Quality bound does, instead of covering it only through its γ₈₀ relative term. No computed value, CPU result or hash lock changes; only the variance bounds grow. `test/display-view-speed-gpu-quantization.test.ts` checks that the term covers the actual change of q(m) over every allowed mean on [−0.1, 1.1] and at the segment join, using at most 50 % of it. The largest fraction of the variance bound used falls from 4.0 % to 3.9 % on the chart presets and from 4.1 % to 4.0 % on the composite fixtures (Reinhard at the white clip: 28.7 % before and after; emulation, SwiftShader the same digits).

**Measured on the CPU:** the host finishing costs 1.22 µs per display pixel (3.4 s for a whole 2028 × 1352 view, one thread), a floor of this design. **GPU time: TBD (#475).**

### The composite material module for the GPU display view (#493, issue #491)

**Change:** composite charts, the 2.3 elements, the sine star, fixed-size charts and declared `material-layers` scenes render on the GPU through the composite kernel's material lookup, with the exact query point recovered in double-float32. `simulateCapture`, `simulateDisplayView`, `prepareDisplayView` and `createPlanarSceneRadianceProvider` accept a `material-layers` scene directly, with the bytes of its `callerScene` (tested).

**Values (emulation and SwiftShader):** every component inside its bounds (at most 4.6 % of the expected-value bound and 29 % of the variance bound used), samples within one code, ΔE2000 at most 4.7 × 10⁻⁵, every #480 threshold met. At the app's size (24 MP, 2028 × 1352, the app's composite under a label layer; emulation): ΔE2000 at most 4.2 × 10⁻⁵, 87 of 8.2 million samples differ by one code, 1.3 % of display pixels flagged and recomputed exactly on the host.

### The display view's Quality kernels on the GPU (#495, issue #479)

**Change:** diffraction kernels, the four-spot anti-aliasing filter, both AHD candidates and the low-signal correction run in three passes per band; the correction states stay on the host (#447), and the host finishes every pixel with the reference's float64 functions, so the noise draw is again bit-identical to the CPU's. The bounds carry each quantity as a (value, absolute bound) pair from the WGSL accuracy table.

**Values (emulation in every CI run, SwiftShader in `test:webgpu`; nine fixtures):** every component inside its bound using at most 3.0 % of the expected-value bound and 9.2 % of the variance bound; ΔE2000 at most 4.1 × 10⁻⁴; at most 7 of 82 215 samples differ, by one code. The whole 24 MP frame at 2028 × 1352 (emulation, run once): ΔE2000 at most 3.3 × 10⁻⁴, 1 035 of 8.2 million samples differ by one code.

**AHD placement:** on SwiftShader every pass is slower than one CPU thread (not GPU performance), so only hardware can decide whether the AHD pass belongs on the GPU; the alternative is not built. **Hardware timing: TBD (#475).**

### `lens.defocus`: the disc, the capture, the display view and the GPU (#494, #497, #498, #499, issue #492)

**Change:**
- `lens.defocus: { model: "geometric-disc" }` (#494) models the thin-lens blur circle as a uniform disc on the site lattice, each weight the exact circle–cell area, with a portable arcsine so the weights are the same in every engine. It is an approximation, labelled `scientificStatus: "approximation"` in the `lens.defocus` assumption; with `lens.diffraction` each node's kernel is convolved with the disc, a further labelled approximation. The disc's radius is capped at 64 sites (combined with diffraction, 96); in focus the image equals the request without the option.
- `simulateCapture` renders it as an object-space convolution (#497); out of focus it is refused with camera rotation, `lens.projection`, `lens.distortion` and `lens.vignetting`.
- The CPU display view applies the same kernels in its expected signal (#498), and the GPU renderer gathers them in Speed and Quality (#499).

**Values:**
- Kernel: a sampled straight edge (10 diameters, 4 angles, 4 offsets) is within its stated bound of the disc's closed-form edge-spread function; 2.2 × 10⁻¹³ on cell boundaries.
- Capture: a slanted edge's profile follows the closed form within 0.0093 of the step; parts equal the whole frame; tabulated and environment paths give the same RAW.
- Display view (CPU): against the in-focus view of the pre-blurred scene, 24 cases × 3 scales, ΔE2000 at most 1.6 × 10⁻⁷ and |Δ|/σ at most 1.3 × 10⁻⁷; the capture with the option equals the capture of the pre-blurred scene, every RAW code, in 8 cases.
- GPU (emulation and SwiftShader, 30 fixtures): every component inside its bound, using at most 2.0 % of the expected-value bound and 2.8 % of the variance bound; ΔE2000 at most 1.7 × 10⁻⁴; one sample of 17 712 differs, by one code; every #480 threshold met.

**Measured on the CPU:** on a 1024 × 683 tabulated capture (Node 24, one thread) a Siemens star took 0.37 s in focus, 2.9 s at radius 32 and 11.6 s at radius 64; the table is in `docs/QUICK_START.md`, "Optics". **GPU timing: TBD (#475).**

## Compatibility

- **Root exports: 1,765 (twenty-three added, none removed or changed).** Compared with `v2.10.0`'s `docs/api/exports.json`: added `getWebGpuEnabled`, `setWebGpuEnabled` (#474); `DisplayViewGpuMode`, `PrepareDisplayViewOptions`, `DisplayViewGpuFallbackReason`, `DisplayViewGpuConformance`, `DisplayViewExecution`, `DisplayViewFastReport`, `ImageKernelAdapterDescription` (#481); `resolveChartMaterialLayers`, `CHART_MASK_INDEX_GRAIN`, `CHART_MATERIAL_LAYER_LIMITS`, `ChartMaterialLayerScene`, `ChartMaskLayer`, `ChartMaskShape`, `ChartMaskPolygon`, `ChartMaskAnnulus`, `ResolvedChartMaterialLayers`, `ResolvedChartMaskLayer`, `ResolvedChartMaskShape` (#477); `ChartCompositeProbeRecord`, `ChartCompositeProbeComponent`, `ChartCompositeProbeMismatch` (the composite probe's record, the M5 Pro finding below). No existing export changed its name, source module or kind.
- **Signatures** (`git diff v2.10.0..origin/main -- docs/API_REFERENCE.md docs/api`): every change widens an input or adds to a result.
  - New optional inputs: `prepareDisplayView`'s second argument; `lens.defocus`; the `material-layers` form in the request's and the radiance provider's `scene` unions and in `ChartRadianceBatchInput.scene`; `ImageKernelAcceleratorOptions.webgpu`, with `backend` now optional when `webgpu` is given.
  - Additions to results: `diagnostics.fast` of a display view is a `DisplayViewFastReport`, which extends `SimulateCaptureFastReport` with `execution`; `diagnostics.timingsMs.defocus`; the chart plan's `layers` and `materials`; `ImageKernelAccelerator.adapter`; `PreparedDisplayView.dispose()`.
  - New members of string unions: `ImageKernelFallbackReason` `"webgpu-disabled"`, `ImageKernelFailureReason` `"conformance-failed"`, `"lens.defocus"` in `SIMULATE_CAPTURE_COST_OPTIONS`. Code that switches exhaustively over these unions sees a new case, as with earlier minor releases.
- **Defaults:** none changes. `gpu` defaults to `"off"`, and `setWebGpuEnabled` defaults to `true`, which only allows GPU use a caller asks for.

### Same results as 2.10.0

A fingerprint of 24 whole results was taken from a build of the `v2.10.0` tag (`ce58a3e`) and from this candidate (`main` at `63934af`, with #500; repeated after merging `598aae3`, #501, with identical results), on Node 24.21.0, with the script of the 2.10.0 record: 18 `simulateCapture` requests (chart presets, spectral patches, a uniform spectrum, a composite with a fixed-size chart, both caller function forms and a material scene, PNG 16-bit Display P3, JPEG, two DNGs, auto and Kelvin white balance, the tone curve, a rolling shutter, a region with diffraction, the Quality options, projection, distortion and vignetting, camera rotation, mirror borders at ISO 3200), 3 `simulateIdealReference` and 3 `simulateDisplayView` results (one with the Quality options at 2 × 2 real pixels per display pixel, one of a material scene). Typed arrays (samples, RAW codes, encoded files) were hashed with SHA-256; everything else was compared as JSON with timings zeroed. The engine version was normalized by setting the `v2.10.0` build's `ENGINE_API_VERSION` to the candidate's, so the DNG Software tag matches too.

- **Bytes identical in all 24:** samples, RAW codes and PNG, JPEG and DNG bytes.
- **Whole results identical in 21:** the 18 captures and the 3 ideal references.
- **One field added in 3:** the 3 display views differ only by the new `diagnostics.fast.execution` label: `backend: "cpu-reference"`, `gpu: "off"`, `arithmetic: "float64"`, `assurance: "engine-reference"`, `bitIdenticalToReference: true`, no adapter, conformance, fallback or error bound.

### Hash locks

No hash lock changed. `Photivra 2.11.0` has the length of `Photivra 2.10.0`, and the 2.0.0 and 2.3.0 DNG locks already make their files with `ENGINE_API_VERSION` mocked to the locked version (`vi.doMock`, since 2.10.0), so no test change was needed for the version string.

## Known issues

- **Quality display-view noise at small footprints (#379), unchanged.** With `output.demosaic: "ahd"` the display view's predicted noise has too much colour where a display pixel covers few sensor pixels (1.13–1.20 of the reference's, validation set F). The GPU reproduces the estimate, including this excess.
- **Quality display view at device-pixel widths: AHD colour error at the Siemens star's centre (#457), open.** 5.1 codes RMS and up to 34 codes on the 24 MP full frame at 2028 wide. The GPU reproduces it. Captures, the 100 % detail box and exports are unaffected.
- **Realm difference in `Math.atan2` (#471).** Node's and Chromium's `Math.atan2` differ in the last bit at some points, so a lattice point exactly on a Siemens star's sector boundary can fall in different sectors in the two realms' CPU references (up to ΔE2000 23 at 27 display pixels of a 2028 × 128 band on SwiftShader). The acceptance harness judges the GPU against the reference of its own browser realm and records the Node difference as information.
- **Hardware conformance of the #471 fixes:** the M5 Pro `test:webgpu:hardware` run of October 27, 2026 (165 tests, after #487) passed every non-composite test within its bounds (the sensor stage with 0 differing sites, the chart-radiance presets, the temporal sum, the convolution, SDR and RAW development, the Speed and Quality preset fixtures, the 24 defocus grid cases and R 64 and R 94 on non-composite charts); its 27 failures are the composite probe's refusal below ([hardware record](WEBGPU_DEVICES.md)).
- **The composite probe refused the Apple M5 Pro (October 27, 2026): found to be reassociation, fixed by a rounding barrier, passed on that device; the owner's run on the commit to be tagged pending.** The owner's first `npm run accept:gpu:hardware` run (Apple M5 Pro, Chrome, WebGPU on Metal, engine `main` at 14f9032) failed all 26 cases: 21 with the composite kernel's double-float32 probe refusing the device ("does not evaluate the composite chart kernel's double-float32 arithmetic as written (reassociated or fused)"; every case is a `material-layers` scene and needs the composite material module), and 5 with `ENOTEMPTY` from the harness's browser cleanup on macOS, which masked the same refusal. `test:webgpu:hardware` failed its 27 composite tests (the composite-module display-view cases, the #491 Quality material-layers case, the composite defocus cases, every #477 composite stage element test and the rollout composite case) with the same refusal, and its rollout suite hit the same `ENOTEMPTY`. The probe of that commit did not say which component differed. WGSL permits fusing a multiply and an add into one rounding and reassociating (§ 15.7.5), and an unfused `fma` (§ 15.7.2, § 17.5.32); which one Metal does is a **hypothesis until the re-run**. **The fix:** the probe now names each differing component (TwoSum `s.l`, TwoProduct `m.l`, double-word add `a.l`, double-word multiply `q`, and the fma path's `mf.l`, `qf`) with its probe inputs and float32 bits, classifies the device (`exact`, `contracted`, `reassociated`, `other`) in the refusal's message and in `diagnostics.fast.execution.compositeProbe`, and a device whose Dekker path fails but whose fused `fma` holds runs the composite kernel with an fma product path that a fusion cannot change ([WebGPU, the device probe](WEBGPU.md#composite-charts-chart-elements-and-mask-layers-477)); the cleanup now waits for the browser to exit, retries the removal and never fails a case. On the emulation of fused contraction the fma path renders the #491 fixtures with the same flags as unfused; SwiftShader keeps the Dekker path and its `fma` is not fused, so **the fma path has not run on hardware**. **The re-run** reported `reassociated` (every differing low part zero, the value (a + b) − a → b gives), which the fma path does not survive. **The barrier:** every operation of the error-free transforms and every value of the bound arithmetic is wrapped in `ob(x) = bitcast<f32>(bitcast<u32>(x) ^ zero)` with `zero` a uniform word the host sets to 0, which the compiler cannot see through ([WebGPU, the re-run](WEBGPU.md#composite-charts-chart-elements-and-mask-layers-477)); it changes no bit where the arithmetic was already evaluated as written. **Measured on the M5 Pro** (one run each, engine `9ce630b` with the barrier, before its commit): the probe `exact` on the Dekker path; `npm run accept:gpu:hardware` PASS, 26 of 26 compared on `webgpu-f32` (100.00 % within ΔE2000 1, largest ΔE2000 0.0010, largest |Δ|/σ 0.002, 8-bit codes equal to the reference's in every pixel); `npm run test:webgpu:hardware` 167 of 167. The release gate below still needs the owner's run on the commit to be tagged.

## Rights and licensing

No third-party code, data or dependencies are added. The CI workflow installs Playwright's Chromium in the job (`playwright@1.63.0`, Apache-2.0) without adding an npm dependency. The accuracy bounds cite the W3C WGSL specification's "Floating Point Accuracy" table; ΔE2000 follows Sharma, Wu and Dalal (2005), implemented from the definitions. The acceptance harness's label is a generic engine-authored stand-in; the app's artwork is not copied.

## Privacy and security

No network, persistence or telemetry is added. GPU use is opt-in per call (`gpu: "off"` by default) and can be vetoed per realm with `setWebGpuEnabled(false)`. The execution label records the adapter as `GPUAdapter.info` reports it (vendor, architecture, device, description, as the browser chooses to expose them) in diagnostics the caller holds; the engine sends it nowhere. GPU caches are bounded (four scenes' records per renderer, released by `dispose()`), and a kernel table above the device's storage limit is refused by name (`insufficient-limits`), never clipped.

## Release gates

1. **GitHub CI** on the exact commit that is tagged (the `main` commit that merges this record), including the `webgpu conformance (SwiftShader)` job. Tag it only when its CI is green. Local results on this candidate are recorded in its pull request.
2. **The owner's hardware acceptance on the Apple M5 Pro**, on the commit to be tagged, with the steps of [Display view, Preview acceptance](DISPLAY_VIEW.md#preview-acceptance) and [WebGPU, Running on hardware](WEBGPU.md#running-on-hardware):
   - `npm ci && npm run build && npm run accept:gpu:hardware -- --record display-view-acceptance-m5-pro-<date>`: passes when the verdict line reads `PASS` and every case ran `webgpu-f32` on a hardware adapter with its conformance self-check passed. All 26 cases are expected to be compared: `app-defocus` is rendered on the GPU since #499 (on SwiftShader it was, above), so an `EXPECTED FALLBACK` line for it on this candidate is a finding to investigate, not a pass. The owner also reviews the difference images at 1:1 for structured differences.
   - `npm run test:webgpu:hardware`: passes when every test passes on a hardware adapter (`softwareAdapter: false`). The October 27 runs: 82 of 89 before the #471 fixes; 138 of 165 after them, the 27 failures all the composite probe's refusal (above).
   - **The M5 Pro finding's re-run (done; reassociation, then the rounding barrier passed, see Known issues):** on the commit with the probe fix, `npm run accept:gpu:hardware` prints for every case `composite probe class …, product path …` and, on a refusal, the differing components with their inputs; `test:webgpu:hardware` records the probe and both paths in `test/webgpu/stages.webgpu.ts` ("composite chart probe and product paths"). A pass needs class `exact` or `contracted` with product path `dekker` or `fma` and every case compared. With the rounding barrier the M5 Pro reports `exact` and `dekker`, all 26 cases compared and passing, 167 of 167 tests; that run was on the barrier's working tree, so the owner's run on the commit to be tagged is still the gate.
   - Each run is recorded as a row of [the hardware record](WEBGPU_DEVICES.md) and linked from this record. Optionally, `PHOTIVRA_WEBGPU_TIMING_OUT=… npm run bench:webgpu:hardware` and the acceptance run's render times give the first GPU timings (#475); until then no GPU speed is claimed.

## Remaining release checklist

- [x] The 2.11.0 changes merged with their changelog entries (#484, #485, #486, #487, #488, #489, #490, #493, #494, #495, #497, #498, #499, #500, #501).
- [x] Version surfaces aligned at 2.11.0 (`npm run release:prepare -- 2.11.0`). Root exports 1,762, then 1,765 with the composite probe's record types (the M5 Pro fix).
- [x] Hash locks unchanged; no test change needed for the version string (see "Hash locks").
- [x] Fingerprint against `v2.10.0`: bytes identical in all 24 results; the only difference is the new `diagnostics.fast.execution` label in the 3 display views (run on `main` at `63934af`, with #500, and again with #501 merged: all 24 identical to the first run).
- [x] Semver: no root export removed or changed incompatibly (exports manifest and API reference compared with `v2.10.0`).
- [x] #501 (#496) merged into this candidate (`598aae3`).
- [ ] Owner's review of this record.
- [ ] Green CI on the record pull request, then on `main` after merge.
- [ ] **The owner's M5 Pro runs of `npm run accept:gpu:hardware` and `npm run test:webgpu:hardware`** on the commit to be tagged, passed and recorded in [the hardware record](WEBGPU_DEVICES.md).
- [ ] **The owner's explicit approval to tag `v2.11.0`** on the `main` commit that merges this record, after its CI and the hardware acceptance have passed.
- [ ] After publication: npm version, dist-tag, integrity and provenance verified; GitHub release notes published; publication dates updated in `CHANGELOG.md`, `README.md`, `SECURITY.md` and this record.
