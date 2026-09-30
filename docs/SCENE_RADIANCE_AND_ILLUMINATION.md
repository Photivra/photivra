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
- continuous relative spectral shape with wavelength coordinates, interpolation semantics, uncertainty, and reusable-data provenance;
- normalized discrete relative lines with explicit wavelengths and wavelength-integrated line fractions.

A blackbody temperature is an explicit approximation. It is not a universal CCT/color control and must not be used to give arbitrary colored, LED, narrowband, UV, or other non-Planckian sources a fictitious Kelvin meaning.

Embedded continuous numeric spectra require `reusable-data` or `photivra-owned` evidence. A calibrated relative spectral shape must use an explicit air/vacuum wavelength basis and quantified relative uncertainty.

The continuous relative spectrum uses arbitrary relative normalization. Combining it with a broadband physical magnitude into an absolute spectral source distribution remains a later explicit composition step; the parser does not silently normalize or integrate it.

Discrete line spectra use the separate `discrete-relative-lines` representation. Each line has an explicit wavelength and a normalized **wavelength-integrated** line weight; weights must sum to one. These are not per-nanometre density samples and are never broadened into synthetic continuous bumps. A calibrated relative line distribution requires reusable-data provenance, a resolved air/vacuum wavelength basis, and quantified relative uncertainty.

`resolveSceneIlluminationDiscreteLineMeasure()` may distribute the source's wavelength-integrated magnitude across those normalized line fractions. Point radiant intensity becomes per-line W/sr, area radiance becomes per-line W/(m²·sr), directional reference-plane irradiance becomes per-line W/m², and relative source magnitude stays relative. Disabled sources resolve to zero contribution.

This source-level line measure still does not authorize a calibrated outgoing scene-radiance claim because material/visibility/transport fidelity and combined uncertainty remain separate.

## Shared spectral composition

`composeSpectralCoverage()` defines the common continuous-spectral planning seam across scene, optics, materials, sensor response, or other wavelength-dependent factors.

Each participant declares:

- stable participant ID and role;
- one resolved air or vacuum wavelength basis;
- finite wavelength support;
- strictly ordered internal interpolation breakpoints.

Composition intersects all participant wavelength ranges and unions every breakpoint that lies inside the common overlap. It does **not** apply response/transmission/radiance values and does not integrate a spectral density. Air/vacuum conversion is never implicit.

The existing sensor spectral response can participate through `createSensorSpectralCoverageParticipant()`, which exposes the channel response's usable overlap and interpolation knots without applying QE or A/W responsivity.

Continuous scene-illumination data can participate through `createSceneIlluminationSpectralCoverageParticipant()`. RGB, blackbody approximations, unresolved spectra, and discrete line spectra are rejected by that adapter rather than being silently converted into a continuous curve.

### Continuous versus discrete integration

The mathematical distinction is hard:

```text
continuous density:  integral f(lambda) d-lambda
discrete line measure: sum line_i
```

`integrateDiscreteSpectralLineMeasure()` therefore sums already wavelength-integrated line quantities. It never multiplies a line by a fabricated `dλ` and never invokes continuous quadrature.

A continuous composition plan and a discrete-line measure may coexist in a future mixed-spectrum transport model, but schema/API 0.1.0 keeps them separate rather than pretending one representation is the other.

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

## Temporal illumination

Time-varying source emission is represented as an additive temporal overlay on the existing illumination profile. The base source keeps its authoritative identity, enabled state, magnitude, geometry and spectrum; the temporal layer supplies a **relative multiplier over physical time**.

Use `parseSceneIlluminationTemporalProfile()` to declare:

- aperiodic piecewise-linear multiplier waveforms for flash/pulse-like behavior;
- periodic piecewise-linear multiplier waveforms for flicker/repeating emission;
- reusable numeric waveform evidence and scientific status;
- one explicit source↔waveform binding per time-varying source;
- exact registration of waveform-local `t=0` to the capture reference `first-opening-boundary-phase`.

The registration equation is:

```text
waveform time =
  capture time from first opening-boundary phase
  - waveform t=0 offset from that capture reference
```

A calibrated waveform requires quantified relative uncertainty. A calibrated time registration requires quantified absolute timing uncertainty in seconds. Numeric waveform samples require reusable-data or Photivra-owned provenance.

`evaluateSceneIlluminationTemporalMultiplier()` evaluates one registered source at one physical capture time. It supports times before or after the capture reference; periodic waveforms wrap deterministically, while aperiodic waveforms return zero outside their declared support.

`integrateSceneIlluminationTemporalMultiplierOverExposureWindow()` consumes an authoritative `CaptureExposureWindows` sample from the existing shutter/exposure timing foundation. It uses deterministic uniform-midpoint quadrature over that local exposure interval and reports both:

- a dimensionless average relative multiplier; and
- a seconds-valued integrated relative multiplier.

The integration does **not** use sensor data-readout duration as a timing proxy. Readout and exposure remain independent.

The result also keeps source `enabled` state separate: a disabled source can retain a non-zero raw waveform value while its effective contribution is zero.

### Scene-radiance provider binding

`SceneRadianceProviderProfile` may now optionally declare `illuminationTemporalProfileId`. When it does, `validateSceneRadianceEvaluationBindings()` requires the matching temporal profile and verifies that it binds the same scene and base illumination profile.

This is semantic binding only. The validator does not prove that the provider numerically applied the waveform correctly, and temporal illumination does not promote provider output beyond the existing approximation-only scene-radiance contract.

### Metering and automatic-exposure boundary

Temporal illumination is upstream input to future metering/automatic-exposure consumers. This foundation never chooses ISO, aperture, shutter duration, compensation, or a target exposure.

That separation allows a future meter to observe changed pre-exposure radiance after a source changes without feeding final display/tone-mapped brightness back into source or exposure selection.

## Downstream optical-radiometry bridge

#110 now provides the first primary-optics consumer of a validated scene-radiance request/result pair.

`calculateSceneRadianceToSensorIrradiance()` preserves the scene sample's:

- sample/provider/scene identity;
- physical time from exposure start;
- wavelength coordinate and air/vacuum basis;
- outgoing spectral-radiance value and provenance.

It then applies an explicit lens-throughput profile to produce pre-sensor-stack spectral irradiance in `W/m^2/nm`.

The first bridge is intentionally limited to:

- paraxial circular-pupil acceptance;
- explicit nominal/working f-number semantics;
- one mutually exclusive transmission path:
  - wavelength-resolved fractional transmission; or
  - effective working T-stop approximation;
- one optional field-throughput result applied exactly once.

This downstream bridge does **not** change #85 scene-radiance semantics. In particular, the current provider/result schema remains approximation-only, so even calibrated optical-transmission data cannot promote the combined result to calibrated sensor-plane irradiance.

The bridge also stops before:

- PSF/diffraction redistribution;
- distortion area-density correction;
- sensor cover glass / OLPF / microlens;
- CFA/filter response;
- QE/responsivity;
- photon/electron conversion;
- stray-light contributions.

Those remain separately owned stages.

## Still outside this slice

The following remain later work beyond the completed A–E foundation sequence:

- fluorescence/excitation-emission;
- participating-media spectral transport;
- polarization;
- a future calibrated scene-radiance provider contract with sufficient completeness evidence.

The staged #85A–#85E foundation sequence is now represented in the engine. Remaining #85 work should be limited to explicitly approved later extensions or closure/hardening rather than widening the renderer contract by default.
