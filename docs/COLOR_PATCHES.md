# Colour patches

From 2.14 the engine ships a set of 30 colour patches designed by Photivra, so an application can build a colour test
chart without supplying spectral data of its own. Each patch is a reflectance **spectrum**, not an RGB value: it is
lit by the capture's illuminant and passes through the same spectral pipeline as every other chart (illuminant ×
reflectance → the sensor's spectral response → white balance → development and output).

The set is Photivra's own design. It uses no ColorChecker or other commercial target's patch data, names, order,
layout or measured spectra; every spectrum is a smooth analytic function written below.

## Using the patches

A built-in patch is a chart reflectance, `{ kind: "color-patch", patchId }`. It is accepted wherever a chart takes a
reflectance spectrum: the `uniform` preset's `reflectance`, a `patches` entry, a material scene's `materials` and a
material-layers scene's reflectances. A scalar reflectance still means a spectrally flat grey and renders exactly as
before.

The `color-patches` preset draws the whole set (or a chosen list) as a grid, like `patches`:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `patchIds` | every patch, in `COLOR_PATCH_IDS` order | 1–30 distinct patch ids, row-major |
| `columns` | min(6, patch count) | Patches per row; the default layout is 6 × 5 |
| `gapFraction` | 0.1 | Gap between patches as a fraction of the cell, [0, 0.5) |
| `backgroundReflectance` | 0.18 | Neutral reflectance of the gaps and empty cells |

Unknown fields, unknown or repeated ids and out-of-range values fail with `InvalidConfigurationError`. Defaults are
reported in the capture's assumptions as for every chart, and the resolved parameters name the set and its version
(`patchSet: "photivra-color-patches"`, `patchSetVersion`). The patch spectra enter the scene digest.

`getColorPatchSet()` returns the set as a frozen record: each patch's `patchId`, plain English `name`, `group`,
formula parameters and reference colorimetry. `evaluateColorPatchReflectance({ patchId, wavelengthNanometers })`
evaluates one spectrum at one wavelength (360–830 nm).

```ts
import { COLOR_PATCH_IDS, getColorPatchSet, simulateCapture, type ChartScene } from "@photivra/engine";

// The whole set as one element of a composite chart (6 × 5 cells, so width / height = 6 / 5 gives square cells).
const chart: ChartScene = { preset: "composite", background: { preset: "uniform", reflectance: 0.6 }, elements: [
  { scene: { preset: "color-patches" }, centerU: 0, centerV: 0, width: 1.2, height: 1 },
  // One patch on its own: a uniform element with a colour-patch reflectance.
  { scene: { preset: "uniform", reflectance: { kind: "color-patch", patchId: "skin-medium" } }, centerU: 0.8, centerV: 0.3, width: 0.2, height: 0.2 }] };
const capture = await simulateCapture({ scene: chart, sensor: { spectralStepNanometers: 5 }, output: { width: 96, height: 64 } });
const labels = getColorPatchSet().patches.map((p) => p.name);
console.log(COLOR_PATCH_IDS.length, labels[0], capture.scene.parameters);
```

