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
- the real pixels' output rounding, Δ²/12 in the encoded domain mapped to linear light;
- with AHD, the variance of its per-pixel choice: where the choice is driven by noise, each pixel
  deviates from the candidates' average by ±½(H − V), variance ¼·Var(H − V), linear in the sites.
  AHD sums homogeneity over 3 × 3 pixels, so neighbouring choices are correlated and this
  independent-pixel term under-states the block variance somewhat (see the Quality noise rows).

D_P is the mean of hundreds of independent site noises, so one correlated normal draw (Cholesky
factor of the 3 × 3 covariance) gives its noise (central limit theorem). It has the statistics of the
resized capture, not the same realization.

## AHD at low signal

AHD's choice between its candidates depends on the noise: with a few electrons per site it prefers
neighbourhoods that look homogeneous, and that shifts the colour. On a phone-size 1.4 µm sensor at
ISO 6400 (about six electrons per site on an 18 % grey) the resized AHD capture's red was 5–7 codes
below what the averaged candidates predict; on a 6 µm sensor at ISO 6400 the effect stayed under
0.3 code.

Where a sampled pixel's noise exceeds 0.01 in linear light, the pixel adds AHD's bias for a flat
neighbourhood with its own channel means, measured as a control variate (Owen, §8.9): noisy flat
neighbourhoods are drawn (Poisson electrons plus read and ADC noise, clipped at white, all four CFA
phases), the engine's AHD steps and the two linear candidates run on the same draw, and the mean of
h(AHD) − ½(h(H) + h(V)) is the bias. Both terms see the same noise, so the difference has far less
variance than AHD's own output.

The bias is a smooth function of the channel means, so it is computed on a logarithmic grid of
states (8 steps per octave over 12 octaves below white), 2048 draws per state seeded by the state
alone, and interpolated trilinearly between the 8 states around the pixel's means. A first version
drew 64 neighbourhoods per display pixel instead: unbiased, but its sampling noise exceeded the display
pixel's own noise wherever many real pixels are averaged (up to 4× the reference's noise at 96 pixels
wide), because the display noise falls with the number of averaged pixels and the correction's did not.
The shared grid has no per-pixel sampling noise; its remaining error is a common offset of about
1/√(8 × 2048) of the difference's spread, and the flat-neighbourhood state, which is an approximation
at edges. On the 1.4 µm sensor at ISO 6400 it took the red error from +6.6 to within ±0.4 code.

## Drawing the noise near a bound

The drawn display value is clipped to [0, 1] like any light level. Where its noise reaches 0 or 1
(within 4σ), a normal centred on the expected value would have a clipped mean above (or below) it,
while the real average of pixels in [0, 1] is unbiased. The centre of the normal is therefore moved,
by bisection on the clipped-normal mean, so that the clipped draw keeps the expected value. This
matters only where each display pixel averages few, very noisy real pixels (a 1.4 µm sensor at
ISO 6400 shown 800 pixels wide: the red error was +3.5 codes before, within ±0.4 after).

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
| Mean error per channel | ≤ 0.5 code, or ≤ 3 standard errors when noise dominates | Half a code is below the 8-bit rounding of the output itself; a block of n display pixels cannot resolve a difference below a few σ/√n. The matrix makes 465 channel tests: at 2 standard errors about 4.6 % of unbiased tests (up to 21) would fail by chance, at 3 about 0.27 % (about 1). Both counts are reported. |
| Noise ratio (predicted ÷ reference) | 0.85–1.15 on 16 × 16 blocks, 0.75–1.25 on 8 × 8 | The reference's standard deviation from n pixels has a relative sampling error of 1/√(2(n − 1)): 4.4 % at n = 256, 8.9 % at n = 64; the limits are about 3 such errors. |
| Expected-value RMS at ISO 100 | ≤ 1 code on edges, ≤ 2 codes in the busiest pixels (star centre) | The Monte Carlo error at K = 16 (σ ≈ 0.006·C per edge); it averages out over any feature larger than a display pixel. |
| MTF50 difference at ISO 100 | ≤ 3 % | Slanted-edge MTF50 repeatability between noise realizations is about 1–2 %. |
| SSIM at ISO 100 | ≥ 0.99 | At high ISO SSIM measures two independent noise realizations, so it is reported, not limited. |
| False-colour difference | ≤ 0.5 code, except where the Monte Carlo error itself adds colour (star centre) | The metric is biased upward by any per-channel error. |

