# Declared scene radiance to sensor irradiance nodes

> **Release context.** This page was written for package 1.2.0 (root API 1.2.0) and has not been re-reviewed for later releases. The [changelog](../CHANGELOG.md) describes the current release. Model and subsystem version numbers on this page, and any dated records, are separate from the package version. See also the [developer guide](DEVELOPERS.md) and the [1.2.0 release contract](RELEASE_1_2_0.md).

`calculateSceneToSensorIrradianceQuadrature()` turns declared scene radiance into irradiance at each sample point the sensor needs. It connects:

- the existing [scene radiance](SCENE_RADIANCE_AND_ILLUMINATION.md) request/result boundary; and
- the existing paraxial optical bridge (scene radiance to sensor irradiance);

to the nodes of the sensor's spatial × spectral quadrature grid.

Its output is physical **W/m²/nm** at the plane where light reaches the **sensor package, before the sensor's optical stack and before anti-aliasing (AA)**. It is a bounded calculation for one static sample, not complete production execution from scene to file.

## Bindings and calculation

**Inputs.**

- the existing `spatialQuadrature` and `spectralQuadrature` values;
- `sceneBindings`: provider, illumination and material profiles, and optionally a temporal illumination profile;
- shared `optics`;
- an explicit `timeSecondsFromExposureStart`;
- a `samples` array. Each sample holds its exact spatio-spectral `node`, `sceneRadianceRequest`, `sceneRadianceResult` and `fieldThroughput` declaration.

**Shared checks.** This function uses the same internal grid-binding code as the irradiance reducer. So these checks are identical:

- profile, channel and plan meaning;
- the existing limit of 100,000 combined nodes;
- complete coverage;
- safe integer indices;
- exact wavelength;
- no duplicates.

Sparse arrays now get an explicit scientific-input error. Valid reduction arithmetic, and earlier diagnostics for ordinary invalid input, are unchanged. The internal binder is not exported from the public package root.

**Provider checks.**

- Provider and profile payloads are parsed, then every request and result is matched to those profiles.
- The provider must have wavelength-resolved fidelity. RGB-derived and unresolved fidelity cannot enter this physical path.
- Requests must match the node's wavelength and basis, and the common explicit time.
- Each node needs a distinct `sampleId`. Identical values are allowed for an explicitly declared uniform field, but they do not prove the field is uniform.

**The optics.** For each node, the existing optical bridge computes:

`L_lambda * pi/(4*N_working²) * transmission * fieldThroughput`

- It follows the existing rules: spectral transmission and working T-stop are mutually exclusive, and front-of-lens filters are optional.
- This function sets `imagePointMm` itself, from the spatial node's **preAntiAliasingSourcePointMm**. It never uses the destination aperture point, or a value from the caller.
- Vignetting results other than unity must match that source point.
- Existing bridge checks keep the finite-focus assumptions, wavelength support, passive transmission, units and separate uncertainties.

**What is not folded in.** No aperture area, spectral measure, AA weight, QE or exposure duration is included in the per-node irradiance value. The returned `reduction` applies those spatial and continuous-wavelength measures, once, through the existing reducer. When you pass `irradianceSamples` to the EQE function, it recomputes that reduction for its own validated run. **Do not add or multiply the diagnostic reductions.**

## Explicit EQE handoff

```ts
const optical = calculateSceneToSensorIrradianceQuadrature(sceneInput);
const photo = calculateSensorEqeLocalExposure({
  ...sensorInput,
  irradianceSamples: optical.value.irradianceSamples,
  responseApplication: {
    ...sensorInput.responseApplication,
    sourcePlane: { value: optical.value.sourcePlane, evidence: sourcePlaneEvidence }
  }
});
```

**Rules for the handoff.** (EQE is external quantum efficiency.)

- The sensor parameters must produce the same spatial and spectral nodes.
- The response must explicitly support **sensor-package-incident-effective-channel-response**.
- Do not relabel light incident on the package as light incident on the site.
- Do not assume that a missing AA kernel means the whole stack transmits perfectly.
- Do not apply stack attenuation that effective package EQE already includes.
- A site-incident or separable response needs an extra, correctly modelled stack handoff.
- The separate stationarity profile still authorises rate × local duration. One evaluated instant does not establish stationarity.
- Dark charge, completeness, capacity and readout remain explicit downstream data.

## Result and limits

**The result keeps:**

- samples in canonical plan order, with owned copies of requests and results;
- pre-AA coordinates;
- provider binding assessments, and child optical records;
- `irradianceSamples` and the reduction record.

Overall provenance is approximation.

**Flags that stay false.**

- `sourceTargetProjectionVerified` and `sceneProviderExecutionVerified`: a target declared by the caller (environment or surface) is not proof of intersection, visibility or transport by the engine. The provider stays external; no callback, renderer, transport or network execution is added.
- `psfRedistributionApplied` and `temporalIntegrationApplied`.

This step does not allow skipping requested diffraction, defocus, aberration, visibility, motion, stray light or temporal transport. The production graph and gates are unchanged. Projection, PSF, temporal sampling and committed capture origin were remaining work (issues #16, #178, coordinated with #112) when this was written; no feature was closed here.

## Tests and versions

The tests independently predict optical irradiance, radiant power and photoelectron expectations, using SI constants and declared synthetic curves.

- Split-AA tests check vignetting at the source point, and that area, weight and transmission are each applied once.
- Failures of identity, time, basis, coverage, profile and plane are rejected.
- Declared radiance passes through optics and EQE into deterministic four-site RAW and paired DNG/JPEG, with the native DNG codes kept exactly.

All data is synthetic fixture evidence owned by Photivra. It is not physical camera calibration or validation of source truth.

**Versions.** This public adapter moved the root API from **0.107.0 to 0.108.0**; its model version is 0.1.0. Package, POC, production, capture and RAW schemas, and noise identities, did not change. Newly created captures use the new root API stamp; historical replay keeps its stored stamp and pinned file hashes. No new dependency or cost.