For colour work use `sensor.spectralStepNanometers: 5` (see [Accuracy](#accuracy)).

## The spectra

Each reflectance is a constant plus a sum of Gaussian bumps and logistic steps on the wavelength λ in nanometres:

R(λ) = min(1, max(0, b + Σₖ aₖ·φₖ(λ))), with

- G(μ, σ): φ(λ) = exp(−½·((λ − μ)/σ)²), a Gaussian bump centred at μ with standard deviation σ;
- S(λ₀, s): φ(λ) = 1/(1 + exp(−(λ − λ₀)/s)), a logistic step rising through ½ at λ₀ with scale s;
- F(λ₀, s): φ(λ) = 1 − S(λ₀, s), the falling step.

The spectra are defined on 360–830 nm, the domain of the CIE 1931 observer. Every spectrum lies in [0.027, 0.9] on that
whole domain (checked on a 0.25 nm grid), so the clamp never acts: it only states that a reflectance is between 0 and
1. There is no fluorescence: a patch reflects at each wavelength only light of that wavelength. The neutral patches
are constants, spectrally flat.

In `getColorPatchSet()` a term is `{ kind: "gaussian", amplitude, centerNanometers, standardDeviationNanometers }` or
`{ kind: "logistic-rise" | "logistic-fall", amplitude, midpointNanometers, scaleNanometers }`.

| Group | Contents |
| --- | --- |
| `neutral` | Six flat greys from white (90 %) to black (3.2 %), in steps of about 15 L* |
| `strong` | Red, yellow, green, cyan, blue and magenta at high chroma |
| `soft` | The same six hues at lower chroma and higher lightness |
| `skin` | Four skin tones from pale to deep |
| `memory` | Sky blue, foliage green, brick red, sand, teal and lavender |
| `gamut-edge` | A deep orange and a deep violet close to the sRGB gamut boundary |

**Design method.** Photivra chose a target colour for each patch, as an sRGB value of its own, and fitted the free
parameters of a one- or two-term form by Nelder–Mead minimisation of ΔE*ab between the target and the spectrum's CIELAB
under D65, with penalties that keep σ ≥ 20 nm, s ≥ 10 nm (smooth spectra that a 5 nm quadrature integrates well) and
the reflectance in [0.02, 0.95]. The fitted values were rounded (amplitudes and constants to 0.001, wavelengths to
0.1 nm) and those rounded values are the definition. The neutral reflectances were chosen for L* = 96, 81, 66, 51, 36
and 21. The foliage spectrum's rise at 715 nm models the steep rise in leaf reflectance at the red edge, almost all of
it beyond the visible range. These are smooth synthetic spectra: they are not measurements of real paints, skin or
plants, and their metamerism under other lights is that of these functions, not of any physical material.

| Id | Name | Group | b | Terms |
| --- | --- | --- | --- | --- |
| `neutral-1` | Neutral 1, white (90 %) | neutral | 0.9 | — |
| `neutral-2` | Neutral 2, light grey (58.5 %) | neutral | 0.585 | — |
| `neutral-3` | Neutral 3, light-mid grey (35.3 %) | neutral | 0.353 | — |
| `neutral-4` | Neutral 4, mid grey (19.3 %) | neutral | 0.193 | — |
| `neutral-5` | Neutral 5, dark grey (9 %) | neutral | 0.09 | — |
| `neutral-6` | Neutral 6, black (3.2 %) | neutral | 0.032 | — |
| `red` | Red | strong | 0.038 | 0.773·S(609.6, 11.2) |
| `yellow` | Yellow | strong | 0.071 | 0.602·S(518.7, 13.2) |
| `green` | Green | strong | 0.048 | 0.308·G(537, 37.6) |
| `cyan` | Cyan | strong | 0.086 | 0.401·G(484.3, 56) |
| `blue` | Blue | strong | 0.056 | 0.351·G(456.8, 32) |
| `magenta` | Magenta | strong | 0.05 | 0.258·G(440, 32.8) + 0.549·S(605, 15) |
| `red-soft` | Soft red | soft | 0.196 | 0.472·S(601.8, 13) |
| `yellow-soft` | Soft yellow | soft | 0.246 | 0.414·S(509, 17.6) |
| `green-soft` | Soft green | soft | 0.184 | 0.251·G(535.7, 47.4) |
| `cyan-soft` | Soft cyan | soft | 0.246 | 0.339·G(487.4, 61.9) |
| `blue-soft` | Soft blue | soft | 0.207 | 0.319·G(457.6, 34.7) |
| `magenta-soft` | Soft magenta | soft | 0.196 | 0.231·G(440, 33.1) + 0.256·S(575.8, 15) |
| `skin-pale` | Pale skin tone | skin | 0.408 | 0.394·S(562.5, 31.7) |
| `skin-medium` | Medium skin tone | skin | 0.213 | 0.376·S(570.3, 30.4) |
| `skin-tan` | Tan skin tone | skin | 0.084 | 0.295·S(573.7, 31.3) |
| `skin-deep` | Deep skin tone | skin | 0.034 | 0.133·S(590.3, 32.4) |
| `sky-blue` | Sky blue | memory | 0.187 | 0.424·F(509.6, 30.4) |
| `foliage-green` | Foliage green | memory | 0.034 | 0.142·G(555.7, 31.3) + 0.4·S(715, 12) |
| `brick-red` | Brick red | memory | 0.05 | 0.308·S(592.7, 16.2) |
| `sand` | Sand | memory | 0.268 | 0.384·S(507.8, 38.5) |
| `teal` | Teal | memory | 0.085 | 0.197·G(498.2, 42) |
| `lavender` | Lavender | memory | 0.331 | 0.298·G(445, 30.4) + 0.137·S(623.4, 20) |
| `deep-orange` | Deep orange | gamut-edge | 0.027 | 0.824·S(586.3, 13.6) |
| `deep-violet` | Deep violet | gamut-edge | 0.031 | 0.37·G(441.6, 25.6) + 0.097·S(640, 20) |

## Reference colorimetry

`reference.cielabD65` and `reference.srgbHex` give each spectrum's colour as a colorimetric fact about the reflectance,
independent of any camera:

- X = k Σ S(λ) R(λ) x̄(λ) Δλ (and Y, Z) with S = CIE standard illuminant D65 and x̄, ȳ, z̄ = the CIE 1931 2° observer,
  the CIE tables at 1 nm from 360 to 830 nm, and k = 100/Σ S(λ) ȳ(λ) Δλ (CIE 15:2018 §7);
- CIELAB with the perfect diffuser under D65 as white (constants as in [Colorimetry](COLORIMETRY.md#colour-difference-and-cielab));
- sRGB: the XYZ is scaled from the D65 table's white to the sRGB white (0.3127, 0.3290) (they differ by about 3·10⁻⁵ in
  x and y), converted with the CSS Color 4 matrix, encoded with the sRGB transfer function and rounded to 8 bits.

The CIE tables are datasets the engine does not bundle, because of their licence ([Colorimetry](COLORIMETRY.md#data-policy-what-is-and-is-not-bundled);
attribution and licence in `THIRD_PARTY.md`).
`scripts/compute-color-patch-reference.mjs` downloads them (D65: DOI 10.25039/CIE.DS.hjfjmt59; CIE 1931:
DOI 10.25039/CIE.DS.xvudnb9b) into a temporary directory, checks their SHA-256, computes these values from the built
package's spectra, compares them with the published ones and deletes the tables; `--print` prints this table. The
repository stores only the computed values.

**Gamut.** All 30 patches are inside the sRGB gamut: every linear sRGB component lies in [0, 1]. None is marked as
outside. The two gamut-edge patches are close to the boundary: deep orange's smallest linear component (blue) is
0.0033 and deep violet's (green) 0.0133.

| Id | Name | L* | a* | b* | C*ab | hab (°) | sRGB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `neutral-1` | Neutral 1, white (90 %) | 96.00 | 0.00 | 0.00 | 0.00 | — | `#F3F3F3` |
| `neutral-2` | Neutral 2, light grey (58.5 %) | 81.02 | 0.00 | 0.00 | 0.00 | — | `#C9C9C9` |
| `neutral-3` | Neutral 3, light-mid grey (35.3 %) | 65.98 | 0.00 | 0.00 | 0.00 | — | `#A0A0A0` |
| `neutral-4` | Neutral 4, mid grey (19.3 %) | 51.04 | 0.00 | 0.00 | 0.00 | — | `#7A7A7A` |
| `neutral-5` | Neutral 5, dark grey (9 %) | 35.98 | 0.00 | 0.00 | 0.00 | — | `#555555` |
| `neutral-6` | Neutral 6, black (3.2 %) | 20.83 | 0.00 | 0.00 | 0.00 | — | `#323232` |
| `red` | Red | 43.75 | 59.12 | 35.74 | 69.08 | 31.2 | `#C42B30` |
| `yellow` | Yellow | 78.87 | -0.23 | 73.26 | 73.26 | 90.2 | `#E6C02A` |
| `green` | Green | 56.59 | -45.57 | 33.69 | 56.67 | 143.5 | `#3A9A4A` |
| `cyan` | Cyan | 59.38 | -26.08 | -19.25 | 32.41 | 216.4 | `#1A9DB0` |
| `blue` | Blue | 35.86 | 18.89 | -50.44 | 53.86 | 290.5 | `#2F4FA6` |
| `magenta` | Magenta | 46.11 | 55.00 | -18.91 | 58.16 | 341.0 | `#B4408E` |
| `red-soft` | Soft red | 59.63 | 29.17 | 14.19 | 32.44 | 25.9 | `#C77B78` |
| `yellow-soft` | Soft yellow | 81.15 | -2.88 | 36.43 | 36.54 | 94.5 | `#DCC985` |
| `green-soft` | Soft green | 66.82 | -24.11 | 16.11 | 29.00 | 146.2 | `#7FAE85` |
| `cyan-soft` | Soft cyan | 71.51 | -16.99 | -10.71 | 20.08 | 212.2 | `#7DB9C2` |
| `blue-soft` | Soft blue | 56.48 | 7.42 | -30.88 | 31.76 | 283.5 | `#7486BD` |
| `magenta-soft` | Soft magenta | 61.36 | 26.09 | -10.98 | 28.31 | 337.2 | `#B984A8` |
| `skin-pale` | Pale skin tone | 81.35 | 9.48 | 17.48 | 19.89 | 61.5 | `#E8C3AA` |
| `skin-medium` | Medium skin tone | 67.25 | 13.65 | 22.01 | 25.90 | 58.2 | `#C99A7D` |
| `skin-tan` | Tan skin tone | 52.01 | 15.71 | 26.72 | 31.00 | 59.5 | `#A3714F` |
| `skin-deep` | Deep skin tone | 33.00 | 13.57 | 18.02 | 22.56 | 53.0 | `#6A4532` |
| `sky-blue` | Sky blue | 60.59 | -0.50 | -30.79 | 30.79 | 269.1 | `#6B95C8` |
| `foliage-green` | Foliage green | 41.26 | -21.99 | 30.95 | 37.97 | 125.4 | `#4D6A2C` |
| `brick-red` | Brick red | 41.63 | 32.81 | 25.53 | 41.57 | 37.9 | `#9C4A3A` |
| `sand` | Sand | 79.13 | 0.98 | 22.72 | 22.74 | 87.5 | `#D6C29A` |
| `teal` | Teal | 48.43 | -24.88 | -5.64 | 25.51 | 192.8 | `#2E7F7C` |
| `lavender` | Lavender | 66.69 | 14.80 | -22.70 | 27.10 | 303.1 | `#A99BCB` |
| `deep-orange` | Deep orange | 56.71 | 58.31 | 64.93 | 87.27 | 48.1 | `#F0520B` |
| `deep-violet` | Deep violet | 26.42 | 48.90 | -59.69 | 77.16 | 309.3 | `#4C1E9C` |
All 30 published reference values match.

## Accuracy

Measured with `simulateIdealReference()` (the capture's development without noise, blur or mosaic) of the
`color-patches` chart, CIELAB of each patch centre relative to the sRGB white scaled to the 90 % neutral, against the
table above (ΔE00, CIEDE2000):

| Illuminant | Sensor quadrature | Maximum ΔE00 | Mean ΔE00 |
| --- | --- | --- | --- |
| CIE D65 (the CIE table passed as `{ kind: "spectrum" }`) | 1 nm | 0.20 (deep orange) | 0.07 |
| CIE D65 (the same) | 5 nm | 0.26 (deep orange) | 0.08 |
| CIE D65 (the same) | 20 nm (the default) | 1.41 (neutral 1) | 0.76 |
| Planckian 6500 K (the facade default) | 5 nm | 1.21 (deep orange) | 0.40 |

- Under D65 the residual is the engine's analytic approximation of the CIE 1931 observer
  ([Colorimetry](COLORIMETRY.md#colour-matching-functions-and-spectral-integration)).
  `node scripts/compute-color-patch-reference.mjs --render` repeats the two D65 rows and fails above ΔE00 0.3.
- Under the default 6500 K Planckian the difference is the illuminant: its spectrum is not D65's, and the patches are
  white-balanced to that light.
- At the default 20 nm quadrature the scene-illuminant white balance is measured from the white diffuser on 1 nm nodes,
  while the sensor integrates on 20 nm nodes. For a spectrum with as much fine structure as the D65 table that leaves
  a neutral cast: a* −0.74, b* +0.95 on the white patch. It is small for the smooth built-in illuminants (6500 K
  Planckian: a* 0.17, b* 0.36; illuminant A: b* −0.17) and below 0.03 with 5 nm nodes. This is a property of the facade
  at its default quadrature, not of the patches.

`test/color-patches.test.ts` checks, without the CIE tables: the formula against the published terms and the unused
clamp; the neutral L* against 116·R^(1/3) − 16; the published hex against the published CIELAB; that the neutral
patches stay neutral after white balance under the 6500 K Planckian and illuminant A (ideal reference and a noisy
capture); that the strong and the soft hues each run red, yellow, green, cyan, blue, magenta in increasing hue angle,
the soft ones at lower chroma, and the skin tones fall in lightness from pale to deep; that the rendered CIELAB under the
6500 K Planckian agrees with the published values within ΔE00 1.35 (mean 0.45); that `color-patches` renders exactly
what `patches` with the same reflectances renders; and that existing charts render bit-identically to 2.13.0.

## Display view and GPU

The display view takes the chart path for the patches, as for a caller spectrum. It evaluates the built-in spectra with
the engine's portable exponential, so the display view's chart presets give the same bits in every JavaScript engine
([Display view](DISPLAY_VIEW.md#same-bytes-in-every-engine)); captures use `Math.exp`, like their other continuous
formulas. Inside a caller material scene or a material-layers scene the display view uses `Math.exp`. The WebGPU chart
stage classifies a `color-patches` element with the `patches` geometry; reflectances are evaluated in float64 on the CPU.

## Cost

A built-in patch's values are memoized per wavelength, so a capture evaluates each patch's formula once per quadrature
node. Measured on one machine (Apple M5 Pro, Node 24.19, built `dist`, medians of 7 captures and 5 display views; not a
performance claim): a 600 × 500 capture of the 30-patch chart took 95–101 ms, the same as a 30-patch `patches` chart
of neutral greys (93–95 ms) or of tabulated caller spectra (99 ms); a 300 × 250 display view of a 1200 × 1000 frame
took 375–397 ms against 350–412 ms for the neutral chart. Charts that do not use the patches run the same code as
before.

The patch table adds 6,526 B minified (2,671 B gzip) to a bundle of `simulateCapture` and `simulateIdealReference`
(rolldown, as in `test/capture-bundle.test.ts`), about 0.8 % of it. The display view's addition is unchanged
(45,613 B minified, within its budget), and captures still use only the four portable-math functions that test allows.
