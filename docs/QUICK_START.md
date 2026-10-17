# Quick start: simulate a capture

`simulateCapture()` takes a small description of a camera, a lens setting, an exposure and a
scene, and returns a developed image. Behind it runs the engine's full physical pipeline: scene
radiance → lens → spectral sensor response → charge and noise → RAW readout → RAW development →
optional JPEG.

`simulateCapture()` is a *facade*: one simple entry point in front of those existing contracts. It
adds no physics of its own. It only builds the request for the existing contracts, runs them, and
tells you every choice it made for you.

This page covers the inputs, the defaults, the chart presets and the limits. The detailed contracts
it composes are in [ENVIRONMENT_RAW_CAPTURE.md](https://github.com/Photivra/photivra/blob/main/docs/ENVIRONMENT_RAW_CAPTURE.md),
[NATIVE_RAW_AND_PRINT.md](https://github.com/Photivra/photivra/blob/main/docs/NATIVE_RAW_AND_PRINT.md), [GENERIC_TIER_PRESETS.md](https://github.com/Photivra/photivra/blob/main/docs/GENERIC_TIER_PRESETS.md),
[COLORIMETRY.md](https://github.com/Photivra/photivra/blob/main/docs/COLORIMETRY.md) and the [Usage Guide](USAGE.md).

Calling the engine from an AI agent? [Using Photivra from an agent](AGENT_GUIDE.md) says which
function fits each task, which units to pass and how to report results honestly.

## The ten-line capture

```ts
import { simulateCapture } from "@photivra/engine";

const capture = await simulateCapture({
  camera: "professional",
  lens: { fNumber: 8 },
  exposure: { mode: "manual", iso: 100, shutterSeconds: 1 / 125 },
  scene: { preset: "slanted-edge" },
  output: { width: 16, height: 16, format: "srgb-8" }
});
console.log(capture.image.width, capture.image.samples.length, capture.exposure.settings);
```

`capture.image.samples` holds interleaved 8-bit sRGB values, row by row from the top-left. The scene
is the only required input; every other field above is the default and could be left out.

Without the facade, the same kind of result needs the 34-line
[production-capture.mjs](examples/production-capture.mjs) plus its 4,613-line
[production-request.json](examples/production-request.json) for a 2 × 2 capture. A runnable version of
the example above is [simulate-capture.mjs](examples/simulate-capture.mjs).

## What comes back

| Field | Contents |
| --- | --- |
| `image` | `width`, `height`, `format`, `samples` (`Uint8Array` or `Uint16Array` RGB), `jpeg` bytes for the `jpeg` format, `png` bytes plus `colorEncoding` for the `png` format, and `dng` bytes for the `dng` format |
| `raw` | The packed native RAW: codes, black levels, saturation flags and per-phase white levels |
| `plan` | The native RAW plan the engine executed |
| `request` | The complete underlying request: `environmentRaw` (the native environment RAW input), `siteInput(index)` (rebuilds the physical input of any sensor site), `development` (the RAW development input) and `whiteBalanceState` |
| `exposure` | Mode, resolved settings, EV100, metered scene luminance and the exposure-mode resolver's full output |
| `scene` | Chart parameters, illuminant, distance, framed size and the scene's SHA-256 digest |
| `diagnostics` | Radiance query count, highlight and rendering counters, and timings |
| `provenance` | Status (`approximation`), camera preset identity, evidence, the composed contracts in order, and limitations |
| `assumptions` | Every default, derived value and fixed modelling choice, each with an explanation |

Nothing is hidden: when you omit a field, an entry with `kind: "default"` names it and its value.
Values the facade calculates (such as the framed chart size) appear as `kind: "derived"`, and fixed
modelling choices (such as "no lens PSF") as `kind: "model"`.

## Inputs and defaults

| Option | Default | Notes |
| --- | --- | --- |
| `camera` | `"professional"` | A generic tier id (`"consumer"`, `"prosumer"`, `"professional"`) or a full `GenericEquipmentTierPreset` record. Tier values are synthetic educational designs, not real cameras. |
| `lens.focalLengthMm` | 50 | Must lie in the lens capability; the generic primes are 50 mm. |
| `lens.fNumber` | 8 | Used in `manual` and `aperture-priority`; resolved automatically otherwise. Must lie in f/4–f/16. |
| `lens.focusDistanceM` | the subject distance | |
| `lens.pupilSampling` | off | `{ radialSamples, angularSamples }` traces an ideal circular pupil, which renders defocus. Off means one chief ray per sample. Angular samples 4–64, at most 256 rays. |
| `lens.projection` | `"rectilinear"` | Any `LENS_PROJECTION_MODELS` value, for example `"fisheye-equisolid-angle"` (see [Optics](#optics)). |
| `lens.distortion` | none | `{ kind: "radial", profile }` or `{ kind: "brown-conrady", profile }`. |
| `lens.vignetting` | none | An `IlluminationVignettingProfile` (radial relative illumination). |
| `lens.psf` | none | A `{ kind: "sampled-local", configuration }` sampled lens PSF, passed to the environment contract unchanged. |
| `exposure.mode` | `"manual"` | Also `"aperture-priority"`, `"shutter-priority"`, `"program"`. |
| `exposure.iso` | 100 | Selects the body's ISO readout regime (gain and read noise). |
| `exposure.shutterSeconds` | 1/125 | Used in `manual` and `shutter-priority`. |
| `exposure.compensationStops` | 0 | Applied to the meter target. |
| `scene` | required | A chart preset or a caller function (below). |
| `subjectDistanceM` | 5 | Distance of the scene plane. |
| `illuminant` | Planckian 6500 K | Also `"cie-a"`, `{ kind: "planckian", temperatureKelvin }`, `{ kind: "daylight", correlatedColorTemperatureKelvin, basis }` or `{ kind: "spectrum", spectrum }`. |
| `illuminanceLux` | 21 481 (π·80 000/11.7) | See [Exposure](#exposure). |
| `output.width`, `output.height` | 64 × 64 | Output pixels. The sensor has one extra site on each side for demosaicing (see `output.borderHandling`). |
| `output.format` | `"srgb-8"` | Also `"srgb-16"`, `"jpeg"`, `"png"` and `"dng"` (see [Output formats](#output-formats)). |
| `output.colorEncoding` | `"srgb"` | PNG only: also `"display-p3"` and `"rec2020"`. |
| `output.bitDepth` | 8 | PNG only: 8 or 16. |
| `output.gamutMapping` | `"clip"` | PNG only: or `"perceptual"`. |
| `output.dng.capturedAtUtc` | none | DNG only: capture time for the date tags. |
| `output.demosaic` | the 1.0 bilinear kernels | `"bilinear"` (see [Demosaic](#demosaic)). |
| `output.borderHandling` | `"margin"` | Or `"mirror"`. |
| `output.toneCurve` | `"identity"` | Any `SdrToneCurve`, for example `"positive-reinhard-per-channel"`. |
| `output.toneCurveParameters` | none | Required by the luminance curves (`extended-reinhard-luminance`, `naka-rushton-luminance`); the facade invents no curve parameters. |
| `output.highlightMode` | `"clip"` | Or `"reconstruct"`. |
| `output.whiteBalance` | `"scene-illuminant"` | Also `"auto"`, `"none"`, `{ kelvin, tint? }` and `{ channelGains }`. |
| `output.jpegQuantizationStep` | 2 | Constant step 1–255, not a manufacturer quality scale. |
| `sensor.pixelPitchMicrometers` | 6 | The sensor is `width × pitch` wide (see [Geometry](#geometry)). |
| `sensor.spectralStepNanometers` | 20 | Spectral quadrature over 380–780 nm. |
| `sensor.temporalSampleCount` | 1, or 8 when the camera rotates | Midpoints across each site's exposure window. |
| `sensor.noiseSeed` | 1 | Output is deterministic for a given seed. |
| `motion.angularVelocityRadPerSec` | still | `{ pitch?, yaw?, roll? }` in rad/s (see [Motion](#motion)). |
| `motion.shutter` | `"global"` | Or `"rolling"`. |
| `motion.rollingShutterSkewSeconds` | the body's readout skew | Rolling only. |
| `signal`, `onProgress` | none | An `AbortSignal` cancels the running task; `onProgress` reports `raw`, `white-balance`, `development` and `jpeg` tiles. |

Unknown fields are rejected, so a typo never silently falls back to a default.

Every option added in 2.0 (PNG, demosaic, optics and motion) is opt-in. With none of them given, the
request, RAW, samples and JPEG are byte-identical to the 1.0 facade at the same illuminance, and a
test checks that. (The default illuminance changed before release; see [Exposure](#exposure).)

## Geometry

The scene is a plane perpendicular to the optical axis at `subjectDistanceM`. The facade sizes the
chart so that it exactly fills the active frame. Chart coordinates use frame units: `u` runs from −1
at the left edge to +1 at the right edge, and `v` points up on the same scale (±height/width).

The simulated sensor has real pixels of `sensor.pixelPitchMicrometers`. A 64 × 64 capture with 6 µm
pixels is therefore a 0.38 mm crop of a large sensor, not a downscaled full frame. This keeps the
signal per pixel, and so the noise and the ISO behaviour, physically consistent with the tier's
sensor values.

## Exposure

The facade meters the scene like a reflected-light meter:

- It averages the scene luminance on a 16 × 16 grid with the body's metering profile.
- It uses two relations from CIPA DC-004-2020 (free):
  - standard output sensitivity S = 10/H (§3.2): the correct focal-plane exposure for ISO S is
    H = 10/S lx·s;
  - the camera equation H = 0.65·L·t/N² (§5.5 (4)), where 0.65 = τ·π/4 with lens transmittance
    τ = 0.828 (Explanation 4).

  N is the f-number, t the shutter time in seconds, L the scene luminance in cd/m² and S the ISO
  setting. Together they give N²/t = 0.65·L·S/10.
- The anchor is f/8, 1/125 s, ISO 100. It is correct for L = 10·N²/(0.65·t·S) =
  10·64·125/(0.65·100) = 80 000/65 ≈ 1230.77 cd/m².
- The meter target then goes through the engine's existing exposure-mode resolver.
- In `program` mode, a generic program line written by the engine chooses the aperture and shutter.

DC-004 ties the reference level to an 18 % grey (Explanation 1 and 2.2). The default illuminance
puts an 18 % Lambertian grey card, whose luminance is L = 0.18·E/π, exactly at that luminance:

```text
E = π·L/0.18 = π·10·N²/(0.65·t·S·0.18)
  = π·10·64·125/(0.65·100·0.18) = π·80 000/11.7 ≈ 21 480.98 lux
```

Before 2.0.0 was released, the default was π·K·N²/(t·S·0.18) ≈ 17 453.29 lux, with the
reflected-light meter constant K = 12.5 cd·s/m² of a paid standard. The DC-004 relations are
equivalent to K = 10/0.65 ≈ 15.38 cd·s/m², so the new default has 10/(0.65·12.5) ≈ 1.231 times
(about 0.30 EV) more light.

The light does not follow your settings. Changing the shutter in manual mode changes the image
brightness, as on a real camera.

With these defaults, the green RAW level of an 18 % grey card is about 13.1 % of RAW white. A 100 %
reflector would then sit at about 73 % of white, roughly half a stop below clipping. DC-004 defines
only the mid-grey reference level, not highlight headroom: this half stop is a property of the
engine's generic tier presets, documented here, and the tier values were not tuned to get it.

## Scene presets

All charts are analytic patterns written by the engine; no third-party chart data is bundled. Each
is a flat Lambertian reflector (it looks equally bright from every direction). Neutral reflectances
are spectrally flat.

| Preset | Parameters (defaults) | Definition |
| --- | --- | --- |
| `uniform` | `reflectance` (0.18) | One reflectance or caller spectrum everywhere. |
| `slanted-edge` | `angleDegrees` (5), `darkReflectance` (0.15), `lightReflectance` (0.6) | An edge through the centre, tilted clockwise from vertical: light where u·cos θ − v·sin θ ≥ 0. The geometry follows the slanted-edge method described by Burns (2000), also used by ISO 12233 (a few degrees of slant, 4:1 contrast by default). |
| `siemens-star` | `cycles` (36), `radiusFraction` (0.9), `darkReflectance` (0.05), `lightReflectance` (0.8), `backgroundReflectance` (0.18) | Alternating sectors of angular width π/cycles inside radius `radiusFraction` × frame half-height. |
| `step-wedge` | `steps` (11), `minimumReflectance` (0.03), `maximumReflectance` (0.9), `spacing` (`equal-density`) | Equal-width vertical steps from left to right. Equal density spaces D = −log₁₀ R evenly; `linear` spaces R evenly. |
| `grey-ramp` | `minimumReflectance` (0.03), `maximumReflectance` (0.9) | Reflectance linear in u, represented by 1024 equal levels. |
| `checkerboard` | `squaresAcross` (8), `darkReflectance` (0.05), `lightReflectance` (0.8) | Square cells, light at the top-left. |
| `point-grid` | `columns` (5), `rows` (3), `radius` (0.01), `pointReflectance` (0.9), `backgroundReflectance` (0.02) | Small disks centred in equal cells, for PSF and defocus inspection. |
| `patches` | `patches` (required), `columns`, `gapFraction` (0.1), `backgroundReflectance` (0.18) | Caller reflectance per patch, row-major. Use it for a ColorChecker-like chart with reflectance data you are entitled to use; the engine does not ship such data because its licence is unclear. |

`resolveChartScene()`, `calculateStepWedgeReflectances()` and `calculatePointGridCenters()` expose
the same definitions for analysis code. `createPlanarSceneRadianceProvider()` turns any of these
scenes into a provider for the native environment RAW contract.

Instead of a chart you can pass a function. `{ kind: "reflectance-function", sceneId, evaluate }`
receives a plane point (`xM`, `yM` in metres, `u`, `v` and `wavelengthNanometers`) and returns a
reflectance in [0, 1], lit by the facade illuminant. `{ kind: "radiance-function", sceneId, evaluate }`
returns absolute spectral radiance in W·m⁻²·sr⁻¹·nm⁻¹ and ignores the illuminant.

```ts
import { simulateCapture } from "@photivra/engine";

const vignette = await simulateCapture({
  scene: { kind: "reflectance-function", sceneId: "radial-falloff", evaluate: (p) => 0.8 / (1 + p.u * p.u + p.v * p.v) },
  illuminant: "cie-a",
  output: { width: 8, height: 8, whiteBalance: "auto" }
});
console.log(vignette.request.whiteBalanceState?.source);
```

## White balance

| Value | Meaning |
| --- | --- |
| `"scene-illuminant"` | A custom white balance measured from a perfect white diffuser under the scene illuminant, like a grey-card setting. |
| `"auto"` | Grey-world auto white balance (AWB) with the body's `neutral-priority` policy, over 2 × 2 block means of the RAW before white balance. The sensor stage is then re-run with that setting; no new radiance queries are made. |
| `"none"` | No white balance; development assumes a D65 adopted white. Scenes under other light keep their colour cast. |
| `{ kelvin, tint? }` | A colour-temperature setting on the Planckian locus (tint as Duv). |
| `{ channelGains }` | Manual channel gains. |

## Modelling choices

These choices appear in `assumptions` as `kind: "model"` entries:

- **Sensor colour.** The facade uses an idealized colorimetric sensor. Channel quantum efficiency is
  a·{x̄, ȳ, z̄}(λ)·555 nm/λ from the engine's own analytic fit of the CIE 1931 colour-matching
  functions (an approximation; see Colorimetry). The λ factor converts the energy-based functions into a
  photon-counting response. RAW channels are then proportional to CIE XYZ (the Luther–Ives
  condition), and the camera matrix is diagonal. No real camera has this response.
- **Lens.** The tier lens's spectrally flat transmission is used at every f-number and focus in the
  lens capability. By default no PSF (point-spread function) or diffraction, vignetting, distortion,
  lateral colour or stray light is applied. The tier's optical data exist only at f/4 and 5 m, and
  the facade does not extrapolate them. Vignetting, distortion and PSF are applied only from profiles
  you supply.
- **Sensor.** Square pixels with a fill factor of 1 and no anti-aliasing filter. A global
  electronic shutter unless `motion.shutter` is `"rolling"`. A synthetic uniform dark current of
  1 e⁻/s at 20 °C (the tiers declare none). The charge capacity equals the body's base-ISO saturation signal.
- **Demosaic.** Bilinear RGGB interpolation through the existing linear-kernel contract, unless
  `output.demosaic` selects a built-in kernel. (Demosaicing fills in the two missing colours at each
  pixel of a colour-filter mosaic.) Sharp edges without lens blur therefore show the usual zipper and
  false-colour artefacts.
- **Scene.** A planar Lambertian surface: radiance = reflectance × irradiance / π, with illuminance
  from K_m = 683 lm/W and the analytic ȳ. No shadows, inter-reflection, gloss or fluorescence.
- **Rendering.** Linear sRGB with RAW white at display white, no exposure push, out-of-gamut
  components clipped, then the sRGB transfer function.

## Output formats

`output.format: "png"` writes a PNG with `serializePngImage`: 8- or 16-bit RGB, deterministic
in-house zlib, and the colour encoding signalled in the file.

| `colorEncoding` | Samples | PNG signalling |
| --- | --- | --- |
| `"srgb"` | Exactly the developed sRGB samples (the `srgb-8` / `srgb-16` output). | sRGB chunk (perceptual intent) with its prescribed gAMA/cHRM values |
| `"display-p3"` | Linear colour converted to Display P3 primaries (W3C CSS Color 4 `display-p3`, D65), sRGB transfer. | cICP 12/13/0/1 |
| `"rec2020"` | Linear colour converted to ITU-R BT.2020 primaries, BT.2020 OETF (the BT.709 curve). | cICP 9/1/0/1 |

The BT.2100 PQ and HLG encodings are not part of 2.0: their patent holders offer only
licence-on-request declarations (see the patent review in `THIRD_PARTY.md`).

What is converted, and where:

- The sRGB output path develops each pixel to linear sRGB/D65. That covers demosaic, a per-site clip
  at the RAW white level, white balance, highlight mode, the camera→XYZ matrix and the XYZ→sRGB
  matrix. It then clips each component to [0, 1].
- The wide-gamut encodings use the same development operator but stop before that clip. So
  colours outside sRGB survive, as negative or above-one sRGB components.
- They convert that linear colour back to CIE XYZ and on to the target primaries (matrices from the
  primaries and the D65 white, as in W3C CSS Color 4; see [Colorimetry](https://github.com/Photivra/photivra/blob/main/docs/COLORIMETRY.md)).
- Gamut mapping then happens only once, in the target space. Components are clipped to [0, 1] for
  Display P3 and Rec. 2020.
- No perceptual gamut compression is applied by default (see `output.gamutMapping` below).
- Tone curves other than `identity` are sRGB-only, and are refused with a wide-gamut encoding.

- RAW white maps to display white. For extended range, merge a bracket with
  `createHdrBracketMergeTask` (see [PROCESSING.md](https://github.com/Photivra/photivra/blob/main/docs/PROCESSING.md)).
- No mDCV or cLLI metadata is written.
- With the facade's colorimetric sensor, the wide-gamut colours are exact up to the spectral
  quadrature (numerical integration over wavelength). With 5 nm spectral steps, a test reproduces an
  out-of-sRGB green emitter's CIE 1931 xy chromaticity to within 0.004.

```ts
import { simulateCapture } from "@photivra/engine";

const wide = await simulateCapture({
  scene: { preset: "checkerboard" },
  output: { width: 8, height: 8, format: "png", colorEncoding: "display-p3", bitDepth: 16 }
});
console.log(wide.image.colorEncoding, wide.image.png?.length, wide.diagnostics.rendering.gamutClippedLowSampleCount);

const rec2020 = await simulateCapture({ scene: { preset: "uniform" }, output: { width: 4, height: 4, format: "png", colorEncoding: "rec2020", bitDepth: 16 } });
console.log(rec2020.image.samples instanceof Uint16Array, rec2020.assumptions.find((a) => a.id === "output.colorEncoding.conversion")?.value);
```

`output.gamutMapping: "perceptual"` replaces the component clip for the PNG encodings (`srgb`,
`display-p3`, `rec2020`) with `prepareRgbGamutMapping`:

- CIELAB L* and hue are held.
- Chroma above 90 % of the gamut-boundary chroma is compressed with a smooth knee that never reaches
  the boundary (constant-lightness, constant-hue chroma reduction as in W3C CSS Color 4 §14, free; also
  see Morovič 2008).
- Hue is kept, whereas a component clip shifts it. The cost: saturated in-gamut colours above the knee
  lose a little chroma, and CIELAB hue drifts for saturated blues.
- `"clip"` (the default) leaves the output exactly as before.
- `diagnostics.gamutMapping` counts the pixels the mapping changed.
- It cannot be combined with tone curves.

`output.format: "dng"` writes the packed native RAW itself with `serializeNativeRawDng`: a lossless,
uncompressed 16-bit CFA DNG. `samples` are the developed 8-bit sRGB image and `image.dng` holds the file.
The DNG states only what the capture has:

| Tags | Source |
| --- | --- |
| Codes, CFAPattern, BlackLevel (2 × 2), WhiteLevel | The packed RAW codes, per-site black levels (they must repeat with the CFA tile) and the smallest per-phase effective white code |
| ActiveArea, DefaultCropOrigin/Size, Orientation | The capture geometry (the demosaic border lies outside the active area) |
| ColorMatrix1 (D65), ForwardMatrix1, AnalogBalance, AsShotNeutral | The facade's diagonal camera→XYZ profile and the capture's white-balance intent |
| BaselineExposure | 0: the RAW white level maps to display white, as in the facade's development |
| NoiseProfile | Each channel's readout regime: conversion gain ÷ digital gain and the combined read noise (Poisson, Gaussian and quantization only) |
| ImageDescription | States that it is a simulated packed RAW with no linear master or rendering stored |

- Saturation flags of sites whose code is below WhiteLevel have no DNG field. They are counted in the
  assumptions.
- `output.dng.capturedAtUtc` adds date tags. Without it, none are written.
- The file round-trips through `parseDngRawImage` to identical codes and tags.
- LibRaw 0.22.1 decodes identical codes. (It trims an odd ActiveArea origin to keep its Bayer
  alignment.)
- Pillow 12 reads every tag but has no CFA (colour filter array) decoder — for these files, as for any
  CFA DNG.

```ts
import { parseDngRawImage, simulateCapture } from "@photivra/engine";

const shot = await simulateCapture({ scene: { preset: "siemens-star" }, output: { width: 8, height: 8, format: "dng" } });
const dng = parseDngRawImage({ bytes: shot.image.dng! });
console.log(dng.width, dng.activeArea, dng.whiteLevel, dng.codes.length === shot.raw.codes.length);
```

## Demosaic

`output.demosaic` selects the built-in Bayer kernels of `createBuiltInBayerDemosaicProfiles`:
`"bilinear"` (nearest same-channel averages; pixel-identical to the default). The Malvar–He–Cutler
kernels are not in 2.0 (a patent is still in force; see
[PROCESSING.md](https://github.com/Photivra/photivra/blob/main/docs/PROCESSING.md)).

`output.borderHandling` decides how edge pixels get their neighbours:

- `"margin"` (the default) renders the kernel's reach as extra sensor sites around the output: one site
  for bilinear.
- `"mirror"` renders exactly the output, and reads reflect-101 mirror images of the missing sites. The
  engine first checks that every reflected site keeps its CFA colour. Mirror saves the radiance work for
  the border, so small captures need no extra sites. Its edge pixels use mirrored neighbours rather than
  rendered ones.

```ts
import { simulateCapture } from "@photivra/engine";

const mirrored = await simulateCapture({
  scene: { preset: "slanted-edge" },
  output: { width: 8, height: 8, demosaic: "bilinear", borderHandling: "mirror" }
});
console.log(mirrored.plan.exposure.geometry.nativeRaster, mirrored.request.development.borderHandling);
```

## Optics

The optics options feed only what the environment site contract accepts:

- `lens.projection` and `lens.distortion` become the site's `lensFieldMapping`.
  - Each sensor point is inverse-distorted, unprojected with the chosen ideal projection, and only then
    turned into a scene ray.
  - Irradiance is multiplied exactly once by the distortion area factor 1/det(J), where J is the
    Jacobian of the mapping.
  - At finite focus, a non-rectilinear projection is scaled by the thin-lens image distance (an
    approximation).
  - The chart is still sized with the rectilinear scale, so its edges move with the projection.
  - Neither option can be combined with `lens.pupilSampling`, because ideal pupil rays assume the
    rectilinear, distortion-free projection.
- `lens.vignetting` becomes radial-illumination-vignetting field throughput,
  1 + r2·ρ² + r4·ρ⁴ + r6·ρ⁶, applied once at the physical sensor point before any PSF.
- `lens.psf` is a caller sampled PSF passed through unchanged. Its focal length, f-number and focus
  must equal the resolved capture settings exactly, and it cannot be combined with pupil sampling.

The default frame is a 0.38 mm crop behind a 50 mm lens, a field of well under a degree. Projection
and distortion effects therefore only become visible with larger pixels (or a custom lens). The
profiles are yours to supply: the tiers declare no vignetting, distortion or PSF away from their f/4
reference.

Atmospheric haze and polarizers are not offered, for two reasons:

- The scene-radiance provider contract fixes `volumetricTransportModeled` and `polarizationModeled` to
  false. Haze airlight added inside the provider would therefore be misdeclared.
- With unpolarized scene light, a polarizer reduces to a uniform attenuation, with none of its glare or
  sky effects.

Use `calculateAtmosphericHaze` and the front-of-lens filter contracts directly (see
[PHYSICS_FOUNDATION.md](https://github.com/Photivra/photivra/blob/main/docs/PHYSICS_FOUNDATION.md)).

```ts
import { simulateCapture } from "@photivra/engine";

const lensy = await simulateCapture({
  scene: { preset: "point-grid" },
  sensor: { pixelPitchMicrometers: 50 },
  lens: {
    projection: "fisheye-equisolid-angle",
    distortion: { kind: "radial", profile: { normalizationRadiusMm: 0.5, maximumNormalizedRadius: 1, coefficients: { k1: -0.1, k2: 0, k3: 0 } } },
    vignetting: { normalizationRadiusMm: 0.5, maximumNormalizedRadius: 1, coefficients: { r2: -0.3, r4: 0, r6: 0 } }
  },
  output: { width: 8, height: 8 }
});
console.log(lensy.request.siteInput(0).environment.lensFieldMapping, lensy.assumptions.find((a) => a.id === "lens.vignetting")?.kind);
```

## Motion

`motion.angularVelocityRadPerSec` rotates the camera at a constant rate during the exposure, in the
engine's pitch/yaw/roll convention ([SENSOR_ENVIRONMENT_QUERY.md](https://github.com/Photivra/photivra/blob/main/docs/SENSOR_ENVIRONMENT_QUERY.md)).

- Every scene ray is rotated at each temporal midpoint of the site's exposure window. Motion blur is
  therefore a midpoint quadrature (an average over sample times).
- `sensor.temporalSampleCount` defaults to 8 when the camera rotates.
- A yaw of ω rad/s moves the image by ω·f/pitch pixels per second (f = focal length).

`motion.shutter: "rolling"` derives the exposure schedule from the body's rolling readout declaration,
with `resolveElectronicRollingShutterExposureSchedule` (line reset/read linkage). A site at normalized
scan position s integrates over [s·τ, s·τ + T], where τ is the skew and T the exposure time.

- The default skew τ is the tier's full-frame data-readout time, applied unchanged across the simulated
  frame. It is not scaled to the cropped sensor, because the engine never rescales a declared skew. A
  small frame therefore shows the skew of a full-sensor readout.
- Pass `rollingShutterSkewSeconds` to declare τ for the simulated frame yourself.
- Each site's charge window follows its own exposure window.
- Combined with rotation, a vertical edge shears by ω·f/pitch·τ pixels from the first row to the last.
  A test checks this.

```ts
import { simulateCapture } from "@photivra/engine";

const pan = await simulateCapture({
  scene: { preset: "slanted-edge", angleDegrees: 0 },
  motion: { angularVelocityRadPerSec: { yaw: 0.06 }, shutter: "rolling", rollingShutterSkewSeconds: 0.01 },
  output: { width: 8, height: 8 }
});
console.log(pan.assumptions.find((a) => a.id === "sensor.shutter")?.value, pan.exposure.settings.shutterSeconds);
```

## Performance

Almost all of the cost is engine time per sensor site; the facade itself adds little. Since 2.0, the
native environment task runs most sites through a lean executor. It skips per-site re-validation that
is provably redundant, and produces byte-identical output (described in the repository's
`docs/NATIVE_RAW_AND_PRINT.md`).

Measured on a 4-core Linux host running Node 24 (slanted edge, default settings and sRGB 8-bit output):

| Output | Native sites | Wall time | CPU time | CPU per site |
| --- | --- | --- | --- | --- |
| 64 × 64 | 4 356 | 0.6 s | 0.87 s | 0.20 ms |
| 128 × 128 | 16 900 | 1.6 s | 2.2 s | 0.13 ms |
| 256 × 256 | 66 564 | 5.7 s | 6.9 s | 0.10 ms |
| 1000 × 1000 | 1 004 004 | — | about 2 min (extrapolated) | — |

The 1000 × 1000 row is not a measurement. It multiplies the 256 × 256 CPU cost per site by the site
count. Before the lean executor, the same 64 × 64 capture took about 6.0 s of CPU on this host, and
128 × 128 about 20.6 s. Development and encoding are a small part of the total.

These numbers come from one run on one machine. They are not a performance claim. Small captures
(up to about 128 × 128) take a few seconds. Use them while you explore, and render large images only
when you need them.

## Not available

The facade offers no atmospheric haze or polarizer (see [Optics](#optics)), flash, video, HDR brackets
or processing operators. Those APIs are available directly. Real camera and lens presets are not
provided, for rights reasons.

## Sources

- CIPA DC-004-Translation-2020, *Sensitivity of Digital Cameras*, free at
  <https://www.cipa.jp/e/std/std-sec.html> (standard output sensitivity S = 10/H, §3.2; reference
  level tied to 18 % grey, §5.2 and Explanation 1, 2.2; focal-plane exposure H = 0.65·L·t/N², §5.5
  and Explanation 4).
- P. D. Burns, "Slanted-Edge MTF for Digital Camera and Scanner Analysis", Proc. IS&T PICS 2000,
  free at <https://www.imaging.org/common/uploaded%20files/pdfs/Papers/2000/PICS-0-81/1621.pdf>
  (slanted-edge geometry; also ISO 12233:2017).
- BIPM, *The International System of Units*, 9th ed. (2019), free at
  <https://www.bipm.org/en/publications/si-brochure> (K_cd = 683 lm/W, the definition of the candela).
- BIPM, *Mise en pratique for the definition of the kelvin*, Absolute Primary Radiometry (2018),
  Eq. (1), free at <https://www.bipm.org/utils/en/pdf/si-mep/MeP-K-2018_Absolute_Primary_Radiometry.pdf>
  (Planck's law, used for the Planckian and illuminant A spectra). Illuminant A's defining constants
  and the daylight polynomial come from CIE 015:2018 (paid); computed values are checked against the
  free CIE datasets at <https://cie.co.at/data-tables> (see [Colorimetry](https://github.com/Photivra/photivra/blob/main/docs/COLORIMETRY.md)).
- C. Wyman, P.-P. Sloan, P. Shirley, "Simple analytic approximations to the CIE XYZ color matching
  functions", *Journal of Computer Graphics Techniques* 2(2), 2013 (the piecewise-Gaussian model form;
  the engine fits its own coefficients to the CIE 1931 data, see Colorimetry).
- R. Luther, "Aus dem Gebiet der Farbreizmetrik", *Zeitschrift für technische Physik* 8, 1927
  (the Luther condition for colorimetric cameras).
- W3C CSS Color Module Level 4 (`srgb` and `display-p3`; RGB↔XYZ matrices from primaries and white),
  free at <https://www.w3.org/TR/css-color-4/>; ITU-R BT.709-6 and BT.2020-2 (primaries and luminance
  coefficients), free at <https://www.itu.int/rec/R-REC-BT>; ITU-T H.273 (cICP code points); W3C PNG Specification, Third
  Edition (2025).
- Adobe DNG Specification 1.7.1.0 (2023); W3C CSS Color Module Level 4 §14 (free). Also see: J. Morovič,
  *Color Gamut Mapping*, Wiley 2008, §10.
- K. Miyamoto, "Fish eye lens", *JOSA* 54, 1964; J. Kannala, S. Brandt, *IEEE TPAMI* 28, 2006
  (projections); A. E. Conrady, *MNRAS* 79, 1919; D. C. Brown, *Photogrammetric Engineering* 32, 1966
  (distortion).
- A. El Gamal, H. Eltoukhy, "CMOS image sensors", *IEEE Circuits and Devices Magazine* 21(3), 2005;
  C.-K. Liang, L.-W. Chang, H. H. Chen, "Analysis and compensation of rolling shutter effect",
  *IEEE TIP* 17(8), 2008 (rolling-shutter line timing).
