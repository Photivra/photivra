# Release 2.1.0 (draft)

A minor release: additive features and fixes only. This record is a draft; the coordinator completes it.

## Fixed: `simulateCapture` cancellation in Web Workers

**Problem.** 2.0.0 (#328) made the capture facade yield to the host with `scheduler.yield()` first, to avoid the browser's ≥ 4 ms clamp on nested `setTimeout(…, 0)`. In a module Web Worker that cancels a capture by posting a message that aborts its `AbortSignal`, the message was not handled until the capture finished.

**Cause, from the specification.** WICG, *Prioritized Task Scheduling* (Community Group draft, https://wicg.github.io/scheduling-apis/; source checked at WICG/scheduling-apis commit `0e7fece`, W3C Software and Document License):

- `scheduler.yield()`: "The priority of the continuation … [is] inherited from the originating task. … If the originating task did not have a priority, then "user-visible" is used." (§ The `Scheduler` Interface).
- "Continuations have a higher effective priority than tasks with the same TaskPriority." A user-visible continuation has effective priority 3, above a user-visible task (2) (§ Task and Continuation Priorities; effective priority table).
- The event-loop patch leaves the choice between scheduler and other task queues implementation-defined, but states the intent that "user-visible" continuations "are typically considered to be more important" than most other event loop tasks, and suggests running effective priority 3 and above "higher than most other task sources" (§ Event loop: processing model, note).
- The explainer (`explainers/yield-and-continuation.md`, "Preventing Task Starvation by Continuations") names the starvation risk and proposes only a duration bound, "e.g. schedule the next continuation as a normal task after one second of recursive continuations"; its "denylist" sketch lists self-directed `postMessage()` and `MessageChannel` among sources continuations may run ahead of.

A capture yields every ~8 ms, so the continuations keep the worker's `message` task from running.

**Fix.** `src/facade/host-yield.ts` yields with a `MessageChannel` message first, else `setImmediate`, else `setTimeout`; `scheduler.yield()` is no longer used. A `MessageChannel` message is a new task on the HTML posted message task source, the same source as worker and port `message` events (WHATWG HTML, § Web messaging / § Task sources, https://html.spec.whatwg.org/multipage/), and tasks of one source run in queue order, so a cancel queued before the next yield runs first. Timers are not involved, so the 4 ms nesting clamp (WHATWG HTML, § Timers) does not apply. This is the only place in `src/` that picks a host yield mechanism; the other tasks await the caller's `yieldControl`.

**Evidence.**

- Output unchanged: yields change scheduling only. The five hash locks and the `simulateCapture` digest baseline (`test/simulate-capture-integration.test.ts`) pass unchanged. Built `dist` digests (SHA-256 of image samples, RAW codes and JPEG bytes; 24 × 16 sRGB and 16 × 16 JPEG captures) are identical for 2.0.0 taking its `scheduler.yield` path (a `scheduler.yield` shim in Node) and this change: `a4788e54b93e4d69…`, `b2177454c2e5b9ea…`.
- Regression tests (fail on 2.0.0, pass now): `test/host-yield.test.ts` ("does not starve queued tasks when the host's scheduler.yield runs continuations first": a fake `scheduler.yield` that resolves on microtasks only; a queued `MessageChannel` message must run within 2 yields) and `test/simulate-capture.test.ts` ("sees an abort queued as a separate task even when the host has a continuation-priority scheduler.yield": an abort queued with `setTimeout` after the first RAW tile must stop the capture within 4 tiles; on 2.0.0 the capture completes).
- Chromium 141.0.7390.37 (headless, Playwright), module worker, 4-vCPU Intel Xeon 2.80 GHz, built `dist` of origin/main vs this change. A 128 × 128 capture starts; after 100 ms the page posts a cancel and a 16 × 16 request. Three rounds:

| Build | 128 px run | 16 px result after cancel |
| --- | --- | --- |
| 2.0.0, `scheduler.yield` present | completed, 258 tiles, 2.12–2.34 s | 2.13–2.35 s |
| 2.0.0, `scheduler` hidden (MessageChannel path) | aborted after 1 tile | 0.17–0.21 s |
| this change | aborted after 1 tile | 0.15–0.20 s |

  Uncancelled 128 × 128 capture, six alternating rounds: median 2.17 s (2.0.0) vs 2.16 s (this change), within run-to-run spread (1.97–2.50 s); no throughput change.

## Added: diffraction and AHD demosaicing in `simulateCapture`

**Problem.** By default `simulateCapture()` applies no lens PSF, so the aperture changed only exposure, never sharpness; and with no optical blur the bilinear demosaic showed strong zipper and false colour on sharp chart edges. The only way to add blur was a caller `lens.psf`, and no engine function built a sampled profile for a diffraction-limited lens. The per-tap PSF path was also slow: 13.1 s for a 48 × 48 capture at f/8 with 9 × 9 kernels.

**Change.** `createDiffractionLimitedPsfProfile` (new root export), `lens.diffraction` and `output.demosaic: "ahd"` in the facade (opt-in), and an object-space convolution execution of the diffraction (`src/facade/diffraction-provider.ts`). The anti-aliasing (optical low-pass) filter was investigated and not added; see below.

### Science evidence: diffraction-limited PSF

- **Model.** Scalar Fraunhofer diffraction of an ideal, uniformly lit circular pupil: the incoherent OTF is the normalized pupil autocorrelation H(ρ) = (2/π)(acos ρ − ρ√(1 − ρ²)), ρ = f/f_c, f_c = 1/(λN_w), and the intensity PSF (the Airy pattern, first dark ring at 1.21967·λN_w) is its Fourier transform. Source: [MIT OpenCourseWare 2.71 Optics, Spring 2009, lectures 21–22](https://ocw.mit.edu/courses/2-71-optics-spring-2009/resources/mit2_71s09_lec22/) (free). Also see: Goodman, *Introduction to Fourier Optics*, 4th ed., 2017, §6.3. The pupil diameter is D = f/N and the pupil-to-image distance the thin-lens image distance, so N_w = N·v/f (1.0101·N at 5 m with 50 mm), the same convention `docs/PSF_FOUNDATION.md` gives for the complex-pupil evaluator.
- **Cell integration.** Each kernel sample is the PSF energy in a square cell of side p (the site pitch in the facade): K(i, j) = p²∫∫ H·sinc(p f_x)·sinc(p f_y)·cos(2πp i f_x)·cos(2πp j f_y) d²f, evaluated in polar coordinates (trapezoid in angle, Gauss–Legendre in t with ρ = 1 − t²). All cells together hold exactly 1 (Parseval), so the energy outside the window is 1 − ΣK. Gauss–Legendre nodes from Newton's method on the Legendre polynomials ([DLMF §3.5(v)](https://dlmf.nist.gov/3.5#v), free).
- **Labelled approximations.** Scalar (no polarization); aberration-free; uniform pupil; exactly in focus; thin lens with unity pupil magnification; the on-axis PSF used across the field (isoplanatic); PSF energy binned into cells; the Airy tail outside the (2R+1)² window (2–5 % of the energy with the facade's default window to the third dark ring) is reported per wavelength and put back by unit-sum renormalization, which slightly raises low-frequency contrast. The pixel aperture is not modelled (sites are sampled at their centres, as before). Not a measured lens.
- **Verification** (`test/diffraction-psf-profile.test.ts`). Node counts doubled change no cell by more than 1e-13 (measured 9e-17 to 6e-15 at β = p·f_c = 0.2, 1.35, 3.9). Cell energies match an independent real-space integration of the Airy pattern ([2J₁(z)/z]² from the J₁ power series, 6 × 6 sub-cells of 16² Gauss points) within 2e-10, and the engine's own `calculateIdealPolygonDiffractionPsf` in its 1024-blade circular limit within 1e-6. Kernels are unit-sum, symmetric and positive; the captured energy grows with the window; profiles parse and resolve at any field point.

### Equivalence and speed of the object-space convolution

- **Argument.** The environment PSF quadrature computes E(q, λ) = Σ_k K_λ(k)·T·L(s_k(q), λ). In the facade the radiance-to-irradiance factor T is the same at every sensor point (paraxial π/(4N_w²), no cos⁴ term), and with kernels sampled on the site pitch every tap source s_k(q) is another site centre, seen through one linear map when the camera is still and there is no projection, distortion or field throughput. The sum is then T·(K_λ ⊛ L) on the site lattice: the same terms in a different order. `calculateIrradianceConvolution` (kernels from `resolveLensPsfConvolutionKernels`, exact site sampling) computes it once per spectral node over the native raster plus the kernel radius, in 32-row bands; the provider answers each site query from it and the site inputs declare no PSF. A query off the lattice is refused, and the facade keeps the per-tap path when rotation, a lens field mapping or vignetting is present.
- **Tests** (`test/simulate-capture-optics.test.ts`). Expected generated electrons at every site of 10 × 8 captures at f/16 (15 × 15 kernels) agree with the per-site engine using `request.diffraction.psf` and the plain scene provider to a relative 1e-12 (measured ≤ 1.2e-15) for the slanted edge and point grid; RAW codes equal those of the facade's per-tap path. Where a chart boundary passes exactly through the site lattice (the checkerboard's u = ±0.5 column at that frame size, the Siemens star's diagonals, the grey-ramp steps) a tap on the boundary picks its material by the last bit of its coordinate, which the two paths compute in different orders; measured differences there reach 1.4 % (checkerboard) and 55 % (star centre). This is point-sampling ambiguity of the scene, which neither path resolves, not a difference in the optics.
- **Timing** (4-vCPU Intel Xeon 2.80 GHz, Node 24, built `dist`, median of 3): 48 × 48 slanted edge at f/8 with diffraction: per-tap 13.1 s, object-space 0.56 s.

| Chart | Output | f | default (s) | diffraction | AHD | both |
| --- | --- | --- | --- | --- | --- | --- |
| slanted edge | 48 × 48 | f/4 | 0.45 | 0.49 | 0.62 | 0.68 |
| slanted edge | 48 × 48 | f/8 | 0.41 | 0.53 | 0.48 | 0.69 |
| slanted edge | 48 × 48 | f/16 | 0.40 | 0.71 | 0.48 | 0.84 |
| slanted edge | 128 × 128 | f/4 | 2.28 | 2.59 | 2.40 | 2.85 |
| slanted edge | 128 × 128 | f/8 | 2.18 | 2.79 | 2.44 | 3.12 |
| slanted edge | 128 × 128 | f/16 | 2.20 | 3.43 | 2.52 | 4.00 |
| Siemens star | 48 × 48 | f/4 | 0.38 | 0.62 | 0.63 | 0.60 |
| Siemens star | 48 × 48 | f/8 | 0.38 | 0.50 | 0.51 | 0.66 |
| Siemens star | 48 × 48 | f/16 | 0.38 | 0.66 | 0.51 | 0.87 |
| Siemens star | 128 × 128 | f/4 | 2.14 | 2.49 | 2.43 | 2.76 |
| Siemens star | 128 × 128 | f/8 | 2.18 | 3.10 | 2.54 | 3.17 |
| Siemens star | 128 × 128 | f/16 | 2.20 | 3.35 | 2.40 | 3.78 |

  The convolution of a band runs inside one provider call (no host yield inside it); at 128 × 128, f/16 a band takes roughly 0.3 s.

### Sharpness now falls with f-number

128 × 128 captures, exposure held constant (shutter (N/8)²/125 s), bilinear demosaic, linear luminance of the decoded sRGB output. Edge width: median 10–90 % rise per row of the 5° slanted edge. Star modulation: (p95 − p5)/(p95 + p5) of the luminance on a circle of the 36-cycle star. Last column: the Airy OTF at 550 nm at the star's frequency at that radius, for comparison only (the measurement also includes demosaicing, point sampling, the window renormalization and the 380–780 nm spread).

| f-number | diffraction | edge 10–90 % (px) | star modulation, r = 48 px (8.4 px period) | r = 24 px (4.2 px period) | Airy OTF at 550 nm (r = 48 / 24) |
| --- | --- | --- | --- | --- | --- |
| f/4 | off | 1.49 | 0.882 | 0.625 | — |
| f/4 | on | 1.56 | 0.867 | 0.597 | 0.944 / 0.888 |
| f/8 | off | 1.49 | 0.882 | 0.625 | — |
| f/8 | on | 1.69 | 0.828 | 0.550 | 0.888 / 0.776 |
| f/16 | off | 1.49 | 0.882 | 0.625 | — |
| f/16 | on | 2.73 | 0.743 | 0.389 | 0.776 / 0.559 |

Without diffraction the sharpness does not depend on the aperture; with it, the edge widens and the star loses contrast monotonically with f-number, in the direction and rough proportion the Airy OTF predicts. These are measurements of the synthetic model, not of a real lens.

### AHD demosaic

`output.demosaic: "ahd"` normalizes the RAW sites exactly as the native development kernel (flagged or white-level sites are 1), demosaics them with the existing `createAhdDemosaicTask` (Hirakawa & Parks, *IEEE Trans. Image Processing* 14(3), 2005; method as documented in `docs/PROCESSING.md`) with the homogeneity measured on white-balanced colour, then applies the native development's colour operator (`developInto`) and SDR kernel. A 5-site rendered margin keeps every output pixel off the mirrored plane edge. Mean false colour |R − G| + |B − G| (8-bit codes) on neutral charts at f/8:

| Chart | Output | bilinear | AHD | bilinear + diffraction | AHD + diffraction |
| --- | --- | --- | --- | --- | --- |
| Siemens star | 32 × 32 | 209.4 | 138.5 | 173.7 | 111.9 |
| Siemens star | 128 × 128 | 100.8 | 68.7 | 88.0 | 53.6 |
| slanted edge | 32 × 32 | 11.4 | 5.3 | 9.4 | 4.3 |
| slanted edge | 128 × 128 | 4.9 | 2.9 | 4.4 | 2.6 |

### Investigated, not added: anti-aliasing filter

The generic tier presets declare no optical low-pass filter (the facade's optical stack declares `effectiveAntiAliasingSpatialResponse: absent`), so there is no tier value to apply. The engine models an AA filter as a caller-declared `normalized-point-splitting-kernel` (resolved by `resolveAntiAliasingSpatialKernel`) that the per-site spatial quadrature applies. A facade pass-through is feasible but (1) multiplies the scene queries by the number of split points (4 for a two-plate birefringent filter), about 4× the capture time, and (2) moves the quadrature points half a site off the lattice, so it would force diffraction back onto the per-tap path. Plan: accept `sensor.antiAliasing: { components }` passed to the optical stack, and extend the object-space convolution to a half-site lattice when every split offset is a multiple of half the pitch (then the split is one more convolution of the same kind).

### Compatibility

All three options are opt-in. Captures that do not use them are byte-identical to 2.0.0: a hash lock in `test/simulate-capture-optics.test.ts` checks the RAW codes, every output byte, the assumptions, composed contracts and diagnostics of six captures (sRGB, PNG, JPEG with auto white balance, mirror borders with 16-bit output, Display P3, DNG in program mode) against digests recorded from the 2.0.0 source. The integration test's unknown-demosaic case now uses `"lmmse"`, because `"ahd"` is accepted.
