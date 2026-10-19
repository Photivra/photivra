# Display view

`simulateDisplayView(options, view)` returns the image that the real full-resolution capture of a
`simulateCapture` request would give after it is resized to a small display size, without rendering
the full-resolution capture. Use it for on-screen previews of a whole frame; use `simulateCapture`
for the files people keep (exports stay real captures).

```ts
import { NATIVE_RAW_LIMITS, simulateDisplayView } from "@photivra/engine";

// A 24 MP full-frame capture (6000 × 4000 sites of 6 µm) shown at 384 × 256.
const request = { scene: { preset: "siemens-star" as const }, lens: { prime: 50, fNumber: 8 }, sensor: { pixelPitchMicrometers: 6 },
  output: { width: 6000, height: 4000, maximumPixels: NATIVE_RAW_LIMITS.ceilingPixels } };
const view = await simulateDisplayView(request, { width: 384, height: 256 });
console.log(view.kind, view.view.scaleX, view.image.samples.length, view.diagnostics.timingsMs.view);
```

The request is the one you would pass to `simulateCapture` for the export, so exposure, white
balance, tone curve and framing are the capture's by construction (the same code resolves them).
The result is labelled `kind: "display-view"` and has no RAW, plan or file: it is not a capture.

## The problem with giant pixels

Before the display view, a small whole-frame view was rendered by simulating a camera whose pixel
pitch is sensor width ÷ output width (2.5 whole-frame views, assumption `sensor.wholeFrameView`):
36 mm at 384 pixels is a 93.75 µm pixel. Everything that happens at the pixel scale then belongs to
that giant-pixel camera, not to the real one:

- the colour mosaic samples the scene every 93.75 µm instead of every 6 µm, so mosaic aliasing and
  demosaic false colour appear at the display scale, where a real 24 MP capture has averaged them away;
- diffraction, the anti-aliasing filter and the pixel aperture act relative to the giant pixel (an
  Airy disc of a few µm inside a 94 µm pixel does nothing), not relative to the real 6 µm pixel;
- the noise is that of one giant photosite (binned charge, one read noise), not the average of the
  roughly 244 real pixels that form each display pixel, each with its own shot and read noise, after a
  demosaic that correlates neighbours.

The whole-frame views stay available unchanged; the display view is a separate function.

## What the display view computes

