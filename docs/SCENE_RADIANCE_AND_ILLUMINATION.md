# Scene Radiance and Illumination

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

Photivra keeps two things apart:

- **illumination-source metadata**: a description of the lights in a scene; and
- **outgoing scene spectral radiance**: the light that actually leaves each scene point toward the camera, per wavelength.

The image-formation contract has a `scene-radiance-evaluation` stage between scene projection and lens/pupil evaluation:

```text
scene geometry + illumination + material response + visibility + emission + time
  -> outgoing scene spectral radiance
  -> lens / pupil / PSF / transmission
  -> sensor-plane spectral irradiance
  -> sensor sampling and signal formation
```

This boundary stops light-source controls, RGB renderer values or photometric scene anchors from being treated as sensor input.

## Shared spectral primitives

Basic wavelength meanings live in the renderer-neutral core, not in the sensor layer.

`SpectralWavelengthBasis` can be:

- `air`;
- `vacuum`;
- `unspecified`.

The shared parsers also provide a positive wavelength sample, and a positive, non-empty wavelength range, in nanometres. They do not convert between air and vacuum wavelengths.

Existing sensor APIs still export and use the same root `SpectralWavelengthBasis` name. Moving it to the core does not change its public values or meaning.

## Scene radiometry versus scene radiance

The existing `SceneRadiometry` contract is still valid.

- `relative-linear` means scene-linear values keep their ratios, without absolute photon calibration.
- `absolute-luminance` gives a photometric luminance anchor in cd/m².

Neither one is an outgoing spectral-radiance field. Absolute luminance is a photometric anchor. It must not be used in place of W/(m²·sr·nm), source irradiance or sensor-plane spectral irradiance.

The illumination profile below adds to `SceneRadiometry`; it does not replace it.

## Illumination profile

Use `parseSceneIlluminationProfile()` for source metadata that does not depend on a renderer.

Schema `0.1.0` supports these kinds of source:

- `point`;
- `spot`;
- `area`;
- `directional`;
- `environment`.

Every source has:

- a stable `sourceId`;
- an explicit enabled state;
- geometry or a binding to a scene object;
- a magnitude representation;
- a spectrum representation;
- time behaviour;
- evidence.

A visible or emissive source can bind to a stable scene object instead of repeating its transform. In this first schema, area-source geometry must use a scene-object binding.

## Magnitude semantics

There is no generic unitless `intensity` field.

Any source can use a clearly labelled relative linear scale for approximate or reference rendering. The first set of physical magnitudes is deliberately small:

- point: radiant intensity, W/sr;
- area: surface radiance, W/(m²·sr);
- directional: irradiance at an explicit reference plane, W/m².

Physical spot magnitude is not represented yet, because a defensible model needs an angular distribution. Absolute environment illumination is not represented yet, because it needs a radiance field that depends on direction.

Photometric quantities such as lumens, candela, lux and luminance are never silently converted into radiometric quantities.

## Spectrum representations

Schema `0.1.0` supports:

- an unresolved spectrum, with an explicit limitation;
- a linear-sRGB preview approximation;
- an explicit blackbody-temperature approximation;
- a continuous relative spectral shape, with wavelength coordinates, interpolation rules, uncertainty and provenance for reusable data;
- normalised discrete relative lines, with explicit wavelengths and line fractions integrated over wavelength.

**Blackbody.** A blackbody temperature is an explicit approximation. It is not a universal CCT (correlated colour temperature) or colour control. It must not be used to give a coloured, LED, narrowband, UV or other non-Planckian source a made-up Kelvin value.

**Continuous spectra.**

- Embedded continuous numeric spectra need `reusable-data` or `photivra-owned` evidence.
- A calibrated relative spectral shape must use an explicit air or vacuum wavelength basis, and quantified relative uncertainty.
- The continuous relative spectrum has an arbitrary normalisation. Combining it with a broadband physical magnitude, to get an absolute spectral source distribution, is a later explicit step. The parser does not silently normalise or integrate it.

**Line spectra.** Discrete line spectra use the separate `discrete-relative-lines` representation.

- Each line has an explicit wavelength and a normalised line weight **integrated over wavelength**. The weights must sum to one.
- These are not per-nanometre density samples. They are never broadened into synthetic continuous bumps.
- A calibrated relative line distribution needs reusable-data provenance, a resolved air or vacuum wavelength basis, and quantified relative uncertainty.

`resolveSceneIlluminationDiscreteLineMeasure()` can share the source's wavelength-integrated magnitude across those normalised line fractions:

- point radiant intensity becomes W/sr per line;
- area radiance becomes W/(m²·sr) per line;
- directional reference-plane irradiance becomes W/m² per line;
- a relative source magnitude stays relative;
- a disabled source contributes zero.

This source-level line measure still does not support a claim of calibrated outgoing scene radiance. Material, visibility and transport fidelity, and the combined uncertainty, are separate questions.

## Shared spectral composition

