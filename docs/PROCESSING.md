# Image processing operators

Standalone, browser-safe operators for post-capture image processing: built-in and adaptive demosaicing, HDR bracket merging and HDR output encoding, tone mapping, exposure fusion, focus stacking, panorama stitching from known rotations, denoising, sharpening and synthetic film grain. They are independently written from the published equations cited below; no third-party code or data is incorporated. Every result is labelled **approximation**: these are named processing choices, not calibrated camera or display models. They do not activate production-plan stages or change POC behaviour.

Examples are in [USAGE](USAGE.md#image-processing-operators).

## Shared task contract

Every operator is a factory `createXTask(input, provider)` returning a single-use `ProcessingTask<T>` with `run()`, `cancel()`, `dispose()`, `takeOutput()`, `state`, `completedTileCount`, `totalTileCount` and `estimatedWorkingBytes`. `provider` is `{ yieldControl, onProgress? }`, the same shape as the native RAW tasks:

- one progress tile is one processed row of one pass; `totalTileCount` is known before `run()`;
- `yieldControl` is awaited once about 8 ms of work has elapsed since the last yield, and after the last row. Cadence never changes output;
- `cancel()` aborts at the next row; `takeOutput()` transfers the result once.

Images are interleaved `Float32Array` RGB (`ProcessingRgbImage`, row-major, +Y down). Inputs are validated at creation (shape, enums, ranges) and at the start of `run()` (finite samples). Inputs are read during `run()` and never written; callers must not mutate them until it settles. Outputs never alias inputs.

Limits: at most `PROCESSING_MAX_PIXELS` (2²⁶) pixels per image and `PROCESSING_MAX_FRAMES` (32) frames. Each task estimates its typed-array working memory, including its output, and rejects a plan above `maximumWorkingBytes` (default `PROCESSING_DEFAULT_MAXIMUM_WORKING_BYTES`, 1 GiB).

All spatial operations use whole-sample symmetric ("reflect-101") borders: index −1 reads 1, n reads n−2.

## Demosaicing

### Built-in linear Bayer kernels

`createBuiltInBayerDemosaicProfiles({ kernel, captureModeId, colorSamplingProfile, channelRoles })` returns one `explicit-linear-native-neighborhood` profile per CFA phase. These are the ordinary reconstruction contract, so they run unchanged through `resolveRawFrameReconstruction`, `createNativeRawDevelopmentTask` and `createCfaPlaneReconstructionTask`. The CFA must be a 2×2 mosaic with one red, one blue and two diagonal greens. Every phase layout (RGGB, GRBG, GBRG, BGGR) is supported.

- **`bilinear`**: average of the nearest same-channel sites (2 or 4 sites; reach 1) (Gunturk et al., 2005).
- **`malvar-he-cutler-2004`**: the 5×5 gradient-corrected linear filters of Malvar, He & Cutler (ICASSP 2004). Each output is the bilinear estimate plus a gain times a zero-sum discrete Laplacian of the site's own channel:
  - green at red/blue: α = 1/2, giving 4/8 at the centre, 2/8 at the four green neighbours and −1/8 at the four same-channel sites at distance 2;
  - red/blue at green: β = 5/8, giving 5/8 at the centre, 4/8 at the two chroma neighbours, −1/8 at the four diagonals and the two greens at distance 2 along the chroma axis, and +1/16 at the two greens at distance 2 across it;
  - red at blue (and blue at red): γ = 3/4, giving 6/8 at the centre, 2/8 at the four diagonals and −3/16 at the four same-channel sites at distance 2.

  All weights are dyadic, so every kernel sums to exactly one. Both kernels reproduce affine per-channel signals exactly, which is tested.

Approximation status: these are fixed linear interpolators. They are not adaptive, calibrated or manufacturer-specific, and aliasing and moiré are not modelled.

### Border handling

Native RAW development and CFA plane reconstruction accept `borderHandling: "reject" | "mirror"`. The default is `"reject"`, which keeps the previous fail-closed behaviour.

With `"mirror"`, a contribution site outside the frame is read at its reflect-101 image. This is accepted only after `validateMirrorBorderCfaConsistency` proves that every reflected site keeps the CFA channel of the virtual periodic site it replaces, which always holds for 2×2 Bayer. Interior pixels use the unchanged flattened-kernel path. Tests prove two things:

- the typed mirrored path is byte-identical to the per-object reference for all four orientations;
- pixels whose neighbourhood stays inside the frame are byte-identical to `"reject"`.

`resolveRawFrameReconstruction` (the bounded reference handoff) still rejects edges.

### Typed CFA plane reconstruction

`createCfaPlaneReconstructionTask({ plane, phaseProfiles, borderHandling?, region? })` executes explicit per-phase kernels on a linear `Float32Array` mosaic (`CfaMosaicPlane`). Examples are black-subtracted normalized RAW or a merged HDR mosaic. Contributions are summed in declared order, matching `calculateRawReconstructionChannel` exactly before float32 storage. Values stay signed and unclamped, and no white balance or colour transform is applied.

### Adaptive homogeneity-directed demosaicing (AHD)

`createAhdDemosaicTask({ plane, channelRoles, cameraToXyz? })` is a separate non-linear reconstruction path after Hirakawa & Parks (IEEE TIP 14(3), 2005). It does not present itself as a linear kernel.

1. Green is interpolated along rows and along columns with the directional 5-tap filter [−1/4, 1/2, 1/2, 1/2, −1/4]. This is the bilinear green plus the own-channel second difference. The paper's optimized filter design is not reproduced.
2. Red and blue are filled from bilinearly interpolated colour differences (R−G, B−G) against each directional green. This gives two full-colour candidates.
3. Both candidates are converted to CIELAB (W3C CSS Color 4; also CIE 15) through `cameraToXyz`. The default is the sRGB/D65 matrix, and it is used only for the metric.
4. Homogeneity is the number of 4-neighbours within the adaptive tolerances ε_L and ε_C. These are the smaller of the two directions' largest along-direction luminance and chroma differences.
5. Homogeneity is summed over 3×3, and the more homogeneous candidate is selected. Ties average the two candidates.

The paper's optional iterative median artifact-reduction step is not applied. `direction` reports the choice per pixel.

**Measured on synthetic patterns (PSNR in dB, interior pixels; `test/processing-demosaic.test.ts`).** These are measurements on our own two generated test images only, not a general quality claim:

| Pattern | Bilinear | Malvar–He–Cutler | AHD |
| --- | --- | --- | --- |
| Luminance-dominant: grey zone plate, slanted edge and disc under a smooth colour cast (96×96) | 33.10 | 37.46 | 39.13 |
| Saturated, decorrelated colour shapes on ramps (96×96) | 29.80 | 28.44 | 29.60 |
| Saturated vertical colour step (24×24) | 24.02 | 22.03 | 23.91 |

On the colour step, the zipper metric (summed alternation along the edge, where the truth is 0) is 0 for AHD, 1.5 for bilinear and 15.6 for MHC. The MHC kernel assumes inter-channel correlation, so it overshoots at saturated chromatic edges. AHD removes zippering by interpolating along edges, but its colour-difference fill still crosses strongly chromatic edges.

## HDR

### Linear RAW bracket merge

`createHdrBracketMergeTask({ sampleCount, frames, iterations? })` merges registered linear RAW exposures. Each frame supplies `codes`, `exposureTimeSeconds`, `blackLevelCode`, `whiteLevelCode`, optional `saturationFlags`, `conversionGainElectronsPerCode` (K) and `readNoiseElectrons`. Samples at or above white, or flagged, are excluded. For the remaining frames:

- e_k = (code_k − black_k)·K_k
- Φ̂_k = e_k / t_k (photo-electrons per second)
- Var[e_k] = max(Φ, 0)·t_k + σ_read,k² + K_k²/12

The variance combines Poisson shot noise and read noise, as in `calculateSignalToNoise`, with the EMVA 1288 uniform quantization term. The estimates are combined with the noise-optimal inverse-variance weights w_k = t_k² / Var[e_k], Φ̂ = Σw_kΦ̂_k / Σw_k and Var[Φ̂] = 1/Σw_k (Granados et al., CVPR 2010; Hasinoff, Durand & Freeman, CVPR 2010). Because Φ enters the variance, the estimate starts from the shot-noise maximum-likelihood estimate Σe_k/Σt_k. It is then refined by `iterations` reweightings (default 2).

Samples saturated in every frame receive the largest representable rate, max_k (white_k − black_k)·K_k / t_k, as a lower bound, with `contributingFrameCount` 0. Each bracket is merged sample by sample, so the merge works on CFA mosaics (demosaic the merged mosaic afterwards) and on RGB data alike.

Tests check:

- exact noise-free recovery;
- exclusion of saturated and flagged samples;
- reduction to Σe/Σt without read and quantization noise;
- on 20,000 simulated samples, an unbiased mean and the predicted variance within 5%. The variance is about 210 (e⁻/s)², against about 857 for equal weighting.

Not modelled: dark current, fixed-pattern noise, inter-frame motion and registration. Inputs must be linear, so non-linear (camera-response) inputs and Debevec–Malik response recovery are not supported.

### HDR output

`createHdrImageEncodingTask({ image, inputColorSpace, transfer, ... })` first converts linear RGB to BT.2020 primaries. The matrices come from `resolveRgbColorSpace` (SMPTE RP 177 derivation); for sRGB this reproduces the ITU-R BT.2087 matrix. It then encodes:

- **`pq`**: the ITU-R BT.2100 PQ inverse EOTF (also SMPTE ST 2084) (`evaluatePqInverseEotf`), with relative 1.0 at `referenceWhiteLuminanceCdPerSquareMeter`. The default is 203 cd/m², the ITU-R BT.2408 HDR reference white. Luminance is clipped to [0, 10000] cd/m².
- **`hlg`**: the BT.2100 HLG OETF (`evaluateHlgOetf`), with relative 1.0 at signal `hlgReferenceWhiteSignal`. The default is 0.75, the BT.2408 HLG reference white. Scene-linear E is clipped to [0, 1].
- **`linear-float32`**: unclipped float32 linear BT.2020.

Integer codes use BT.2100 full range, D = round((2ⁿ−1)E′), or narrow range, D = round((219E′+16)·2ⁿ⁻⁸), at 10, 12 or 16 bits. Negative and over-range clipping are counted. This is component clipping, not gamut mapping, and no HDR metadata (MaxCLL/MaxFALL) or display adaptation is produced.

## Tone mapping and exposure fusion

- **Reinhard et al. (SIGGRAPH 2002), global.** The log-average luminance is L̄_w = exp(mean log(δ + L_w)), with δ = 1e-6 by default. Then L = a·L_w/L̄_w (key a = 0.18 by default) and L_d = L(1 + L/L_white²)/(1 + L). L_white defaults to the largest scaled luminance. Colour is scaled by L_d/L_w, which preserves chromaticity. The local dodging-and-burning variant is not implemented.
- **Durand & Dorsey (SIGGRAPH 2002), local.** The base is a bilateral filter of log₁₀ luminance, with spatial σ defaulting to 2% of the larger side and range σ to 0.4. Detail = log₁₀L − base, and the output log is base·c + detail − max(base)·c with c = log₁₀(contrast)/(max base − min base). The target base contrast defaults to 5:1. The bilateral filter uses the paper's piecewise-linear acceleration: intensity nodes spaced ≤ σ_r apart, a box-downsampled grid (factor max(1, round(σ_s/4)) by default), bilinear upsampling, and interpolation between the two nodes bracketing each pixel. Tested against a brute-force bilateral filter, it stays within 0.03 log₁₀. Luminance uses the Y row of the declared space.
- **Mertens, Kautz & Van Reeth (Pacific Graphics 2007), exposure fusion** of display-referred frames. The weights are:
  - contrast: |3×3 Laplacian| of Rec.709-weighted luma;
  - saturation: the RGB standard deviation;
  - well-exposedness: Π_c exp(−(v_c − 0.5)²/(2·0.2²)).

  Each weight is raised to its exponent (default 1). The weights are normalized per pixel and blended with Laplacian pyramids (Burt & Adelson, 1983; 5-tap kernel [1, 4, 6, 4, 1]/16). The output is clipped to [0, 1]. Identical frames reproduce the input, which is tested.

HDR operator outputs are display-referred linear RGB in the input primaries. Encode them with the SDR rendering primitives.

## Focus stacking

`createFocusStackTask({ frames, sharpnessSigmaPixels?, pyramidLevels? })` works as follows:

1. The sharpness of each frame is S_k = G_σ ⊗ (∇²Y_k)², the Gaussian-averaged squared 3×3 Laplacian of luma. This is a Laplacian-based focus measure (Nayar & Nakagawa, 1994; survey by Pertuz, Puig & García, 2013).
2. Each pixel selects its sharpest frame. Ties go to the lowest index.
3. The one-hot masks blend the frames through Laplacian pyramids (Burt & Adelson, 1983; Burt & Kolczynski, 1993), which removes selection seams.

On a synthetic three-slice depth stack, the result exceeds every input frame by more than 6 dB PSNR and selects the sharp slice in each band. Frames must be registered. There is no focus-breathing (magnification) correction, and `selectedFrameIndex` is a selection, not calibrated depth.

## Panorama from known rotations

`createPanoramaTask({ frames, canvas, blending?, exposureCompensation? })` stitches without feature matching. Each frame gives `focalLengthPixels`, an optional principal point and `rotationRad {pitch, yaw, roll}`. The rotation uses the engine's physical right-hand convention, applied as one axis-angle vector through `applyPhysicalCameraRotation`. The reference frame is the camera with zero rotation (+X right, +Y up, +Z forward).

Each canvas pixel's ray is computed as follows. θ increases to the right and φ upward (Szeliski, 2006).

- Equirectangular: d = (cos φ sin θ, sin φ, cos φ cos θ).
- Cylindrical: d ∝ (sin θ, h, cos θ), with h = tan φ linear in rows.

The ray is mapped into each frame and projected rectilinearly: x = c_x + f·x′/z′ and y = c_y − f·y′/z′, with pixel centres at i + 0.5. The frame is then sampled bilinearly.

Exposure compensation (`gain`, the default) solves Brown & Lowe (IJCV 2007): minimize Σ_{i<j} N_ij[(g_iĪ_ij − g_jĪ_ji)²/σ_N² + ((1−g_i)² + (1−g_j)²)/(2σ_g²)]. Overlap means are normalized by the mean of all overlap means. The defaults are σ_N = 0.04 (about 10/255, the published 8-bit value) and σ_g = 0.1. The linear system is solved exactly.

Blending is one of:

- **`feather`**: weights fall linearly from each frame's centre to its edge;
- **`multi-band`**: Burt & Adelson (1983) Laplacian pyramids of each warped frame, blended with Gaussian pyramids of its binary max-weight mask. Each frame's Gaussian levels are normalized by those of its coverage mask (normalized convolution, Knutsson & Westin, 1993), so the zero fill does not darken the blend. The default is at most 4 levels; coarse bands much wider than the frame overlap mix differently normalized low frequencies.

Synthetic scenes rendered by rotation are reproduced to within 0.01 (feather) and 0.005 (multi-band, 6 px inside the coverage edge). Relative exposures of 1.25 and 0.8 are recovered to 2 decimals.

Limits: pure rotation only (no parallax), no lens distortion or vignetting correction, and resampling without a prefilter.

## Denoising, sharpening and synthetic grain

- **Bilateral filter** (Tomasi & Manduchi, ICCV 1998): a brute-force window of radius ⌈3σ_s⌉ with a Gaussian spatial weight and a Gaussian range weight on the Euclidean RGB distance in the data's own units.
- **Non-local means** (Buades, Coll & Morel, CVPR 2005): w = exp(−max(d² − 2σ², 0)/h²), where d² is the mean squared difference over a uniform (2f+1)² patch and all channels. With known σ this is the form of Buades et al. (IPOL 2011); with σ = 0 it is the 2005 form with a uniform patch kernel. The centre pixel takes the largest weight in its search window. The implementation is offset-major, with box-filtered patch distances.
- **Unsharp mask**: out = in + amount·(in − G_σ⊗in) where the detail exceeds `threshold`. The test checks the analytic sinusoid gain 1 + a(1 − e^(−2π²σ²f²)).
- **Synthetic film grain** is clearly labelled `syntheticAesthetic: true, physicalFilmModel: false`. It is **not** a film model: there are no silver-halide grain statistics, dye clouds or characteristic curve.
  - Per-pixel unit Gaussian noise is seeded from (seed, absolute pixel index, stream `SYNTHETIC_FILM_GRAIN_STREAM_ID`) through the engine's deterministic stream.
  - The noise is optionally Gaussian-correlated by the grain size and renormalized to unit variance by Σk².
  - It is scaled by a(v) = intensity·2√(v(1−v)) on encoded values in [0, 1], and the result is clipped.

All filters use one global parameter set. Linear RAW noise is signal-dependent, and no variance-stabilizing transform is applied.

## Sources

- Burt, P. J. & Adelson, E. H. (1983). The Laplacian pyramid as a compact image code. *IEEE Trans. Communications* 31(4), 532–540; and A multiresolution spline with application to image mosaics. *ACM TOG* 2(4), 217–236.
- Burt, P. J. & Kolczynski, R. J. (1993). Enhanced image capture through fusion. *Proc. ICCV 1993*.
- Brown, M. & Lowe, D. G. (2007). Automatic panoramic image stitching using invariant features. *IJCV* 74(1), 59–73. Gain compensation and multi-band blending only.
- Buades, A., Coll, B. & Morel, J.-M. (2005). A non-local algorithm for image denoising. *Proc. CVPR 2005*, vol. 2, 60–65; and Buades et al. (2011), Non-local means denoising, *Image Processing On Line* 1.
- W3C CSS Color Module Level 4, Lab (free); also CIE 15 (Colorimetry): CIELAB.
- Durand, F. & Dorsey, J. (2002). Fast bilateral filtering for the display of high-dynamic-range images. *ACM TOG* 21(3), 257–266.
- EMVA Standard 1288: linear camera model and quantization noise variance 1/12 DN².
- Granados, M., Ajdin, B., Wand, M., Theobalt, C., Seidel, H.-P. & Lensch, H. P. A. (2010). Optimal HDR reconstruction with linear digital cameras. *Proc. CVPR 2010*.
- Gunturk, B. K., Glotzbach, J., Altunbasak, Y., Schafer, R. W. & Mersereau, R. M. (2005). Demosaicking: color filter array interpolation. *IEEE Signal Processing Magazine* 22(1).
- Hasinoff, S. W., Durand, F. & Freeman, W. T. (2010). Noise-optimal capture for high dynamic range photography. *Proc. CVPR 2010*.
- Hirakawa, K. & Parks, T. W. (2005). Adaptive homogeneity-directed demosaicing algorithm. *IEEE Trans. Image Processing* 14(3), 360–369.
- ITU-R BT.2020-2, BT.2087, BT.2100-3 and BT.2408 (free); also SMPTE ST 2084.
- Knutsson, H. & Westin, C.-F. (1993). Normalized and differential convolution. *Proc. CVPR 1993*.
- Malvar, H. S., He, L. & Cutler, R. (2004). High-quality linear interpolation for demosaicing of Bayer-patterned color images. *Proc. IEEE ICASSP 2004*, vol. 3.
- Mertens, T., Kautz, J. & Van Reeth, F. (2007). Exposure fusion. *Proc. Pacific Graphics 2007*.
- Nayar, S. K. & Nakagawa, Y. (1994). Shape from focus. *IEEE TPAMI* 16(8), 824–831; Pertuz, S., Puig, D. & García, M. A. (2013). Analysis of focus measure operators for shape-from-focus. *Pattern Recognition* 46(5).
- Reinhard, E., Stark, M., Shirley, P. & Ferwerda, J. (2002). Photographic tone reproduction for digital images. *ACM TOG* 21(3), 267–276.
- Szeliski, R. (2006). Image alignment and stitching: a tutorial. *Foundations and Trends in Computer Graphics and Vision* 2(1).
- Tomasi, C. & Manduchi, R. (1998). Bilateral filtering for gray and color images. *Proc. ICCV 1998*.