**Definition.** Let L_j be the linear-light value of output pixel j of the real capture: its sRGB
samples (rounded to the view's bit depth) decoded with the sRGB EOTF. Display pixel P covers the
rectangle F_P = [P_x·s_x, (P_x + 1)·s_x) × [P_y·s_y, (P_y + 1)·s_y) of real output pixels, with
s = frame size ÷ view size per axis, and

  D_P = Σ_j (w_j / A) · L_j,

where w_j is the area of pixel j inside F_P and A = s_x·s_y. D_P is then sRGB-encoded and rounded.
This is area (box) resampling, the standard reduction filter that averages exactly the source area
each output pixel covers (PBRT, §7.8 "Image reconstruction", box filter; OpenCV's `INTER_AREA`),
carried out in linear light so that the average is the average of light, as a shrunk photograph is,
rather than the darker average of gamma-encoded values (Poynton, *Gamma FAQ*). Non-integer scales are
handled exactly by the fractional weights w_j.

That definition is the validation reference: a region of the real capture, rendered with
`output.region` (byte-identical to the whole render), decoded, area-averaged and compared.

## Options studied

| Approach | Exact? | Cost per display pixel | Used for |
| --- | --- | --- | --- |
| (a) Render every real pixel and average | yes | s² real pixels (244 at 6000 → 384; 3 900 at 6000 → 96) | the validation reference |
| (b) Average a random subset of real pixels | unbiased for the mean only | K² pixels | the scene integral (expected value) |
| (c) Linear kernels at display resolution | for the linear chain | O(1) after the scene integral | demosaic, colour and noise |

(a) costs what a 24 MP capture costs (about 3 000 s for a whole frame at the measured 0.12 ms per
site), so it can only be the reference. (b) alone is wrong for the noise: the mean of K² sampled
noisy pixels has the noise of K² pixels, not of the s² pixels the real average contains, and it is
biased wherever a non-linear step meets the noise. (c) alone cannot work for an arbitrary scene: the
expected signal of a display pixel is an integral of the scene over its footprint, through the
optics, at the real sites, and only a quadrature can evaluate that.

The display view therefore combines them:

1. **Expected value by stratified Monte Carlo over real pixels ((b) for the scene integral only).**
   Each sample is a real pixel; for it the expected (noise-free) electrons of the real sites its
   demosaic reads are computed exactly, at the real pitch.
2. **Everything after that analytically ((c)).** Each sampled pixel's noise distribution is
   propagated through the readout, the demosaic kernels, white balance, the highlight clip, the colour
   matrix, the tone curve and the clip to [0, 1]. The noise of the display pixel is the exact variance
   of the area mean of independent site noises, demosaic correlation included.
3. **AHD's non-linear choice by a control-variate correction** where the noise is large enough for it
   to matter (below).

## Expected signal at the real sites

For a still camera, an ideal rectilinear distortion-free lens and the facade's planar Lambertian scene,
the environment chain's radiance-to-irradiance factor is the same at every site (paraxial π/(4N_w²),
no cos⁴ term). The expected photo-electrons of site (i, j) with CFA channel c are therefore a linear
functional of the scene radiance,

  μ_c(i, j) = Σ_o w_o Σ_λ A_c(λ) Σ_t K_λ(t) · L(p_o(i, j) − t, λ),

with A_c(λ) the electrons per unit spectral radiance at spectral node λ (the facade's own environment
chain evaluated once on the axis, as in the ideal reference), o the pixel-aperture nodes times the
anti-aliasing split spots with weights w_o, and K_λ the diffraction kernel on the site lattice (one
unit tap without `lens.diffraction`). Dark electrons (1 e⁻/s × exposure) are added.

- Chart materials are tabulated once per channel: neutral materials share one table scaled by their
  reflectance, spectral materials get their own, so each lattice point costs one material lookup.
- With diffraction, offsets that share a fractional shift (the centred four-spot filter has one
  half-site-shifted lattice) are combined with the kernels in advance, as the capture's object-space
  convolution does, and lattice points are evaluated with the same formula as
  `createDiffractedPlanarProvider`.
- Without diffraction, query points use the environment's own arithmetic (site centre, aperture node,
  split offset, rectilinear ray, planar intersection), so a point that falls exactly on a chart
  boundary (a Siemens star's diagonal) resolves to the same material as in the capture.
- A test evaluates μ for 24 sites in each of seven configurations (point, box plus four-spot,
  diffraction plus four-spot at f/16 with AHD margins, diffraction with mirror borders, a caller
  function, spectral patches on a fixed-size chart) against `calculateEnvironmentSensorPhotoSignal`
  with the capture's own provider: equal within 1e-9 relative.

Because each sample is a real site of the real lattice, the colour mosaic and its aliasing are
represented as they are: the red sites of a 6 µm sensor sample the scene every 12 µm, and content near
that frequency aliases into the display pixel exactly as it does in the real average (the expected
value of the box-averaged mosaic contains Σ_k Ŝ(f − k/(2p)), and the box passes the aliases that land
near zero frequency). Sampling theory: MIT OpenCourseWare 6.003, lectures on sampling and aliasing.

### Monte Carlo estimator and its error

A point drawn uniformly in F_P lands in real pixel j with probability w_j/A, so the mean of
E[L_j] over such points is unbiased for E[D_P]. The rectangle is split into K × K strata with one
seeded, uniformly jittered point in each (stratified sampling; Owen, *Monte Carlo theory, methods and
examples*, §8.4; PBRT §13.8):

- where E[L] is constant over the footprint the estimate is exact for any K;
- at a straight edge of contrast C, about K strata are cut and each contributes a variance of at most
  C²·f(1 − f)/K⁴, so σ ≈ C/(√6·K^{3/2}): 0.6 % of the contrast at K = 16;
- n edges in a pixel add their variances: σ ≈ C·√(n/(6K³)).

Measured at the centre of a 36-cycle Siemens star (every display pixel crossed by many edges), the
RMS error of the expected value fell from 10.1 to 3.8, 1.4 and 0.49 8-bit codes for K = 4, 8, 16 and
32: a factor 2.6–2.8 per doubling of K, as K^{-3/2} predicts.

**Pilot.** A fixed grid (one point per about two sites, 4 to 16 per axis) over the footprint widened by
the demosaic, filter and kernel reach classifies each display pixel. Pixels whose grid returns one
scene value, and whose eight neighbours' grids do too, use K/4 samples per axis (at least 1); the
others use K. The grid is deterministic, so the sample count does not depend on the random draws and
the estimate stays unbiased either way; the neighbour rule catches edges that only clip a corner.

The samples and the noise of each display pixel are seeded by `sensor.noiseSeed` and the display
pixel's index (`view.region` renders are byte-identical to the same pixels of the whole view).

## Readout, demosaic and development of a sampled pixel

**Sites.** Each site's normalized RAW value (code − black)/(white − black) is approximately normal with
mean k_c·e and variance k_c²·(e + σ_read²) + Δ²/12/(W − B)², where e is the expected electrons
(photo plus dark, Poisson, so variance e), k_c = digital gain/(conversion gain·(W − B)), σ_read the
regime's combined read noise and Δ²/12 the ADC rounding (times the digital gain squared, plus a
second rounding when a digital gain applies; EMVA 1288 Release 4.0, §2; Bennett 1948). It is then
clipped at the white level 1, exactly as the development clips sites; for Y ~ N(m, s²) and
z = (1 − m)/s:

  E[min(Y, 1)] = m − s·(φ(z) − z·(1 − Φ(z))),   E[min(Y, 1)²] = m²Φ − 2msφ + s²(Φ − zφ) + (1 − Φ),

