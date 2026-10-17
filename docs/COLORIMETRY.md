# Colorimetry

Photivra's colorimetry primitives live in `src/color/`. They cover colour-matching functions (CMFs), spectral integration, illuminants and correlated colour temperature (CCT), chromatic adaptation, CIELAB colour differences, camera-matrix fitting, Kelvin + tint white balance, wide-gamut and HDR transfer functions, and perceptual gamut mapping. All of them are deterministic, browser-safe functions. Each one is labelled `calculated`, `approximation` or `estimated` exactly as described below.

These are standalone primitives. They do not change scene radiance, exposure, sensor capture or any existing default. The SDR/export stages own output wiring.

## Data policy: what is and is not bundled

The CIE distributes its tabulated datasets under **CC BY-SA 4.0**. These include the CIE 1931/1964 CMFs, the daylight basis S₀/S₁/S₂ and the D65/A tables; the dataset metadata (for example DOI 10.25039/CIE.DS.xvudnb9b) declares this licence. The ShareAlike condition would bind adaptations of those tables, and this conflicts with distributing the package under Apache-2.0 alone. **No CIE table is therefore bundled.** Instead:

- CIE 1931 2° CMFs are available as a published **analytic approximation** (see below), or as caller-supplied tables (`{ kind: "tabulated", … }`). A caller may load the official CIE CSV themselves under its licence.
- CIE daylight spectra need a caller-supplied S₀/S₁/S₂ basis (`createCieDaylightSpectrum`). The daylight-locus chromaticity and the M₁/M₂ weights are equations and are built in.
- Illuminant A and Planckian radiators are computed from their defining formulas.
- The engine bundles no ColorChecker or other reflectance tables, because their licences are unclear. Training reflectances for matrix fitting are supplied by the caller.

The tests use a handful of individual published values, each cited in the test. They do not reproduce any table.

## Colour-matching functions and spectral integration

`estimateCie1931ColorMatchingFunctions(λ)` evaluates the multi-lobe piecewise-Gaussian fit of Wyman, Sloan & Shirley (2013), *Simple Analytic Approximations to the CIE XYZ Color Matching Functions*, JCGT 2(2), Eq. 4 / Table 1, using the fitted coefficients:

x̄(λ) = Σᵢ αᵢ exp(−½[(λ − βᵢ)·S(λ − βᵢ, γᵢ, δᵢ)]²), where S selects γ left of βᵢ and δ right of it. ȳ and z̄ have the same form.