`composeSpectralCoverage()` is the common planning step for continuous spectra across scene, optics, materials, sensor response and any other wavelength-dependent factor.

Each participant declares:

- a stable participant ID and role;
- one resolved wavelength basis, air or vacuum;
- finite wavelength support;
- interior interpolation breakpoints, in strictly increasing order.

Composition intersects all the participants' wavelength ranges, and takes the union of every breakpoint inside that common overlap. It does **not** apply response, transmission or radiance values, and does not integrate a spectral density. Air/vacuum conversion is never implicit.

Adapters:

- The sensor spectral response can take part through `createSensorSpectralCoverageParticipant()`. It exposes the channel response's usable range and interpolation knots, without applying QE (quantum efficiency) or A/W responsivity.
- Continuous scene-illumination data can take part through `createSceneIlluminationSpectralCoverageParticipant()`. This adapter rejects RGB, blackbody approximations, unresolved spectra and discrete line spectra, instead of silently converting them into a continuous curve.

### Continuous versus discrete integration

The two are mathematically different:

```text
continuous density:  integral f(lambda) d-lambda
discrete line measure: sum line_i
```

So `integrateDiscreteSpectralLineMeasure()` adds up line quantities that are already integrated over wavelength. It never multiplies a line by a made-up `dλ`, and never uses continuous quadrature.

A future transport model for mixed spectra could use a continuous composition plan and a discrete-line measure together. Schema and API 0.1.0 keep them separate rather than pretending one is the other.

## Temporal boundary

Schema `0.1.0` supports only source emission that does not change over time.