with Φ from Abramowitz & Stegun 26.2.17 (error below 7.5e-8).

**Demosaic.** The bilinear demosaic is linear: each camera channel of the pixel is Σ_k w_k·n_k, with
mean Σ w_k E[n_k] and, the sites being independent, variance Σ w_k² Var(n_k); the three channels use
disjoint sites, so they are uncorrelated.

**AHD** (Hirakawa & Parks 2005, `createAhdDemosaicTask`) builds two candidates, green along the rows
or the columns with the 5-tap filter, red and blue from colour differences. Each candidate is linear in
the mosaic (`ahdCandidateKernels` derives its kernels as responses to unit sites, reach 3); AHD's only
non-linear step is choosing one per pixel by CIELAB homogeneity. The view propagates both candidates
with their full channel covariance (the colour differences correlate the channels) and averages the
results.

**Development.** White balance multiplies each channel; the highlight clip at the smallest gain uses
the same clipped-normal moments; the colour matrix (camera → XYZ → linear sRGB) combines the channels
with their covariance; the tone curve and the clip to [0, 1] act per component (identity in closed form;
positive Reinhard by 16-point Gauss–Legendre quadrature on four panels). The mean of these moments is
the sample's E[L_j], so a clipped noise floor lifts dark tones and a clipped highlight stays white, as
in the real image.

**Skewness at low signal.** Shot noise is Poisson, so with a few electrons per site a pixel's linear
sRGB component is skewed, and the colour matrix amplifies the skew (red takes 3.24 × X, so the X sites'
third cumulant enters 3.24³ times). A normal model then over-states how much the clip at 0 lifts the
mean. Each component is a linear combination Σ_k a_k·n_k of independent sites, so its third cumulant
is exact, κ₃ = Σ_k a_k³·k_c³·e_k (Poisson electrons have κ₃ = e; read and rounding noise add none), and
the mean of the clip carries the first-order Edgeworth term: with γ = κ₃/s³,
E[(Y − t)₊] gains s·γ·z·φ(z)/6 at z = (t − m)/s, so

  E[clip(Y, 0, 1)] = (normal value) + (s·γ/6)·(a·φ(a) − b·φ(b)),   a = −m/s, b = (1 − m)/s,