## Validation results

155 cases on the final code (`node scripts/validate-display-view.mjs`; every row, and the raw lines, in
[the validation record](validation/display-view-2026-10-19/README.md)). Summary by options, ISO and block type:

| Options | ISO | Blocks | Cases | Largest mean error (codes) | Noise, predicted ÷ reference | MTF50 change | Lowest SSIM (blocks ≥ 16) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Speed | ISO 100 | charts | 41 | 0.24 | — | −2.6 to +0.8 % | 0.9874 |
| Speed | ISO 100 | uniform patches | 9 | 0.14 | 0.90–1.12 | — | — |
| Speed | ISO 1600 | charts | 2 | 0.37 | — | +0.9 to +0.9 % | 0.9667 |
| Speed | ISO 1600 | uniform patches | 1 | 0.28 | 1.00–1.08 | — | — |
| Speed | ISO 6400 | charts | 9 | 1.14 | — | −9.9 to +4.0 % | 0.8716 |
| Speed | ISO 6400 | uniform patches | 18 | 3.51 | 0.85–1.14 | — | — |
| Quality | ISO 100 | charts | 39 | 0.28 | — | −2.4 to +2.9 % | 0.9912 |
| Quality | ISO 100 | uniform patches | 8 | 0.25 | 0.84–1.12 | — | — |
| Quality | ISO 1600 | charts | 2 | 0.54 | — | +1.0 to +1.0 % | 0.9634 |
| Quality | ISO 1600 | uniform patches | 1 | 1.09 | 0.96–1.01 | — | — |
| Quality | ISO 6400 | charts | 9 | 1.02 | — | −2.5 to +22.2 % | 0.8644 |
| Quality | ISO 6400 | uniform patches | 16 | 1.72 | 0.84–1.19 | — | — |

Against the limits:

- **Mean error per channel: every channel of every case passes** (|error| ≤ max(0.5 code, 3 standard errors of the
  noise)). At ISO 100 the largest is 0.28 code (Monte Carlo error at a Siemens star's centre). The largest absolute
  values are where each display pixel averages a few very noisy pixels: a 1.4 µm sensor at ISO 6400 shown 800 pixels
  wide, +3.5 ± 1.7 codes in red (2.1 standard errors). Five of the 465 channel tests exceed 2 standard errors (all
  on the 1.4 µm sensor at ISO 1600–6400, with both signs), fewer than chance alone would give, so the data show no
  bias at that level.
- **Expected value at ISO 100:** with the reference's own noise taken out (the predicted noise, which the uniform
  patches confirm), the estimator's RMS error is at most 0.52 code on edges, bars, dead leaves and grey steps and 1.9
  codes in the busiest pixels (star centres, many edges per pixel).
- **Noise:** the predicted standard deviation is 0.85–1.14 of the reference's for Speed and 0.84–1.19 for Quality
  (8 × 8 blocks at 96 pixels wide have a ±25 % limit). Two Quality values fall just below 0.85: blue on the 24 MP
  sensor at 384 pixels wide, 0.84 and 0.85. AHD's choice between its candidates correlates neighbouring pixels (it sums
  homogeneity over 3 × 3), and the view models that choice's variance per pixel only, so Quality blue (and to a lesser
  degree red) noise is 5–15 % below the resized AHD capture's at mid scales.
- **Sharpness:** MTF50 of the slanted edge at ISO 100 changes by −2.6 % to +2.9 % (limit 3 %), over three sensors,
  f/2.8–f/16 and 192–800 pixels wide. At ISO 6400 MTF50 measured on a noisy reference block is dominated by the
  reference's noise (the change ranges from −10 % to +22 % between two noise realizations of the same blur) and is not
  a fidelity measure.
- **SSIM** of structured blocks at ISO 100 is 0.9874 or higher. It misses the 0.99 limit only at star centres
  (0.987–0.990), where the Monte Carlo error is largest; a larger `view.samplesPerAxis` reduces it (with stratified
  samples the variance falls at least as 1/K²) at a detail-pixel cost proportional to K² (not measured in this matrix). At high ISO SSIM compares two independent noise realizations.