Flash pulses, mains or LED flicker, and other time-varying source waveforms must use the existing exposure-time contract, measured in seconds. They must not invent a second time coordinate. (See [Temporal illumination](#temporal-illumination) below.)

## What this foundation does not calculate

A parsed illumination profile explicitly reports that it has **not**:

- calculated outgoing scene radiance;
- applied the optical response of materials;
- evaluated visibility or occlusion;
- evaluated indirect light transport;
- modelled fluorescence;
- modelled spectral transport through participating media (fog, smoke and other volumes);
- modelled polarisation.

These are scientific boundaries, not renderer preferences.

RGB/PBR textures and RGB HDR environments can still be useful preview or reference inputs. They are approximations unless compatible spectral and absolute radiometric calibration is actually available.

## Renderer boundary

Photivra owns the meaning of the inputs and the scene-radiance stage. It does not require any one renderer.

A browser/WebGPU preview, a Blender reference render or a future spectral renderer can each use different bounded approximations, while using the same source identities and declared meanings. An approximate backend does not inherit calibrated spectral or radiometric claims just because it uses an engine-owned profile.

## Scene-radiance provider and material-response boundary

The engine defines a renderer-neutral boundary for a radiance provider, without becoming a renderer itself. A "provider" is whatever code (a renderer, a lookup, a test function) supplies radiance values for requested samples.

**Material response.** `parseSceneMaterialResponseProfile()` describes stable material-response inputs. Schema `0.1.0` distinguishes:

- unresolved material response;
- `rgb-pbr-approximation`: linear-sRGB base colour plus bounded metallic and roughness parameters, with an explicit limitation;
- `spectral-wavelength-preserving-data`: bound to a data artifact identified by SHA-256, with an explicit wavelength basis and range, uncertainty, and a provider-defined scattering model that preserves wavelength.

RGB/PBR input is always approximation data. Spectral material data may itself be calibrated. Schema 0.1.0 does not model wavelength-changing behaviour, fluorescence, material emission, volumetric transport in materials or polarisation.

`assessSceneMaterialResponseFidelity()` reports a conservative state for the whole profile: `spectral-data`, `rgb-pbr-approximation`, `mixed` or `unresolved`.

**Provider profile.** `parseSceneRadianceProviderProfile()` declares the provider's bindings, and its fidelity separately for:

- spectral evaluation;
- material response;
- visibility;
- direct transport;
- indirect transport.

Its output quantity is always outgoing spectral radiance in `W/m^2/sr/nm`. Provider schema `0.1.0` allows `approximation` status only. So calibrated input artifacts can never automatically turn an incomplete renderer or transport path into a claim of calibrated outgoing radiance.

### Evaluation request

`parseSceneRadianceEvaluationRequest()` identifies one exact sample by:

- provider, scene, illumination and material profile IDs;
- either a surface point + scene object + material response, or an environment direction;
- a unit-length outgoing direction;
- seconds from the start of exposure;
- a positive wavelength in an explicit air or vacuum basis.

An `unspecified` wavelength basis is rejected for physical outgoing spectral-radiance evaluation.

### Evaluation result

`parseSceneRadianceEvaluationResult()` validates the provider's output. It checks:

- exact identity of sample, provider, scene and wavelength;
- the quantity is `outgoing-spectral-radiance`;
- the units are `W/m^2/sr/nm`;
- the spectral radiance is finite and nonnegative;
- approximation status, uncertainty, evidence and limitations are present.

Parsing does **not** prove the renderer's radiance value is physically correct.

`validateSceneRadianceEvaluationBindings()` then checks that the scene, profiles, material, request and result all match each other exactly. A surface request must reference a declared material response. The provider's declared material fidelity must agree with the material-response profile supplied.

The validation result explicitly reports that calibrated radiance is not authorised, and that optics, sensor-plane irradiance and photons have not been calculated.

In practice, this means a browser preview, a Blender reference path or a future spectral renderer can all plug into one stable interface, and the engine does not dictate how they render.

## Temporal illumination

Light that changes over time is added as a temporal layer on top of the existing illumination profile. The base source keeps its identity, enabled state, magnitude, geometry and spectrum. The temporal layer supplies a **relative multiplier over physical time**.

Use `parseSceneIlluminationTemporalProfile()` to declare:

- one-off (aperiodic) piecewise-linear multiplier waveforms, for flashes and pulses;
- periodic piecewise-linear multiplier waveforms, for flicker and other repeating emission;
- evidence and scientific status for reusable numeric waveforms;
- one explicit source↔waveform binding for each time-varying source;
- exact registration of the waveform's local `t=0` to the capture reference, `first-opening-boundary-phase`.

The registration equation is:

```text
waveform time =
  capture time from first opening-boundary phase
  - waveform t=0 offset from that capture reference
```

Evidence requirements:

- a calibrated waveform needs quantified relative uncertainty;
- a calibrated time registration needs quantified absolute timing uncertainty in seconds;
- numeric waveform samples need reusable-data or Photivra-owned provenance.

**Evaluating.** `evaluateSceneIlluminationTemporalMultiplier()` evaluates one registered source at one physical capture time. Times before or after the capture reference are allowed. Periodic waveforms wrap around deterministically; aperiodic waveforms return zero outside their declared support.

**Integrating over an exposure.** `integrateSceneIlluminationTemporalMultiplierOverExposureWindow()` takes a `CaptureExposureWindows` sample from the existing shutter and exposure timing model. It uses fixed uniform-midpoint quadrature over that local exposure interval, and reports both:

- the average relative multiplier (dimensionless); and
- the integrated relative multiplier (in seconds).

The integration does **not** use sensor data-readout duration as a stand-in for timing. Readout and exposure stay independent.

The result also keeps the source's `enabled` state separate. A disabled source can have a non-zero raw waveform value while its effective contribution is zero.

### Scene-radiance provider binding

`SceneRadianceProviderProfile` can optionally declare `illuminationTemporalProfileId`. When it does, `validateSceneRadianceEvaluationBindings()` requires the matching temporal profile, and checks that it binds the same scene and base illumination profile.

This only checks that the declarations match. The validator does not prove that the provider applied the waveform correctly, and temporal illumination does not lift provider output beyond the existing approximation-only scene-radiance contract.

### Metering and automatic-exposure boundary

Temporal illumination is an upstream input for future metering and automatic-exposure consumers. This foundation never chooses ISO, aperture, shutter duration, compensation or a target exposure.

That separation lets a future meter see the changed radiance before exposure when a source changes, without feeding the final displayed (tone-mapped) brightness back into source or exposure choices.

## Downstream optical-radiometry bridge

The scene-to-sensor bridge (issue #110) is the first consumer, on the main-optics side, of a validated scene-radiance request/result pair.

`calculateSceneRadianceToSensorIrradiance()` keeps the scene sample's:

- sample, provider and scene identity;
- physical time from the start of exposure;
- wavelength and its air/vacuum basis;
- outgoing spectral-radiance value and provenance.

It then applies an explicit lens-throughput profile, to produce spectral irradiance in `W/m^2/nm` before the sensor's optical stack.

The first bridge is deliberately limited to:

- paraxial circular-pupil acceptance;
- explicit nominal or working f-number meaning;
- one of two mutually exclusive transmission paths:
  - fractional transmission resolved by wavelength; or
  - an effective working T-stop approximation;
- one optional field-throughput result, applied exactly once.

This bridge does **not** change what scene radiance means. In particular, the provider/result schema is still approximation-only, so even calibrated optical-transmission data cannot make the combined result calibrated sensor-plane irradiance.

The bridge also stops before:

- PSF and diffraction redistribution;
- distortion area-density correction;
- sensor cover glass, OLPF (optical low-pass filter) and microlenses;
- CFA (colour filter array) and filter response;
- QE and responsivity;
- photon and electron conversion;
- stray-light contributions.

Those are separate stages.

## Still outside this slice

The scene-radiance foundation (issue #85, built in stages A–E) is complete in the engine. These remain later work:

- fluorescence (excitation and emission);
- spectral transport through participating media;
- polarisation;
- a future calibrated scene-radiance provider contract, with enough evidence of completeness.

Further work on issue #85 should be limited to explicitly approved extensions or to closing and hardening, rather than widening the renderer contract by default.