with |γ| limited to 1. On a 1.4 µm sensor at ISO 6400 (about six electrons per site on an 18 % grey)
this took the red mean error of the bilinear view from +0.8 to +0.0 codes.

## Noise of the display pixel

Linearize the non-linear steps around each sample with their **expected** slopes Γ (Stein's lemma: for
normal X, Cov(g(X), X) = E[g′(X)]·Var(X), so E[g′] is the best linear predictor's slope; Stein 1981). Then

  D_P − E[D_P] ≈ Σ_k (J·M·Γ)_c(k) · β_k · ε_k,

a weighted sum of the independent site noises ε_k, with β_k = Σ_j (w_j/A)·W_jk the total weight of
site k in the display pixel after demosaicing and averaging. Its covariance is

  Cov(D_P) = Σ_c B_c·σ_c²·a_c·a_cᵀ,   a_c = J·M·Γ·e_c,   B_c = Σ_{k ∈ c} β_k²,

with σ_c² the site variance of channel c (variance of the mean of correlated pixels: NIST/SEMATECH
e-Handbook, §2.5.5, propagation of error). B_c holds the demosaic correlation exactly. For the bilinear
kernels it is separable: with w(k) the overlap of real column k,
b(k) = w(k) + ½(w(k − 1) + w(k + 1)) spreads red and blue, so B_red = Σ_even b(k)²·Σ_even b(l)²/A²
(blue on the odd sites), and green's quincunx sums nine separable terms of p(k) = w(k) and
q(k) = ¼(w(k − 1) + w(k + 1)). A test checks the closed form against a brute-force spread of every
pixel's weight through its phase's kernels to 1e-12. For a demosaic whose kernels preserve the mean,
the block mean of a channel is the mean of that channel's sites plus terms that cancel except at the
block edge, so the bilinear B_c also serves AHD.

Two terms are added as independent per-pixel variances, weighted by Σ_j (w_j/A)²:

- what the linearization misses: Var(g(X_j)) − (linear prediction), non-zero only where a clip or the
  tone curve bends within the noise;
- the real pixels' output rounding, Δ²/12 in the encoded domain mapped to linear light.

D_P is the mean of hundreds of independent site noises, so one correlated normal draw (Cholesky
factor of the 3 × 3 covariance) gives its noise (central limit theorem). It has the statistics of the
resized capture, not the same realization.

## AHD at low signal

AHD's choice between its candidates depends on the noise: with a few electrons per site it prefers
neighbourhoods that look homogeneous, and that shifts the colour. On a phone-size 1.4 µm sensor at
ISO 6400 (about six electrons per site on an 18 % grey) the resized AHD capture's red was 5–7 codes
below what the averaged candidates predict; on a 6 µm sensor at ISO 6400 the effect stayed under
0.3 code.

Where a sampled pixel's noise exceeds 0.01 in linear light, the view draws 64 noisy neighbourhoods per
display pixel (Poisson electrons from the exact expected electrons, plus read and ADC noise, clipped at
white), runs the engine's AHD steps for the centre pixel and the two linear candidates on the same
draw, renders each, and adds the mean of h(AHD) − ½(h(H) + h(V)). This is a control variate (Owen,
§8.9): its expectation is exactly AHD's bias relative to the averaged candidates, and its variance is
far smaller than AHD's own output variance because both terms see the same noise. Its sampling
variance is taken out of the noise drawn for the display pixel, so the total variance stays that of
the resized capture.

## Validation

See [Validation results](#validation-results) below for the tables; this section defines what was
measured.

**Reference.** For each case the real capture of the request is rendered at full resolution over a
block of display pixels (`output.region`, byte-identical to the whole render), as 16-bit sRGB, decoded,
and area-averaged in linear light with the exact fractional weights: approach (a) on the block. The
display view renders the same block with `view.region` (16-bit). One process per case, built `dist`.

**Matrix.** Five charts (slanted edge, 36-cycle Siemens star, bar groups at 100–800 LW/PH, dead leaves,
an 11-step grey wedge) and uniform grey patches; three sensors (full frame 6000 × 4000 at 6 µm,
24 MP; phone 4000 × 3000 at 1.4 µm, 12 MP; medium format 11 648 × 8 736 at 3.76 µm, 100 MP); the
50 mm-equivalent generic prime at f/2.8, f/8 and f/16; ISO 100, 1600 and 6400 (the shutter scaled to the
same exposure); display widths 96, 192, 384 and 800; Speed (the engine defaults) and Quality
(diffraction, four-spot anti-aliasing filter, AHD). Blocks are 16 × 16 or 32 × 32 display pixels
(8 × 8 at width 96) at the chart's busiest place.

**Metrics.**

- *Mean error per channel* (8-bit codes): code(mean of the view's linear values) − code(mean of the
  reference's), with its standard error from both blocks' spreads. In the encoded domain a mean of
  noisy values also depends on the noise's shape through the concave sRGB curve, so the mean is taken
  in linear light and only then expressed in codes.
- *Expected-value RMS and maximum* (8-bit): the view's noise-free estimate against the reference, per
  display pixel; at ISO 100 the reference's own noise is a fraction of a code, so this is the estimator
  error (Monte Carlo plus model), at high ISO it is dominated by the reference's noise.
- *Noise ratio*: the standard deviation of the view's display pixels over a uniform patch divided by
  the reference's (and the view's predicted standard deviation divided by the reference's, which has no
  sampling error on the view side).
- *MTF50* of the slanted edge in cycles per display pixel (Burns 2000; ISO 12233 method: edge
  centroids, a fitted line, 4× oversampled ESF, Hamming window).
- *SSIM* of the two blocks' encoded luma (Wang et al. 2004; 7 × 7 uniform window).
- *False colour*: mean |R − G| + |B − G| in 8-bit codes for the neutral charts.

**Acceptance limits.**

| Metric | Limit | Why |
| --- | --- | --- |
| Mean error per channel | ≤ 0.5 code, or ≤ 2 standard errors when noise dominates | Half a code is below the 8-bit rounding of the output itself; a block of n display pixels cannot resolve a difference below about 2σ/√n. |
| Noise ratio (predicted ÷ reference) | 0.85–1.15 on 16 × 16 blocks, 0.75–1.25 on 8 × 8 | The reference's standard deviation from n pixels has a relative sampling error of 1/√(2(n − 1)): 4.4 % at n = 256, 8.9 % at n = 64; the limits are about 3 such errors. |
| Expected-value RMS at ISO 100 | ≤ 1 code on edges, ≤ 2 codes in the busiest pixels (star centre) | The Monte Carlo error at K = 16 (σ ≈ 0.006·C per edge); it averages out over any feature larger than a display pixel. |
| MTF50 difference at ISO 100 | ≤ 3 % | Slanted-edge MTF50 repeatability between noise realizations is about 1–2 %. |
| SSIM at ISO 100 | ≥ 0.99 | At high ISO SSIM measures two independent noise realizations, so it is reported, not limited. |
| False-colour difference | ≤ 0.5 code, except where the Monte Carlo error itself adds colour (star centre) | The metric is biased upward by any per-channel error. |

## Validation results

(Filled in from `scripts/validate-display-view.mjs`; see below.)

## Cost

(Filled in from the cost measurements below.)

## Limits and refusals

`simulateDisplayView` refuses, with an `InvalidConfigurationError` that names the option, the capture
options whose expected signal it cannot tabulate on the site lattice or whose statistics it does not
model:

- `lens.pupilSampling`, `lens.projection`, `lens.distortion`, `lens.vignetting`, `lens.psf` and camera
  rotation (`motion.angularVelocityRadPerSec`): they move the queries off the site lattice or change the
  radiance-to-irradiance factor between sites;
- `output.whiteBalance: "auto"`: the capture measures it from its noisy full-resolution RAW (use
  `"scene-illuminant"` or a fixed white balance, as for region tiles);
- luminance tone curves (`extended-reinhard-luminance`, `naka-rushton-luminance`) and
  `output.highlightMode: "reconstruct"`, which couple the channels non-linearly;
- `output.region` (pass `view.region` in display pixels instead).

A still camera with a rolling shutter is accepted (each site's window has the same length, so the
expected signal is unchanged). The capture's file-format options (`format`, `colorEncoding`,
`bitDepth`, `gamutMapping`, `jpegQuantizationStep`, `dng`, `metadata`) do not apply: the view shows the
capture's sRGB rendering, as `srgb-8` (default) or `srgb-16`. `onProgress` is not called; `signal`
cancels the view.

Approximations, recorded in the `view.*` assumptions:

- each sampled pixel's noise is treated as normal for the non-linear steps, with the first-order
  Edgeworth (skewness) term on the clip at 0; higher cumulants are not modelled;
- the noise of the display pixel is drawn as one correlated normal value;
- the residual variance of the clips is treated as independent between neighbouring pixels;
- AHD's candidates are averaged, and its choice is corrected only where a pixel's noise exceeds 0.01;
- JPEG compression of a JPEG export is not part of the view.

## Sources

- M. Pharr, W. Jakob, G. Humphreys, *Physically Based Rendering: From Theory to Implementation*, 3rd ed.,
  free at <https://pbr-book.org/3ed-2018/> (§7.8 image reconstruction and the box filter; §13.8
  stratified sampling).
