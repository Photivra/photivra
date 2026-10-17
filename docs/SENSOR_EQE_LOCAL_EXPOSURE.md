# Irradiance to stationary EQE local exposure

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

`calculateSensorEqeLocalExposure()` turns light falling on one sensor site into an expected number of photoelectrons, assuming the light is constant during the exposure (stationary). EQE means external quantum efficiency: the fraction of incident photons that become electrons.

- **Input:** explicit physical spectral irradiance samples in **W/m²/nm**, not RGB.
- **Output:** a photoelectron expectation that the existing accumulated-charge step and RAW producer can use.
- It does not establish where the scene or optics data came from, does not run a renderer, and does not turn on reserved production stages.

## Input ownership and order

**Inputs.** The caller supplies `colorSamplingProfile`, `spectralResponseProfile`, `spatialSampling`, `spectralSampling`, `irradianceSamples`, `responseApplication`, `operatingRangeProfile`, `localExposure` and `stationarityProfile`.

The optional `airPhotonEnergyContext` keeps the EQE API's explicit requirements for converting air wavelengths to vacuum for photon energy. Vacuum wavelengths need none.

**Steps,** in order:

1. **Spatial quadrature.** Midpoint and anti-aliasing (AA) quadrature uses the native raster and binding profile from the supplied local timing, plus the explicit physical imaging area, aperture and lattice.
2. **Spectral quadrature.** Midpoint quadrature checks response support and the requested wavelength measure. The caller must separately make sure the scene and optics cover the needed wavelengths.
3. **Reduction.** One identified irradiance value is needed for every node of the spatial × spectral grid. Order does not matter. Missing, duplicate, non-finite or negative values fail. Values are evaluated at each node's `preAntiAliasingSourcePointMm`, before AA and sensor response. Spatial units and the wavelength measure are applied once.
4. **Compatibility and range.** Application compatibility establishes the response plane and scope, collection area, uniform spatial response and reference conditions. The operating-range check covers the specified radiant-power domain, and the evidence for spectral and spatial linearity.
5. **EQE.** Radiant power is converted to photons, then to expected electrons. Responsivity (A/W) profiles are rejected by this EQE path. A channel filter is applied only when the existing separable-response contract requires it.
6. **Local shutter binding.** The site and channel are validated, and the exact one-to-one native exposure window is computed. The stationarity profile must match that site, binding and window before rate × duration integration.

**Preparing samples.** Prepare sample identities with the existing public spatial and spectral quadrature functions, using the same parameters. This function recomputes those plans; result flags supplied by the caller cannot skip these calculations or checks.

- The input is not frozen or changed.
- Child results keep their own provenance, evidence and declared response uncertainty.
- No combined uncertainty and no quadrature-convergence estimate are introduced.

## Downstream handoff

```ts
const photo = calculateSensorEqeLocalExposure(request);
const charge = {
  photoSignal: photo.value.exposure.value,
  darkCharge,
  completenessProfile
};
// Feed charge with explicit sampling/capacity/readout state into
// simulateSensorRawFrame(). Paired export consumes that returned RAW frame.
```

**Still downstream:** dark charge, other stored charge, completeness, capacity, random realisation and electronics.

- Do not insert fake zero-dark or completeness evidence to get a RAW.
- A rolling schedule in the RAW producer must match the local event used here.
- Scene motion or changing irradiance needs real integration over time, which this function does not do. A stationarity declaration is not such an integration. (See [nonstationary sensor calculation](#nonstationary-sensor-calculation) below.)

**What the result declares.**

- `upstreamOrigin: "declared-spatio-spectral-irradiance-samples"` and `upstreamSceneAndOpticsVerified: false`.
- It keeps detailed records of: the spatial and spectral plans, reduction, compatibility, operating range, electron rate, exposure binding and exposure.
- Overall provenance is approximation.

The RAW producer and the attachment and export origin flags stay conservative. Running this function cannot prove the history or calibration of whatever provided the irradiance.

## Evidence and compatibility

**Tests.** `test/eqe-local-exposure.test.ts` independently predicts photon and electron counts using:

- SI values of the Planck constant and the speed of light;
- conversion from µm² to m²;
- two spectral midpoints;
- the synthetic QE curve.

It checks independence from order, exact rolling windows and scaling with duration, and invalid nodes, planes, ranges, channels, bindings and windows. It also runs all four native Bayer sites through deterministic RAW and paired DNG/JPEG. Fixtures are synthetic test declarations owned by Photivra, not measured camera calibration or scene validation. The existing primitive tests are still in place.

**Versions.** This entry point moved the root API from **0.106.0 to 0.107.0**. The composition model is 0.1.0. Package, POC, production-plan, capture, RAW and producer schemas, and noise identities, did not change.

- Newly created captures carry the new root API stamp, so their export identities, which depend on provenance, may differ.
- Replaying historical captures keeps their stored root stamp and pinned paired-file hashes.
- No primitive equations, random seeds or RAW readout arithmetic changed.

Remaining work at the time (issues #16, #178, #112): committed origin of scene, optics and PSF data for each node; production-stage activation; and wider acceptance across resolutions and editors. This handoff did not close those issues.

## Optical-node producer

[`calculateSceneToSensorIrradianceQuadrature()`](SCENE_SENSOR_QUADRATURE.md) produces exactly these physical node values, from declared wavelength-resolved scene radiance through the existing optical bridge. Its output plane is light incident on the sensor package; use matching effective package EQE, and explicit evidence for the source plane. Projection, PSF, source truth and stationarity are still separate requirements.

## Nonstationary sensor calculation

[`calculateSensorEqeTemporalExposure()`](SENSOR_EQE_TEMPORAL_EXPOSURE.md) reuses this function's instantaneous steps at every explicit local shutter midpoint. It returns a separate nonstationary photo expectation, with no stationarity claim. The [temporal photo-signal handoff](TEMPORAL_PHOTO_RAW.md), added at API 0.110.0, builds a separate compact record for dark-charge, charge and RAW consumers.
