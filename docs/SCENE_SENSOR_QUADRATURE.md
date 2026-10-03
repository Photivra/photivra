# Declared scene radiance to sensor irradiance nodes

Release context: **package 1.1.0 candidate / root API 1.1.0**. Subsystem/model versions and dated introduction or measurement records below are independent historical identities; they are not distribution versions. See [developer navigation](DEVELOPERS.md) and [release contract](RELEASE_1_1_0.md).

`calculateSceneToSensorIrradianceQuadrature()` connects the existing #85 scene
request/result boundary and #110 paraxial optical bridge to the Cartesian nodes
of sensor spatial/spectral quadrature. Its output is physical **W/m²/nm** at the
**sensor-package-incident, pre-sensor-stack, pre-AA** plane. It remains a bounded
static sample calculation, not complete production scene-to-file execution.

## Bindings and calculation

Inputs are existing `spatialQuadrature` and `spectralQuadrature` values,
`sceneBindings` (provider, illumination, material and optional temporal
illumination profiles), shared `optics`, explicit `timeSecondsFromExposureStart`,
and a `samples` array. Each sample contains its exact spatio-spectral `node`,
`sceneRadianceRequest`, `sceneRadianceResult` and `fieldThroughput` declaration.

The adapter shares the irradiance reducer's internal Cartesian binding code:
profile/channel/plan semantics, the existing 100,000 combined-node budget,
complete coverage, safe integer indices, exact wavelength and duplicate checks
are identical. Sparse arrays now receive an explicit scientific-input error;
valid reduction arithmetic and prior ordinary invalid-input diagnostics are
unchanged. The internal binder is not exported from the public package root.

Provider/profile payloads are parsed, then every request/result is matched to
those profiles. This adapter requires wavelength-resolved provider fidelity;
RGB-derived and unresolved fidelity cannot enter this physical node path.
Requests must match the node wavelength and basis and the common explicit time.
Each node needs a distinct `sampleId`; identical values are allowed for an
explicitly declared uniform field but do not prove that field is uniform.

For each node the existing optical bridge computes
`L_lambda * pi/(4*N_working²) * transmission * fieldThroughput`, with the
existing mutually exclusive spectral-transmission/working-T-stop rules and
optional front-of-lens filters. The adapter owns `imagePointMm`: it comes from
the spatial node's **preAntiAliasingSourcePointMm**, never the destination
aperture point or a caller substitution. Non-unity vignetting results must match
that source point. Existing bridge validation retains finite-focus assumptions,
wavelength support, passive transmission, units and separate uncertainties.

No aperture area, spectral measure, AA weight, QE or exposure duration is folded
into the per-node irradiance value. The returned `reduction` delegates those
spatial/continuous-wavelength measures to the existing reducer once. Passing
`irradianceSamples` to the EQE adapter recomputes that reduction for its own
validated execution; **do not add or multiply the diagnostic reductions**.

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

The sensor parameters must produce the same spatial/spectral nodes. The response
must explicitly support **sensor-package-incident-effective-channel-response**.
Do not relabel package-incident light as site-incident light, assume an absent AA
kernel means the entire stack has unit transmission, or apply stack attenuation
already included in effective package EQE. Site-incident/separable response needs
an additional correctly modeled stack handoff. The separate stationarity profile
still authorizes rate × local duration; one evaluated instant establishes no
stationarity. Dark/completeness/capacity/readout remain explicit downstream data.

## Result and limits

The result retains canonical plan-order samples with owned request/result copies,
pre-AA coordinates, provider binding assessments and child optical envelopes,
plus `irradianceSamples` and the reduction envelope. Aggregate provenance is
approximation. `sourceTargetProjectionVerified` and `sceneProviderExecutionVerified`
remain false: a caller-declared environment/surface target is not an engine
intersection/visibility/transport proof. The provider remains external; no
callback, renderer, transport or network execution is added.

`psfRedistributionApplied` and `temporalIntegrationApplied` remain false. This
slice does not authorize skipping requested diffraction, defocus, aberration,
visibility, motion, stray light or temporal transport. Production graph/gates
are unchanged. Projection/PSF/temporal sampling and committed capture origin are
remaining #16/#178 work, coordinated with #112; no feature is closed here.

Tests independently predict optical irradiance, radiant power and photoelectron
expectations using SI constants and declared synthetic curves. Split-AA tests
check source-point vignetting and one-time area/weight/transmission arithmetic.
Identity/time/basis/coverage/profile/plane failures reject; declared radiance
passes through optics/EQE into deterministic four-site RAW and paired DNG/JPEG,
with exact native DNG code preservation. All data is Photivra-owned synthetic
fixture evidence, not physical camera calibration or source-truth validation.

This additive public adapter advances root API **0.107.0 → 0.108.0**; its model
version is 0.1.0. Package, POC, production, capture/RAW schemas and noise identities
are unchanged. Newly created captures use the new root API stamp; historical
replay keeps its stored stamp and pinned file hashes. No new dependency or cost.
