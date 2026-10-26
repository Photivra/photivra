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
chain evaluated once on the axis, as in the ideal reference: one run per channel with unit radiance at every node, each
node's value its own rate term times the exposure time; it does not depend on the scene, so it is kept across chart,
illuminant and illuminance changes, #443), o the pixel-aperture nodes times the
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
alone, and interpolated trilinearly between the 8 states around the pixel's means. A state depends
only on its grid indices, the noise seed, the draws and the readout and development inputs (the
normalized value per electron and the read and ADC variance of each channel, the homogeneity matrix,
the white-balance gains, the highlight clip, the colour matrix and the tone curve), so each one is
computed once per view and kept for later calls with the same inputs (see "Cost"). A first version
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

**Seven reference seeds.** The reference block is rendered at seven noise seeds (`sensor.noiseSeed` 1 to 7) and every
reference-side metric below is the mean of its seven values (standard deviations: the root of the mean variance); the
view is rendered once, at the request's default seed (1). One realization of the reference varies too much for the
limits: on the 100 MP sensor at 800 pixels wide its slanted-edge MTF50 ranged 0.521–0.554 cycles per display pixel over
the seven seeds (standard deviation 2.1 % of the mean), so the difference between two single realizations varies by
about 3 %, the size of the MTF50 limit. A single seed decided case 102 of the October 19 record (−4.4 %), whose seed-1
reference was the sharpest of the seven; against the seven-seed mean it is −0.9 %. The limits did not change. The
standard error of a mean difference is then that of the view plus that of the seven-seed mean, √((1 + 1/7)·σ²/n).

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

