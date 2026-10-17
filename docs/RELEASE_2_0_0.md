# 2.0.0 release candidate

> **Candidate record, prepared October 17, 2026.** This is the production release request for `@photivra/engine@2.0.0`. Preparing it does not tag, publish or create a GitHub release. **Tagging `v2.0.0` triggers npm publishing and requires the owner's explicit approval.**

## At a glance

- **What is proposed:** publish `@photivra/engine@2.0.0`, with `ENGINE_API_VERSION = "2.0.0"` and `POC_SIMULATION_API_VERSION = "1.0.0"`.
- **Why the version goes from 1 to 2:** the owner directed a single major release containing every fix, optimization and new feature from the 2.0 deep review, including breaking API and schema changes. Some of these changes alter results, stored identities (hashes, seeds) or the input that is accepted. Under the 1.0 root-package compatibility policy, such changes require a major version.
- **What is ready:** all work streams are merged, the version numbers are aligned, the changelog is written, and the citation audit is done.
- **What still needs the owner:** the [pending owner decisions](#pending-owner-decisions), a substantive human review of the AI-assisted changes and of this record, green CI on the exact release commit, and explicit approval to tag `v2.0.0`. See the [remaining release checklist](#remaining-release-checklist).
- **What this release does not claim:** calibrated physical accuracy for any real camera, lens or sensor. Tier presets remain synthetic.

## Candidate details

**Candidate base:** `origin/main` at `09e4262` (#304), merged into the release branch.

- `npm run release:prepare -- 2.0.0` had already aligned `package.json`, both lockfile root versions, `ENGINE_API_VERSION`, `CITATION.cff`, the current-release lines in `README.md` and `docs/DEVELOPERS.md`, and the generated `docs/api`.
- After the merge, the API reference was regenerated.
- No citation release date is stated before publication.

**All streams merged:** the lean per-site executor (#305), the `simulateCapture()` integration of the 2.0 features (#306) and the native RAW DNG writer (#307) are merged and listed in the [changelog](https://github.com/Photivra/photivra/blob/main/CHANGELOG.md).

## Scope

Changes since `v1.5.0`, all merged to `main`. In the "Kind" column, *Breaking* means existing users may get different results or errors; *Additive* means new features only; *Performance (bit-identical)* means faster with exactly the same output.

| PR | Issue | Change | Kind |
| --- | --- | --- | --- |
| [#278](https://github.com/Photivra/photivra/pull/278) | #274 | Print JPEG pixels-per-inch and mandatory ExifVersion | Fix, additive API |
| [#279](https://github.com/Photivra/photivra/pull/279) | #271 | Exact thin-lens depth-of-field limits | Breaking (values) |
| [#280](https://github.com/Photivra/photivra/pull/280) | #273 | Capacity assessments bound to their charge; `>=` digital saturation flag | Fix (stricter validation) |
| [#281](https://github.com/Photivra/photivra/pull/281) | #272 | Auto-ISO priority modes match exact grid values | Fix |
| [#282](https://github.com/Photivra/photivra/pull/282) | #276 | Crop rounding, canonical JSON, result contract, POC server status codes | Breaking (values, strictness) |
| [#283](https://github.com/Photivra/photivra/pull/283) | #270 | Independent per-site RAW noise seeding | Breaking (values, identities) |
| [#284](https://github.com/Photivra/photivra/pull/284) | #276 | Camera rotation sign; complex-pupil PSF padding and sampling guard | Breaking (values, geometry) |
| [#285](https://github.com/Photivra/photivra/pull/285)–[#288](https://github.com/Photivra/photivra/pull/288) | #275, #276 | Native path, SDR, JPEG and stabilization speedups; optical-stage reuse | Performance (bit-identical), additive API |
| [#290](https://github.com/Photivra/photivra/pull/290) | 2.0 review | ISO-to-gain mapping, fixed-pattern noise, generic presets 2.0.0, noise model 0.4.0 | Breaking (values, schemas) |
| [#291](https://github.com/Photivra/photivra/pull/291) | 2.0 review | Colorimetry, chromatic adaptation, Kelvin white balance, wide-gamut and HDR transfers | Additive, union widening |
| [#292](https://github.com/Photivra/photivra/pull/292) | #275 | Faster native environment RAW, yields between sites | Performance (bit-identical) |
| [#293](https://github.com/Photivra/photivra/pull/293) | 2.0 review | Cross-engine determinism, review fixes, POC API 1.0.0, leaner package, input validation | Breaking (values, strictness, package) |
| [#294](https://github.com/Photivra/photivra/pull/294) | #275 | Native environment site-plan retention | Performance (bit-identical) |
| [#295](https://github.com/Photivra/photivra/pull/295) | 2.0 review | RAW development corrections, tone curves, DNG tags, typed kernel | Breaking (values, contract) |
| [#296](https://github.com/Photivra/photivra/pull/296) | 2.0 review | Projections, distortion, axial CA, vignetting, Zernike, PSF interpolation, polarizer, haze | Additive, type widening |
| [#297](https://github.com/Photivra/photivra/pull/297), [#301](https://github.com/Photivra/photivra/pull/301) | 2.0 review | Rolling-shutter image formation, video, TTL/HSS flash, highlight-priority metering | Additive, union widening |
| [#298](https://github.com/Photivra/photivra/pull/298) | 2.0 review | Exif 2.32 tags, JPEG encoder v2, Print JPEG 0.2.0, DNG import, PNG | Breaking (bytes, schema), additive |
| [#299](https://github.com/Photivra/photivra/pull/299) | 2.0 review | Coverage, independent oracles, rejection tables | Tests only |
| [#300](https://github.com/Photivra/photivra/pull/300) | 2.0 review | `simulateCapture()` facade and chart scenes | Additive |
| [#302](https://github.com/Photivra/photivra/pull/302) | 2.0 review | Demosaic, HDR, tone mapping, fusion, stacking, panorama, denoise | Additive |
| [#303](https://github.com/Photivra/photivra/pull/303) | 2.0 review | Brown–Conrady and projections wired into mapping and environment capture | Additive, type widening |
| [#304](https://github.com/Photivra/photivra/pull/304) | #277 | Opt-in WebGPU float32 backend | Additive |
| [#305](https://github.com/Photivra/photivra/pull/305) | #275 | Lean per-site executor for native environment RAW | Performance (identical output) |
| [#306](https://github.com/Photivra/photivra/pull/306) | — | `simulateCapture()` uses the 2.0 features | Additive |
| [#307](https://github.com/Photivra/photivra/pull/307) | — | Native RAW DNG writer, perceptual gamut mapping, PSF throughput rounding fix | Additive, fix |

Commits #243–#267, between `v1.5.0` and the first review, are guidance, CI, documentation, hooks, `release:prepare` and repository-internal browser-native reference work. They change no public root contract. The full release notes, with a migration for each breaking change, are in the [changelog](../CHANGELOG.md).

## Science evidence

How to read this section: each entry names one change, the model and version it uses, the accepted science and sources behind it, and the committed deterministic tests that check it.

- Free sources are preferred, following the [citation audit](#citation-audit-free-sources). A paid standard appears only as "also specified in", or where no free equivalent was found.
- Nothing in this release establishes calibrated physical accuracy for any real camera, lens or sensor. Tier presets remain synthetic.

### RAW noise seeding (#283) and noise model (#290)

- **Model and version:** `photivra-native-raw-noise` 0.4.0; seed schedule v2; charge realization 3.0.0; RAW code 4.0.0.
- **Accepted science and sources:**
  - Linear camera model and photon-transfer noise of EMVA Standard 1288 Release 4.0 (free from emva.org): Poisson signal electrons, independent Gaussian read noise, gain, quantization.
  - J. R. Janesick, *Photon Transfer* (SPIE, 2007).
  - Poisson sampling by Hörmann's PTRS (1993) and Box–Muller (1958), with the normal approximation for very large means (Johnson, Kemp & Kotz, *Univariate Discrete Distributions*, 3rd ed.).
  - Seeds from the public-domain MurmurHash3_x86_32/`fmix32`. Independence is shown statistically.
- **Evidence in the repository:** `test/sensor-raw-noise-independence.test.ts` (Poisson mean/variance, spatial and cross-seed independence within pre-declared 5σ bands; the old schedule fails at lag correlation 0.84), `test/sensor-readout-v2.test.ts`.

### ISO-to-gain and fixed-pattern noise (#290)

- **Model and version:** `createIsoGainReadoutRegimes`; `photivra-sensor-fixed-pattern` 1.0.0; expected readout 2.0.0.
- **Accepted science and sources:**
  - Exposure index S = 10/H and focal-plane exposure H = 0.65·L·t/N² from CIPA DC-004-2020 (free; also ISO 12232:2019).
  - EMVA 1288 Release 4.0: system gain K, PRNU, DSNU, linearity, dark current versus temperature. (PRNU and DSNU are the pixel-to-pixel variations in response to light and in dark signal.)
  - Janesick (2007): exponential dependence of dark current on temperature.
  - Dual conversion gain is a declared per-mode read noise, never derived from S.
- **Evidence in the repository:** `test/iso-brightness.test.ts`, `test/sensor-readout-v2.test.ts`, `test/independent-radiometric-oracle.test.ts` (independent camera-equation RAW oracle).

### Depth of field and defocus (#279, #293)

- **Model and version:** `thin-lens-depth-of-field` 1.1.0; defocus circle 1.1.0.
- **Accepted science and sources:** exact thin-lens limits from the blur-circle condition; S. F. Ray, *Applied Photographic Optics*, 3rd ed. (2002). The defocus closed form is an algebraic rearrangement of the same model. Geometric only.
- **Evidence in the repository:** `test/optics.test.ts` (exact rational references, a property test with 300+ cases, hyperfocal cases).

### Camera rotation sign (#284)

- **Model and version:** rotation and stabilization models 2.0.0.
- **Accepted science and sources:** right-hand-rule rigid rotation with standard rotation matrices. The camera basis is left-handed, so the physical matrix is the transpose of the component Rodrigues form.
- **Evidence in the repository:** `test/camera-rotation-sign-consistency.test.ts`.

### Complex-pupil PSF sampling (#284, #293)

PSF = point-spread function: the pattern a lens makes from a single point of light.

- **Model and version:** complex-pupil PSF 2.0.0.
- **Accepted science and sources:**
  - Incoherent PSF = \|FT{pupil}\|², OTF cutoff D/(λz), Nyquist Q = λN/pitch ≥ 2: J. W. Goodman, *Introduction to Fourier Optics*, 4th ed. (2017).
  - Q notation from Fiete, *Opt. Eng.* 38(7) (1999).
  - The no-wrap condition M ≥ 2S − 1 follows from DFT circular convolution.
- **Evidence in the repository:** `test/lens-psf-framework.test.ts` (Dirichlet kernel, analytic Airy comparison, support rejection).

### Cross-engine determinism (#293)

The aim: the same inputs give bit-identical stored results in every JavaScript engine.

- **Model and version:** crop models 2.0.0; 35 mm crop factor.
- **Accepted science and sources:** IEEE 754-2019 §5.4 requires correct rounding of +, −, ×, ÷ and sqrt. ECMA-262 §21.3.2 leaves `Math` functions approximated by each implementation. Hashed paths therefore use only correctly rounded operations and portable kernels.
- **Evidence in the repository:** `test/portable-math.test.ts`, `test/crop-integer-rounding.test.ts`, the POC hash corpus, and the macOS hash-lock CI job.

### Colorimetry (#291)

- **Model and version:** `COLORIMETRY_MODEL_VERSION` 1.0.0.
- **Accepted science and sources:**
  - Analytic colour-matching functions (CMFs): Wyman, Sloan & Shirley, JCGT 2(2) 2013 (free; labelled approximation).
  - Planck's law (BIPM *Mise en pratique* for the kelvin, Absolute Primary Radiometry, Eq. 1, free) with exact SI constants (BIPM SI Brochure, 9th ed., free).
  - Illuminant A: Planck's law with the CIE's constants c₂ = 1.435e-2 m·K and T = 2848 K; it reproduces the free CIE 1 nm table to its rounding. Daylight locus and M₁/M₂: CIE 15:2018 (paid; no free text found; values checked against the free CIE D55 and D65 datasets).
  - Tristimulus integral: Wyman, Sloan & Shirley 2013, Eq. 1 (free).
  - CIE94: Wikipedia, "Color difference" (secondary source; the primary CIE 116-1995 is not free), checked against the colour-science worked values.
  - RGB↔XYZ matrices: derived from the ITU-R BT.709-6 / BT.2020-2 and CSS Color 4 primaries and D65; equal to the W3C CSS Color 4 matrices within 1e-12.
  - Planckian locus: Kang et al., *J. Korean Phys. Soc.* 41(6) (2002). McCamy, *Color Res. Appl.* 17(2) (1992).
  - CCT/Duv (correlated colour temperature and distance from the Planckian locus): Smet et al., LEUKOS 2023 (free DOE copy). Duv sign: the engine's documented convention (positive above the locus).
  - Chromatic adaptation: Lam (1985), ICC.1 Annex E (free), Moroney et al. CIC10 2002, Li et al. *Color Res. Appl.* 42(6) (2017).
  - CIELAB: W3C CSS Color 4. CIEDE2000: Sharma, Wu & Dalal 2005 (free notes and test data).
  - Camera matrix fit: Finlayson & Drew, CIC5 1997.
  - Gamut mapping: Morovič 2008; CSS Color 4 §13.
  - Transfers: ITU-R BT.709-6, BT.1886, BT.2020-2, BT.2100-3, BT.2408 (free) and CSS Color 4 sRGB.
- **Evidence in the repository:** `test/colorimetry.test.ts`, `test/colorimetry-output-and-camera.test.ts` (Sharma CIEDE2000 test pairs, published chromaticities, ITU-R luminance rows).

### RAW development (#295)

- **Model and version:** development output and DNG tags.
- **Accepted science and sources:**
  - DNG Specification 1.7.1.0 (free): WhiteLevel, BlackLevel/ActiveArea origin, AsShotNeutral, ForwardMatrix1, BaselineExposure, NoiseProfile, AnalogBalance.
  - EMVA 1288 saturation point.
  - Tone curves: Reinhard et al., SIGGRAPH 2002; Naka & Rushton, *J. Physiol.* 185 (1966); Reinhard & Devlin, IEEE TVCG 11(1) (2005).
  - Highlight reconstruction is an approximation defined by the engine, informed by Guo, Cheng & Hu, CVPR 2010.
- **Evidence in the repository:** `test/raw-white-level.test.ts`, `test/photographic-export-development.test.ts`, `test/native-sdr-quantizer.test.ts`, `test/processing-raw-development-borders.test.ts`.

### Optics (#296, #303)

- **Model and version:** projections, Brown–Conrady, axial CA (chromatic aberration), vignetting, wavefronts, polarizer (filter schema 0.2.0), haze; mapping schema 0.2.0; environment photo-signal 0.4.0 when a mapping is present.
- **Accepted science and sources:**
  - Projections: Miyamoto, JOSA 54 (1964); Kannala & Brandt, IEEE TPAMI 28 (2006); Snyder, USGS PP 1395 (1987, free).
  - Distortion: Conrady, MNRAS 79 (1919); Brown (1966, 1971).
  - Vignetting: cos⁴ and finite Lambertian disk (Foote 1915); mechanical vignetting (Kingslake & Johnson).
  - Wavefronts: Noll, JOSA 66 (1976); Mahajan, JOSA 72 (1982); Maréchal.
  - Dispersion: Cauchy/Abbe (Hecht; Born & Wolf); line wavelengths from SCHOTT TIE-29 (free).
  - Polarizer: Malus's law and Mueller matrices (Chipman; Goldstein).
  - Haze: Koschmieder 1924; Middleton 1952; WMO-No. 8 (free).
  - The irradiance area factor 1/det J follows from flux conservation.
- **Evidence in the repository:** `test/lens-projection.test.ts`, `test/brown-conrady-distortion.test.ts`, `test/pupil-vignetting.test.ts`, `test/wavefront-aberrations.test.ts`, `test/lens-psf-interpolation.test.ts`, `test/front-of-lens-polarizer.test.ts`, `test/haze-and-geometric-breathing.test.ts`, `test/lens-geometry-wiring.test.ts`, `test/lens-field-mapping-environment.test.ts`, `test/optics-validator-extrema.test.ts`.

### Rolling shutter, video, flash, metering (#297)

- **Model and version:** `electronic-rolling-shutter-line-reset-read` 1.0.0; `flash-hss-quasi-continuous-burst` 1.0.0; flash sync schema 0.2.0; metering 1.1.0.
- **Accepted science and sources:**
  - Rolling shutter: El Gamal & Eltoukhy (2005); Liang, Chang & Chen, IEEE TIP 17(8) (2008); Meingast, Geyer & Sastry (2005, arXiv:cs/0503076, free); Ait-Aider et al., ECCV 2006.
  - Flicker: Poplin (2006). Modulation at twice the mains frequency follows from P ∝ sin²ωt.
  - Shutter angle: ASC *American Cinematographer Manual*.
  - Guide number GN = d·N, from the inverse-square law and the camera equation (Ray 2002; Jacobson et al. 2000).
  - HSS (high-speed sync) √(η·t_e/D) is derived and labelled an approximation.
  - TTL (through-the-lens flash metering) is a generic linear pre-flash solution.
  - Highlight priority: Hyndman & Fan (1996) quantiles.
- **Evidence in the repository:** `test/rolling-shutter-image-formation.test.ts`, `test/video-sequence.test.ts`, `test/flash-ttl-hss.test.ts`, `test/highlight-priority-metering.test.ts`.

### Export formats (#298)

- **Model and version:** Print JPEG 0.2.0; encoder `photivra-baseline-jpeg-444-v2`; `photivra-png-rgb-v1`; DNG import 1.0.0.
- **Accepted science and sources:**
  - Exif 2.32 (CIPA DC-008, free): mandatory tags and defaults.
  - ITU-T T.81 (free): DCT definition, Huffman coding, Annex H lossless.
  - DNG 1.7.1.0 and TIFF 6.0 (free).
  - W3C PNG Third Edition (free): cICP, mDCV, cLLI, sRGB gAMA/cHRM; RFC 1950/1951; ITU-T H.273 code points.
  - DCT cosines are mathematical values computed by the engine.
- **Evidence in the repository:** `test/export-jpeg-v2.test.ts` (independent reference encoder), `test/print-jpeg-strip-identity.test.ts`, `test/dng-import.test.ts`, `test/png-encoder.test.ts` (layouts cross-checked with Pillow).

### Processing (#302)

- **Model and version:** opt-in tasks; no change to the default path.
- **Accepted science and sources:** Malvar, He & Cutler, ICASSP 2004; Hirakawa & Parks, IEEE TIP 14(3) (2005); Gunturk et al. (2005); Granados et al. and Hasinoff et al., CVPR 2010; Reinhard et al. and Durand & Dorsey, SIGGRAPH 2002; Mertens et al., PG 2007; Burt & Adelson (1983); Nayar & Nakagawa (1994); Brown & Lowe, IJCV 2007; Tomasi & Manduchi, ICCV 1998; Buades et al., CVPR 2005 and IPOL 2011 (free). Film grain is explicitly synthetic.
- **Evidence in the repository:** `test/processing-*.test.ts` (seven files).

### `simulateCapture()` (#300)

- **Model and version:** facade 1.0.0.
- **Accepted science and sources:**
  - Composes existing models.
  - Exposure anchor by CIPA DC-004-2020 (free): standard output sensitivity S = 10/H and the camera equation H = 0.65·L·t/N², with the 18 % grey as the reference. The default illuminance is π·10·N²/(0.65·t·S·0.18) ≈ 21 480.98 lux.
  - Luther condition (Luther 1927).
  - Slanted-edge geometry after Burns, IS&T PICS 2000 (free).
  - K_cd = 683 lm/W (BIPM SI Brochure).
- **Evidence in the repository:** `test/simulate-capture.test.ts`, `test/chart-scenes.test.ts`.

### WebGPU backend (#304)

- **Model and version:** `webgpu-f32` execution label; irradiance convolution schema 0.1.0.
- **Accepted science and sources:**
  - Incoherent imaging as linear superposition with isoplanatic patches (Goodman 2017 §6.1); piecewise shift-invariant optics (Farrell et al., Proc. SPIE 8299, 2012).
  - Float32 forward-error bounds γ_k (Higham, *Accuracy and Stability of Numerical Algorithms*, 2nd ed., §2–3); IEEE 754 binary32; W3C WGSL accuracy rules (free).
  - Never claimed bit-identical.
- **Evidence in the repository:** `test/image-kernel-accelerator.test.ts` (fake device), `test/webgpu/conformance.webgpu.ts` (real device, repository-only).

### Native RAW DNG (#307)

- **Model and version:** `NATIVE_RAW_DNG_SCHEMA_VERSION` 1.0.0.
- **Accepted science and sources:** Adobe DNG Specification 1.7.1.0 (free): tag semantics; BlackLevel/CFAPattern origin at the ActiveArea top-left (confirmed in the spec text); NoiseProfile definition. EMVA 1288 (free): shot, read and quantization noise.
- **Evidence in the repository:** `test/native-raw-dng.test.ts` (round trip through `parseDngRawImage`); LibRaw decode recorded in #307.

### Facade gamut mapping (#307)

- **Model and version:** —
- **Accepted science and sources:** CIELAB chroma reduction at constant L* and hue (W3C CSS Color 4 §13, free; Morovič 2008).
- **Evidence in the repository:** `test/simulate-capture-integration.test.ts`.

### Fixes and validation (#280, #281, #282, #293)

- **Model and version:** no physics change.
- **What they are:** consistency, tolerance, serialization and validation fixes.
- **Evidence in the repository:** `test/sensor-raw-pipeline.test.ts`, `test/priority-auto-iso-resolver.test.ts`, `test/canonical-json.test.ts`, `test/root-export-input-errors.test.ts`, the `*-rejections.test.ts` tables.

### Performance (#285–#288, #292, #294)

- **Model and version:** no model, equation or unit change.
- **What they are:** speed-ups with bit-identical output.
- **Evidence in the repository:** `test/native-environment-bit-identity.test.ts`, `test/native-environment-shared-state.test.ts`, `test/environment-photo-plan-retention.test.ts`, `test/native-capture-sdr-kernel-parity.test.ts`, `test/export-jpeg-byte-identity.test.ts`, `test/stabilization-evaluation-identity.test.ts`, `test/native-yield-cadence.test.ts`, `test/native-environment-optical-stage.test.ts`.

## Citation audit (free sources)

The owner's rule is that releases rely only on free-to-use sources. Every paid or paywalled standard cited by 2.0 work is listed below, with the free source used instead.

Free standards bodies and documents already in use need no change: CIPA (DC-003, DC-004, DC-008), ITU-R and ITU-T recommendations, EMVA 1288, the Adobe DNG and TIFF 6.0 specifications, ICC specifications, W3C recommendations, IETF RFCs, the BIPM SI Brochure, and the CIE free datasets.

In the Status column: **Replaced** means a free source now backs the fact. **Removed** means the engine no longer depends on the paid source: the fact is derived in the documentation or stated as the engine's own convention. **Flagged** means no free equivalent was found, and the owner must decide what to do (see [pending owner decisions](#pending-owner-decisions)).

| Paid source | Fact used | Free replacement | Status |
| --- | --- | --- | --- |
| ISO 12232:2019 | Exposure index S = 10/H; H ∝ 1/S; H = 0.65·L·t/N² | CIPA DC-004-Translation-2020, *Sensitivity of Digital Cameras*, §3.2–3.3 and §5.5 — <https://www.cipa.jp/e/std/std-sec.html> | Replaced |
| ISO 12232:2019 | Saturation-based speed S_sat = 78/H_sat (test oracle, Quick Start remark, highlight-priority headroom remark) | Removed. The ISO-brightness test now uses the CIPA DC-004-2020 standard output sensitivity H_m = 10/S (§3.2), whose reference level is an 18 % grey (§5.2, Explanation 1 and 2.2), so mid-grey is 0.18 of the white exposure — <https://www.cipa.jp/e/std/std-sec.html>. The Quick Start and highlight-priority remarks cite DC-004 and state the half-stop headroom as the engine's own documented choice. No engine output changed. | Replaced (owner decision 1) |
| ISO 2720:1974 | Reflected-light meter constant K = 12.5 cd·s/m² (facade exposure anchor) | Removed. The facade uses CIPA DC-004-2020 S = 10/H (§3.2) and H = 0.65·L·t/N² (§5.5 (4), Explanation 4) — <https://www.cipa.jp/e/std/std-sec.html>. This is equivalent to K = 10/0.65 ≈ 15.38. The default illuminance changes from π·12.5·64·125/18 ≈ 17 453.29 lux to π·80 000/11.7 ≈ 21 480.98 lux (recorded in `CHANGELOG.md`). | Replaced (owner decision 2) |
| ISO 12233:2017 | Slanted-edge chart geometry | P. D. Burns, "Slanted-Edge MTF for Digital Camera and Scanner Analysis", IS&T PICS 2000 — <https://www.imaging.org/common/uploaded%20files/pdfs/Papers/2000/PICS-0-81/1621.pdf> | Replaced |
| ISO 2827 | Guide-number measurement | Citation removed. `docs/SCENE_SENSOR_TEMPORAL_EXPOSURE.md` derives GN = d·N, the √p and the √(ISO/100) scaling from the inverse-square law and the DC-004 camera equation. The engine does not model how a guide number is measured; the caller supplies it. | Removed (owner decision 3) |
| ISO 7944 | Fraunhofer d, F, C line wavelengths | SCHOTT Technical Information TIE-29, *Refractive Index and Dispersion* (August 2023) — <https://media.schott.com/api/public/content/aaa572afd854434fb7b3faa4bc46103f> (587.5618, 486.1327, 656.2725 nm confirmed) | Replaced |
| ISO 12234-2 (TIFF/EP) | CFARepeatPatternDim, CFAPattern | Adobe DNG 1.7.1.0 and CIPA DC-008 (Exif CFAPattern) — <https://helpx.adobe.com/camera-raw/digital-negative.html>, <https://www.cipa.jp/e/std/std-sec.html> | Replaced |
| ISO/IEC 10918-1 | JPEG DCT, Huffman, lossless | ITU-T T.81 (identical text) — <https://www.w3.org/Graphics/JPEG/itu-t81.pdf> | Replaced |
| IEC 61966-2-1 | sRGB primaries, transfer and matrix | W3C CSS Color Module Level 4, `srgb` — <https://www.w3.org/TR/css-color-4/>; ICC sRGB registry — <https://registry.color.org/rgb-registry/files/sRGB.pdf>; ITU-R BT.709-6 | Replaced |
| CIE 15:2018 / ISO/CIE 11664-4 | CIELAB with exact ε, κ | W3C CSS Color 4 §9 (Lab) | Replaced |
| CIE 15:2018 / ISO/CIE 11664-1 | Tristimulus integration X = k Σ S R x̄ Δλ | Wyman, Sloan & Shirley 2013, JCGT 2(2), Eq. 1 (X = ∫ L(λ) x̄(λ) dλ; open access, CC BY-ND 3.0) — <https://jcgt.org/published/0002/02/01/paper.pdf>. The quadrature and the normalization k are explicit engine choices. | Replaced (owner decision 4) |
| CIE 15:2018 / ISO/CIE 11664-2 | Illuminant A formula | Planck's law: BIPM *Mise en pratique* for the kelvin, Absolute Primary Radiometry (2018), Eq. 1 — <https://www.bipm.org/utils/en/pdf/si-mep/MeP-K-2018_Absolute_Primary_Radiometry.pdf>. The engine uses the CIE's constants c₂ = 1.435e-2 m·K and T = 2848 K (the exact c₂ = hc/k = 1.438 776 877…e-2 m·K, NIST CODATA 2022, is used only for the Planckian radiator). These two constants have no free source text, but the formula reproduces all 531 values of the free CIE 1 nm table (DOI 10.25039/CIE.DS.8jsxjrsn) within 4.8e-6 relative, the table's rounding. | Replaced (owner decision 4); constants verified for free |
| CIE 15:2018 | Daylight-locus polynomial and M₁/M₂ | No free copy found. The source paper, Judd, MacAdam & Wyszecki, *JOSA* 54(8):1031 (1964), doi:10.1364/JOSA.54.001031, is subscription-only on the publisher's site; the only other copy found was an unauthorized upload. Per the owner's decision no alternative was chosen. The coefficients were checked against the free CIE datasets: with three-decimal rounding they reproduce D55 within 5.0e-4 and D65 within 8.5e-4 at every 5 nm node (the tables' rounding). | **Flagged** (formula text only); values verified for free |
| CIE 15:2018 | CCT as the nearest Planckian point in (u, v); signed Duv | Smet et al., LEUKOS 2023, doi:10.1080/15502724.2023.2248397; free DOE copy — <https://www.energy.gov/sites/default/files/2023-09/ssl-smet-etal-2023_method-cct-duv-light-source.pdf> | Replaced |
| ANSI C78.377 | Duv sign (positive above the locus) | Ohno, LEUKOS 10(1), 2014 could not be used: NIST's record of it (<https://www.nist.gov/publications/practical-use-and-calculation-cct-and-duv>) links only to the paywalled publisher copy, and no free NIST copy was found. Per the owner's decision, the sign is now stated as the engine's own documented convention (docs, runtime assumption text), and a test checks that a greenish light gives a positive Duv. Ohno's free CORM 2011 slides state the same sign but are not cited. | Removed (owner decision 5) |
| CIE 018:2019 | K_m = 683 lm/W | BIPM SI Brochure, 9th ed., definition of the candela (K_cd = 683 lm/W) — <https://www.bipm.org/en/publications/si-brochure> | Replaced |
| CIE 116-1995 | CIE94 ΔE weights | Secondary source (the primary CIE 116-1995 is not free): Wikipedia, "Color difference", §CIE94 — <https://en.wikipedia.org/wiki/Color_difference#CIE94> (equations, S_C = 1 + K₁C*₁, S_H = 1 + K₂C*₁, and the graphic-arts and textiles weights). The engine also reproduces the worked values in the colour-science `delta_E_CIE1994` documentation (1.6711191 and 0.8404677). Lindbloom's page could not be reached from the host. | Replaced (secondary source; owner decision 6) |
| CIE 142-2001 / ISO/CIE 11664-6 | CIEDE2000 | Sharma, Wu & Dalal (2005) implementation notes and test data — <https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/>; CSS Color 4 `deltaE2000` | Replaced |
| CIE 159:2004 | CAT02 and HPE matrices; degree of adaptation D | Moroney et al., "The CIECAM02 color appearance model", CIC10 2002, in the RIT open repository — <https://repository.rit.edu/other/143>. Automated download was refused (HTTP 403), so free availability is listed but was not confirmed from this host. | Replaced (needs human confirmation) |
| SMPTE ST 2084 | PQ EOTF and constants | ITU-R BT.2100-3 — <https://www.itu.int/rec/R-REC-BT.2100> | Replaced |
| SMPTE ST 2086 | Mastering display colour volume fields | W3C PNG Third Edition `mDCV` — <https://www.w3.org/TR/png-3/>; ITU-T H.265 Annex D SEI — <https://www.itu.int/rec/T-REC-H.265> | Replaced |
| CTA-861.3 | MaxCLL/MaxFALL | W3C PNG Third Edition `cLLI`; ITU-T H.265 Annex D content light level SEI | Replaced |
| SMPTE EG 432-1 | Display P3 primaries with D65 | W3C CSS Color 4 `display-p3`; ITU-T H.273 ColourPrimaries 12 — <https://www.itu.int/rec/T-REC-H.273> | Replaced |
| SMPTE RP 177-1993 | Deriving RGB↔XYZ matrices from primaries and white | W3C CSS Color 4 (method and matrices, §2, §11 and §19) — <https://www.w3.org/TR/css-color-4/>; ITU-R BT.709-6 and BT.2020-2 (primaries, D65 and luminance coefficients) — <https://www.itu.int/rec/R-REC-BT>. The derivation is written out in `docs/COLORIMETRY.md`, and a test shows the engine's matrices equal the CSS Color 4 matrices within 1e-12 (largest difference 1.8e-15). | Replaced (owner decision 7) |
| IEEE Std 1789-2015 | Lamps modulate at twice the mains frequency | Follows from P ∝ sin²ωt = (1 − cos 2ωt)/2; context on the US DOE flicker pages — <https://www.energy.gov/eere/ssl/flicker> | Replaced |

**What changed:** doc comments in `src/`, and the reference lists in `docs/` and `THIRD_PARTY.md`, now cite the free source first. The paid standard is kept only as "also specified in".

**Runtime strings (owner decision).** Provenance `sources` arrays, `assumptions` text and error messages that named paid standards now name the free sources above. This is a text-only output change; no number changed. Limitation and error strings that used internal ticket numbers as model names (#12, #14, #85, #110) now use the model names. See `CHANGELOG.md`. Test comments are not shipped and were left as they were. The result model id `rgb-xyz-matrix-smpte-rp177` of `calculateRgbToXyzMatrices` is an identifier, not a citation, and was not renamed.

**Open:** one flagged item remains: the formula text of the CIE daylight locus and M₁/M₂. Its values are verified against free data.

## Rights and licensing

- **No CIE tables bundled.** The CIE 1931 colour-matching-function and daylight-component datasets are licensed CC BY-SA 4.0 (dataset metadata, e.g. DOI 10.25039/CIE.DS.xvudnb9b). ShareAlike is incompatible with Apache-2.0-only distribution. The engine therefore uses analytic forms (Wyman et al. 2013) and tables supplied by the caller. CIE datasets are used only as external checks of computed values in tests, quoting individual facts. No ColorChecker or other reflectance data is included.
- **Wyman, Sloan & Shirley (2013)** is CC BY-ND 3.0. Only its published model parameters are used, as factual inputs to an independently written equation.
- **Kim et al. Planckian locus, US 7,024,034** ("Color temperature conversion system and method using the same", Samsung Electronics; filed October 15, 2002, Korean priority October 15, 2001; granted April 4, 2006).
  - The USPTO record, as shown by Google Patents on October 17, 2026, lists **"Expired – Fee Related"**.
  - A maintenance-fee reminder was mailed November 13, 2017. The patent lapsed for failure to pay the 12th-year fee, effective **April 4, 2018** ("PATENT EXPIRED DUE TO NONPAYMENT OF MAINTENANCE FEES UNDER 37 CFR 1.362").
  - Its adjusted expiration would have been June 23, 2024 anyway. Either way, the patent is no longer in force.
  - The engine uses only the locus approximation published in Kang et al. (2002).
  - This is a public-record check, not a legal opinion. `THIRD_PARTY.md` records the finding.
- **DNG ActiveArea phase rule (confirmed).**
  - The Adobe DNG Specification 1.7.1.0 (September 2023) was downloaded from Adobe's Digital Negative page.
  - Under PhotometricInterpretation (PDF page 22) it states: "The origin of the repeating CFA pattern is the top-left corner of the ActiveArea rectangle". Under BlackLevel (PDF page 28): "The origin of this pattern is the top-left corner of the ActiveArea rectangle".
  - The #295 correction, which takes BlackLevel and CFAPattern phases relative to the ActiveArea origin, and the DNG importer both follow this rule.
  - Compatibility Issue 2 (16-bit lossless JPEG before DNG 1.1.0.0) is as cited in `docs/IMPORT_AND_PNG.md`.
  - The specification is free to download. It is © Adobe, and only factual tag definitions are used.
- **MurmurHash3** is an independent implementation of the public-domain algorithm (Austin Appleby, SMHasher), checked against published test vectors and recorded in `THIRD_PARTY.md`.
- **No third-party code, model weights or calibration data added.**
  - The JPEG DCT constants are computed by the engine.
  - The PNG zlib/DEFLATE encoder and the DNG/lossless JPEG readers are written in-house from free specifications.
  - AVIF and HEIC are not implemented, which avoids codec patent licensing.
  - Test oracles under `test/helpers/` are frozen copies of this repository's own Apache-2.0 code.
- **No new runtime dependency.** `npm ls --omit=dev` stays empty. The SPDX header, licence, identity and browser-surface gates run in `npm run check:static`.
- Every included commit carries the owner's DCO `Signed-off-by`, under the owner's October 11, 2026 policy. AI-assisted material still needs the owner's substantive human review before release.

## Privacy and security

- **No network, persistence or telemetry.** The root package makes no network request, stores nothing and collects nothing. In the browser it touches only `performance.now()`, for yield timing, and — only when the caller opts in — `navigator.gpu` (see WebGPU below). The browser-surface gate covers every reachable root module.
- **Parsers for untrusted input.** `parseDngRawImage` and `parseLosslessJpeg`:
  - bounds-check every offset and count;
  - detect IFD loops and aliases;
  - cap IFDs (default 64, at most 1,024) and pixels (default 64 MP, at most 200 MP) before allocating;
  - check a JPEG frame against the strip's sample count, to stop decompression bombs;
  - apply strict Huffman, marker and range checks.

  `serializePngImage` validates its input against `PNG_ENCODER_LIMITS`. JSON entry points reject non-plain objects, holes and unknown fields instead of silently hashing them; this also removes a way for different inputs to produce the same identity. There is no corpus of real-camera DNG files, so interoperability with camera files is not claimed.
- **WebGPU is opt-in.** `createImageKernelAccelerator()` touches `navigator.gpu` (or a GPU object supplied by the caller) only when called, never at import. Results are labelled `webgpu-f32` with an error bound, and the CPU reference stays the default. Shaders are fixed engine code; no caller code is compiled.
- **POC server (repository-only, not in the package).** Fixed messages for 413/422/500 and for malformed-JSON 400 reveal less than before. It stays loopback-oriented, unauthenticated and for development only.
- **Package surface.** The package no longer ships declaration maps, internal guides or unreachable modules. The JS source maps embed only this repository's TypeScript sources.

## Compatibility and migration

This is a breaking major release. The [changelog](../CHANGELOG.md#breaking-changes) lists each break with its migration. Version and identity changes:

| Identity | 1.5.0 | 2.0.0 |
| --- | --- | --- |
| Package and `ENGINE_API_VERSION` | 1.5.0 | **2.0.0** |
| `POC_SIMULATION_API_VERSION` | 0.20.0 | **1.0.0** |
| `SENSOR_RAW_PRODUCER_NOISE_MODEL` (`photivra-native-raw-noise`) | 0.2.0 | **0.4.0** (0.1.0–0.3.0 rejected) |
| Noise seed schedule | `capture-seed-plus-two-native-index-modulo-2-to-32-v1` | **`murmur3-capture-seed-native-index-stream-v2`** |
| Charge realization / stochastic RAW code / expected readout models | — | **3.0.0 / 4.0.0 / 2.0.0** |
| Generic tier `presetVersion` | 1.0.0 | **2.0.0** (1.0.0 rejected) |
| Spectral channel binding format | `…-canonical-json-v1` | **`…-canonical-json-v2`** (v1 rejected) |
| Crop models (centered, subject framing) | 1.0.0 | **2.0.0** |
| `thin-lens-depth-of-field` / defocus circle | 1.0.0 | **1.1.0 / 1.1.0** |
| Complex-pupil PSF | 1.1.0 | **2.0.0** |
| Rotation mapping and stabilization-equivalent models | 1.x | **2.0.0** |
| `PRINT_JPEG_SCHEMA_VERSION` | 0.1.0 | **0.2.0** (adds `encoderId`) |
| `EXPORT_JPEG_ENCODER_ID` | — | **`photivra-baseline-jpeg-444-v2`** |
| DNG output `DNGVersion` | 1.x writer value | **1.4.0.0** |
| Geometric mapping schema | 0.1.0 | 0.1.0, or **0.2.0** with the new transforms |
| Front-of-lens filter schema | 0.1.0 | 0.1.0, or **0.2.0** with a polarizer |
| Flash sync capability schema | 0.1.0 | 0.1.0, or **0.2.0** for HSS |
| Environment photo-signal model | 0.3.x | **0.4.0** only when `lensFieldMapping` is present |
| `relative-pre-exposure-metering` | 1.0.0 | **1.1.0** (no value change) |
| New identities | — | `SIMULATE_CAPTURE_FACADE_VERSION` 1.0.0, `COLORIMETRY_MODEL_VERSION` 1.0.0, `DNG_IMPORT_SCHEMA_VERSION` 1.0.0, `PNG_ENCODER_ID` `photivra-png-rgb-v1`, `IRRADIANCE_CONVOLUTION_SCHEMA_VERSION` 0.1.0, `SENSOR_FIXED_PATTERN_NOISE_MODEL` 1.0.0, `ELECTRONIC_ROLLING_SHUTTER_MODEL` 1.0.0, `HIGH_SPEED_SYNC_MODEL` 1.0.0 |

Other contract changes:

- new required RAW and sensor result fields;
- `createNativeRawDevelopmentTask` takes ownership of `input.raw`;
- stricter input validation (non-plain JSON, unknown scalar fields, plan version/fingerprint mismatches);
- widened unions (white-balance source, metering policy, readout synchronization, filter polarization, geometric transforms, blocker codes);
- a smaller package, without `prepare`, declaration maps or internal guides.

Root exports grow from 1,227 to 1,627 symbols. Comparing the generated `docs/api/exports.json` against `v1.5.0` shows none removed. New captures and plans record creator identity 2.0.0. Existing archives keep their identities, and fail closed where a bound identity changed.

## Known historical evidence not regenerated

These committed records are dated evidence tied to outputs from before 2.0.0. They are kept as written and are **not** 2.0.0 evidence:

- **`test/fixtures/producer-export-acceptance/` and `test/fixtures/paired-export-acceptance/`.** RAW, DNG and JPEG artifacts from engine 0.100 and 0.115, tied to external LibRaw/Adobe/editor review records. Regenerating them would orphan that evidence. Any new external review needs fresh 2.0.0 artifacts, which now differ in noise, white level, DNG tags and Exif.
- **`docs/validation/` records made with pre-2.0.0 behaviour**, such as `docs/validation/native-raw-print-2026-10-04/`, and the 1.2.0 #196 candidate inventory `docs/validation/print-196-candidate-evidence.json`. They remain valid records of the code that produced them. `docs/validation/tier-acceptance-report-v1.json` was regenerated in #284.

## Deferred items

Work that is known and deliberately left for later:

- **#305 follow-ups:** lean coverage for sampled-PSF and lens-mapped sites; a provably identical fast path for provider-result validation; lean sensor-stage reuse.
- **#307 follow-ups:** real-camera DNG interoperability is not claimed (LibRaw decodes the files; no editor review yet); sharing the colour-tag code with the paired export.
- **#275:** planning once per CFA phase; worker parallelism; a different native RAW default tile width (a plan-shape change); per-tap request retention (about 8 MB per site with a large PSF).
- **#276:** consistency between error classes; freezing result envelopes (a deep freeze costs every result on hot paths).
- **#277 and follow-ups from #304:** hardware-GPU conformance runs and CI wiring, kernel sampling from `LensPsfProfile`, GPU luminance tone curves.
- **Optics follow-ups from #303:** lens field mapping in the browser-native executor, mappings combined with ideal pupil rays, calibrated finite-focus fisheye scale.
- **Motion follow-ups from #297:** derived rolling exposure schedules in tier presets; time-varying angular velocity (rolling-shutter wobble).

## Pending owner decisions

1. **Flagged citations.** The owner decided the seven flagged items; six are now replaced or removed (see the [citation audit](#citation-audit-free-sources)). One remains open: no free copy of Judd, MacAdam & Wyszecki (1964) or other free text of the daylight-locus formula was found. The owner decides whether to accept it as a CIE fact verified against the free CIE datasets, or to name another source. Runtime strings now name free sources (decided).
2. **`docs/AGENT_DOMAIN_RULES.md`.** Two statements in it are out of date:
   - Its spatial camera rotation section still says `estimateCameraShakeBlur()` keeps its legacy sign semantics. That is no longer true for pitch.
   - It still says not to compose distortion into the production plan without a contract review. #303 wrote that review, in `docs/PHYSICS_FOUNDATION.md`.

   That file holds shared agent rules, so changing it needs the owner's approval. This candidate does not edit it.
3. **Human review** of the colorimetry constants recorded in `THIRD_PARTY.md` (CC BY-ND parameters, the patent record finding) and of the AI-assisted changes.

## Release gates

The authoritative result is the **exact-head GitHub CI run on the release PR** (CI run on the exact final commit). It is to be recorded here once the in-flight streams merge and this record is final:

| Gate | Exact-head result |
| --- | --- |
| Exact head SHA | *to be filled* |
| GitHub CI (all jobs, all Node versions) | *to be filled with the run URL and result* |
| `npm run check` (full vitest suite) | *to be filled from CI* |
| `npm run coverage` (thresholds) | *to be filled from CI* |
| `npm run build`, `pack:check`, `docs:check`, `release:consumer-check` | *to be filled from CI* |
| Informational macOS hash-lock job | *to be filled from CI* |

**Local results on this candidate** (merge of `09e4262`, Node 24.21.0, linux/x64). The host was memory-limited, so the full vitest suite and coverage were not run locally; CI must provide them.

| Command | Result |
| --- | --- |
| `npm run check:static` | Passed: eslint, tsc, dependency licences (Apache-2.0 15, BlueOak-1.0.0 1, BSD-2-Clause 6, BSD-3-Clause 2, ISC 7, MIT 125, MPL-2.0 12), SPDX headers, identity, browser surface across 193 reachable modules. |
| `npm run build` | Passed (`tsc -p tsconfig.build.json`, from a clean `dist/`). |
| `npm run pack:check` | Passed: 767 files, 2,403,767 bytes packed, 11,429,321 unpacked; root export plus `./package.json`; inline-source maps; no lifecycle scripts; local POC API excluded. |
| `npm run docs:check` | Passed: API reference current (1,627 root symbols across 175 modules); 282 Markdown files, 3,080 repository and local links, 92 importing examples, 26 explicit fragments. |
| `npm run release:consumer-check` | Passed: packed `@photivra/engine@2.0.0`; `require(esm)` and `lib: es2022`/DOM declaration consumers, 92 typed and running doc snippets, and the quick-start, simulate-capture and production/paired-export consumers. |
| Focused vitest (`--maxWorkers=1`) | Passed: colorimetry, PNG encoder, ISO brightness and chart-scene tests (4 files, 42 tests), covering the modules whose comments changed in the citation audit. |

A first `pack:check` run failed for two reasons: stale declaration maps left in a reused `dist/`, and a relative link from the packed `CHANGELOG.md` to the unpacked release record. The link now uses the repository URL, and the rebuild from a clean `dist/` passed.

## Remaining release checklist

- [x] Version surfaces aligned at 2.0.0; `POC_SIMULATION_API_VERSION` 1.0.0.
- [x] 2.0.0 changelog with breaking changes and migrations, additions, fixes, performance, tests and tooling.
- [x] Generated API reference regenerated after the merge.
- [x] Citation audit, with doc comments and docs updated to free sources.
- [x] All streams merged (#305, #306, #307) and changelog entries written.
- [ ] Owner decisions above.
- [ ] Owner's substantive human review of the AI-assisted changes and of this record.
- [ ] Green exact-head CI on the release PR, recorded above; then green CI on `main` after merge.
- [ ] **The owner's explicit approval to tag `v2.0.0`.** The tag triggers npm publishing. First confirm that 2.0.0 is not already on npm, and never move or overwrite `v1.5.0`.
- [ ] After publication: verify the npm version, dist-tag, tarball integrity and provenance; publish matching GitHub release notes; update publication dates in `CHANGELOG.md`, `README.md`, `docs/DEVELOPERS.md`, `SECURITY.md` and this record.