- **False colour** of neutral charts agrees within 0.1–0.3 code except at star centres, where per-channel Monte Carlo
  error adds 0.4–1.4 codes of apparent false colour (for example 9.69 → 10.09 on the 24 MP sensor, Speed).
- **Aperture:** with the engine defaults (no diffraction) the f-number changes only the exposure, which the matrix
  compensates with the shutter, so Speed results are the same at f/2.8, f/8 and f/16; with diffraction (Quality) the
  slanted-edge MTF50 falls from 0.533 to 0.523 cycles per display pixel between f/2.8 and f/16 on the 24 MP sensor,
  and the view follows within 1.5 %.

What changed during validation (each found by this matrix and checked again on it):

1. Lattice points that fall exactly on a chart boundary resolved to different materials than in the capture, giving
   errors up to 15 codes along a star's diagonals; the view now uses the capture's own query arithmetic.
2. AHD at low signal shifted the colour by up to 6.6 codes; the control-variate correction removed it, first with
   per-pixel draws (whose own noise exceeded the display noise at large scales) and then with the shared grid.
3. The normal approximation over-stated the clipped noise floor at a few electrons per site; the skewness term fixed it.
4. Thin edge slivers in a footprint's corner were missed by the pilot (one pixel 10.8 codes off); neighbouring pilots
   now count.
5. The clipped noise draw biased very noisy display pixels upward (+3.5 codes); its centre is now adjusted.

## Cost

**Method.** `node scripts/benchmark-display-view.mjs`: one fresh Node process per row, a 16 × 16 warm-up capture,
then one timed `simulateDisplayView` of the whole view and one timed 2.5 whole-frame view (a `simulateCapture` at
pitch = sensor width ÷ view width) of the same scene, lens, exposure and options. f/8, ISO 100, default
`samplesPerAxis` (16). Speed is the engine defaults; Quality is `lens.diffraction: "circular-aperture"`, the four-spot
anti-aliasing filter and AHD. Built `dist`, Node 24.21.0, 4-vCPU Intel Xeon 2.80 GHz, Linux, nothing else running.
One run on one machine: not a performance claim.

