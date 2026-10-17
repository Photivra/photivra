# Quick start: simulate a capture

`simulateCapture()` takes a small description of a camera, a lens setting, an exposure and a
scene, and returns a developed image. Behind it runs the engine's full physical pipeline: scene
radiance → lens → spectral sensor response → charge and noise → RAW readout → RAW development →
optional JPEG. The facade adds no physics of its own. It only builds the request for the existing
contracts, runs them, and tells you every choice it made for you.

This page covers the inputs, the defaults, the chart presets and the limits. The detailed contracts
it composes are in [ENVIRONMENT_RAW_CAPTURE.md](https://github.com/Photivra/photivra/blob/main/docs/ENVIRONMENT_RAW_CAPTURE.md),
[NATIVE_RAW_AND_PRINT.md](https://github.com/Photivra/photivra/blob/main/docs/NATIVE_RAW_AND_PRINT.md), [GENERIC_TIER_PRESETS.md](https://github.com/Photivra/photivra/blob/main/docs/GENERIC_TIER_PRESETS.md),
[COLORIMETRY.md](https://github.com/Photivra/photivra/blob/main/docs/COLORIMETRY.md) and the [Usage Guide](USAGE.md).

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

Before the facade, the same kind of result needed the 34-line
[production-capture.mjs](examples/production-capture.mjs) plus its 4,613-line
[production-request.json](examples/production-request.json) for a 2 × 2 capture. A runnable version of
the example above is [simulate-capture.mjs](examples/simulate-capture.mjs).

## What comes back

| Field | Contents |
| --- | --- |
| `image` | `width`, `height`, `format`, `samples` (`Uint8Array` or `Uint16Array` RGB), and `jpeg` bytes for the `jpeg` format |
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
| `lens.pupilSampling` | off | `{ radialSamples, angularSamples }` traces an ideal circular pupil, which renders defocus. Off means one chief ray per sample. |
| `exposure.mode` | `"manual"` | Also `"aperture-priority"`, `"shutter-priority"`, `"program"`. |
| `exposure.iso` | 100 | Selects the body's ISO readout regime (gain and read noise). |
| `exposure.shutterSeconds` | 1/125 | Used in `manual` and `shutter-priority`. |
| `exposure.compensationStops` | 0 | Applied to the meter target. |
| `scene` | required | A chart preset or a caller function (below). |
| `subjectDistanceM` | 5 | Distance of the scene plane. |
| `illuminant` | Planckian 6500 K | Also `"cie-a"`, `{ kind: "planckian", temperatureKelvin }`, `{ kind: "daylight", correlatedColorTemperatureKelvin, basis }` or `{ kind: "spectrum", spectrum }`. |
| `illuminanceLux` | 17 453 | See [Exposure](#exposure). |
| `output.width`, `output.height` | 64 × 64 | Output pixels. The sensor has one extra site on each side for demosaicing. |
| `output.format` | `"srgb-8"` | Also `"srgb-16"` and `"jpeg"`. |
| `output.toneCurve` | `"identity"` | Any `SdrToneCurve`, for example `"positive-reinhard-per-channel"`. |
| `output.toneCurveParameters` | none | Required by the luminance curves (`extended-reinhard-luminance`, `naka-rushton-luminance`); the facade invents no curve parameters. |
| `output.highlightMode` | `"clip"` | Or `"reconstruct"`. |
| `output.whiteBalance` | `"scene-illuminant"` | Also `"auto"`, `"none"`, `{ kelvin, tint? }` and `{ channelGains }`. |
| `output.jpegQuantizationStep` | 2 | Constant step 1–255, not a manufacturer quality scale. |
| `sensor.pixelPitchMicrometers` | 6 | The sensor is `width × pitch` wide (see [Geometry](#geometry)). |
| `sensor.spectralStepNanometers` | 20 | Spectral quadrature over 380–780 nm. |
| `sensor.temporalSampleCount` | 1 | The scene and camera are static. |
| `sensor.noiseSeed` | 1 | Output is deterministic for a given seed. |
| `signal`, `onProgress` | none | An `AbortSignal` cancels the running task; `onProgress` reports `raw`, `white-balance`, `development` and `jpeg` tiles. |

Unknown fields are rejected, so a typo never silently falls back to a default.

## Geometry

The scene is a plane perpendicular to the optical axis at `subjectDistanceM`. The facade sizes the
chart so that it exactly fills the active frame. Chart coordinates use frame units: `u` runs from −1
at the left edge to +1 at the right edge, and `v` points up on the same scale (±height/width).

The simulated sensor has real pixels of `sensor.pixelPitchMicrometers`. A 64 × 64 capture with 6 µm
pixels is therefore a 0.38 mm crop of a large sensor, not a downscaled full frame. This keeps the
signal per pixel, and so the noise and the ISO behaviour, physically consistent with the tier's
sensor values.

## Exposure

The facade meters the scene like a reflected-light meter. It averages the scene luminance on a
16 × 16 grid with the body's metering profile and follows the ISO 2720 relation
N²/t = L·S/K with K = 12.5 cd·s/m². The anchor is f/8, 1/125 s, ISO 100, which is correct for
L = 1000 cd/m². The meter target then goes through the engine's existing exposure-mode resolver.
In `program` mode an engine-authored generic program line chooses the aperture and shutter.

The default illuminance is π·K·N²/(t·S·0.18) = 17 453 lux. Under it an 18 % grey card is exactly
at the metered exposure for the default f/8, 1/125 s, ISO 100. The light does not follow your
settings: changing the shutter in manual mode changes the image brightness, as on a real camera.

With these defaults the green RAW level of an 18 % grey card is about 10.5 % of RAW white. This is
close to the ISO 12232 saturation-based speed relation. The tier values were not tuned to get it.

## Scene presets

All charts are engine-authored analytic patterns; no third-party chart data is bundled. Each is a
planar Lambertian reflector. Neutral reflectances are spectrally flat.

| Preset | Parameters (defaults) | Definition |
| --- | --- | --- |
| `uniform` | `reflectance` (0.18) | One reflectance or caller spectrum everywhere. |
| `slanted-edge` | `angleDegrees` (5), `darkReflectance` (0.15), `lightReflectance` (0.6) | An edge through the centre, tilted clockwise from vertical: light where u·cos θ − v·sin θ ≥ 0. The geometry follows the ISO 12233 edge target (a few degrees of slant, 4:1 contrast by default). |
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
| `"auto"` | Grey-world AWB with the body's `neutral-priority` policy over 2 × 2 block means of the pre-white-balance RAW. The sensor stage is then re-run with that setting; no new radiance queries are made. |
| `"none"` | No white balance; development assumes a D65 adopted white. Scenes under other light keep their colour cast. |
| `{ kelvin, tint? }` | A colour-temperature setting on the Planckian locus (tint as Duv). |
| `{ channelGains }` | Manual channel gains. |

## Modelling choices

These choices appear in `assumptions` as `kind: "model"` entries:

- **Sensor colour.** The facade uses an idealized colorimetric sensor. Channel quantum efficiency is
  a·{x̄, ȳ, z̄}(λ)·555 nm/λ from the engine's analytic CIE 1931 colour-matching functions
  (Wyman, Sloan & Shirley 2013). The λ factor converts the energy-based functions into a
  photon-counting response. RAW channels are then proportional to CIE XYZ (the Luther–Ives
  condition), and the camera matrix is diagonal. No real camera has this response.
- **Lens.** The tier lens's spectrally flat transmission is used at every f-number and focus in the
  lens capability. No PSF or diffraction, vignetting, distortion, lateral colour or stray light is
  applied. The tier's optical data exist only at f/4 and 5 m, and the facade does not extrapolate them.
- **Sensor.** Square pixels with a fill factor of 1 and no anti-aliasing filter. A global
  electronic shutter. A synthetic uniform dark current of 1 e⁻/s at 20 °C (the tiers declare none).
  The charge capacity equals the body's base-ISO saturation signal.
- **Demosaic.** Bilinear RGGB interpolation through the existing linear-kernel contract. Sharp
  edges without lens blur therefore show the usual zipper and false-colour artefacts.
- **Scene.** A planar Lambertian surface: radiance = reflectance × irradiance / π, with illuminance
  from K_m = 683 lm/W and the analytic ȳ. No shadows, inter-reflection, gloss or fluorescence.
- **Rendering.** Linear sRGB with RAW white at display white, no exposure push, out-of-gamut
  components clipped, then the sRGB transfer function.

## Performance

The facade's cost is almost entirely engine time per sensor site, not facade overhead. Since 2.0 the
native environment task runs most sites through a lean executor that skips provably redundant per-site
re-validation while producing byte-identical output (described in the repository's
`docs/NATIVE_RAW_AND_PRINT.md`). Measured on
a 4-core Linux host running Node 24 (slanted edge, default settings and sRGB 8-bit output):

| Output | Native sites | Wall time | CPU time | CPU per site |
| --- | --- | --- | --- | --- |
| 64 × 64 | 4 356 | 0.6 s | 0.87 s | 0.20 ms |
| 128 × 128 | 16 900 | 1.6 s | 2.2 s | 0.13 ms |
| 256 × 256 | 66 564 | 5.7 s | 6.9 s | 0.10 ms |
| 1000 × 1000 | 1 004 004 | — | about 2 min (extrapolated) | — |

The 1000 × 1000 row is not a measurement; it multiplies the 256 × 256 CPU cost per site by the site
count. Before the lean executor the same 64 × 64 capture took about 6.0 s of CPU and 128 × 128 about
20.6 s on this host. Development and encoding are a small part of the total.

These numbers come from one run on one machine. They are not a performance claim. Small captures
(up to about 128 × 128) take a few seconds. Use them while you explore, and render large images only when
you need them.

## Not available yet

The facade has no lens PSF or diffraction blur, vignetting, distortion, motion blur, rolling shutter,
flash, or DNG and PNG output. The underlying contracts support several of these; the facade will
expose them as they are added. Real camera and lens presets are not provided, for rights reasons.

## Sources

- ISO 2720:1974, *General purpose photographic exposure meters (photoelectric type) — Guide to
  product specification* (reflected-light calibration constant K).
- ISO 12232:2019, *Photography — Digital still cameras — Determination of exposure index, ISO speed
  ratings, standard output sensitivity, and recommended exposure index* (saturation-based speed).
- ISO 12233:2017, *Photography — Electronic still picture imaging — Resolution and spatial frequency
  responses* (slanted-edge geometry).
- CIE 015:2018, *Colorimetry*, 4th ed. (K_m = 683 lm/W, illuminant A, daylight).
- C. Wyman, P.-P. Sloan, P. Shirley, "Simple analytic approximations to the CIE XYZ color matching
  functions", *Journal of Computer Graphics Techniques* 2(2), 2013.
- R. Luther, "Aus dem Gebiet der Farbreizmetrik", *Zeitschrift für technische Physik* 8, 1927
  (the Luther condition for colorimetric cameras).