- OpenCV documentation, `cv::resize` interpolation flags (`INTER_AREA`: resampling using pixel area
  relation), free at <https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html>.
- C. Poynton, *Frequently Asked Questions about Gamma* (1998), free at
  <https://poynton.ca/GammaFAQ.html> (linear-light versus gamma-encoded arithmetic); W3C CSS Color
  Module Level 4 (sRGB transfer functions), free at <https://www.w3.org/TR/css-color-4/>.
- MIT OpenCourseWare 6.003 *Signals and Systems* (Fall 2011), lectures on sampling and aliasing, free at
  <https://ocw.mit.edu/courses/6-003-signals-and-systems-fall-2011/>.
- A. B. Owen, *Monte Carlo theory, methods and examples* (2013), free at
  <https://artowen.su.domains/mc/> (§8.4 stratification, §8.9 control variates).
- C. M. Stein, "Estimation of the mean of a multivariate normal distribution", *Annals of Statistics*
  9(6), 1981, free at <https://projecteuclid.org/journals/annals-of-statistics/volume-9/issue-6/>
  (Stein's lemma: Cov(g(X), X) = E[g′(X)]·Var(X) for normal X).
- NIST/SEMATECH *e-Handbook of Statistical Methods*, §2.5.5 propagation of error, free at
  <https://www.itl.nist.gov/div898/handbook/>.
- W. R. Bennett, "Spectra of quantized signals", *Bell System Technical Journal* 27(3), 1948, free at
  <https://archive.org/details/bstj27-3-446> (quantization noise Δ²/12).
- M. Abramowitz, I. A. Stegun, *Handbook of Mathematical Functions*, NBS AMS 55 (1964), free US government
  work (26.2.17 normal distribution function; 25.4.29 Gauss–Legendre quadrature).
- EMVA Standard 1288 Release 4.0 Linear, free at <https://www.emva.org/standards-technology/emva-1288/>
  (photon transfer: shot, read and quantization noise of a pixel).
- K. Hirakawa, T. W. Parks, "Adaptive homogeneity-directed demosaicing algorithm", *IEEE Transactions on
  Image Processing* 14(3), 2005 (the AHD candidates and homogeneity choice, as in `createAhdDemosaicTask`).
- P. D. Burns, "Slanted-Edge MTF for Digital Camera and Scanner Analysis", Proc. IS&T PICS 2000, free at
  <https://www.imaging.org/common/uploaded%20files/pdfs/Papers/2000/PICS-0-81/1621.pdf>.
- Z. Wang, A. C. Bovik, H. R. Sheikh, E. P. Simoncelli, "Image quality assessment: from error visibility
  to structural similarity", *IEEE Transactions on Image Processing* 13(4), 2004, free at
  <https://www.cns.nyu.edu/pub/eero/wang03-reprint.pdf>.