**Approximation error (from the paper's Table 2, relative to the 1 nm CIE 1931 tables):**

| | x̄ | ȳ | z̄ |
| --- | --- | --- | --- |
| Maximum squared error | 2.0e-4 | 6.4e-5 | 4.9e-4 |
| Maximum absolute error | ≈ 0.014 | ≈ 0.008 | ≈ 0.022 |
| Mean squared error | 3.1e-5 | 7.1e-6 | 1.6e-5 |

Integrated with this fit, illuminant A comes out at xy ≈ (0.4463, 0.4087), against the CIE value (0.44758, 0.40745). That is an error of about 1.3e-3 in xy. Use caller-tabulated CMFs when you need colorimetric agreement better than about 2e-3 in xy. The fit is accepted on 360–830 nm and fails closed outside that range.

`integrateSpectrumToXyz()` evaluates X = k Σ S(λᵢ) R(λᵢ) x̄(λᵢ) Δλᵢ (CIE 15:2018 §7) with caller-explicit quadrature nodes `{ wavelengthNanometers, wavelengthMeasureNanometers }`:

- Nodes from `calculateSensorSpectralQuadrature()` are structurally compatible.
- `createColorimetricMidpointQuadrature()` builds uniform midpoint nodes.
- A 1 nm / 5 nm node list reproduces the CIE summation convention.

Normalization is explicit:

- `white-luminance-one`: k = 1/Σ S ȳ Δλ, so the perfect diffuser has Y = 1.
- `scale`: a caller factor, for example 683.002 lm/W for photometric units.

Spectra are either tabulated (linear interpolation, fail-closed outside the table) or in-process functions over a declared range.

## Illuminants, Planckian locus and CCT

| Function | Model | Status |
| --- | --- | --- |
| `calculatePlanckianSpectralRadiance`, `createPlanckianSpectrum` | Planck's law L = 2hc²/λ⁵/(exp(hc/λkT) − 1), exact SI h, c, k (SI Brochure 2019), W·m⁻²·sr⁻¹·nm⁻¹, vacuum wavelength | calculated |
| `calculateCieIlluminantARelativeSpectralPower`, `createCieIlluminantASpectrum` | CIE defining formula with c₂ = 1.435e-2 m·K, T = 2848 K (≈ 2855.5 K with the current c₂), 300–830 nm | calculated |
| `calculateCieDaylightComponentWeights` | CIE 15:2018 daylight-locus x_D(T) polynomials (4000–7000 K and 7000–25000 K), y_D = −3x² + 2.87x − 0.275, and the M₁/M₂ weights. Optional CIE three-decimal rounding of M₁, M₂ | calculated |
| `createCieDaylightSpectrum` | S = S₀ + M₁S₁ + M₂S₂ from a caller basis | calculated from caller data |
| `estimatePlanckianLocusChromaticity` | Kim et al. cubic spline (Kang et al., J. Korean Phys. Soc. 41(6):865–871, 2002; US 7,024,034), 1667–25000 K | approximation |
| `calculatePlanckianChromaticity` | Kim spline, or exact Planck × CMF integration (`planck-integration`) | approximation / calculated |
| `estimateCorrelatedColorTemperatureMcCamy` | McCamy (1992), Color Res. Appl. 17(2):142–144: n = (x − 0.3320)/(0.1858 − y), CCT = 449n³ + 3525n² + 6823.3n + 5520.33 | approximation |
| `calculateCorrelatedColorTemperature` | Nearest point on the chosen Planckian locus in CIE 1960 uv (the CCT/Duv definition as stated in Smet et al. 2023, free; also CIE 15:2018), golden-section search in mired. Signed Duv per ANSI C78.377 (positive = above the locus, greenish). Fails closed for \|Duv\| > 0.05, where CIE 15 advises against quoting a CCT | follows the locus model |
| `calculateChromaticityFromCorrelatedColorTemperature` | Locus point (Planckian or CIE daylight) offset by Duv along the unit normal of the Planckian locus in uv | follows the locus model |

Measured in the tests:

- **Kim spline:** for the published CIE A chromaticity the spline gives CCT within 10 K of 2856 K and |Duv| < 2e-4. For D65 it gives about 6501 K and Duv ≈ +0.0032.
- **Daylight polynomial:** at 6504 K it reproduces the CIE D65 chromaticity within 1.5e-4.
- **Kim spline against exact integration:** compared with exact Planck integration through the analytic CMFs, the spline differs by less than 1e-3 in uv at 4000 K. Near 1667 K the difference is up to about 4.5e-3, and that figure includes the CMF-fit error.

## Chromatic adaptation

`calculateChromaticAdaptationMatrix()` builds a linear von Kries-type transform:

M = C⁻¹ · diag(D·(Y_s/Y_d)·ρ_d/ρ_s + 1 − D) · C

This is the one-step two-illuminant form of Li et al. (2017), applied to every cone space. With D = 1 the source white maps exactly to the destination white, keeping the source-white luminance. With D = 0 the transform is the identity.

| `transform` | Cone matrix C (published constants) |
| --- | --- |
| `bradford` | Linearized Bradford: Lam (1985), Univ. of Bradford thesis; Luo & Rhodes (1999); ICC.1:2010 Annex E |
| `cat02` | Moroney et al. (2002), *The CIECAM02 color appearance model*, IS&T/SID CIC10 (also CIE 159:2004) |
| `cat16` | Li, Li, Wang, Xu, Luo, Cui, Melgosa, Brill & Pointer (2017), Color Res. Appl. 42(6):703–718 |
| `von-kries-hpe` | Hunt–Pointer–Estévez cones (equal-energy normalized) as used in CIECAM02 (Moroney et al. 2002; also CIE 159:2004) |
| `xyz-scaling` | Identity: diagonal scaling in XYZ (the weakest model) |

`calculateDegreeOfAdaptation()` implements the CIECAM02 formula D = F[1 − (1/3.6)·exp((−L_A − 42)/92)], with F = 1.0, 0.9 or 0.8 for average, dim or dark surround. The matrix is calculated exactly. How well a linear CAT predicts corresponding colours is a property of that model and is not claimed here. The test suite reproduces the widely published Bradford D65→D50 matrix to 1e-6.

### Scene adaptation in the capture colour transform

`calculateCaptureColorTransform()` keeps its default unchanged. `whiteBalance: { kind: "adopted-white-xyz-scaling" }` with no `transform` is still the original XYZ-diagonal scaling. Its model id stays `capture-color-xyz-diagonal-adaptation` and its applied-transform id stays `photivra-xyz-diagonal-adaptation`. That default is documented as an approximation, not as provisional.

Adding `transform: "bradford" | "cat02" | "cat16" | "von-kries-hpe"` selects complete (D = 1) cone-space adaptation to D65:

- model id `capture-color-<transform>-adaptation`;
- applied-transform profile `photivra-<transform>-adaptation`;
- still labelled `approximation`.

The review measured how far XYZ scaling departs from Bradford for illuminant A → D65: ΔE76 up to about 17 on saturated colours. The cone-space option exists to avoid that error.

## Kelvin + tint white balance

`createColorTemperatureWhiteBalanceIntent()` still only records intent. `resolveColorTemperatureWhiteBalance()` turns that intent into channel gains for an explicit camera colour model `{ profileId, profileVersion, xyzToCameraRgb }`:

1. white xy = locus(CCT) offset by Duv = `tint` (`tintInterpretation: "duv-cie-1960-uv"`, |Duv| ≤ 0.05), using the `planckian` or `cie-daylight` locus. The default Planckian locus model is the Kim et al. spline; `planck-integration` is the exact alternative.
2. camera neutral n = M_XYZ→camera · XYZ(white, Y = 1).
3. gains = (n_G/n_R, 1, n_G/n_B).

The result is a `ResolvedWhiteBalanceState` with `source: "color-temperature"`. Its `colorTemperature` record keeps the white chromaticity and the camera neutral, and its `sourceProfile` is the camera profile. A grey card lit by a Planckian illuminant of the same temperature comes out neutral to 1e-10 when the locus and the camera matrix share the CMFs. With the Kim spline the residual cast stays within a few percent, and it is reported in the tests. The CCT/tint describes the white the photographer declares, not a measured scene illuminant. Accuracy is bounded by the camera matrix, which is exact only under the Luther–Ives condition.

## Colour difference and CIELAB

- **CIELAB and LCh:** `calculateCielabFromXyz` / `calculateXyzFromCielab` and `calculateCielchFromCielab` / `calculateCielabFromCielch` implement CIELAB as defined in W3C CSS Color 4 §9 (also CIE 15:2018) with the exact constants ε = (6/29)³ and κ = (29/3)³.
- **`calculateColorDifference`** supports four formulas:
  - `cie76`: Euclidean ΔE*ab.
  - `cie94-graphic-arts` and `cie94-textiles`: CIE 116-1995, asymmetric in `reference`.
  - `ciede2000`: implemented following the notes and test data of Sharma, Wu & Dalal (2005), Color Res. Appl. 30(1):21–30, freely available from the first author (also CIE 142-2001 / ISO/CIE 11664-6), with optional parametric factors k_L, k_C, k_H.

The tests reproduce 13 of Sharma et al.'s published test pairs to 4 decimals, including the hue-discontinuity pairs.

## Camera colour-matrix fitting

`estimateCameraColorMatrix()` takes caller camera spectral sensitivities, training reflectances, an illuminant and CMFs. It integrates camera RGB and target XYZ, both normalized so that the perfect diffuser gives Y = 1 and camera green = 1. It then fits a 3×3 camera→XYZ matrix in one of two ways:

- **`least-squares`:** M = X Pᵀ (P Pᵀ)⁻¹.
- **`white-point-preserving-least-squares`:** the same fit with the exact constraint M·ρ_white = X_white, solved in closed form with a Lagrange multiplier per row (Finlayson & Drew 1997, IS&T/SID CIC5).

The report gives per-patch CIEDE2000, computed with CIELAB relative to the illuminant white and no adaptation, plus the mean and maximum ΔE00 and the RMS XYZ residual. The result is labelled `estimated`: a 3×3 matrix is exact only under the Luther–Ives condition, and the training residual does not bound the error for other spectra. The tests show an exact fit for a Luther camera, and a reported non-zero residual for a Gaussian-sensitivity camera.

## Wide-gamut and HDR output primitives

`resolveRgbColorSpace()` and `calculateRgbToXyzMatrices()` derive RGB↔XYZ matrices numerically from primaries and white (the SMPTE RP 177 method). No matrix is copied.

| Space | Primaries (x, y) R / G / B | White | Source |
| --- | --- | --- | --- |
| `srgb`, `rec709` | (0.64, 0.33) / (0.30, 0.60) / (0.15, 0.06) | D65 (0.3127, 0.3290) | ITU-R BT.709-6; W3C CSS Color 4 `srgb` (also IEC 61966-2-1) |
| `display-p3` | (0.680, 0.320) / (0.265, 0.690) / (0.150, 0.060) | D65 | W3C CSS Color 4 `display-p3`; ITU-T H.273 ColourPrimaries 12 (also SMPTE EG 432-1) |
| `rec2020` | (0.708, 0.292) / (0.170, 0.797) / (0.131, 0.046) | D65 | ITU-R BT.2020-2, BT.2100-3 |

The derived luminance rows match the published coefficients to 1e-4: BT.709 0.2126/0.7152/0.0722, BT.2020 0.2627/0.6780/0.0593 and P3 0.2290/0.6917/0.0793.

Transfer functions, all using the constants published in each standard:

- **sRGB / Display P3:** `evaluateSrgbEncoding` / `evaluateSrgbDecoding`.
- **BT.709 OETF:** `evaluateBt709Oetf` / `evaluateBt709InverseOetf`.
- **BT.1886 EOTF:** `prepareBt1886Eotf` (γ = 2.4, with the display's white and black luminance).
- **ITU-R BT.2100 PQ (also SMPTE ST 2084):** `evaluatePqEotf` / `evaluatePqInverseEotf`, with m₁ = 2610/16384, m₂ = 2523/4096·128, c₁ = 3424/4096, c₂ = 2413/4096·32 and c₃ = 2392/4096·32.
- **BT.2100 HLG:**
  - `evaluateHlgOetf` / `evaluateHlgInverseOetf`, with a = 0.17883277, b = 1 − 4a and c = 0.5 − a·ln(4a).
  - `calculateHlgSystemGamma`: γ = 1.2 + 0.42·log₁₀(L_W/1000) for 400–2000 cd/m², otherwise the extended form 1.2·1.111^log₂(L_W/1000).
  - `prepareHlgReferenceDisplay`: OOTF F_D = L_W·Y_S^(γ−1)·E with BT.2100 luminance weights, and EOTF with black lift β = √(3(L_B/L_W)^(1/γ)).

The tests check:

- PQ: 100 cd/m² encodes to 0.5081.
- HLG: OETF(1/12) = 0.5, and a 75 % HLG signal shows at about 203 cd/m² on a 1000 cd/m² display (ITU-R BT.2408).

PQ and HLG accept signals only in [0, 1] and fail closed outside that range. The published 8-digit HLG constants make OETF⁻¹(1) exceed 1 by about 1e-8, so the EOTF bounds that value to 1.

## Perceptual gamut mapping

`prepareRgbGamutMapping()` / `calculateGamutMappedColor()` map D65-relative XYZ (white Y = 1) into a target RGB cube [0, 1]³:

- **Method:** L*ab and hue h_ab are held constant. The boundary chroma C_max(L*, h) is found by bisection, and chroma is reduced toward the neutral axis.
- **Knee:** with `kneeFraction` k, chroma above k·C_max is compressed as C′ = kC_max + (1 − k)C_max·tanh((C − kC_max)/((1 − k)C_max)). This is continuous, monotone and stays inside the boundary. k = 1 is hard chroma clipping along constant (L*, h).
- **Lightness:** values outside [0, 100] are clipped to black or white.
- **Method family:** constant-lightness/constant-hue chroma reduction, the same binary-search idea as W3C CSS Color 4 §13 (free), which uses OKLCh. Also see: Morovič 2008, *Color Gamut Mapping*, Wiley. This independent implementation uses CIELAB instead, so no additional third-party matrices are needed.
- **Known limitation:** CIELAB hue is not perceptually constant for saturated blues, so mapped blues can drift toward purple. The result is labelled `approximation`.

## References

- CIE 15:2018 *Colorimetry*, 4th ed.; CIE 018:2019; ISO/CIE 11664-1/-2/-4/-6 (paid; see the free sources below and the citation audit in [RELEASE_2_0_0.md](RELEASE_2_0_0.md#citation-audit-free-sources)). Free CIE datasets (CC BY-SA 4.0, not bundled) at <https://cie.co.at/data-tables> are used only to check computed values.
- C. Wyman, P.-P. Sloan, P. Shirley (2013), JCGT 2(2):1–11.
- B. Kang, O. Moon, C. Hong, H. Lee, B. Cho, Y. Kim (2002), J. Korean Phys. Soc. 41(6):865–871; US Patent 7,024,034.
- C. S. McCamy (1992), Color Res. Appl. 17(2):142–144.
- K. A. G. Smet et al. (2023), "Recommended method for determining the correlated color temperature and distance from the Planckian locus of a light source", LEUKOS, doi:10.1080/15502724.2023.2248397; free archival copy: <https://www.energy.gov/sites/default/files/2023-09/ssl-smet-etal-2023_method-cct-duv-light-source.pdf> (CCT and signed Duv). ANSI C78.377 (Duv sign convention; paid, no free equivalent found).
- K. M. Lam (1985), PhD thesis, University of Bradford; M. R. Luo, P. A. Rhodes (1999); ICC.1:2010 Annex E (ICC specifications are free at <https://www.color.org/>).
- N. Moroney et al. (2002), IS&T/SID 10th Color Imaging Conference, listed in the RIT open repository <https://repository.rit.edu/other/143>; also CIE 159:2004.
- C. Li et al. (2017), Color Res. Appl. 42(6):703–718.
- G. Sharma, W. Wu, E. N. Dalal (2005), Color Res. Appl. 30(1):21–30; paper and test data at <https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/>. Also CIE 142-2001. CIE 116-1995 (CIE94; paid, no free equivalent found).
- G. D. Finlayson, M. S. Drew (1997), IS&T/SID 5th Color Imaging Conference.
- W3C CSS Color Module Level 4 §13 (free). Also see: J. Morovič (2008), *Color Gamut Mapping*, Wiley.
- ITU-R BT.709-6, BT.1886, BT.2020-2, BT.2100-3 (PQ and HLG), BT.2408 (free at <https://www.itu.int/rec/R-REC-BT>); W3C CSS Color Module Level 4 (`srgb`, `display-p3`, Lab) <https://www.w3.org/TR/css-color-4/>; ITU-T H.273. Also specified in IEC 61966-2-1:1999, SMPTE ST 2084 and SMPTE EG 432-1. SMPTE RP 177-1993 (matrix derivation method; paid, no free equivalent found: the derivation is standard linear algebra and its results are checked against the free ITU-R BT.709-6 and BT.2020-2 luminance coefficients).
- BIPM, *The International System of Units*, 9th ed. (2019).