| Chart | Sensor | Options | View | Display view | Whole-frame view (2.5) | Ratio |
| --- | --- | --- | --- | --- | --- | --- |
| Siemens star | 24 MP full frame, 6 µm | Speed | 96 × 64 | 1.7 s | 1.0 s | 1.8× |
| Siemens star | 24 MP full frame, 6 µm | Speed | 192 × 128 | 4.5 s | 2.6 s | 1.7× |
| Siemens star | 24 MP full frame, 6 µm | Speed | 384 × 256 | 9.2 s | 10.6 s | 0.87× |
| Siemens star | 24 MP full frame, 6 µm | Speed | 800 × 533 | 23.3 s | 38.1 s | 0.61× |
| Siemens star | 24 MP full frame, 6 µm | Quality | 96 × 64 | 15.7 s | 3.2 s | 5.0× |
| Siemens star | 24 MP full frame, 6 µm | Quality | 192 × 128 | 27.8 s | 6.4 s | 4.3× |
| Siemens star | 24 MP full frame, 6 µm | Quality | 384 × 256 | 59.5 s | 23.1 s | 2.6× |
| Siemens star | 24 MP full frame, 6 µm | Quality | 800 × 533 | 143.6 s | 97.3 s | 1.5× |
| Siemens star | 12 MP phone, 1.4 µm | Speed | 96 × 72 | 2.2 s | 1.0 s | 2.2× |
| Siemens star | 12 MP phone, 1.4 µm | Speed | 192 × 144 | 5.3 s | 3.3 s | 1.6× |
| Siemens star | 12 MP phone, 1.4 µm | Speed | 384 × 288 | 11.5 s | 12.5 s | 0.92× |
| Siemens star | 12 MP phone, 1.4 µm | Speed | 800 × 600 | 30.9 s | 51.2 s | 0.60× |
| Siemens star | 12 MP phone, 1.4 µm | Quality | 96 × 72 | 200.6 s | 2.6 s | 77× |
| Siemens star | 12 MP phone, 1.4 µm | Quality | 192 × 144 | 265.2 s | 6.6 s | 40× |
| Siemens star | 12 MP phone, 1.4 µm | Quality | 384 × 288 | 400.4 s | 25.8 s | 16× |
| Siemens star | 12 MP phone, 1.4 µm | Quality | 800 × 600 | 758.0 s | 119.8 s | 6.3× |
| Siemens star | 100 MP medium format, 3.76 µm | Speed | 96 × 72 | 2.2 s | 1.0 s | 2.3× |
| Siemens star | 100 MP medium format, 3.76 µm | Speed | 192 × 144 | 6.4 s | 3.1 s | 2.1× |
| Siemens star | 100 MP medium format, 3.76 µm | Speed | 384 × 288 | 13.6 s | 10.9 s | 1.3× |
| Siemens star | 100 MP medium format, 3.76 µm | Speed | 800 × 600 | 29.7 s | 45.9 s | 0.65× |
| Siemens star | 100 MP medium format, 3.76 µm | Quality | 96 × 72 | 59.1 s | 4.0 s | 15× |
| Siemens star | 100 MP medium format, 3.76 µm | Quality | 192 × 144 | 127.1 s | 8.0 s | 16× |
| Siemens star | 100 MP medium format, 3.76 µm | Quality | 384 × 288 | 205.6 s | 27.8 s | 7.4× |
| Siemens star | 100 MP medium format, 3.76 µm | Quality | 800 × 600 | 404.3 s | 116.1 s | 3.5× |
| Dead leaves | 24 MP full frame | Speed | 384 × 256 | 17.7 s | 11.3 s | 1.6× |
| Dead leaves | 24 MP full frame | Quality | 384 × 256 | 93.9 s | 25.0 s | 3.8× |
| Dead leaves | 12 MP phone | Speed | 384 × 288 | 19.2 s | 12.0 s | 1.6× |
| Dead leaves | 12 MP phone | Quality | 384 × 288 | 423.0 s | 28.6 s | 15× |
| Dead leaves | 100 MP medium format | Speed | 384 × 288 | 28.6 s | 12.0 s | 2.4× |
| Dead leaves | 100 MP medium format | Quality | 384 × 288 | 284.2 s | 28.5 s | 10× |

**Speed** costs 0.6–2.4× the whole-frame view at every size and sensor: 0.87–1.3× for the star and 1.6–2.4× for dead
leaves at 384 pixels wide. The cost follows the detailed display pixels × K², not the 12–100 million real pixels.

**Quality** is much dearer on small pixels, for two reasons that the accuracy requirements impose (one run each, 12 MP
phone star at 96 × 72, one option at a time: diffraction 50 s, anti-aliasing 3.7 s, AHD 316 s):

- *Diffraction at the real pitch.* The Airy pattern's first dark ring at f/8 and 550 nm has a radius of
  1.22·λ·N ≈ 5.4 µm: under one site at 6 µm but almost four at 1.4 µm, so every site's expectation sums many more
  kernel taps. At the whole-frame view's giant pitch the kernel is far below one pixel.
- *AHD at low signal.* At ISO 100 a 1.4 µm pixel already has a linear noise of 0.014–0.018, above the 0.01 threshold,
  so every sampled pixel takes the correction. Each grid state the image touches costs 2048 drawn neighbourhoods
  through the AHD steps, about 0.11 s. The star touches 2 779 states (the eight corners around every pixel's channel
  means on the logarithmic grid). With the correction off, a uniform 18 %
  grey at ISO 100 on that sensor moves by −0.11 code in red (+0.05 in blue); at ISO 1600 by −1.07 code. Those are the
  biases the correction removes.

The whole-frame view has neither cost because its giant pixels make one tap and almost no noise per pixel. Both can
be made cheaper without approximation: correction states can be shared across calls with the same sensor and
development, and the per-pixel lattice convolution can use a separable or transform method. Neither is in this
change.

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
- AHD's candidates are averaged, and its choice is corrected only where a pixel's noise exceeds 0.01,
  with the bias of a flat neighbourhood of the pixel's channel means (an approximation at edges);
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
