# Scene Radiance and Illumination

Photivra separates **illumination-source metadata** from **outgoing scene spectral radiance**.

The public image-formation contract owns a `scene-radiance-evaluation` stage between scene projection and lens/pupil evaluation:

```text
scene geometry + illumination + material response + visibility + emission + time
  -> outgoing scene spectral radiance
  -> lens / pupil / PSF / transmission
  -> sensor-plane spectral irradiance
  -> sensor sampling and signal formation
```

This boundary prevents light-source controls, RGB renderer values, or photometric scene anchors from being treated as sensor input.

## Shared spectral primitives

Fundamental wavelength semantics live in the renderer-neutral core rather than the sensor layer.

`SpectralWavelengthBasis` supports:

- `air`;
- `vacuum`;
- `unspecified`.

The shared parsers also expose a positive wavelength sample and a positive non-empty wavelength range in nanometres. They do not convert between air and vacuum wavelength coordinates.

Existing sensor APIs continue to export/use the same root `SpectralWavelengthBasis` name. Moving ownership does not change its public values or meaning.

## Scene radiometry versus scene radiance

The existing `SceneRadiometry` contract remains valid.

- `relative-linear` says scene-linear values preserve ratios without absolute photon calibration.
- `absolute-luminance` provides a photometric luminance anchor in cd/m².

Neither form is, by itself, an outgoing spectral-radiance field. Absolute luminance is a photometric anchor and must not be substituted for W/(m²·sr·nm), source irradiance, or sensor-plane spectral irradiance.

The new illumination profile complements `SceneRadiometry`; it does not replace it.

## Illumination profile

Use `parseSceneIlluminationProfile()` for renderer-independent source metadata.

Schema `0.1.0` supports these source families:

- `point`;
- `spot`;
- `area`;
- `directional`;
- `environment`.

Every source has a stable `sourceId`, explicit enabled state, geometry/binding, magnitude representation, spectrum representation, time behavior, and evidence.

A visible/emissive source may bind to a stable scene object instead of duplicating its transform. Area-source geometry must use a scene-object binding in the first schema.

## Magnitude semantics

There is no generic unitless `intensity` field.

All source families may use a clearly labeled relative linear scale for approximate/reference rendering. The first physical magnitude subset is deliberately narrow:

- point: radiant intensity, W/sr;
- area: surface radiance, W/(m²·sr);
- directional: irradiance at an explicit reference plane, W/m².

Physical spot magnitude is not yet represented because a defensible model needs an angular distribution. Absolute environment illumination is not yet represented because it needs a direction-dependent radiance field.

Photometric quantities such as lumens, candela, lux, and luminance are not silently converted into radiometric quantities.

## Spectrum representations

Schema `0.1.0` supports:

- unresolved spectrum with an explicit limitation;
- linear-sRGB preview approximation;
- explicit blackbody-temperature approximation;
- continuous relative spectral shape with wavelength coordinates, interpolation semantics, uncertainty, and reusable-data provenance.

A blackbody temperature is an explicit approximation. It is not a universal CCT/color control and must not be used to give arbitrary colored, LED, narrowband, UV, or other non-Planckian sources a fictitious Kelvin meaning.

Embedded continuous numeric spectra require `reusable-data` or `photivra-owned` evidence. A calibrated relative spectral shape must use an explicit air/vacuum wavelength basis and quantified relative uncertainty.

The continuous relative spectrum uses arbitrary relative normalization. Combining it with a broadband physical magnitude into an absolute spectral source distribution remains a later explicit composition step; the parser does not silently normalize or integrate it.

Discrete/delta-like line spectra are not represented by this first schema. Calibrated narrow/line-source composition remains blocked until an explicit line-spectrum path exists.

## Temporal boundary

Schema `0.1.0` supports time-invariant source emission only.

Flash pulses, mains/LED flicker, and other time-varying source waveforms must later consume the existing seconds-based exposure-time contract. They must not invent a second time coordinate.

## What this foundation does not calculate

A parsed illumination profile explicitly reports that it has not:

- calculated outgoing scene radiance;
- applied material optical response;
- evaluated visibility/occlusion;
- evaluated indirect light transport;
- modeled fluorescence;
- modeled participating-media/volumetric spectral transport;
- modeled polarization.

Those are scientific boundaries, not renderer implementation preferences.

RGB/PBR textures and RGB HDR environments can still be useful preview/reference inputs, but they are approximation paths unless compatible spectral and absolute-radiometric calibration is actually available.

## Renderer boundary

Photivra owns the semantic inputs and scene-radiance stage. It does not require one renderer implementation.

A browser/WebGPU preview, Blender reference render, or future spectral renderer may use different bounded approximations while consuming the same source identities and declared meanings. Approximate backends must not inherit calibrated spectral/radiometric claims merely because they consume an engine-owned profile.

## Scene-radiance provider and material-response boundary

The engine now exposes a renderer-neutral provider boundary without becoming a renderer.

`parseSceneMaterialResponseProfile()` describes stable material-response inputs. Schema `0.1.0` deliberately distinguishes:

- unresolved material response;
- `rgb-pbr-approximation`, with linear-sRGB base color plus bounded metallic/roughness parameters and an explicit limitation;
- `spectral-wavelength-preserving-data`, bound to a SHA-256 identified data artifact, explicit wavelength basis/range, uncertainty and a provider-defined wavelength-preserving scattering model.

RGB/PBR input is always approximation data. Spectral material data may itself be calibrated, but schema 0.1.0 does not model wavelength-changing behavior, fluorescence, material emission, volumetric material transport or polarization.

`assessSceneMaterialResponseFidelity()` reports the conservative profile-level state: `spectral-data`, `rgb-pbr-approximation`, `mixed`, or `unresolved`.

`parseSceneRadianceProviderProfile()` declares the provider's bindings and fidelity independently across:

- spectral evaluation;
- material response;
- visibility;
- direct transport;
- indirect transport.

Its output quantity is fixed to outgoing spectral radiance in `W/m^2/sr/nm`. Provider schema `0.1.0` is intentionally `approximation` only. Calibrated input artifacts therefore cannot automatically promote an incomplete renderer/transport path into a calibrated outgoing-radiance claim.

### Evaluation request

`parseSceneRadianceEvaluationRequest()` identifies one exact sample by:

- provider/scene/illumination/material profile IDs;
- surface point + scene object + material response, or an environment direction;
- unit-length outgoing direction;
- seconds from exposure start;
- positive wavelength in an explicit air or vacuum basis.

`unspecified` wavelength basis is rejected for physical outgoing spectral-radiance evaluation.

### Evaluation result

`parseSceneRadianceEvaluationResult()` validates provider-produced output with:

- exact sample/provider/scene/wavelength identity;
- `outgoing-spectral-radiance` quantity;
- `W/m^2/sr/nm` units;
- finite nonnegative spectral radiance;
- approximation status, uncertainty, evidence and limitations.

Parsing does **not** prove that the renderer's numeric radiance value is physically correct.

`validateSceneRadianceEvaluationBindings()` then verifies the exact scene/profile/material/request/result relationships. A surface request must reference a declared material response, and the provider's declared material fidelity must agree with the supplied material-response profile.

The validation result explicitly reports that calibrated radiance is not authorized and that optics, sensor-plane irradiance and photons have not been calculated.

This means a browser preview, Blender reference path, or future spectral renderer can plug into one stable scientific seam without the engine prescribing its rendering algorithm.

## Still outside this slice

The following remain later #85 work:

- shared scene/optics/sensor spectral coverage and discrete-line composition (#85D);
- time-varying light emission/flash/flicker tied to the existing exposure-time basis (#85E);
- fluorescence/excitation-emission;
- participating-media spectral transport;
- polarization;
- a future calibrated scene-radiance provider contract with sufficient completeness evidence.

The next scene-radiance group is #85D: common spectral coverage/breakpoint composition plus an explicit discrete-line representation before any calibrated narrow/line-source claim.