**Set F, device-pixel views (October 26, 2026, `65decd1`; [record](validation/display-view-2026-10-26/README.md)).**
`node scripts/validate-display-view.mjs --set F` validates the view where an interactive viewer renders it: 2028 pixels
wide on the 24 MP full frame and 4000 on the 100 MP medium format, about 3 × 3 real pixels per display pixel, on the
[exact area mean](#exact-area-mean) (12 cases, 32 × 32 blocks at the star's centre and on uniform grey at ISO 100 and
6400). Speed passes every limit. Quality misses two: the predicted noise is 1.13–1.20 of the reference's on the uniform
patches (the [known limit](#known-limit-quality-noise-at-small-footprints), #379), and at the star's centre the expected
value is 5.1 codes RMS, at most 34 codes, from the capture (full frame; 3.6 / 22 on the medium format) against the 2-code
limit, because the view's AHD result differs from the capture's where the pattern is finer than the sensor resolves.
Diffraction and the four-spot filter match the capture there within 0.2 code; the AHD miss shrinks with the footprint
(19.3 codes RMS with AHD alone at 2028 wide, 7.7 at 800). Set F is outside the default run.

**2.8.0 re-run (October 25, 2026, `de77074`; [record](validation/display-view-2026-10-25/README.md)).** 145 cases are
identical to the October 19 results below. The 10 cases on the [exact area mean](#exact-area-mean), the phone at 800
pixels wide, are the same or better against every limit (Siemens star: expected-value RMS 1.78 → 1.35 codes, SSIM
0.9931 → 0.9966). The known noise miss of case 138 (#379) remains at 1.165. The run took about 9 minutes instead of
3 h 27 min, because the reference captures take the tabulated RAW path.

155 cases on `main` at `ea6dbe7` (`node scripts/validate-display-view.mjs`, seven reference seeds; the display views of
`05d24cb` are byte-identical; every row, and the raw lines, in
[the validation record](validation/display-view-2026-10-19/README.md)). Summary by options, ISO and block type:

| Options | ISO | Blocks | Cases | Largest mean error (codes) | Noise, predicted ÷ reference | MTF50 change | Lowest SSIM (blocks ≥ 16) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Speed | ISO 100 | charts | 41 | 0.24 | — | −2.7 to +2.2 % | 0.9873 |
| Speed | ISO 100 | uniform patches | 9 | 0.10 | 0.94–1.03 | — | — |
| Speed | ISO 1600 | charts | 2 | 0.16 | — | −1.4 to −1.4 % | 0.9668 |
| Speed | ISO 1600 | uniform patches | 1 | 0.51 | 0.99–1.01 | — | — |
| Speed | ISO 6400 | charts | 9 | 0.75 | — | −2.9 to +3.4 % | 0.8703 |
| Speed | ISO 6400 | uniform patches | 18 | 1.03 | 0.93–1.06 | — | — |
| Quality | ISO 100 | charts | 39 | 0.30 | — | −1.0 to +1.2 % | 0.9904 |
| Quality | ISO 100 | uniform patches | 8 | 0.22 | 0.89–1.08 | — | — |
| Quality | ISO 1600 | charts | 2 | 0.27 | — | −0.2 to −0.2 % | 0.9631 |
| Quality | ISO 1600 | uniform patches | 1 | 0.37 | 0.97–1.05 | — | — |
| Quality | ISO 6400 | charts | 9 | 0.65 | — | −1.7 to +10.6 % | 0.8598 |
| Quality | ISO 6400 | uniform patches | 16 | 1.30 | 0.90–1.16 | — | — |

Against the limits:

- **Mean error per channel: every channel of every case passes** (|error| ≤ max(0.5 code, 3 standard errors of the
  noise)). At ISO 100 the largest is 0.30 code (Monte Carlo error at a Siemens star's centre). One of the 465 channel
  tests is above 0.5 code and 2 standard errors, fewer than chance alone would give.
- **Expected value at ISO 100:** with the reference's own noise taken out (estimated from each block's standard error,
  √(RMS² − n·SE²/(1 + 1/7)) averaged over the channels, which is crude on high-contrast blocks), the estimator's RMS
  error is at most 0.81 code on edges, bars, dead leaves and grey steps and 1.9 codes in the busiest pixels (star
  centres, many edges per pixel).
- **Noise: one Quality case misses the limit, a documented miss of the known limit below.** The predicted standard
  deviation is 0.93–1.06 of the reference's for Speed and 0.89–1.16 for Quality (8 × 8 blocks at 96 pixels wide have a
  ±25 % limit). The miss is case 138: the 1.4 µm sensor with the Quality options at 800 pixels wide on an 18 % grey
  patch at ISO 6400, predicted ÷ reference R 1.164, G 1.133, B 1.030 against the 0.85–1.15 limit. The limit is
  unchanged; the miss is recorded under #379 with case 92 and is accepted for 2.6.0 by the owner's decision of
  October 20, 2026.
- **Sharpness:** MTF50 of the slanted edge at ISO 100 changes by −2.7 % to +2.2 % for Speed and −1.0 % to +1.2 % for
  Quality (limit 3 %), over three sensors, f/2.8–f/16 and 192–800 pixels wide. The reference's own MTF50 varies by up to
  2.2 % (one standard deviation) between noise seeds. At ISO 6400 MTF50 measured on a noisy block is dominated by the
  noise and is not a fidelity measure.
- **SSIM** of structured blocks at ISO 100 is 0.9873 or higher. It misses the 0.99 limit only at star centres
  (0.987–0.998), where the Monte Carlo error is largest; a larger `view.samplesPerAxis` reduces it (with stratified
  samples the variance falls at least as 1/K²) at a detail-pixel cost proportional to K² (not measured in this matrix).
  At high ISO SSIM compares independent noise realizations.
- **False colour** of neutral charts at ISO 100 agrees within 0.15 code except on the 1.4 µm sensor with the Quality
  options, within the 0.5-code limit: the slanted edge at 800 pixels wide, +0.48 (case 92, 4.20 → 4.68; the known limit
  below), and bar groups at 384 wide, +0.41 (case 17, 2.90 → 3.31); and star centres, where per-channel Monte Carlo
  error adds up to 1.4 codes of apparent false colour.
- **Aperture:** with the engine defaults (no diffraction) the f-number changes only the exposure, which the matrix
  compensates with the shutter, so Speed results are the same at f/2.8, f/8 and f/16; with diffraction (Quality) the
  slanted-edge MTF50 falls from 0.528 to 0.518 cycles per display pixel between f/2.8 and f/16 on the 24 MP sensor,
  and the view follows within 0.2 %.

### Known limit: Quality noise at small footprints

With the Quality options (AHD) the view's noise has too much colour where a display pixel covers few sensor pixels.
The noise term Σ_c B_c·σ_c²·a_c·a_cᵀ treats output camera channel c as driven only by CFA sites of channel c, with
B_c from the bilinear kernels. AHD forms red and blue from directional green plus interpolated colour differences, so
they read green sites as well, and the output channels share noise. Over a large footprint those green weights sum to
zero and the error vanishes; over a small one they do not. AHD's noise-driven choice between its candidates, which is
correlated over 3 × 3 pixels, changes the covariance as well, so no closed form over the two linear candidates matches
the capture (with one candidate everywhere, 0.89 / 0.89 / 1.07 of the reference's standard deviation; with an
independent choice per pixel, 0.45 / 0.83 / 0.89).

Measured on the 1.4 µm sensor at 800 pixels wide (5 × 5 real pixels per display pixel): on a uniform 18 % grey patch
at ISO 100 the predicted noise is 1.08 / 1.08 / 0.95 of the reference's (pooled over 12 noise seeds: R − G +9 %,
B − G +15 %, and a green–blue correlation of −0.06 where the capture has +0.16), and at ISO 6400 (case 138) R 1.164,
G 1.133, B 1.030, outside the 0.85–1.15 noise limit. On the slanted edge (case 92) R − G is +9 % and B − G +18 %, and the false colour
exceeds the reference's by +0.48 code (+0.49 ± 0.05 over seven view and reference seeds; with the reference's own noise
added to the view's expected image instead of the view's draw, +0.04): the expected value is right and the drawn
noise is not. Speed (bilinear) is exact. On the 6 µm and 3.76 µm sensors at 800 pixels wide or less, and on the 1.4 µm sensor at
384 pixels wide or less, the predicted noise is within 0.89–1.08. At device-pixel widths, about 3 × 3 real pixels per
display pixel, the 6 µm and 3.76 µm sensors reach 1.13–1.20 as well (set F, October 26, 2026). A redesign of the Quality noise model, from the autocovariance of
the real AHD output, is planned for 2.7.0 (#379).

Known-limit misses in the validation, recorded under #379 and accepted for 2.6.0 by the owner (October 20, 2026), with
the limits unchanged: case 138 (noise ratio, above) and case 92 (false colour +0.48 code, within its 0.5-code limit with
seven reference seeds but at the limit across seeds).

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

Two regimes. Where a display pixel covers more than 25 real pixels (narrower than about a fifth of the frame's width), the
stratified estimator applies and the cost follows the detailed display pixels × K². At or below 25, the
[exact area mean](#exact-area-mean) applies and the cost follows the real pixels the region touches.

### A device-pixel view rendered in parts

The request shape of an interactive viewer (#454): a 24 MP, 6 µm, 6000 × 4000 sensor with the 2 × 2 box pixel aperture, a
caller material scene (an engine-authored composite chart plus a stand-in printed label), and a 2028 × 1352 view (a
1440 × 900 window at twice the CSS pixel size), prepared once with `prepareDisplayView` and rendered in 96 × 96 parts,
centre first. Every display pixel covers about 2.96 × 2.96 real pixels, so every part takes the exact area mean. Speed is
the engine defaults plus the box; Quality adds `lens.diffraction: "circular-aperture"`, the four-spot filter and AHD. ISO
100, so no part needs the AHD low-signal correction.

`node scripts/benchmark-display-view.mjs --app`, on `main` at `65decd1` (2.9.0 plus #434): one fresh Node process per row
and repeat, 30 of the 294 parts timed (every ninth in the centre-first order), two repeats; built `dist`, Node 24.21.0,
4-vCPU Intel Xeon 2.80 GHz, Linux, load average 0.3–1.1. To show the noise floor the same build ran a second time as
build B, interleaved with A: the per-part medians of the two builds and two repeats agree within 10 %, the prepare
times within 20 %. Ranges are over both builds and both repeats.

| Options | f | Prepare | Part median | Slowest part | µs per display pixel, median (min–max) | Whole view, one thread |
| --- | --- | --- | --- | --- | --- | --- |
| Speed | f/8 | 195–226 ms | 88–89 ms | 227–291 ms | 9.4–9.5 (8.4–31.3) | 31–33 s |
| Speed | f/11 | 176–197 ms | 86–95 ms | 199–215 ms | 9.2–10.2 (8.5–23.1) | 29–33 s |
| Quality | f/8 | 452–548 ms | 169–181 ms | 510–526 ms | 18.2–19.3 (16.5–57.1) | 63–65 s |
| Quality | f/11 | 461–559 ms | 175–186 ms | 496–535 ms | 18.7–19.9 (16.9–57.5) | 65–67 s |

The whole-view column is an extrapolation from the timed parts (their mean × 294), not a measurement. Quality costs about
twice Speed per part. The slowest parts are the first one (its own warm-up) and those over the chart's busiest areas. The
stand-in label costs a few comparisons per lookup; a caller's label tested by polygon winding costs more (about 3 % of the
self time in one caller's profile). Comparing two builds: `DIST_B=<other dist/index.js> node
scripts/benchmark-display-view.mjs --app` runs them interleaved, alternating which goes first.

The prepare column above predates #443, which runs the channel response's sensor chain once per channel instead of once
per spectral node and keeps it across chart, illuminant and illuminance changes, with the same bytes. Prepares in one process after a
warm-up, the app-request shape, five rounds alternating the builds (Node 24.21.0, load average 1.3): after an aperture
change 378–430 ms → 54–67 ms (Quality) and 110–142 ms → 15–19 ms (Speed); after a chart change 379–435 ms → 34–39 ms
and 108–115 ms → 6–7 ms; after an illuminant change 370–385 ms → 35–47 ms and 108–120 ms → 6–7 ms.

### Whole views against the 2.5 whole-frame view (2.6.0)

The table below is the 2.6.0 record: whole views of 96–800 pixels wide, mostly on the stratified estimator, against the
2.5 whole-frame view, which no caller renders any more. Both columns have changed since: re-run on `main` at `65decd1`
(Node 24.21.0, same host, load average 4.4), the full-frame star at 384 wide takes 5.7–6.0 s (Speed) and 13.1–13.8 s
(Quality) as a display view, and 0.16–0.20 s and 0.54–0.56 s as a whole-frame view, now that captures take the tabulated
RAW path (2.8.0).

**Method.** `node scripts/benchmark-display-view.mjs`: one fresh Node process per row, a 16 × 16 warm-up capture,
then one timed `simulateDisplayView` of the whole view and one timed 2.5 whole-frame view (a `simulateCapture` at
pitch = sensor width ÷ view width) of the same scene, lens, exposure and options. f/8, ISO 100, default
`samplesPerAxis` (16). Speed is the engine defaults; Quality is `lens.diffraction: "circular-aperture"`, the four-spot
anti-aliasing filter and AHD. "Before" is the display view as first merged (#368), "after" the
[exact speed-ups](#exact-speed-ups); the two builds ran interleaved, row by row, on the same host (built `dist`,
Node 24.21.0, 4-vCPU Intel Xeon 2.80 GHz, Linux, nothing else running). The whole-frame column is the after build's.
One run per cell on one machine: not a performance claim. Rows within about ±10 % are within this host's run-to-run
spread (Speed did not change: six alternating runs of the phone at 384 wide took a median 12.7 s before and 12.8 s
after).

| Chart | Sensor | Options | View | Display view before | Display view after | Speed-up | Whole-frame view (2.5) | Ratio after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Siemens star | 24 MP full frame, 6 µm | Speed | 96 × 64 | 1.9 s | 2.4 s | 0.8× | 1.0 s | 2.3× |
| Siemens star | 24 MP full frame, 6 µm | Speed | 192 × 128 | 4.9 s | 5.1 s | 1.0× | 3.3 s | 1.5× |
| Siemens star | 24 MP full frame, 6 µm | Speed | 384 × 256 | 10.3 s | 10.6 s | 1.0× | 11.5 s | 0.92× |
| Siemens star | 24 MP full frame, 6 µm | Speed | 800 × 533 | 25.0 s | 26.6 s | 0.9× | 40.9 s | 0.65× |
| Siemens star | 24 MP full frame, 6 µm | Quality | 96 × 64 | 15.5 s | 5.2 s | 3.0× | 3.3 s | 1.6× |
| Siemens star | 24 MP full frame, 6 µm | Quality | 192 × 128 | 28.3 s | 10.8 s | 2.6× | 7.0 s | 1.5× |
| Siemens star | 24 MP full frame, 6 µm | Quality | 384 × 256 | 65.0 s | 30.9 s | 2.1× | 24.6 s | 1.3× |
| Siemens star | 24 MP full frame, 6 µm | Quality | 800 × 533 | 162.4 s | 84.3 s | 1.9× | 110.4 s | 0.76× |
| Siemens star | 12 MP phone, 1.4 µm | Speed | 96 × 72 | 2.0 s | 2.2 s | 0.9× | 0.9 s | 2.4× |
| Siemens star | 12 MP phone, 1.4 µm | Speed | 192 × 144 | 5.5 s | 6.3 s | 0.9× | 3.5 s | 1.8× |
| Siemens star | 12 MP phone, 1.4 µm | Speed | 384 × 288 | 12.4 s | 11.7 s | 1.1× | 12.7 s | 0.92× |
| Siemens star | 12 MP phone, 1.4 µm | Speed | 800 × 600 | 32.9 s | 32.1 s | 1.0× | 54.1 s | 0.59× |
| Siemens star | 12 MP phone, 1.4 µm | Quality | 96 × 72 | 221.8 s | 49.7 s | 4.5× | 2.5 s | 20× |
| Siemens star | 12 MP phone, 1.4 µm | Quality | 192 × 144 | 300.9 s | 63.0 s | 4.8× | 7.8 s | 8.1× |
| Siemens star | 12 MP phone, 1.4 µm | Quality | 384 × 288 | 450.3 s | 106.1 s | 4.2× | 27.7 s | 3.8× |
| Siemens star | 12 MP phone, 1.4 µm | Quality | 800 × 600 | 836.6 s | 272.4 s | 3.1× | 126.1 s | 2.2× |
| Siemens star | 100 MP medium format, 3.76 µm | Speed | 96 × 72 | 2.5 s | 2.7 s | 0.9× | 1.2 s | 2.3× |
| Siemens star | 100 MP medium format, 3.76 µm | Speed | 192 × 144 | 7.7 s | 8.0 s | 1.0× | 3.4 s | 2.4× |
| Siemens star | 100 MP medium format, 3.76 µm | Speed | 384 × 288 | 15.7 s | 15.8 s | 1.0× | 13.3 s | 1.2× |
| Siemens star | 100 MP medium format, 3.76 µm | Speed | 800 × 600 | 35.4 s | 32.6 s | 1.1× | 49.7 s | 0.66× |
| Siemens star | 100 MP medium format, 3.76 µm | Quality | 96 × 72 | 64.9 s | 18.2 s | 3.6× | 4.9 s | 3.7× |
| Siemens star | 100 MP medium format, 3.76 µm | Quality | 192 × 144 | 145.3 s | 29.3 s | 5.0× | 8.1 s | 3.6× |
| Siemens star | 100 MP medium format, 3.76 µm | Quality | 384 × 288 | 207.6 s | 49.7 s | 4.2× | 27.5 s | 1.8× |
| Siemens star | 100 MP medium format, 3.76 µm | Quality | 800 × 600 | 423.8 s | 125.8 s | 3.4× | 119.9 s | 1.0× |
| Dead leaves | 24 MP full frame | Speed | 384 × 256 | 19.2 s | 19.1 s | 1.0× | 11.3 s | 1.7× |
| Dead leaves | 24 MP full frame | Quality | 384 × 256 | 95.9 s | 54.3 s | 1.8× | 28.1 s | 1.9× |
| Dead leaves | 12 MP phone | Speed | 384 × 288 | 19.8 s | 18.7 s | 1.1× | 11.5 s | 1.6× |
| Dead leaves | 12 MP phone | Quality | 384 × 288 | 407.8 s | 124.3 s | 3.3× | 29.8 s | 4.2× |
| Dead leaves | 100 MP medium format | Speed | 384 × 288 | 27.7 s | 28.9 s | 1.0× | 12.3 s | 2.3× |
| Dead leaves | 100 MP medium format | Quality | 384 × 288 | 282.3 s | 68.2 s | 4.1× | 26.7 s | 2.6× |

**Speed** costs 0.6–2.4× the whole-frame view at every size and sensor: 0.9–1.2× for the star and 1.6–2.3× for dead
leaves at 384 pixels wide (2.6.0). On the stratified estimator the cost follows the detailed display pixels × K², not the
12–100 million real pixels.

**Quality** costs more on small pixels, for two reasons that the accuracy requirements impose (12 MP phone star at
96 × 72, one option at a time, before → after: diffraction 55.6 → 8.2 s, AHD 312.5 → 100.1 s):

- *Diffraction at the real pitch.* The Airy pattern's first dark ring at f/8 and 550 nm has a radius of
  1.22·λ·N ≈ 5.4 µm: under one site at 6 µm but almost four at 1.4 µm, so a site's expectation sums 32 × 32 kernel
  taps at 1.4 µm (10 × 10 at 6 µm). At the whole-frame view's giant pitch the kernel is far below one pixel.
- *AHD at low signal.* At ISO 100 a 1.4 µm pixel already has a linear noise of 0.014–0.018, above the 0.01 threshold,
  so every sampled pixel takes the correction. Each grid state the image touches costs 2048 drawn neighbourhoods
  through the AHD steps: about 0.11 s before, about 0.035 s after. The star touches 2 779 states at 96 × 72 without
  diffraction and 1 155 with the Quality options at 384 × 288 (the eight corners around every pixel's channel means
  on the logarithmic grid). With the correction off, a uniform 18 % grey at ISO 100 on that sensor moves by
  −0.11 code in red (+0.05 in blue); at ISO 1600 by −1.07 code. Those are the biases the correction removes.

**Where the phone's 106 s at 384 × 288 go** (CPU profile of the after build, 108 s under the profiler): the AHD
correction states 40 s (1 155 states × about 35 ms: the 248 000 Poisson and normal draws of each state and its 2048 AHD
evaluations), the per-sample statistics 42 s (14.3 million samples: the site reads, the clips, the two candidates'
moments and the noise terms), the diffraction sums 13 s, the per-sample correction interpolation 2.4 s and the rest
about 10 s. The 60 s aimed for was not reached: the draws of a state, the order of each kernel sum and the
per-sample arithmetic are what the exact result is made of, and the remaining ways to go below them are approximations
(fewer draws per state, a reassociated or transformed convolution) or parallel work in workers, which were not part of
this change. A second view in the same JavaScript realm with the same sensor, exposure and development reuses the
correction states: the same 384 × 288 view again took 72.8 s instead of 102.7 s, a 192 × 144 view after it 29.6 s
instead of 63.0 s; a different scene needs mostly different states (dead leaves after the star: 123.9 s, as cold).

The whole-frame view has neither cost because its giant pixels make one tap and almost no noise per pixel.

**Cost of the portable functions** ([Same bytes in every engine](#same-bytes-in-every-engine)). They take more
operations than the engines' native `Math` (on this host about 39 ns per logarithm against 12 ns, 38 ns per cube
root against 10 ns), which matters where the display view calls them most: the AHD correction states (a normal draw,
some Poisson rejection tests and 126 CIELAB cube roots per drawn neighbourhood). Two changes made with the move recover
part of it: the states use both values of each Box–Muller pair and no longer draw for the 16 sites AHD never reads.
Same benchmark, main before the change and this build, one run each on the same host (the unchanged whole-frame view
varied by up to 26 % between the two runs of a row): Speed, Siemens star at 384 wide, 9.5 → 10.6 s (full frame) and
12.3 → 13.2 s (phone); Quality, full frame star 27.0 → 28.2 s, phone star 47.5 → 60.2 s at 96 wide and 97.2 →
114.6 s at 384 wide, phone dead leaves 117.0 → 122.0 s at 384 wide. The table above is from before the change.

### Exact speed-ups

Quality was made cheaper without changing a byte of any display view: the samples, the expected values, the noise and
every diagnostic, including `sceneLookups`, are the same as before for every request and seed. Each change computes the
same values with the same operations in the same order; none reassociates a floating-point sum.

- **AHD correction states are shared.** A grid state depends only on its indices and the inputs listed in
  [AHD at low signal](#ahd-at-low-signal), so it is computed once and kept, for the rest of the view and for later
  calls with the same inputs (another view size, region or scene of the same sensor, exposure and development): up to
  65 536 states for each of the 4 most recently used input sets, about 50 bytes per state (13 MB at most). A state is also cheaper to
  compute: ln n! for the Poisson sampler comes from a table of the same partial sums, the sampler's per-mean constants
  are computed once per state, the xorshift stream keeps its state in a `Uint32Array` (a uint32 in a closure variable
  was boxed on every step; this speeds every seeded draw in the engine), the AHD steps run on flat arrays without
  temporary objects and skip the four corner candidates their homogeneity step never reads, and the 16 patch sites the
  steps never read skip the normal transform (their uniforms were still drawn, so the stream was where it was; since the
  move to the portable functions below, those sites are not drawn at all and the normals come in Box–Muller pairs).
- **Diffraction sums are shared, not rearranged.** A site's expected electrons are a sum of kernel taps in a fixed
  order; a separable, summed-area or transform evaluation would reassociate it and change the last bits, so the sum
  itself is kept. With chart materials (every preset): each lattice point is looked up once per display row (a band
  that grows to the right with the windows) instead of once per display pixel; a site whose whole kernel support reads
  one material, found from summed-area tables of material changes, takes that material's value, precomputed once with
  the same sum; other sites run the sum from the band; and site values are kept across the windows of neighbouring
  display pixels (a ring of site rows). The scene lookup count is still the count of the per-pixel lazy cache,
  reconstructed from the sites each display pixel reads. Radiance scenes (caller functions) keep the per-pixel path.
- **One-material samples are replayed.** A sampled pixel whose demosaic sites all read one material has the statistics
  of every other such sample of that material and CFA phase, so the terms it adds to the display pixel's sums are
  recorded once and added again in the same order (with the display pixel's own footprint weights).
- **Zero terms are skipped.** The covariance and third-cumulant sums of each AHD candidate skip the sites where its
  weights are zero (adding ±0 to a sum that starts at +0 changes nothing).

**Proof of byte identity.** The display views of all 155 validation cases at their seeds (the requests of
`validate-display-view.mjs`, Speed and Quality, three sensors) were hashed before and after (SHA-256 of the samples, of
the expected values and noise, and of the whole result with the timings removed): all identical, with the later cases
reusing the earlier cases' correction states in the same process. A test locks six more requests that exercise each
path (uniform and mixed diffraction sites, the AHD correction, spectral materials with mirror borders, a radiance
scene, AHD with a tone curve, Speed) to hashes recorded before the change, and another checks that shared states give
the same bytes as fresh ones (at that time the display view still used `Math.pow`, whose last bit differs between
Node 22 and Node 24, so the test held each runtime to its own recording; byte identity before and after was checked on
both). The capture hash locks and the facade fingerprints of 15 default-path results are unchanged. The display view
has since moved to the engine's portable functions (next section), which changed its last bits once; the six requests
are now locked to one set of hashes for every runtime.

### Exact area mean

From 2.8.0 (#393), a display pixel whose rectangle holds at most 25 real pixels (and at most `view.samplesPerAxis`²,
so views at least 1/5 of the frame's width) is not sampled: every real pixel it touches is evaluated once and
weighted by its exact overlap, w_j / A, so its expected value is the definition D_P = Σ_j (w_j/A)·E[L_j] with no
sampling error. The linear noise keeps the closed-form term and the independent residual becomes Σ_j (w_j/A)²·r_j. A
real pixel's terms are recorded once and shared by the display pixels that touch it (a ring of native rows), so at
device-pixel sizes the view does about one real pixel's work per real pixel. Coarser views keep the stratified estimator
and their bytes; the `view.estimation` assumption names the method used. This is a deliberate reference change, not a
byte-identical speed-up: the views that take the exact path have new hashes, and a test checks that a half-size and a
2/3-size view equal the overlap-weighted means of the frame-size view's per-pixel expected values. On the app's 8-row
strips of a 24 MP frame at 2028 × 1352 (one thread, one run) Speed went from 0.97–1.04 s to 0.77–0.85 s against 2.7.0.
The limit of 25 real pixels is where the exact path stops paying: on 8-row strips of a 24 MP view (Siemens star and dead
leaves, f/2.8, one thread, one run each) it took the stratified estimator's time within run-to-run spread up to 25 real
pixels per display pixel and longer above (1.1–1.2× at 36, 1.4–1.5× at 64, 1.5–2.4× at 144), because it evaluates every
real pixel while the estimator takes a quarter of its samples per axis where the pilot finds no detail. The validation
cases are re-run on this reference before the release.

## Same bytes in every engine

ECMAScript defines `+`, `−`, `×`, `÷` and `Math.sqrt` as correctly rounded binary64 operations, but leaves `Math.pow`
(and `**`), `Math.exp`, `Math.log`, `Math.cbrt`, `Math.cos` and the other transcendental functions
"implementation-approximated" (ECMA-262, `Number::exponentiate` and §21.3.2, "Function Properties of the Math Object"). They do differ: measured on
200 000 arguments each, Node 22 (V8 12) and Node 24 (V8 13) differ in the last bit of `x ** (1/2.4)`, `x ** 2.4`,
`x ** 1.4` and integer powers such as `λ ** 5` (V8 13 rounds `x ** 5` correctly in 99.9 % of cases, V8 12 in 90 %), but
agree on `exp`, `log`, `cbrt`, `sin` and `cos`; Chromium 141 also differs from Node in `sin` and `cos`, and Chromium 153
and Bun 1.4 (JavaScriptCore) in nearly all of them.

So the display view's own arithmetic uses only correctly rounded operations and the engine's portable functions
(`src/core/portable-math.ts`): logarithm, exponential, power, cube root, e^x − 1 and cos/sin of 2πu, each a fixed
sequence of `+ − × ÷`, exact power-of-two scaling and integer operations, within 1 ulp (2 ulps for e^x − 1, cos and
sin) of the exact function. Methods: double-double arithmetic (Dekker 1971; Knuth, TAOCP vol. 2, §4.2.2), log via
2·atanh((m − 1)/(m + 1)) and 2^r by its Taylor series after additive range reduction (J.-M. Muller, *Elementary
Functions*, 3rd ed., 2016, ch. 11); the bounds were checked against 60-digit decimal references. They replace:

- the sRGB encoding of the drawn value and the slope of its quantization variance (x^(1/2.4), x^1.4);
- the normal density in the clip moments (exp), the Gauss–Legendre starting points (cos), CIELAB's cube root in the AHD
  correction, the correction grid (2^x, log2) and squares (`**2` becomes a product);
- the Box–Muller normal draws (log, cos and sin; the correction states use both values of each pair and no longer draw
  for the 16 sites AHD never reads) and the Poisson draws of the AHD correction states (exp, log, ln n!);
- the scene illuminant: the engine's own formulas (Planck's law, CIE illuminant A, the daylight-locus polynomial) are
  evaluated with the portable power and e^x − 1, and the view's irradiance scale, radiances and scene-illuminant white
  balance are computed from that evaluation; a Kelvin white balance takes its white point from the Planckian locus
  evaluated the same way; a step wedge's equal-density levels use the portable power. These differ from the
  capture's own values by at most a few ulps.

Captures keep `Math` and `**`: their bytes are a 2.x guarantee. The display view therefore still takes some inputs
from the capture's code: the sensor's spectral response, the CIE 1931 colour-matching fit (`Math.exp`), the diffraction
kernels (`Math.sin`, `Math.cos` and others), the chart geometry (`Math.atan2` and others) and an automatic exposure.
The capture's query arithmetic and the view's copy of it no longer use `Math.hypot`: both take `hypot3`, V8's
three-argument `Math.hypot` sequence written as correctly rounded operations, so the query points have V8's bits in
every engine (#452; on V8 nothing changed). Their bits are the same on every Node.js version tested, so the
display view is byte-identical across them: the six hash-locked requests give one set of hashes on Node 22.13.0,
22.22.0, 24.21.0 and 26.12.0, and so did 156 other requests on Node 22.13.0, 24.21.0 and 26.12.0 (three sensors, Speed
and Quality, six charts, four f-number and ISO pairs; plus CIE A, a 3200 K blackbody, a daylight basis, Kelvin, fixed
and no white balance, the tone curve, mirror borders, a 21-step equal-density wedge, a composite chart, and
aperture-priority and program exposure). In browsers whose `Math` differs (Chromium 141 with diffraction, Chromium 153,
Bun/JavaScriptCore) those inputs, and with them the expected values and noise, differ in the last bits; the samples of
the six requests were identical there too. The capture's own floating-point results differ in the same browsers (for
example its diffraction kernels), while its samples were identical in every case tested.

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
